import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHerdrStubs, realExec, stub } from "./support/herdr-changes-panel-stub";

installHerdrStubs();

const DIR = "../home/dot_config/herdr-app/mods/changes-panel";
let Panel: any;
const repos: string[] = [];

beforeAll(async () => {
  Panel = (await import(`${DIR}/main.js`)).default;
  stub.exec = realExec;
  stub.readTextFile = (path: string) => readFile(path, "utf8").catch(() => null);
});
afterAll(() => Promise.all(repos.map((repo) => rm(repo, { recursive: true, force: true }))));

const lines = (n: number, tag = "") => Array.from({ length: n }, (_, i) => `line ${i + 1}${tag}`);
const text = (rows: string[]) => rows.join("\n") + "\n";

async function makeRepo() {
  const repo = await mkdtemp(join(tmpdir(), "changes-panel-"));
  repos.push(repo);
  const git = (...args: string[]) => realExec("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);
  await git("init", "-q", "-b", "main");
  await writeFile(join(repo, "big.js"), text(lines(80)));
  await git("add", ".");
  await git("commit", "-q", "-m", "init");
  return { repo, git, file: join(repo, "big.js") };
}

// The panel as the app builds it, with the host's Context replaced by one that runs tasks to completion.
function panel(repo: string, source: any = { repo, base: "main", head: "", commit: null }) {
  const view = Object.create(Panel.prototype);
  const tasks: Promise<unknown>[] = [];
  const cx: any = { notify() {}, spawn: (fn: any) => { tasks.push(fn(cx)); return tasks.at(-1); }, timer: { every() {}, after() {} } };
  Object.assign(view, {
    rev: 0, files: [], rowsCache: new Map(), expanded: new Map(), open: new Map(), moves: { perFile: new Map(), lines: new Set() },
    prefs: { diffStyle: "unified", wholeFiles: false }, review: { viewed: {}, comments: [] }, only: null, editing: null, mainW: 900, charW: 7.5,
    source, text: "", commits: [], refs: [], loading: false, busy: false, lastReviewed: {}, reviewKey: null,
    scroll: { scroll_to_item() {} },
  });
  return { view, cx, settle: async () => { while (tasks.length) await tasks.shift(); } };
}

// Every context line the view shows, as [line number, text it shows].
const contextRows = (view: any, name: string) =>
  view.items.filter((item: any) => item.f?.name === name && item.t === "unified" && item.cell.kind === "ctx").map((item: any) => [item.new, item.cell.text]);

// Which of them show text that is not what the file really has on that line.
const wrong = (rows: [number, string][], actual: string[]) => rows.filter(([n, shown]) => shown.trim() !== actual[n - 1]);

describe("separators opened, then the file changes", () => {
  test("a working-tree edit that shifts lines does not show the old lines", async () => {
    const { repo, file } = await makeRepo();
    const two = (rows: string[]) => rows.map((l, i) => (i === 9 ? "line 10 EDITED" : i === 69 ? "line 70 EDITED" : l));
    await writeFile(file, text(two(lines(80))));
    const { view, cx, settle } = panel(repo);
    await view.load(view.source, cx);
    // Open the separator between the two edits.
    view.expandGap(view.files[0], view.items.filter((item: any) => item.t === "hunk")[1].hunk, cx);
    await settle();
    expect(wrong(contextRows(view, "big.js"), (await readFile(file, "utf8")).split("\n"))).toEqual([]);

    // The agent adds five lines at the top, so every line below moves down by five.
    const edited = [...lines(5, " (new)"), ...two(lines(80))];
    await writeFile(file, text(edited));
    view.refresh(cx);
    await settle();
    const rows = contextRows(view, "big.js");
    expect(wrong(rows, edited)).toEqual([]);
    // The file is a new version: its opened separator is closed again, not drawn from old text.
    expect(view.items.some((item: any) => item.t === "hunk" && item.f.name === "big.js")).toBe(true);
    expect(view.expanded.has("big.js")).toBe(false);
  });

  test("viewing a commit does not reuse the text of the working tree", async () => {
    const { repo, git, file } = await makeRepo();
    await writeFile(file, text(lines(80).map((l, i) => (i === 39 ? "line 40 v2" : l))));
    await git("commit", "-q", "-am", "v2");
    const { view, cx, settle } = panel(repo);
    await view.load({ repo, base: "main", head: "", commit: null }, cx);
    // Uncommitted work on top of v2: a different line, and shifted.
    const later = [...lines(3, " (top)"), ...lines(80).map((l, i) => (i === 39 ? "line 40 v2" : i === 60 ? "line 61 later" : l))];
    await writeFile(file, text(later));
    await view.load(view.source, cx);
    view.expandGap(view.files[0], view.items.find((item: any) => item.t === "hunk").hunk, cx);
    await settle();

    const sha = (await git("rev-parse", "HEAD")).stdout.trim();
    await view.load({ repo, base: "main", head: "", commit: sha }, cx);
    const atV2 = (await git("show", `${sha}:big.js`)).stdout.split("\n");
    const rows = contextRows(view, "big.js");
    expect(rows.length).toBeGreaterThan(0);
    expect(wrong(rows, atV2)).toEqual([]);
  });
});

describe("opened separators and the files that stay the same", () => {
  test("an unchanged file keeps its opened separator through a refresh", async () => {
    const { repo, git, file } = await makeRepo();
    await writeFile(join(repo, "other.js"), text(lines(10)));
    await git("add", ".");
    await git("commit", "-q", "-m", "other");
    const two = (rows: string[]) => rows.map((l, i) => (i === 9 ? "line 10 EDITED" : i === 69 ? "line 70 EDITED" : l));
    await writeFile(file, text(two(lines(80))));
    const { view, cx, settle } = panel(repo);
    await view.load(view.source, cx);
    view.expandGap(view.files[0], view.items.filter((item: any) => item.t === "hunk")[1].hunk, cx);
    await settle();
    const open = view.expanded.get("big.js");
    expect(open).toBeDefined();

    await writeFile(join(repo, "other.js"), text(lines(10, " changed"))); // a different file changes
    view.refresh(cx);
    await settle();
    expect(view.expanded.get("big.js")).toBe(open);
    expect(wrong(contextRows(view, "big.js"), two(lines(80)))).toEqual([]);
  });

  test("a file that leaves the diff gives up its text", async () => {
    const { repo, git, file } = await makeRepo();
    const two = (rows: string[]) => rows.map((l, i) => (i === 9 ? "line 10 EDITED" : i === 69 ? "line 70 EDITED" : l));
    await writeFile(file, text(two(lines(80))));
    const { view, cx, settle } = panel(repo);
    await view.load(view.source, cx);
    view.expandGap(view.files[0], view.items.filter((item: any) => item.t === "hunk")[1].hunk, cx);
    await settle();
    expect(view.expanded.size).toBe(1);

    await git("checkout", "--", "big.js"); // the edits are undone: no diff
    view.refresh(cx);
    await settle();
    expect(view.files).toHaveLength(0);
    expect(view.expanded.size).toBe(0);
  });

  test("with whole files on, a changed file's text is read again after a refresh", async () => {
    const { repo, file } = await makeRepo();
    const two = (rows: string[]) => rows.map((l, i) => (i === 9 ? "line 10 EDITED" : i === 69 ? "line 70 EDITED" : l));
    await writeFile(file, text(two(lines(80))));
    const { view, cx, settle } = panel(repo);
    view.prefs.wholeFiles = true;
    await view.load(view.source, cx);
    await settle();
    expect(contextRows(view, "big.js").length).toBeGreaterThan(70);

    const edited = [...lines(5, " (new)"), ...two(lines(80))];
    await writeFile(file, text(edited));
    view.refresh(cx);
    await settle();
    await settle();
    const rows = contextRows(view, "big.js");
    expect(rows.length).toBeGreaterThan(70); // the whole file is open again
    expect(wrong(rows, edited)).toEqual([]);
  });
});

describe("a branch under review gets new commits", () => {
  async function branchRepo() {
    const { repo, git, file } = await makeRepo();
    await git("checkout", "-q", "-b", "feature");
    await writeFile(file, text(lines(80).map((l, i) => (i === 9 ? "line 10 first" : l))));
    await git("commit", "-q", "-am", "first");
    return { repo, git, file };
  }
  const names = (view: any) => view.files.map((f: any) => f.name).join();
  const rangeSource = (repo: string) => ({ repo, base: "main", head: "feature", commit: null });
  // The git subcommand of each exec, past git's global options (-C <dir>, -c <k=v>, --flags).
  const subcommand = (args: string[]) => { for (let i = 0; i < args.length; i++) { if (args[i] === "-C" || args[i] === "-c") i++; else if (!args[i].startsWith("-")) return args[i]; } return ""; };
  const execs = () => { const seen: string[] = []; const was = stub.exec; stub.exec = (cmd: string, args: string[], options: any) => { seen.push(cmd === "git" ? `git ${subcommand(args)}` : cmd); return was(cmd, args, options); }; return { seen, stop: () => { stub.exec = was; } }; };

  test("a refresh tick shows a commit made after the panel loaded", async () => {
    const { repo, git } = await branchRepo();
    const { view, cx, settle } = panel(repo, rangeSource(repo));
    await view.load(view.source, cx);
    expect(names(view)).toBe("big.js");
    expect(view.commits).toHaveLength(1);

    await writeFile(join(repo, "b.js"), "new\n");
    await git("add", ".");
    await git("commit", "-q", "-m", "second");
    view.refresh(cx);
    await settle();
    expect(names(view)).toBe("b.js,big.js");
    expect(view.commits).toHaveLength(2);
  });

  test("polls one cheap command while the branch has not moved, and does not reload", async () => {
    const { repo } = await branchRepo();
    const { view, cx, settle } = panel(repo, rangeSource(repo));
    await view.load(view.source, cx);
    const files = view.files;
    const spy = execs();
    try {
      for (let i = 0; i < 3; i++) { view.refresh(cx); await settle(); }
    } finally { spy.stop(); }
    expect(spy.seen).toEqual(["git rev-parse", "git rev-parse", "git rev-parse"]);
    expect(view.files).toBe(files);
  });

  test("reloads without the loading state, and keeps viewed marks and the scroll", async () => {
    const { repo, git } = await branchRepo();
    const { view, cx, settle } = panel(repo, rangeSource(repo));
    await view.load(view.source, cx);
    const [big] = view.files;
    view.review = { viewed: { [big.id]: big.signature }, comments: [] };
    let loadingSeen = false;
    let flag = view.loading;
    Object.defineProperty(view, "loading", { get: () => flag, set: (v) => { loadingSeen ||= v === true; flag = v; } });
    let scrolled = 0;
    view.scroll = { scroll_to_item() { scrolled++; } };

    await writeFile(join(repo, "b.js"), "new\n");
    await git("add", ".");
    await git("commit", "-q", "-m", "second");
    view.refresh(cx);
    await settle();
    expect(names(view)).toBe("b.js,big.js");
    expect(loadingSeen).toBe(false);
    expect(view.review.viewed[big.id]).toBe(big.signature);
    expect(scrolled).toBe(0);
  });

  test("a commit that lands while the panel is loading is picked up on the next tick", async () => {
    const { repo, git } = await branchRepo();
    const { view, cx, settle } = panel(repo, rangeSource(repo));
    // The commit lands just after the diff has been read, before anything else is.
    const was = stub.exec;
    let diffs = 0;
    stub.exec = async (cmd: string, args: string[], options: any) => {
      const result = await was(cmd, args, options);
      if (cmd === "git" && subcommand(args) === "diff" && ++diffs === 2) {
        stub.exec = was;
        await writeFile(join(repo, "b.js"), "landed mid-load\n");
        await git("add", ".");
        await git("commit", "-q", "-m", "mid-load");
      }
      return result;
    };
    await view.load(view.source, cx);
    expect(names(view)).toBe("big.js"); // the diff was read before the commit
    view.refresh(cx);
    await settle();
    expect(names(view)).toBe("b.js,big.js");
  });

  test("notices when the base moves too", async () => {
    const { repo, git } = await branchRepo();
    const { view, cx, settle } = panel(repo, rangeSource(repo));
    await view.load(view.source, cx);
    await git("checkout", "-q", "main");
    await writeFile(join(repo, "m.js"), "on main\n");
    await git("add", ".");
    await git("commit", "-q", "-m", "main moves");
    await git("checkout", "-q", "feature");
    const before = view.text;
    view.refresh(cx);
    await settle();
    expect(view.tips).toBeDefined();
    // main moved: the three-dot diff is unchanged, but it was looked at again without error.
    expect(view.text).toBe(before);
    expect(view.error).toBeNull();
  });

  test("keeps the diff when reading the new commits fails, and tries again next tick", async () => {
    const { repo, git } = await branchRepo();
    const { view, cx, settle } = panel(repo, rangeSource(repo));
    await view.load(view.source, cx);
    const files = view.files;
    await writeFile(join(repo, "b.js"), "new\n");
    await git("add", ".");
    await git("commit", "-q", "-m", "second");

    const was = stub.exec;
    stub.exec = (cmd: string, args: string[], options: any) =>
      cmd === "git" && subcommand(args) === "diff" ? { code: 128, stdout: "", stderr: "fatal: bad object" } : was(cmd, args, options);
    try {
      view.refresh(cx);
      await settle();
    } finally { stub.exec = was; }
    expect(view.files).toBe(files);
    expect(view.error).toBeNull();
    expect(view.loading).toBe(false);

    view.refresh(cx);
    await settle();
    expect(names(view)).toBe("b.js,big.js");
  });

  test("keeps the last diff when the branch can no longer be read", async () => {
    const { repo, git } = await branchRepo();
    const { view, cx, settle } = panel(repo, rangeSource(repo));
    await view.load(view.source, cx);
    const files = view.files;
    await git("checkout", "-q", "main");
    await git("branch", "-q", "-D", "feature");
    view.refresh(cx);
    await settle();
    expect(view.files).toBe(files);
    expect(view.error).toBeNull();
  });

  test("never polls a working tree or a single commit for tips", async () => {
    const { repo, git } = await branchRepo();
    const sha = (await git("rev-parse", "HEAD")).stdout.trim();
    for (const source of [{ repo, base: "main", head: "", commit: null }, { repo, base: "main", head: "", commit: sha }]) {
      const { view, cx, settle } = panel(repo, source);
      await view.load(source, cx);
      const spy = execs();
      try { view.refresh(cx); await settle(); } finally { spy.stop(); }
      expect(spy.seen.some((cmd) => cmd === "git rev-parse")).toBe(false);
    }
  });
});
