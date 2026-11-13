import { beforeAll, describe, expect, test } from "bun:test";
import { installHerdrStubs, stub } from "./support/herdr-changes-panel-stub";

installHerdrStubs();

const DIR = "../home/dot_config/herdr-app/mods/changes-panel";
let git: any, review: any, main: any;

beforeAll(async () => {
  git = await import(`${DIR}/git.js`);
  review = await import(`${DIR}/review.js`);
  main = await import(`${DIR}/main.js`);
});

describe("gitOn", () => {
  test("runs every command and read on its machine, and only there", async () => {
    const calls: any[] = [];
    stub.exec = async (command: string, args: string[], options: any = {}) => {
      calls.push({ command, on: options.on });
      if (args.includes("ls-files")) return { code: 0, stdout: "new.txt\0", stderr: "" };
      return { code: 0, stdout: command === "stat" ? "1.5:3\n" : "", stderr: "" };
    };
    const reads: any[] = [];
    stub.readTextFile = async (path: string, options: any = {}) => { reads.push(options.on); return "hi\n"; };

    await git.gitOn("sparky").diff({ repo: "/r", base: "main", head: "" });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.on === "sparky")).toBe(true);
    expect(reads).toEqual(["sparky"]);

    calls.length = 0;
    await git.diff({ repo: "/r", base: "main", head: "" });
    expect(calls.every((c) => c.on === undefined)).toBe(true);
  });
});

test("review progress on another machine is kept apart from the same path here", () => {
  const here = { repo: "/r", base: "main", head: "topic" };
  const there = { ...here, on: "sparky" };
  expect(review.reviewKey(here)).toBe("/r:main...topic");
  expect(review.reviewKey(there)).not.toBe(review.reviewKey(here));
  expect(review.rangeKey(there)).not.toBe(review.rangeKey(here));
});

test("editorUrl opens remote files over SSH", () => {
  expect(main.editorUrl("vscode", "/a b/x.js", 3)).toBe("vscode://file/a%20b/x.js:3");
  expect(main.editorUrl("vscode", "/r/x.js", 3, "me@host")).toBe("vscode://vscode-remote/ssh-remote+me@host/r/x.js:3");
  expect(main.editorUrl("cursor", "/r/x.js", 3, "me@host")).toBe("cursor://vscode-remote/ssh-remote+me@host/r/x.js:3");
  expect(main.editorUrl("zed", "/r/x.js", 3, "me@host")).toBe("zed://ssh/me@host/r/x.js:3");
});
