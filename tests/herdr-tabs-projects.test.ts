import { describe, expect, test } from "bun:test";
import { candidateFolders, pickRoot } from "../home/dot_config/herdr-app/mods/tabs-flat/projects.js";

const space = { id: "s1", folder: "/code/app", machine: null, active: true, tabs: [{ id: "t1" }, { id: "t2" }] };
const other = { id: "s2", folder: "/code/other", machine: null, active: false, tabs: [{ id: "t9" }] };
const pane = (pane, tab, cwd, mod) => ({ pane, tab, cwd: cwd ?? null, terminal: mod ? null : pane + "-term", ...(mod ? { mod } : {}) });

describe("project detection for the tab bar", () => {
  test("a focused panel with no folder still finds the space's projects", () => {
    const panes = [pane("p1", "t1", null, "kube"), pane("p2", "t1", "/code/app/worker"), pane("p3", "t2", "/code/app/docs"), pane("p9", "t9", "/code/other")];
    const folders = candidateFolders({ space: "s1", tab: "t1", pane: "p1", cwd: null }, [space, other], panes);
    expect(folders).toEqual(["/code/app/worker", "/code/app/docs", "/code/app"]);
  });

  test("the focused folder comes first, then its tab, then the rest of the space", () => {
    const panes = [pane("p2", "t2", "/code/app/b"), pane("p1", "t1", "/code/app/a"), pane("p4", "t1", "/code/app/c")];
    expect(candidateFolders({ space: "s1", tab: "t1", pane: "p1", cwd: "/code/app/a" }, [space, other], panes))
      .toEqual(["/code/app/a", "/code/app/c", "/code/app/b", "/code/app"]);
  });

  test("picks the first candidate that is a project and reports pending ones", () => {
    const known = new Map([["|/a", null], ["|/b", "/b-root"], ["|/c", "/c-root"]]);
    expect(pickRoot(["/a", "/b", "/c"], null, known)).toEqual({ root: { repo: "/b-root", on: null }, unknown: [] });
    expect(pickRoot(["/a", "/x", "/c"], null, known)).toEqual({ root: { repo: "/c-root", on: null }, unknown: ["/x"] });
    expect(pickRoot(["/a"], null, known)).toEqual({ root: null, unknown: [] });
  });
});
