import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHerdrStubs, realExec, stub } from "./support/herdr-changes-panel-stub";

installHerdrStubs();

const DIR = "../home/dot_config/herdr-app/mods/changes-panel";
let git: any;
const repos: string[] = [];
const calls = { exec: [] as string[], reads: [] as string[] };
let statWorks = true;

beforeAll(async () => {
  git = await import(`${DIR}/git.js`);
  stub.exec = (cmd: string, args: string[], options: any) => {
    calls.exec.push(cmd);
    if (cmd === "stat" && !statWorks) return { code: 1, stdout: "", stderr: "stat: unavailable" };
    return realExec(cmd, args, options);
  };
  stub.readTextFile = async (path: string) => {
    calls.reads.push(path);
    const text = await readFile(path, "utf8").catch(() => null);
    return text != null && text.length <= 1 << 20 ? text : null;
  };
});

afterAll(() => Promise.all(repos.map((repo) => rm(repo, { recursive: true, force: true }))));

// A repo with one edited tracked file and `count` untracked files under dist/, build output
// nobody put in .gitignore. Each test gets its own: the cache follows the last repo it saw.
async function makeRepo(count: number, size = 1000) {
  const repo = await mkdtemp(join(tmpdir(), "changes-panel-"));
  repos.push(repo);
  const run = (...args: string[]) => realExec("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);
  await run("init", "-q");
  await writeFile(join(repo, "tracked.js"), "export const a = 1;\n");
  await run("add", ".");
  await run("commit", "-q", "-m", "init");
  await writeFile(join(repo, "tracked.js"), "export const a = 2;\n");
  await mkdir(join(repo, "dist"));
  await Promise.all(Array.from({ length: count }, (_, i) => writeFile(join(repo, "dist", `chunk-${i}.js`), `// chunk ${i}\n`.padEnd(size, "x") + "\n")));
  return repo;
}

const tick = (repo: string) => git.diff({ repo, base: "HEAD" });
const reset = () => { calls.exec = []; calls.reads = []; };
const names = (reads: string[]) => reads.map((path) => path.split("/").pop()).sort();

describe("polling a working tree", () => {
  test("an unchanged tick reads no untracked file", async () => {
    const repo = await makeRepo(200, 500_000);
    await tick(repo);
    expect(calls.reads.length).toBe(200); // first sight reads them all
    reset();
    await tick(repo);
    await tick(repo);
    expect(calls.reads.length).toBe(0);
    expect(calls.exec.filter((cmd) => cmd === "stat").length).toBe(2); // one stat per tick, not per file
  });

  test("returns the same patch whether or not it came from the cache", async () => {
    const repo = await makeRepo(20);
    const cold = await tick(repo);
    const warm = await tick(repo);
    expect(warm.text).toBe(cold.text);
    expect(warm.text).toContain("+// chunk 7");
    expect(warm.text).toContain("-export const a = 1;");
  });

  test("rereads only the file that changed, and shows its new content", async () => {
    const repo = await makeRepo(20);
    await tick(repo);
    await writeFile(join(repo, "dist", "chunk-3.js"), "rewritten\n");
    reset();
    const { text } = await tick(repo);
    expect(names(calls.reads)).toEqual(["chunk-3.js"]);
    expect(text).toContain("+rewritten");
    expect(text).not.toContain("+// chunk 3");
  });

  test("notices an edit of the same size made at once, within the same second", async () => {
    const repo = await makeRepo(5);
    const file = join(repo, "dist", "chunk-1.js");
    await writeFile(file, "aaaa\n");
    await tick(repo);
    await writeFile(file, "bbbb\n"); // same length, moments later
    reset();
    const { text } = await tick(repo);
    expect(names(calls.reads)).toEqual(["chunk-1.js"]);
    expect(text).toContain("+bbbb");
    expect(text).not.toContain("+aaaa");
  });

  test("follows files that appear and disappear", async () => {
    const repo = await makeRepo(5);
    await tick(repo);
    await unlink(join(repo, "dist", "chunk-0.js"));
    await writeFile(join(repo, "dist", "fresh.js"), "brand new\n");
    reset();
    const { text } = await tick(repo);
    expect(names(calls.reads)).toEqual(["fresh.js"]);
    expect(text).not.toContain("dist/chunk-0.js");
    expect(text).toContain("+brand new");
  });

  test("falls back to reading everything when stat gives no answer", async () => {
    const repo = await makeRepo(10);
    const cold = await tick(repo);
    statWorks = false;
    try {
      reset();
      const { text } = await tick(repo);
      expect(calls.reads.length).toBe(10);
      expect(text).toBe(cold.text);
    } finally {
      statWorks = true;
    }
  });

  test("a different repository does not inherit another's cache", async () => {
    const one = await makeRepo(3);
    const two = await makeRepo(3);
    await tick(one);
    reset();
    await tick(two);
    expect(calls.reads.length).toBe(3);
  });
});

describe("fingerprinter", () => {
  const BSD = (paths: string[]) => paths.map((_, i) => `1794220328.38292498${i}:7729`).join("\n") + "\n";
  const GNU = (paths: string[]) => paths.map((_, i) => `1794220328.38292498${i}:7729`).join("\n") + "\n";

  test("uses GNU stat when the BSD form is not understood, and remembers it", async () => {
    const forms: string[] = [];
    const run = async (_cmd: string, args: string[]) => {
      forms.push(args[1]);
      return args[1] === "-c" ? { code: 0, stdout: GNU(["a", "b"]), stderr: "" } : { code: 1, stdout: "", stderr: "illegal option" };
    };
    const print = git.fingerprinter(run);
    expect(await print("/r", ["a", "b"])).toHaveLength(2);
    expect(forms).toEqual(["-f", "-c"]);
    forms.length = 0;
    await print("/r", ["a", "b"]);
    expect(forms).toEqual(["-c"]);
  });

  test("rejects output that is not one clean line per path", async () => {
    const answer = (stdout: string, code = 0) => async () => ({ code, stdout, stderr: "" });
    expect(await git.fingerprinter(answer(BSD(["a"])))("/r", ["a", "b"])).toBeNull(); // a path missing
    expect(await git.fingerprinter(answer("garbage\nlines\n"))("/r", ["a", "b"])).toBeNull();
    expect(await git.fingerprinter(answer(BSD(["a"]), 1))("/r", ["a"])).toBeNull(); // stat failed
    expect(await git.fingerprinter(async () => { throw new Error("no stat"); })("/r", ["a"])).toBeNull();
  });

  test("asks nothing about no files", async () => {
    let asked = 0;
    expect(await git.fingerprinter(async () => { asked++; return { code: 0, stdout: "", stderr: "" }; })("/r", [])).toEqual([]);
    expect(asked).toBe(0);
  });
});
