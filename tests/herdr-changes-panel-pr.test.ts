import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHerdrStubs, realExec, stub } from "./support/herdr-changes-panel-stub";

installHerdrStubs();

let git: any, picker: any;
const dirs: string[] = [];

beforeAll(async () => {
  git = await import("../home/dot_config/herdr-app/mods/changes-panel/git.js");
  picker = await import("../home/dot_config/herdr-app/mods/pr-picker/main.js");
  stub.exec = realExec;
});
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

describe("remoteFor", () => {
  const remotes = "origin\tgit@github.com:me/fork.git (fetch)\nupstream\thttps://github.com/Acme/Tool.git (fetch)\n";
  test("picks the remote holding the PR's repository, whatever its URL style", () => {
    expect(git.remoteFor(remotes, "https://github.com/acme/tool/pull/7")).toBe("upstream");
    expect(git.remoteFor(remotes, "https://github.com/me/fork/pull/7")).toBe("origin");
  });
  test("falls back to the repository's own URL", () => {
    expect(git.remoteFor(remotes, "https://ghe.example.com/team/other/pull/3")).toBe("https://ghe.example.com/team/other.git");
  });
});

describe("pr-picker matches", () => {
  const prs = [
    { number: 12, title: "Fix login", author: "ana", headRefName: "fix/login" },
    { number: 345, title: "Add search", author: "bo", headRefName: "feat/search" },
  ];
  test("filters by number, title, author or branch", () => {
    expect(picker.matches(prs, "").map((p: any) => p.number)).toEqual([12, 345]);
    expect(picker.matches(prs, "#34").map((p: any) => p.number)).toEqual([345, 34]);
    expect(picker.matches(prs, "LOGIN").map((p: any) => p.number)).toEqual([12]);
    expect(picker.matches(prs, "bo").map((p: any) => p.number)).toEqual([345]);
  });
  test("offers a number that isn't listed", () => {
    expect(picker.matches(prs, "99").map((p: any) => p.number)).toEqual([99]);
    expect(picker.matches(prs, "12").map((p: any) => p.number)).toEqual([12]);
  });
});

test("fetchPullRequest fetches into the panel's own refs and leaves remote-tracking refs alone", async () => {
  const run = (repo: string, ...args: string[]) => realExec("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);
  const upstream = await mkdtemp(join(tmpdir(), "changes-panel-up-"));
  const clone = await mkdtemp(join(tmpdir(), "changes-panel-clone-"));
  dirs.push(upstream, clone);
  await run(upstream, "init", "-q", "-b", "main");
  await writeFile(join(upstream, "a.txt"), "one\n");
  await run(upstream, "add", ".");
  await run(upstream, "commit", "-q", "-m", "init");
  await run(clone, "clone", "-q", upstream, ".");
  const tracking = (await run(clone, "rev-parse", "origin/main")).stdout.trim();
  await writeFile(join(upstream, "a.txt"), "two\n");
  await run(upstream, "commit", "-q", "-am", "base moves");
  await run(upstream, "checkout", "-q", "-b", "topic");
  await writeFile(join(upstream, "b.txt"), "new\n");
  await run(upstream, "add", ".");
  await run(upstream, "commit", "-q", "-m", "topic");
  await run(upstream, "update-ref", "refs/pull/5/head", "topic");

  // The URL names the upstream folder, so remoteFor picks origin (a local path) over the network.
  const refs = await git.fetchPullRequest(clone, { number: 5, baseRefName: "main", url: `https://github.com/${upstream.split("/").slice(-2).join("/")}/pull/5` });
  expect(refs).toEqual({ base: "refs/changes-panel/pr/5/base", head: "refs/changes-panel/pr/5/head" });
  const sha = async (repo: string, ref: string) => (await run(repo, "rev-parse", ref)).stdout.trim();
  expect(await sha(clone, refs.head)).toBe(await sha(upstream, "topic"));
  expect(await sha(clone, refs.base)).toBe(await sha(upstream, "main"));
  expect(await sha(clone, "origin/main")).toBe(tracking);
});
