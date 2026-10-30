import { describe, expect, test } from "bun:test";
import { fuzzyScore, normalizePath, projectRows } from "../home/dot_config/herdr-app/mods/projects/model.js";

const home = "/Users/example";
const projects = ["NemoClaw", "dotfiles", "pi"].map(name => ({ name, path: `${home}/Code/${name}` }));
const space = (id, folder, machine = null) => ({ id, folder, machine, tabs: [{ id: `${id}-tab` }], active: false });

describe("local project picker", () => {
  test("matches ordered letters regardless of case, preferring an exact name", () => {
    expect(fuzzyScore("NemoClaw", "nmcl")).not.toBeNull();
    expect(fuzzyScore("NemoClaw", "CLNM")).toBeNull();
    expect(fuzzyScore("pi", "PI")).toBeGreaterThan(fuzzyScore("pi-openshell", "PI"));
    expect(projectRows(projects, "dtf", [], [], home).map(row => row.name)).toEqual(["dotfiles"]);
    expect(projectRows(projects, "unknown", [], [], home)).toEqual([]);
  });

  test("puts open projects first and reuses a renamed space in a subfolder", () => {
    const open = space("renamed-space", "~/Code/pi/src/");
    const rows = projectRows(projects, "", [open], [], home);
    expect(rows[0].name).toBe("pi");
    expect(rows[0].space.id).toBe(open.id);
  });

  test("ignores remote spaces and folders with only a shared prefix", () => {
    const spaces = [space("remote", `${home}/Code/pi`, "server"), space("other", `${home}/Code/pi-extra`)];
    expect(projectRows(projects, "pi", spaces, [], home)[0].space).toBeUndefined();
  });

  test("finds a project in another terminal of an existing space", () => {
    const open = space("work", home);
    const panes = [{ tab: "work-tab", cwd: `${home}/Code/dotfiles/home` }];
    expect(projectRows(projects, "dtf", [open], panes, home)[0].space.id).toBe("work");
  });

  test("prefers the active space when the project is open more than once", () => {
    const first = space("first", `${home}/Code/pi`);
    const active = { ...space("active", `${home}/Code/pi`), active: true };
    expect(projectRows(projects, "pi", [first, active], [], home)[0].space.id).toBe("active");
  });

  test("normalizes home, trailing slashes and dot segments", () => {
    expect(normalizePath("~/Code/pi/../dotfiles/", home)).toBe(`${home}/Code/dotfiles`);
    expect(normalizePath(null, home)).toBe("");
  });
});
