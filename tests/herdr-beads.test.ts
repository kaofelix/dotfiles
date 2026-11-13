import { describe, expect, test } from "bun:test";
import { buildRows, parseQuery, relations, sectionOf } from "../home/dot_config/herdr-app/mods/beads/model.js";

const issue = (id, extra = {}) => ({ id, title: id, status: "open", priority: 2, issue_type: "task", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...extra });
const blocks = (from, on) => ({ issue_id: from, depends_on_id: on, type: "blocks" });
const rowsOf = (rows) => rows.map(r => r.kind === "section" ? `# ${r.id} ${r.count}` : `${"  ".repeat(r.depth)}${r.issue.id}${r.context ? " (context)" : ""}`);

describe("beads model", () => {
  test("groups issues into status sections, an open issue with an open blocker is blocked", () => {
    const all = [issue("a", { status: "in_progress" }), issue("b", { dependencies: [blocks("b", "a")] }), issue("c"), issue("d", { status: "closed" }), issue("e", { dependencies: [blocks("e", "d")] })];
    const byId = new Map(all.map(i => [i.id, i]));
    expect(all.map(i => sectionOf(i, byId))).toEqual(["in_progress", "blocked", "open", "closed", "open"]);
  });

  test("shows a closed child under its open epic as context in the closed section", () => {
    const all = [issue("ep", { issue_type: "epic" }), issue("ep.1", { parent: "ep", status: "closed" }), issue("ep.2", { parent: "ep" })];
    expect(rowsOf(buildRows(all, {}))).toEqual(["# open 2", "ep", "  ep.2", "# closed 1", "ep (context)", "  ep.1"]);
  });

  test("filters keep matching issues and their ancestors as context", () => {
    const all = [issue("ep", { issue_type: "epic", title: "Platform" }), issue("ep.1", { parent: "ep", title: "Login bug", issue_type: "bug" }), issue("ep.2", { parent: "ep", title: "Docs" })];
    expect(rowsOf(buildRows(all, { query: "login" }))).toEqual(["# open 1", "ep (context)", "  ep.1"]);
    expect(rowsOf(buildRows(all, { query: "type:bug" }))).toEqual(["# open 1", "ep (context)", "  ep.1"]);
    expect(rowsOf(buildRows(all, { query: "-type:bug -type:epic" }))).toEqual(["# open 1", "ep (context)", "  ep.2"]);
  });

  test("query understands priority, assignee, label and status tokens", () => {
    const all = [issue("x", { priority: 0, assignee: "Alice", labels: ["ui"] }), issue("y", { priority: 3 }), issue("z", { status: "closed", priority: 1 })];
    const ids = (q) => buildRows(all, { query: q }).filter(r => r.kind === "issue").map(r => r.issue.id);
    expect(ids("p0")).toEqual(["x"]);
    expect(ids("p:0-1")).toEqual(["x", "z"]);
    expect(ids("@alice")).toEqual(["x"]);
    expect(ids("#ui")).toEqual(["x"]);
    expect(ids("is:closed")).toEqual(["z"]);
    expect(parseQuery("  ").length).toBe(0);
  });

  test("sorts siblings by priority by default and closed ones by most recently closed", () => {
    const all = [issue("lo", { priority: 3 }), issue("hi", { priority: 0 }),
      issue("old", { status: "closed", closed_at: "2026-01-01T00:00:00Z" }), issue("new", { status: "closed", closed_at: "2026-02-01T00:00:00Z" })];
    expect(rowsOf(buildRows(all, {}))).toEqual(["# open 2", "hi", "lo", "# closed 2", "new", "old"]);
    expect(rowsOf(buildRows(all, { sort: { key: "id", desc: false } }))).toEqual(["# open 2", "hi", "lo", "# closed 2", "new", "old"]);
    expect(rowsOf(buildRows(all, { sort: { key: "priority", desc: true } })).slice(1, 3)).toEqual(["lo", "hi"]);
  });

  test("collapsed sections and nodes hide what is under them", () => {
    const all = [issue("ep", { issue_type: "epic" }), issue("ep.1", { parent: "ep" }), issue("z", { status: "closed" })];
    const rows = buildRows(all, { collapsed: new Set(["open:ep", "section:closed"]) });
    expect(rowsOf(rows)).toEqual(["# open 2", "ep", "# closed 1"]);
    expect(rows[1].hasChildren && rows[1].collapsed).toBe(true);
  });

  test("relations derive children, blockers, blocked issues and epic progress", () => {
    const all = [issue("ep", { issue_type: "epic" }), issue("ep.1", { parent: "ep", status: "closed" }), issue("ep.2", { parent: "ep", dependencies: [blocks("ep.2", "ep.1"), { issue_id: "ep.2", depends_on_id: "x", type: "related" }] }), issue("x")];
    const r = relations(all.find(i => i.id === "ep.2"), all);
    expect(r.parent.id).toBe("ep");
    expect(r.blockedBy.map(i => i.id)).toEqual(["ep.1"]);
    expect(r.related.map(i => i.id)).toEqual(["x"]);
    expect(relations(all[1], all).blocks.map(i => i.id)).toEqual(["ep.2"]);
    expect(relations(all[0], all).progress).toEqual({ closed: 1, total: 2 });
  });
});
