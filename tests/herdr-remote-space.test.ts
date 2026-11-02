import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLONE_SCRIPT, cloneArgv, cloneCommand, detectForge, forgeFromHost, parseRemote, repoPath, sameRepo,
} from "../home/dot_config/herdr-app/mods/space-from-remote/model.js";

describe("remote URL parsing", () => {
  test("reads https, ssh and scp-style remotes", () => {
    const expected = { host: "github.com", segments: ["owner", "repo.git"] };
    expect(parseRemote("https://github.com/owner/repo.git")).toEqual(expected);
    expect(parseRemote("ssh://git@github.com:22/owner/repo.git")).toEqual(expected);
    expect(parseRemote("git@github.com:owner/repo.git")).toEqual(expected);
    expect(parseRemote("  github.com/owner/repo.git  ")).toEqual(expected);
  });

  test("drops web-only parts, queries and fragments", () => {
    expect(parseRemote("https://github.com/owner/repo/tree/main?tab=x#top")?.segments)
      .toEqual(["owner", "repo", "tree", "main"]);
    expect(parseRemote("https://gitlab.example.com/group/sub/repo/-/tree/main")?.segments)
      .toEqual(["group", "sub", "repo"]);
  });

  test("lowercases the host and keeps nested GitLab groups", () => {
    expect(parseRemote("https://GitLab.Example.COM/group/sub/repo")).toEqual({
      host: "gitlab.example.com", segments: ["group", "sub", "repo"],
    });
  });

  test("rejects anything that is not a plain host and project path", () => {
    for (const bad of ["", "owner/repo", "https://github.com/owner", "https://github.com/owner/repo;rm -rf x",
      "https://github.com/owner/$(id)", "https://bad host/owner/repo", "not a url", "https:///owner/repo"]) {
      expect(parseRemote(bad)).toBeNull();
    }
  });
});

describe("project paths", () => {
  test("GitHub projects are owner/repo; GitLab keeps nested groups", () => {
    expect(repoPath("github", ["owner", "repo.git", "tree", "main"])).toEqual({ path: "owner/repo", name: "repo" });
    expect(repoPath("gitlab", ["group", "sub", "repo.git"])).toEqual({ path: "group/sub/repo", name: "repo" });
  });

  test("an existing checkout matches regardless of protocol, case and .git", () => {
    const repo = repoPath("gitlab", ["Group", "Repo"]);
    expect(sameRepo("git@gitlab.example.com:group/repo.git", "gitlab", "gitlab.example.com", repo)).toBe(true);
    expect(sameRepo("https://gitlab.example.com/other/repo", "gitlab", "gitlab.example.com", repo)).toBe(false);
    expect(sameRepo("https://elsewhere.example.com/group/repo", "gitlab", "gitlab.example.com", repo)).toBe(false);
    expect(sameRepo("not a remote", "gitlab", "gitlab.example.com", repo)).toBe(false);
  });
});

describe("forge detection", () => {
  test("uses the host name when it names exactly one forge", () => {
    expect(forgeFromHost("github.com")).toBe("github");
    expect(forgeFromHost("gitlab.example.com")).toBe("gitlab");
    expect(forgeFromHost("git.example.com")).toBeNull();
    expect(forgeFromHost("github-gitlab-bridge.example.com")).toBeNull();
  });

  // Fake exec: `answers` maps "command arg arg" prefixes to a result, anything else fails to start.
  const fake = (answers: Record<string, { code: number; stdout?: string }>) => {
    const calls: string[] = [];
    const exec = async (command: string, args: string[] = []) => {
      const line = [command, ...args].join(" ");
      calls.push(line);
      const key = Object.keys(answers).find(prefix => line.startsWith(prefix));
      if (!key) throw new Error("not installed");
      return { code: answers[key].code, stdout: answers[key].stdout ?? "", stderr: "" };
    };
    return { exec, calls };
  };

  test("a forge-named host never needs a server request, and reports its login", async () => {
    const { exec, calls } = fake({ "glab auth status": { code: 0 }, "gh auth status": { code: 1 } });
    expect(await detectForge("gitlab.example.com", { exec })).toEqual({ forge: "gitlab", authed: true, how: "hostname" });
    expect(calls.some(line => line.startsWith("curl"))).toBe(false);
  });

  test("an unnamed host belongs to the only CLI logged in there", async () => {
    const { exec } = fake({ "glab auth status": { code: 1 }, "gh auth status": { code: 0 } });
    expect(await detectForge("git.example.com", { exec })).toEqual({ forge: "github", authed: true, how: "login" });
  });

  test("otherwise asks the server: GitLab's version endpoint, then GitHub's API headers", async () => {
    const none = { "glab auth status": { code: 1 }, "gh auth status": { code: 1 } };
    const gitlab = fake({ ...none, "curl -s -m 5 -o /dev/null": { code: 0, stdout: "401" } });
    expect(await detectForge("git.example.com", { exec: gitlab.exec })).toEqual({ forge: "gitlab", authed: false, how: "server" });
    const github = fake({ ...none, "curl -s -m 5 -o /dev/null": { code: 0, stdout: "404" },
      "curl -s -m 5 -I": { code: 0, stdout: "HTTP/2 200\r\nX-GitHub-Enterprise-Version: 3.9\r\n" } });
    expect(await detectForge("git.example.com", { exec: github.exec })).toEqual({ forge: "github", authed: false, how: "server" });
  });

  test("gives up when nothing identifies the host or the tools are missing", async () => {
    const { exec } = fake({ "curl": { code: 0, stdout: "404" } });
    expect(await detectForge("git.example.com", { exec })).toBeNull();
    expect(await detectForge("git.example.com", { exec: async () => { throw new Error("no"); } })).toBeNull();
  });
});

describe("clone command", () => {
  test("logged-in CLIs resolve the project themselves; glab without login gets a URL", () => {
    expect(cloneCommand({ forge: "github", host: "github.com", path: "owner/repo", authed: false }))
      .toEqual({ cli: "gh", env: "GH_HOST", repo: "owner/repo" });
    expect(cloneCommand({ forge: "gitlab", host: "gitlab.example.com", path: "g/sub/r", authed: true }))
      .toEqual({ cli: "glab", env: "GITLAB_HOST", repo: "g/sub/r" });
    expect(cloneCommand({ forge: "gitlab", host: "gitlab.example.com", path: "g/sub/r", authed: false }))
      .toEqual({ cli: "glab", env: "", repo: "https://gitlab.example.com/g/sub/r" });
  });

  const run = (cli: string, env: string, dir: string, extra: Record<string, string> = {}) => {
    const dest = join(dir, "dest dir");
    const argv = cloneArgv({ cli, env, repo: "g/r" }, "git.example.com", dest);
    const result = Bun.spawnSync(argv, { env: { ...process.env, SHELL: "/usr/bin/true", ...extra }, cwd: dir });
    return { dest, text: result.stdout.toString() + result.stderr.toString(), code: result.exitCode };
  };

  const fakeCli = (dir: string, body: string) => {
    const path = join(dir, "fakecli");
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
    return path;
  };

  test("the script exports the host, passes the arguments through and ends in the new checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "remote-space-"));
    const cli = fakeCli(dir, `printf '%s|%s|%s|%s|%s\\n' "$FAKE_HOST" "$1" "$2" "$3" "$4" >> "${dir}/log"\nmkdir -p "$4"`);
    const { dest, code } = run(cli, "FAKE_HOST", dir);
    expect(code).toBe(0);
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(join(dir, "log"), "utf8").trim()).toBe(`git.example.com|repo|clone|g/r|${dest}`);
  });

  test("a failed clone explains how to retry and still leaves a shell", () => {
    const dir = mkdtempSync(join(tmpdir(), "remote-space-"));
    mkdirSync(dir, { recursive: true });
    const cli = fakeCli(dir, "exit 3");
    const { text, code } = run(cli, "", dir);
    expect(code).toBe(0);
    expect(text).toContain("Clone failed");
    expect(text).toContain("repo clone g/r");
  });

  test("the script text is shell-safe: user input only ever arrives as arguments", () => {
    expect(CLONE_SCRIPT).not.toMatch(/\$\{?[6-9]/);
    expect(CLONE_SCRIPT).toContain('"$4"');
  });
});
