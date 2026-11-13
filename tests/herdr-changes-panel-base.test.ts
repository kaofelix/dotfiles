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

test("a branch is compared with its copy on origin", async () => {
  const repo = await cloned();
  await run(repo, "checkout", "-q", "-b", "pushed", "origin/pushed");
  expect(await git.defaultBase(repo, "pushed")).toBe("origin/pushed");
  expect(await git.defaultBase(repo, "main")).toBe("origin/main");
});

test("a branch origin doesn't have is compared with itself, and a detached HEAD with HEAD", async () => {
  const repo = await cloned();
  await run(repo, "checkout", "-q", "-b", "local-only");
  expect(await git.defaultBase(repo, "local-only")).toBe("local-only");
  expect(await git.defaultBase(repo, "HEAD")).toBe("HEAD");
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
