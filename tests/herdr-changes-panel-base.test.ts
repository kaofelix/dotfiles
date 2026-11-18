import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHerdrStubs, realExec, stub } from "./support/herdr-changes-panel-stub";

installHerdrStubs();

let git: any;
const dirs: string[] = [];
beforeAll(async () => {
  git = await import("../home/dot_config/herdr-app/mods/changes-panel/git.js");
  stub.exec = realExec;
});
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const run = (repo: string, ...args: string[]) => realExec("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);
async function commit(repo: string, file: string, text: string) {
  await writeFile(join(repo, file), text);
  await run(repo, "add", ".");
  await run(repo, "commit", "-q", "-m", file);
}
async function cloned() {
  const upstream = await mkdtemp(join(tmpdir(), "changes-panel-up-"));
  const clone = await mkdtemp(join(tmpdir(), "changes-panel-clone-"));
  dirs.push(upstream, clone);
  await run(upstream, "init", "-q", "-b", "main");
  await commit(upstream, "a.txt", "one\n");
  await run(upstream, "branch", "pushed");
  await run(clone, "clone", "-q", upstream, ".");
  return clone;
}

const sha = async (repo: string, ref = "HEAD") => (await run(repo, "rev-parse", ref)).stdout.trim();

test("a trunk is compared with its copy on origin, so what isn't pushed shows", async () => {
  const repo = await cloned();
  expect(await git.baseFor(repo, "main")).toEqual({ base: "origin/main", target: null, own: "origin/main" });
});

test("a branch started from origin's v1 is compared with v1, and knows its own pushed copy", async () => {
  const repo = await cloned();
  // v1 has moved on from main, as a release line does.
  await run(repo, "checkout", "-q", "-b", "v1");
  await commit(repo, "v1.txt", "v1\n");
  await run(repo, "push", "-q", "origin", "v1");
  await run(repo, "checkout", "-q", "main");
  await run(repo, "branch", "-q", "-D", "v1");
  await run(repo, "fetch", "-q");
  // A worktree branch whose upstream is the trunk it came from.
  await run(repo, "checkout", "-q", "-b", "feat/x", "--track", "origin/v1");
  await commit(repo, "x.txt", "x\n");
  expect(await git.baseFor(repo, "feat/x")).toEqual({ base: "origin/v1", target: "origin/v1", own: null });
  // Pushed and tracking its own copy: the target is the trunk it forked from, nearest first.
  await run(repo, "push", "-q", "-u", "origin", "feat/x");
  await commit(repo, "y.txt", "y\n");
  expect(await git.baseFor(repo, "feat/x")).toEqual({ base: "origin/v1", target: "origin/v1", own: "origin/feat/x" });
});

test("the fork point picks the nearest trunk, and the GitHub CLI's merge base wins over it", async () => {
  const repo = await cloned();
  await commit(repo, "main2.txt", "2\n");
  await run(repo, "push", "-q", "origin", "main");
  await run(repo, "push", "-q", "origin", "HEAD~1:refs/heads/v1");
  await run(repo, "fetch", "-q");
  await run(repo, "checkout", "-q", "-b", "local-only");
  await commit(repo, "b.txt", "b\n");
  expect((await git.baseFor(repo, "local-only")).base).toBe("origin/main");
  await run(repo, "config", "branch.local-only.gh-merge-base", "v1");
  expect((await git.baseFor(repo, "local-only")).base).toBe("origin/v1");
});

test("a branch with nothing to fork from is compared with itself; a detached HEAD looks for a trunk", async () => {
  const repo = await cloned();
  await run(repo, "checkout", "-q", "--detach");
  expect((await git.baseFor(repo, "HEAD")).base).toBe("origin/main");
  await run(repo, "checkout", "-q", "--orphan", "fresh");
  await commit(repo, "c.txt", "c\n");
  expect((await git.baseFor(repo, "fresh")).base).toBe("fresh");
});

test("refs keep each branch next to its copies on remotes", () => {
  expect(git.groupRefs(["refs/remotes/origin/v1", "refs/heads/feat", "refs/heads/v1", "refs/remotes/origin/feat", "refs/tags/v1", "refs/remotes/up/v1"]))
    .toEqual(["v1", "origin/v1", "up/v1", "feat", "origin/feat", "v1"]);
});

test("the working tree lists the commits under it, and its HEAD shows when one lands", async () => {
  const repo = await cloned();
  await run(repo, "checkout", "-q", "-b", "feat");
  await commit(repo, "b.txt", "b\n");
  expect((await git.commits(repo, "origin/main", "")).map((c: any) => c.subject)).toEqual(["b.txt"]);
  expect(await git.headCommit(repo)).toBe(await sha(repo));
});

test("refFor names a branch by origin's copy, else the local branch", async () => {
  const repo = await cloned();
  await run(repo, "branch", "only-here");
  expect(await git.refFor(repo, "main")).toBe("origin/main");
  expect(await git.refFor(repo, "only-here")).toBe("only-here");
  expect(await git.refFor(repo, "nope")).toBeNull();
});

test("histories that never met are compared directly instead of failing", async () => {
  const repo = await cloned();
  await run(repo, "checkout", "-q", "--orphan", "fresh");
  await run(repo, "rm", "-q", "-rf", ".");
  await commit(repo, "b.txt", "two\n");
  await writeFile(join(repo, "b.txt"), "three\n");
  const { text } = await git.diff({ repo, base: "origin/main", head: "" });
  expect(text).toContain("+three");
  expect(text).toContain("-one");
  const branch = await git.diff({ repo, base: "origin/main", head: "fresh" });
  expect(branch.text).toContain("+two");
});
