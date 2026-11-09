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
