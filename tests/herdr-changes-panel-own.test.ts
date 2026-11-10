import { describe, expect, test } from "bun:test";
import { findMoves, isMoved } from "../home/dot_config/herdr-app/mods/changes-panel/moved.js";
import { areas, reviewOrder } from "../home/dot_config/herdr-app/mods/changes-panel/insights.js";
import { parsePatch } from "../home/dot_config/herdr-app/mods/changes-panel/patch.js";
import { abbreviatePath, treeOrder, treeRows } from "../home/dot_config/herdr-app/mods/changes-panel/tree.js";
import { partAt, partsWidth, rowAt } from "../home/dot_config/herdr-app/mods/changes-panel/pointer.js";

const diff = (path: string, lines: string[], hunk = "@@ -1,3 +1,3 @@") =>
  `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n${hunk}\n${lines.join("\n")}\n`;

describe("pointer", () => {
  const sizes = [40, 20, 20, 28, 40];

  test("rowAt walks the row heights from the first row drawn", () => {
    expect(rowAt(sizes, 0, 0)).toBe(0);
    expect(rowAt(sizes, 0, 39)).toBe(0);
    expect(rowAt(sizes, 0, 40)).toBe(1);
    expect(rowAt(sizes, 1, 45)).toBe(3);
    expect(rowAt(sizes, 3, 27)).toBe(3);
    expect(rowAt(sizes, 3, 28)).toBe(4);
  });

  test("rowAt is null below the last row and ignores a negative start", () => {
    expect(rowAt(sizes, 0, 148)).toBeNull();
    expect(rowAt(sizes, 4, 40)).toBeNull();
    expect(rowAt([], 0, 5)).toBeNull();
    expect(rowAt(sizes, -3, 0)).toBe(0);
  });

  test("rowAt stops at the item count, not the sizes length", () => {
    expect(rowAt(sizes, 0, 100, 3)).toBeNull();
    expect(rowAt(sizes, 0, 79, 3)).toBe(2);
  });

  const parts = [
    { id: "viewed", width: 24, click: true },
    { id: "stats", width: 60, click: false },
    { id: "editor", width: 24, click: true },
  ];
  // From the right edge: 14 padding, Viewed 14-38, gap, stats 46-106, gap, editor 114-138.
  const at = (x: number) => partAt(x, parts, 14, 8);

  test("partAt finds the clickable part a press landed on", () => {
    expect(at(20)).toBe("viewed");
    expect(at(120)).toBe("editor");
  });

  test("partAt gives the right padding to the rightmost part and splits gaps between neighbours", () => {
    expect(at(0)).toBe("viewed");
    expect(at(41)).toBe("viewed"); // first half of the gap
    expect(at(42)).toBeNull(); // second half: the stats'
    expect(at(110)).toBe("editor"); // the editor's half of the gap
    expect(at(141)).toBe("editor");
    expect(at(142)).toBeNull();
  });

  test("partAt reports a part that isn't clickable, and anything past the parts, as nothing", () => {
    expect(at(80)).toBeNull();
    expect(at(600)).toBeNull();
  });

  test("partAt follows the list: without the editor its place is the rest of the row", () => {
    expect(partAt(120, parts.slice(0, 2), 14, 8)).toBeNull();
  });

  test("partsWidth counts each part and the gap beside it", () => {
    expect(partsWidth(parts, 8)).toBe(24 + 60 + 24 + 3 * 8);
    expect(partsWidth([], 8)).toBe(0);
  });
});

describe("moved code", () => {
  const block = ["function load(cx) {", "  const rows = read(cx);", "  return rows.map(fmt);", "}"];

  test("marks a block removed in one file and added, re-indented, in another", () => {
    const files = parsePatch(
      diff("a.js", block.map((l) => `-${l}`), "@@ -1,4 +0,0 @@") +
      diff("b.js", block.map((l) => `+  ${l}`), "@@ -0,0 +1,4 @@"),
    );
    const moves = findMoves(files);
    const [a, b] = files;
    expect(isMoved(moves, a.id, "old", 1)).toBe(true);
    expect(isMoved(moves, b.id, "new", 3)).toBe(true);
    expect(moves.perFile.get(a.id)).toBeGreaterThanOrEqual(3);
    expect(moves.perFile.get(b.id)).toBeGreaterThanOrEqual(3);
  });

  test("two matching lines are a coincidence, not a move", () => {
    const files = parsePatch(
      diff("a.js", ["-const x = compute();", "-const y = other();"], "@@ -1,2 +0,0 @@") +
      diff("b.js", ["+const x = compute();", "+const y = other();"], "@@ -0,0 +1,2 @@"),
    );
    expect(findMoves(files).lines.size).toBe(0);
  });

  test("runs of braces and blank lines never count", () => {
    const trivial = ["}", "}", "}", "", "});"];
    const files = parsePatch(
      diff("a.js", trivial.map((l) => `-${l}`), "@@ -1,5 +0,0 @@") +
      diff("b.js", trivial.map((l) => `+${l}`), "@@ -0,0 +1,5 @@"),
    );
    expect(findMoves(files).lines.size).toBe(0);
  });

  test("a plain edit in place is not a move", () => {
    const files = parsePatch(diff("a.js", ["-const a = 1;", "+const a = 2;", " keep();"], "@@ -1,2 +1,2 @@"));
    expect(findMoves(files).lines.size).toBe(0);
  });
});

describe("review order", () => {
  const f = (name: string, extra = {}) => ({ name, id: name, ...extra });

  test("contracts first, then tests, code, config and docs, generated last", () => {
    const order = reviewOrder([
      f("README.md"), f("package-lock.json", { generated: true }), f("src/app.js"), f("config/app.yaml"),
      f("src/app.test.js"), f("db/migrations/001.sql"), f("src/types/user.d.ts"),
    ]).map((x: any) => x.name);
    expect(order).toEqual([
      "db/migrations/001.sql", "src/types/user.d.ts", "src/app.test.js", "src/app.js", "config/app.yaml", "README.md", "package-lock.json",
    ]);
  });

  test("keeps the given order within a rank", () => {
    expect(reviewOrder([f("b.js"), f("a.js"), f("c.js")]).map((x: any) => x.name)).toEqual(["b.js", "a.js", "c.js"]);
  });
});

describe("areas", () => {
  const f = (name: string, add: number, del: number) => ({ name, add, del });

  test("groups by the next folder, biggest first, counting viewed files", () => {
    const rows = areas([f("src/a.js", 5, 1), f("src/b.js", 1, 0), f("docs/x.md", 20, 0), f("top.js", 2, 2)], "", (file: any) => file.name === "src/a.js");
    expect(rows.map((r: any) => [r.path, r.files, r.add + r.del, r.viewed, r.deeper])).toEqual([
      ["docs/", 1, 20, 0, true], ["src/", 2, 7, 1, true], ["top.js", 1, 4, 0, false],
    ]);
  });

  test("drills into a folder and skips files outside it", () => {
    const rows = areas([f("src/lib/a.js", 3, 0), f("src/b.js", 1, 0), f("docs/x.md", 9, 0)], "src/", () => false);
    expect(rows.map((r: any) => r.path)).toEqual(["src/lib/", "src/b.js"]);
  });
});

describe("diff order follows the file tree", () => {
  const file = (name: string) => ({ id: name, name, add: 1, del: 0, type: "change" });
  // git lists paths bytewise, with files and folders interleaved; untracked files come last.
  const gitOrder = ["Makefile", "README.md", "a/b.js", "a/sub/c.js", "a/z.js", "src/lib/x.js", "src/app.js", "zed.txt", "new/untracked.js"].map(file);

  test("folders come before the files beside them, depth first, like the tree", () => {
    expect(treeOrder(gitOrder).map((f: any) => f.name)).toEqual([
      "a/sub/c.js", "a/b.js", "a/z.js", "new/untracked.js", "src/lib/x.js", "src/app.js", "Makefile", "README.md", "zed.txt",
    ]);
  });

  test("matches the order of the file rows in the tree, for the same files", () => {
    const names = ["b/x.js", "b.js", "a/b/c/d.js", "a/b/e.js", "a.js", "a/f.js", "B/y.js", "z/z/z.js", "z/a.js", "m.md", "docs/readme.md", "docs/img/a.png"];
    const files = names.map(file);
    const fromTree = treeRows(files).filter((row: any) => row.kind === "file").map((row: any) => row.id);
    expect(treeOrder(files).map((f: any) => f.id)).toEqual(fromTree);
    expect(treeOrder([...files].reverse()).map((f: any) => f.id)).toEqual(fromTree);
  });

  test("does not change the list it is given, and keeps equal names in order", () => {
    const input = ["b.js", "a.js"].map(file);
    treeOrder(input);
    expect(input.map((f: any) => f.name)).toEqual(["b.js", "a.js"]);
    expect(treeOrder([])).toEqual([]);
  });
});

describe("abbreviatePath", () => {
  const path = "adapters/typescript/pi/src/agent-runtime.ts";
  test("leaves a path that fits alone", () => {
    expect(abbreviatePath(path, path.length)).toBe(path);
    expect(abbreviatePath("cli.ts", 3)).toBe("cli.ts");
  });
  test("folds middle folders, keeping the first folder, the last folders that fit and the file name", () => {
    expect(abbreviatePath(path, path.length - 1)).toBe("adapters/…/pi/src/agent-runtime.ts");
    expect(abbreviatePath(path, 31)).toBe("adapters/…/src/agent-runtime.ts");
    expect(abbreviatePath(path, 27)).toBe("adapters/…/agent-runtime.ts");
  });
  test("keeps the whole file name even when nothing else fits", () => {
    expect(abbreviatePath(path, 5)).toBe("…/agent-runtime.ts");
  });
  test("always keeps the file name and stays within budget when it can", () => {
    for (let n = 1; n < path.length; n++) {
      const out = abbreviatePath(path, n);
      expect(out.endsWith("/agent-runtime.ts")).toBe(true);
      expect(out.length).toBeLessThanOrEqual(Math.max(n, "…/agent-runtime.ts".length));
    }
  });
});
