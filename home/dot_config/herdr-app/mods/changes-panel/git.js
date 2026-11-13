// The git CLI, as the panel runs it. Shelling out is as fast as git itself.
import { exec, readTextFile } from "herdr";
import { untrackedPatch } from "./patch.js";

// Reads that write nothing under .git: no index refresh, no lock, no fsmonitor cookie.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const DIFF = ["--no-color", "--no-ext-diff", "--full-index", "-M"];
// Untracked files past these limits are listed as binary rather than read.
const MAX_UNTRACKED_FILES = 200;
const MAX_UNTRACKED_BYTES = 1 << 20;
// Files changing more lines than this are listed, not diffed: a staged PDF or a dump can
// run to millions of lines, past what one command may print.
const MAX_FILE_LINES = 20000;

const isOption = (ref) => ref?.startsWith("-");

// git's empty tree: the base for a repository with no commits yet, where everything is new.
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// `--numstat -z`: "add\tdel\tpath\0", or for a rename "add\tdel\t\0from\0to\0".
function numstat(out) {
  const parts = out.split("\0");
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/^(-|\d+)\t(-|\d+)\t(.*)$/s);
    if (!m) continue;
    const path = m[3] || (i += 2, parts[i]);
    files.push({ path, add: m[1] === "-" ? 0 : +m[1], del: m[2] === "-" ? 0 : +m[2] });
  }
  return files;
}

// A cheap stand-in for "this file changed": its mtime to the nanosecond and its size, from one
// `stat` for all the paths. Tries the BSD form, then GNU's, and remembers which answered.
// Null when neither gives one clean line per path (a missing file, a newline in a name, no
// stat): the caller then reads everything, as if there were no fingerprints.
export function fingerprinter(run) {
  const forms = [["-L", "-f", "%Fm:%z"], ["-L", "-c", "%.9Y:%s"]];
  const clean = /^\d+(?:\.\d+)?:\d+$/;
  let known = 0;
  return async (cwd, paths) => {
    if (!paths.length) return [];
    for (let k = 0; k < forms.length; k++) {
      const form = (known + k) % forms.length;
      let result = null;
      try {
        result = await run("stat", [...forms[form], "--", ...paths], { cwd });
      } catch { /* no stat: try the other form, then give up */ }
      const lines = result?.code === 0 ? result.stdout.split("\n").filter(Boolean) : [];
      if (lines.length === paths.length && lines.every((line) => clean.test(line))) {
        known = form;
        return lines;
      }
    }
    return null;
  };
}

// The remote that holds a pull request's repository (https://host/owner/repo/pull/N), else
// that repository's URL itself.
export function remoteFor(remotes, url) {
  const m = /^(https?:\/\/[^/]+)\/([^/]+\/[^/]+)\/pull\/\d+/.exec(url ?? "");
  if (!m) return "origin";
  const slug = m[2].toLowerCase();
  for (const line of remotes.split("\n")) {
    const [name, address] = line.split(/\s+/);
    if (address && address.toLowerCase().replace(/\.git$/, "").replace(/\/$/, "").match(/[:/]([^/:]+\/[^/]+)$/)?.[1] === slug) return name;
  }
  return `${m[1]}/${m[2]}.git`;
}

// Git on one machine: null for this computer, else a machine's name (`hc machine ls`), where
// every command and file read then runs. Each machine keeps its own untracked-file cache and
// remembers its own `stat` flavor.
export function gitOn(machine) {
  const on = machine ? { on: machine } : {};
  const run = (command, args, options = {}) => exec(command, args, { ...options, ...on });
  const read = (path) => readTextFile(path, on);

  async function git(repo, args) {
    const result = await run("git", ["-C", repo, ...READ, ...args]);
    if (result.code !== 0) throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
    return result.stdout;
  }

  async function line(repo, args) {
    const out = await git(repo, args).catch(() => "");
    return out.trim() || null;
  }



  const hasCommits = async (repo) => Boolean(await line(repo, ["rev-parse", "--verify", "--quiet", "HEAD"]));

  const toplevel = (dir) => line(dir, ["rev-parse", "--show-toplevel"]);

  const currentBranch = async (repo) => (await line(repo, ["rev-parse", "--abbrev-ref", "HEAD"])) ?? "HEAD";

  // What a branch is compared with by default: its copy on origin, so the panel shows what
  // isn't pushed yet; without one, the branch itself, so only uncommitted work shows.
  async function defaultBase(repo, branch) {
    if (!(await hasCommits(repo))) return EMPTY_TREE;
    if (!branch || branch === "HEAD" || isOption(branch)) return "HEAD";
    const remote = `origin/${branch}`;
    return (await line(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}`])) ? remote : branch;
  }

  const isDirty = async (repo) => Boolean(await line(repo, ["status", "--porcelain", "--untracked-files=normal"]));

  // Where base and head point right now, as one string: what a branch under review is compared
  // by, to see that it moved. Null for a working tree or a commit, and when a ref can't be
  // resolved (a deleted branch): the caller then keeps what it shows.
  async function tips({ repo, base, head }) {
    if (!head || isOption(base) || isOption(head)) return null;
    // The trailing "--" says these are revisions, so a file named like the branch is no clash.
    const out = await git(repo, ["rev-parse", ...(base === EMPTY_TREE ? [] : [base]), head, "--"]).catch(() => null);
    return out?.trim() || null;
  }

  // Branches, remote branches and tags, most recently committed first.
  async function refs(repo) {
    const out = await git(repo, ["for-each-ref", "--sort=-committerdate", "--format=%(refname)", "refs/heads", "refs/remotes", "refs/tags"]).catch(() => "");
    return out.split("\n").filter((r) => r && !r.endsWith("/HEAD")).map((r) => r.split("/").slice(2).join("/"));
  }

  // Commits in base..head, newest first, with lines added and removed.
  async function commits(repo, base, head) {
    if (!head || base === EMPTY_TREE || isOption(base) || isOption(head)) return [];
    const out = await git(repo, ["log", "--format=%x1e%H%x1f%s%x1f%an%x1f%ar", "--numstat", "--max-count=500", `${base}..${head}`, "--"]).catch(() => "");
    return out.split("\x1e").filter(Boolean).map((record) => {
      const [first, ...stats] = record.split("\n");
      const [sha, subject, author, date] = first.split("\x1f");
      let add = 0;
      let del = 0;
      for (const stat of stats) {
        const [a, d] = stat.split("\t");
        if (/^\d+$/.test(a) && /^\d+$/.test(d)) { add += +a; del += +d; }
      }
      return { sha, subject, author, date, add, del };
    });
  }

  // The patch for a source: one commit, base...head like a pull request, or, with no head,
  // the working tree against where it forked from base, untracked files included.
  // Returns { text, skipped }: skipped files are too large to diff, with their line counts.
  async function diff({ repo, base, head, commit, since, ignoreWhitespace }) {
    const whitespace = ignoreWhitespace ? ["-w"] : [];
    let command;
    if (commit) {
      if (isOption(commit)) throw new Error("invalid commit");
      command = ["show", "--format=", "--diff-merges=first-parent", ...whitespace, commit];
    } else {
      if (isOption(base) || isOption(head) || isOption(since)) throw new Error("invalid ref");
      // The empty tree has no history to fork from: compare against it directly. "Since your
      // review" diffs from the commit you last reviewed instead of the base.
      const from = since || base;
      const range = head ? [`${from}...${head}`] : base === EMPTY_TREE ? [base] : ["--merge-base", base];
      command = ["diff", ...whitespace, ...range];
    }
    let stats;
    try {
      stats = await git(repo, [...command, "--numstat", "-z", "-M", "--"]);
    } catch (e) {
      // Histories that never met (an orphan branch, an unrelated remote) have no fork point:
      // compare with the base as it is.
      if (commit || !/no merge base/i.test(e.message)) throw e;
      command = ["diff", ...whitespace, since || base, ...(head ? [head] : [])];
      stats = await git(repo, [...command, "--numstat", "-z", "-M", "--"]);
    }
    const skipped = numstat(stats).filter((f) => f.add + f.del > MAX_FILE_LINES);
    const excludes = skipped.map((f) => `:(exclude,literal)${f.path}`);
    const [text, untracked] = await Promise.all([
      git(repo, [...command, ...DIFF, "--", ...(excludes.length ? [".", ...excludes] : [])]),
      head || commit ? "" : untrackedPatchOf(repo),
    ]);
    return { text: text + untracked, skipped };
  }



  const fingerprint = fingerprinter(run);

  // The last repository's untracked files, each as its patch and the fingerprint it was read at.
  // The tick that polls a working tree would otherwise read every untracked file again: up to
  // 200 files of 1 MiB, however little changed. One repository per machine, so it can't grow.
  let seen = { repo: null, files: new Map() };

  // Untracked files, as a patch adding them: only those whose fingerprint changed are read.
  async function untrackedPatchOf(repo) {
    const list = await git(repo, ["ls-files", "--others", "--exclude-standard", "-z"]).catch(() => "");
    const paths = list.split("\0").filter(Boolean).slice(0, MAX_UNTRACKED_FILES);
    const prints = await fingerprint(repo, paths);
    const before = seen.repo === repo ? seen.files : new Map();
    const files = new Map();
    const patches = await Promise.all(paths.map(async (path, i) => {
      const print = prints?.[i];
      const hit = print ? before.get(path) : null;
      if (hit && hit.print === print) {
        files.set(path, hit);
        return hit.patch;
      }
      const text = await read(`${repo}/${path}`).catch(() => null);
      const binary = text == null || text.length > MAX_UNTRACKED_BYTES || text.slice(0, 8000).includes("\0");
      const patch = untrackedPatch([{ path, text: binary ? null : text }]);
      // The print was taken before the read: a file written in between has a newer one next
      // tick and is read again, never served stale.
      if (print) files.set(path, { print, patch });
      return patch;
    }));
    seen = { repo, files };
    return patches.join("");
  }

  // Pull requests, through the GitHub CLI. Null when gh is missing, signed out, or there is none.
  async function pullRequest(repo, number) {
    const args = ["pr", "view", ...(number ? [String(number)] : []), "--json", "number,title,url,baseRefName,headRefName"];
    const result = await run("gh", args, { cwd: repo }).catch(() => null);
    if (result?.code !== 0) return null;
    try { return JSON.parse(result.stdout); } catch { return null; }
  }


  // Fetches a pull request's head and base into the panel's own refs, so it can be reviewed
  // without checking it out and without moving any branch or remote-tracking ref.
  async function fetchPullRequest(repo, pr) {
    const remotes = await git(repo, ["remote", "-v"]).catch(() => "");
    const ref = `refs/changes-panel/pr/${pr.number}`;
    const result = await run("git", ["-C", repo, "fetch", "--quiet", "--no-tags", "--refmap=", remoteFor(remotes, pr.url),
      `+refs/pull/${pr.number}/head:${ref}/head`, `+refs/heads/${pr.baseRefName}:${ref}/base`]);
    if (result.code !== 0) throw new Error(result.stderr.trim() || `couldn't fetch #${pr.number}`);
    return { base: `${ref}/base`, head: `${ref}/head` };
  }

  // A file's text on the new side of the diff, for expanding the lines a separator hides:
  // its blob when git has one, otherwise (uncommitted) what is on disk.
  async function fileText(repo, file, worktree) {
    if (file.newOid && !/^0+$/.test(file.newOid)) {
      const result = await run("git", ["-C", repo, ...READ, "cat-file", "blob", file.newOid]);
      if (result.code === 0) return result.stdout;
    }
    return worktree ? read(`${repo}/${file.name}`) : null;
  }

  // How many commits of base..head touched each file: path -> count.
  async function churn(repo, base, head) {
    const counts = new Map();
    if (!head || isOption(base) || isOption(head)) return counts;
    const out = await git(repo, ["log", "--format=", "--name-only", "--max-count=500", `${base}..${head}`, "--"]).catch(() => "");
    for (const path of out.split("\n").filter(Boolean)) counts.set(path, (counts.get(path) ?? 0) + 1);
    return counts;
  }

  return { hasCommits, toplevel, currentBranch, defaultBase, isDirty, tips, refs, commits, diff, pullRequest, fetchPullRequest, fileText, churn };
}

// This computer's git, for callers that never leave it.
export const { hasCommits, toplevel, currentBranch, defaultBase, isDirty, tips, refs, commits, diff, pullRequest, fetchPullRequest, fileText, churn } = gitOn(null);
