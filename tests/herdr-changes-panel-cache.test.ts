import { beforeAll, describe, expect, test } from "bun:test";
import { installHerdrStubs } from "./support/herdr-changes-panel-stub";

installHerdrStubs();

const DIR = "../home/dot_config/herdr-app/mods/changes-panel";
let Panel: any, parsePatch: any;
beforeAll(async () => {
  Panel = (await import(`${DIR}/main.js`)).default;
  parsePatch = (await import(`${DIR}/patch.js`)).parsePatch;
});

// A blob id, as git would print: it changes whenever the content does.
const oid = (n: number) => n.toString(16).padStart(40, "0");

// A working-tree diff of `names`, where each file's third line carries `edit[name]`.
const patch = (names: string[], edit: Record<string, number>) => names.map((name) => {
  const body = Array.from({ length: 30 }, (_, i) => ` line ${i}`);
  body[3] = `-old ${name}\n+new ${name} v${edit[name] ?? 0}`;
  return `diff --git a/${name} b/${name}\nindex ${oid(0)}..${oid(edit[name] ?? 0)} 100644\n--- a/${name}\n+++ b/${name}\n@@ -1,30 +1,31 @@\n${body.join("\n")}\n`;
}).join("");

// What refresh() does on each tick: parse the new diff against the old files, then rebuild.
function tick(view: any, text: string) {
  view.rev += 1;
  view.files = parsePatch(text, view.rev, view.files);
  view.rebuild();
}

function panel(style = "split") {
  const view = Object.create(Panel.prototype);
  Object.assign(view, {
    rev: 0, files: [], rowsCache: new Map(), expanded: new Map(), open: new Map(), moves: { perFile: new Map(), lines: new Set() },
    prefs: { diffStyle: style }, review: { viewed: {}, comments: [] }, only: null, editing: null, mainW: 900, charW: 7.5,
  });
  return view;
}

const names = ["a.js", "b.js", "c.js"];

describe("rows cache", () => {
  test("stays bounded while an agent keeps editing one file", () => {
    const view = panel();
    const edit: Record<string, number> = {};
    for (let n = 1; n <= 200; n++) {
      edit["b.js"] = n;
      tick(view, patch(names, edit));
      if (n % 50 === 0) expect(view.rowsCache.size).toBeLessThanOrEqual(names.length * 2);
    }
    expect(view.rowsCache.size).toBeLessThanOrEqual(names.length * 2);
  });

  test("keeps every shown file's rows, and reuses them while nothing changes", () => {
    const view = panel();
    tick(view, patch(names, {}));
    const before = names.map((_, i) => view.rowsFor(view.files[i]));
    tick(view, patch(names, {}));
    names.forEach((_, i) => expect(view.rowsFor(view.files[i])).toBe(before[i]));
    expect(view.rowsCache.size).toBe(names.length);
  });

  test("drops the old rows of a file that changed", () => {
    const view = panel();
    tick(view, patch(names, {}));
    const old = view.rowsFor(view.files[1]);
    tick(view, patch(names, { "b.js": 1 }));
    expect(view.rowsFor(view.files[1])).not.toBe(old);
    expect(view.rowsCache.size).toBe(names.length);
  });

  test("drops the rows of a collapsed file, and rebuilds them when it opens again", () => {
    const view = panel();
    tick(view, patch(names, {}));
    view.open.set("b.js", false);
    view.rebuild();
    expect(view.rowsCache.size).toBe(2);
    view.open.set("b.js", true);
    view.rebuild();
    expect(view.rowsCache.size).toBe(3);
  });

  test("keeps only the rows of the diff style being shown", () => {
    const view = panel("split");
    tick(view, patch(names, {}));
    view.prefs.diffStyle = "unified";
    view.rebuild();
    expect(view.rowsCache.size).toBe(names.length);
    expect([...view.rowsCache.keys()].every((key: string) => key.includes("|unified|"))).toBe(true);
  });

  test("shows one file on its own and frees the others", () => {
    const view = panel();
    tick(view, patch(names, {}));
    view.only = "c.js";
    view.rebuild();
    expect([...view.rowsCache.keys()].map((key: string) => key.split("|")[0])).toEqual(["c.js"]);
  });

  test("drops a file that left the diff", () => {
    const view = panel();
    tick(view, patch(names, {}));
    tick(view, patch(["a.js"], {}));
    expect(view.rowsCache.size).toBe(1);
  });
});
