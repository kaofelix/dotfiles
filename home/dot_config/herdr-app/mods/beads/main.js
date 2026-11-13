// Beads (https://github.com/gastownhall/beads) for the project in view: in-progress, blocked, open,
// deferred and closed issues as a tree (children under their epic, even across sections), with a
// filter, sorting and a detail view. Read-only: it runs `bd ... --readonly`.
//
// Props: { repo?, on? } pins a folder (and machine); without them it follows the focused pane.
// { issue } opens that issue's details once it's loaded.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView, ScrollHandle } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, theme, settings, props, nextCommand } from "herdr";
import { SECTIONS, SORTS, buildRows, relations, sectionOf, index, ago, isDone } from "./model.js";

const ICON = (name) => "mods/beads/icons/" + name + ".svg";
const POLL_MS = 4000, FALLBACK_RELOAD_MS = 15000, LOCATE_MS = 10000;
const WIDE = 720;

function location() {
  const p = props() ?? {};
  if (p.repo) return { cwd: p.repo, on: p.on ?? null };
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(x => x.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}

const parent = (path) => path.replace(/[\\/]+$/, "").replace(/[\\/][^\\/]*$/, "") || "/";
const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

// bd usually comes from a version manager (mise, asdf) or a user bin folder that Herdr's exec
// PATH may lack. Try bd directly, then with the usual install folders added; remember which
// worked per machine.
const via = new Map();
const WITH_PATH = 'PATH="$HOME/.local/share/mise/shims:$HOME/.asdf/shims:$HOME/.local/bin:$HOME/go/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:$PATH" exec bd "$@"';
async function bd(args, { cwd, on, timeout } = {}) {
  const machine = on ?? "";
  if (via.get(machine) !== "path") {
    try { const r = await exec("bd", args, { cwd, on, timeout }); via.set(machine, "direct"); return r; }
    catch (e) { if (via.get(machine) === "direct") throw e; }
  }
  const r = await exec("sh", ["-c", WITH_PATH, "sh", ...args], { cwd, on, timeout });
  if (r.code === 127) throw new Error("bd was not found on PATH or in ~/.local/share/mise/shims, ~/.local/bin, Homebrew");
  via.set(machine, "path");
  return r;
}

export default class Beads extends View {
  init(_props, cx) {
    this.issues = []; this.byId = new Map();
    this.query = ""; this.selected = null; this.detailId = null; this.detail = null;
    this.width = 0; this.status = "locating"; this.error = null;
    this.prefs = { sort: { key: "auto", desc: false }, hidden: [], collapsed: [], ...(json(localStorage.getItem("prefs") ?? "") ?? {}) };
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.filter = InputState.new({ placeholder: "Filter  text · type:bug · p0 · @who · #label · is:open · -term" });
    this.filter.on("change", (_e, cx) => { this.query = this.filter.value(); cx.notify(); });
    this.filter.on("submit", (_e, cx) => { const first = this.rows().find(r => r.kind === "issue" && !r.context); if (first) this.open(first, cx); this.handle.focus(); });
    this.filter.on("focus", (_e, cx) => { this.filtering = true; cx.notify(); });
    this.filter.on("blur", (_e, cx) => { this.filtering = false; cx.notify(); });
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "focus") this.handle.focus(); else if (c === "reload") this.reload(cx); cx.notify(); } });
    this.tick = 0;
    cx.timer.every(POLL_MS, (cx) => this.poll(cx));
    this.relocate(cx);
  }

  savePrefs() { localStorage.setItem("prefs", JSON.stringify(this.prefs)); }

  // Finding the database

  relocate(cx) {
    const loc = location(), key = JSON.stringify(loc);
    this.key = key; this.loc = loc;
    this.beads = null; this.issues = []; this.byId = new Map(); this.signature = null;
    this.detailId = null; this.detail = null; this.selected = null; this.error = null;
    if (!loc.cwd) { this.status = "none"; cx.notify(); return; }
    this.status = "locating";
    const collapsed = json(localStorage.getItem("collapsed:" + loc.cwd) ?? "");
    this.collapsed = new Set(collapsed ?? []);
    cx.spawn(async (cx) => {
      let where = null;
      try {
        const r = await bd(["where", "--json"], { cwd: loc.cwd, on: loc.on, timeout: 15000 });
        where = json(r.stdout);
        if (r.code !== 0 || !where?.path) where = null;
      } catch (e) {
        if (this.key !== key) return;
        this.status = "nobd"; this.error = String(e?.message ?? e); cx.notify(); return;
      }
      if (this.key !== key) return;
      if (!where) { this.status = "none"; this.lastLocate = Date.now(); cx.notify(); return; }
      const meta = json(await readTextFile(where.path + "/metadata.json", { on: loc.on }).catch(() => null) ?? "") ?? {};
      const manifest = meta.dolt_mode === "embedded" || meta.dolt_database
        ? where.path + "/embeddeddolt/" + (meta.dolt_database ?? "") + "/.dolt/noms/manifest" : null;
      this.beads = { dir: where.path, root: parent(where.path), prefix: where.prefix, manifest };
      await this.load(cx, key);
    });
  }

  // Embedded Dolt rewrites its manifest on every commit (reads leave it alone), so a changed
  // manifest means new data. Server-backed databases have none: reload on a slower timer.
  poll(cx) {
    if (!this.loc) return;
    if (JSON.stringify(location()) !== this.key) return this.relocate(cx);
    if (this.status === "none" && Date.now() - (this.lastLocate ?? 0) > LOCATE_MS) return this.relocate(cx);
    if (!this.beads || this.loading) return;
    const key = this.key;
    if (!this.beads.manifest) {
      if (Date.now() - (this.loadedAt ?? 0) >= FALLBACK_RELOAD_MS) cx.spawn((cx) => this.load(cx, key));
      return;
    }
    cx.spawn(async (cx) => {
      const sig = await readTextFile(this.beads.manifest, { on: this.loc.on }).catch(() => null);
      if (this.key === key && sig !== this.signature) await this.load(cx, key);
    });
  }

  reload(cx) { if (this.beads) cx.spawn((cx) => this.load(cx, this.key)); else this.relocate(cx); }

  async load(cx, key) {
    if (this.loading) return;
    this.loading = true; cx.notify();
    try {
      const sig = this.beads.manifest ? await readTextFile(this.beads.manifest, { on: this.loc.on }).catch(() => null) : null;
      const r = await bd(["list", "--all", "--json", "--limit", "0", "--readonly"], { cwd: this.beads.root, on: this.loc.on, timeout: 60000 });
      if (this.key !== key) return;
      const data = json(r.stdout);
      if (r.code !== 0 || !Array.isArray(data)) { this.error = (r.stderr || r.stdout || "bd list failed").trim().split("\n").slice(0, 3).join("\n"); this.status = "error"; return; }
      this.issues = data; this.byId = index(data).byId; this.signature = sig; this.error = null; this.status = "ready";
      this.loadedAt = Date.now();
      const wanted = props()?.issue;
      if (wanted && !this.openedProp && this.byId.has(wanted)) { this.openedProp = true; this.show(wanted, cx); }
      else if (this.detailId) this.fetchDetail(this.detailId, cx);
    } catch (e) {
      if (this.key === key) { this.error = String(e?.message ?? e); this.status = "error"; }
    } finally { this.loading = false; cx.notify(); }
  }

  // Comments (and anything list leaves out) come from bd show.
  fetchDetail(id, cx) {
    const key = this.key;
    cx.spawn(async (cx) => {
      try {
        const r = await bd(["show", "--id", id, "--json", "--include-comments", "--readonly"], { cwd: this.beads.root, on: this.loc.on });
        const d = json(r.stdout);
        if (this.key === key && this.detailId === id && Array.isArray(d) && d[0]) { this.detail = d[0]; cx.notify(); }
      } catch { /* the list's copy is enough */ }
    });
  }

  // State

  rows() {
    return buildRows(this.issues, { query: this.query, sort: this.prefs.sort, collapsed: this.collapsed ?? new Set(), hidden: new Set(this.prefs.hidden) });
  }

  counts() {
    const out = {};
    for (const s of SECTIONS) out[s.id] = 0;
    for (const r of buildRows(this.issues, { query: this.query, collapsed: new Set(SECTIONS.map(s => "section:" + s.id)) })) out[r.id] = r.count;
    return out;
  }

  toggleCollapsed(key, cx) {
    if (this.collapsed.has(key)) this.collapsed.delete(key); else this.collapsed.add(key);
    localStorage.setItem("collapsed:" + this.loc.cwd, JSON.stringify([...this.collapsed]));
    cx.notify();
  }

  toggleSection(id, cx) {
    const hidden = new Set(this.prefs.hidden);
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    this.prefs.hidden = [...hidden]; this.savePrefs(); cx.notify();
  }

  cycleSort(cx) {
    const i = SORTS.findIndex(s => s.key === this.prefs.sort.key);
    this.prefs.sort = { key: SORTS[(i + 1) % SORTS.length].key, desc: false }; this.savePrefs(); cx.notify();
  }

  flipSort(cx) { this.prefs.sort = { ...this.prefs.sort, desc: !this.prefs.sort.desc }; this.savePrefs(); cx.notify(); }

  open(row, cx) {
    this.selected = row.key; this.detailId = null; this.history = [];
    this.show(row.issue.id, cx);
  }

  show(id, cx) {
    if (!this.byId.has(id)) return;
    if (this.detailId && this.detailId !== id) (this.history ??= []).push(this.detailId);
    this.detailId = id; this.detail = null;
    // Keep the list selection on the shown issue when it's listed.
    const row = this.rows().find(r => r.kind === "issue" && r.issue.id === id && !r.context) ?? this.rows().find(r => r.kind === "issue" && r.issue.id === id);
    if (row) { this.selected = row.key; this.reveal(row.key); }
    this.fetchDetail(id, cx);
    cx.notify();
  }

  back(cx) {
    const prev = this.history?.pop();
    if (prev && this.byId.has(prev)) { this.detailId = null; this.show(prev, cx); }
    else { this.detailId = null; this.detail = null; this.history = []; }
    cx.notify();
  }

  reveal(key) {
    const i = this.rows().findIndex(r => r.key === key);
    if (i >= 0) this.scroll.scroll_to_item(i);
  }

  step(delta, cx) {
    const rows = this.rows(), issues = rows.filter(r => r.kind === "issue");
    if (!issues.length) return;
    const at = issues.findIndex(r => r.key === this.selected);
    const next = issues[Math.max(0, Math.min(issues.length - 1, at < 0 ? (delta > 0 ? 0 : issues.length - 1) : at + delta))];
    this.selected = next.key; this.reveal(next.key);
    if (this.detailId && this.wide()) { this.detailId = null; this.show(next.issue.id, cx); }
    cx.notify();
  }

  wide() { return this.width >= WIDE; }

  onKey(e, cx) {
    const k = e.keystroke;
    if (this.filtering) {
      if (k === "escape") { this.filter.set_value(""); this.query = ""; this.handle.focus(); cx.notify(); cx.stop_propagation(); }
      else if (k === "down") { this.handle.focus(); this.step(1, cx); cx.stop_propagation(); }
      return;
    }
    const row = this.rows().find(r => r.key === this.selected);
    const actions = {
      "j": () => this.step(1, cx), "down": () => this.step(1, cx),
      "k": () => this.step(-1, cx), "up": () => this.step(-1, cx),
      "enter": () => row?.kind === "issue" && this.open(row, cx),
      "space": () => row?.kind === "issue" && this.open(row, cx),
      "left": () => { if (row?.hasChildren && !row.collapsed) this.toggleCollapsed(row.key, cx); else if (row?.issue?.parent) { const p = this.rows().find(r => r.kind === "issue" && r.section === row.section && r.issue.id === row.issue.parent); if (p) { this.selected = p.key; this.reveal(p.key); cx.notify(); } } },
      "h": () => actions.left(),
      "right": () => row?.hasChildren && row.collapsed && this.toggleCollapsed(row.key, cx),
      "l": () => actions.right(),
      "/": () => this.filter.focus(),
      "cmd-f": () => this.filter.focus(),
      "r": () => this.reload(cx),
      "s": () => this.cycleSort(cx),
      "shift-s": () => this.flipSort(cx),
      "c": () => this.detailId && cx.write_to_clipboard(this.detailId),
      "escape": () => { if (this.detailId) this.back(cx); else if (this.query) { this.filter.set_value(""); this.query = ""; cx.notify(); } else return false; },
      "backspace": () => this.detailId && this.back(cx),
    };
    const run = actions[k];
    if (!run) return;
    if (run() === false) return;
    cx.stop_propagation();
  }

  // Look

  colors(t) {
    return {
      status: { in_progress: t.working, blocked: t.blocked, open: t.muted, deferred: t.dim, closed: t.done, hooked: t.working, pinned: t.accent },
      type: { epic: t.ansi5, bug: t.ansi1, feature: t.ansi2, spike: t.ansi6, decision: t.ansi4, story: t.ansi2, milestone: t.ansi3, molecule: t.ansi13 ?? t.ansi5, chore: t.dim },
      priority: [t.ansi1, t.ansi3, t.muted, t.dim, t.dim],
    };
  }

  statusIcon(issue, t, c, size = 14) {
    const sec = this.byId.size ? sectionOf(issue, this.byId) : issue.status;
    const name = sec === "in_progress" ? "in_progress" : sec === "blocked" ? "blocked" : sec === "closed" ? "closed" : sec === "deferred" ? "deferred" : "open";
    return svg(ICON(name)).size(size).flex_none().text_color(c.status[sec] ?? t.muted);
  }

  chip(label, color, t) {
    return div().flex_none().px(5).h(17).flex().items_center().rounded(4).border_1().border_color(color ?? t.border).text_color(color ?? t.muted).text_size(10.5).child(label);
  }

  button(id, icon, tip, onClick, t, active = false) {
    return div().id(id).size(24).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
      .text_color(active ? t.foreground : t.dim).when(active, el => el.bg(t.selected))
      .hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(svg(ICON(icon)).size(14));
  }

  header(t) {
    const sortLabel = SORTS.find(s => s.key === this.prefs.sort.key)?.label ?? "Smart";
    return h_flex().h(34).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(svg(ICON("beads")).size(15).flex_none().text_color(t.accent))
      .child(div().font_semibold().child("Beads"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim)
        .child(this.beads ? (this.beads.prefix ?? "") + "  ·  " + this.beads.root.split(/[\\/]/).pop() : this.loc?.cwd?.split(/[\\/]/).pop() ?? ""))
      .when(this.status === "ready", el => el
        .child(div().id("beads-sort").h(22).px(7).flex_none().flex().items_center().gap(4).rounded(5).cursor_pointer().text_size(11.5).text_color(t.muted)
          .hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip("Sort (s)").on_click((_e, cx) => this.cycleSort(cx))
          .child(svg(ICON("sort")).size(12)).child(sortLabel))
        .when(this.prefs.sort.key !== "auto", el => el.child(div().id("beads-dir").w(20).h(22).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
          .text_color(t.muted).hover(s => s.bg(t.hover)).tooltip("Reverse (S)").on_click((_e, cx) => this.flipSort(cx))
          .child(this.prefs.sort.desc ? "↑" : "↓"))))
      .child(this.button("beads-reload", "reload", "Reload (r)", (cx) => this.reload(cx), t))
      .when(this.loading, el => el.child(svg(ICON("reload")).size(12).flex_none().text_color(t.dim).spin(900)));
  }

  toolbar(t, c) {
    const counts = this.counts(), hidden = new Set(this.prefs.hidden);
    return v_flex().flex_none().px(10).py(8).gap(7).border_b(1).border_color(t.border)
      .child(h_flex().h(28).px(8).gap(6).items_center().rounded(6).border_1().border_color(this.filtering ? t.accent : t.input).bg(t.surface)
        .child(svg(ICON("search")).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.filter).flex_1().text_size(12.5))
        .when(Boolean(this.query), el => el.child(div().id("beads-clear").flex_none().cursor_pointer().text_color(t.dim).hover(s => s.text_color(t.foreground))
          .on_click((_e, cx) => { this.filter.set_value(""); this.query = ""; cx.notify(); }).child(svg(ICON("x")).size(12)))))
      .child(h_flex().gap(5).flex_wrap().children(SECTIONS.map(s => {
        const on = !hidden.has(s.id), color = c.status[s.id];
        return h_flex().id("beads-sec-" + s.id).h(22).px(7).gap(5).items_center().rounded(11).cursor_pointer().text_size(11.5)
          .border_1().border_color(on ? color : t.border).text_color(on ? t.foreground : t.dim).when(on, el => el.bg(t.raised))
          .hover(st => st.bg(t.hover)).tooltip(on ? "Hide " + s.label.toLowerCase() : "Show " + s.label.toLowerCase())
          .on_click((_e, cx) => this.toggleSection(s.id, cx))
          .child(svg(ICON(s.id)).size(11).text_color(on ? color : t.dim))
          .child(s.label).child(div().text_color(t.dim).child(String(counts[s.id] ?? 0)));
      })));
  }

  listRow(row, t, c, mono, compact) {
    if (row.kind === "section") {
      const color = c.status[row.id];
      return h_flex().id("beads-row-" + row.key).h(28).flex_none().px(10).mt(4).gap(6).items_center().cursor_pointer()
        .text_size(11).font_semibold().text_color(t.muted).hover(s => s.text_color(t.foreground))
        .on_click((_e, cx) => this.toggleCollapsed(row.key, cx))
        .child(svg(ICON(row.collapsed ? "chevron-right" : "chevron-down")).size(11).text_color(t.dim))
        .child(svg(ICON(row.id)).size(12).text_color(color))
        .child(row.label.toUpperCase())
        .child(div().text_color(t.dim).font_normal().child(String(row.count)));
    }
    const i = row.issue, selected = row.key === this.selected, shown = this.detailId === i.id;
    const typeColor = c.type[i.issue_type];
    const kids = row.hasChildren ? relations(i, this.issues).progress : null;
    return h_flex().id("beads-row-" + row.key).h(30).flex_none().pl(8 + row.depth * 16).pr(10).mx(4).gap(6).items_center().rounded(6).cursor_pointer()
      .when(selected, el => el.bg(shown ? t.selected : t.raised)).hover(s => s.bg(t.hover))
      .when(row.context, el => el.opacity(0.55))
      .on_click((_e, cx) => { this.handle.focus(); this.open(row, cx); })
      .child(row.hasChildren
        ? div().id("beads-fold-" + row.key).size(16).flex_none().flex().items_center().justify_center().rounded(4).text_color(t.dim).hover(s => s.bg(t.border).text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); this.toggleCollapsed(row.key, cx); })
          .child(svg(ICON(row.collapsed ? "chevron-right" : "chevron-down")).size(12))
        : div().w(16).flex_none())
      .child(this.statusIcon(i, t, c))
      .child(div().flex_none().text_size(11.5).font_family(mono).text_color(t.dim).child(this.shortId(i.id)))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(isDone(i) && !row.context ? t.muted : t.foreground)
        .when(i.issue_type === "epic", el => el.font_semibold()).child(i.title ?? ""))
      .when(Boolean(kids), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(kids.closed + "/" + kids.total)))
      .when(i.issue_type && i.issue_type !== "task" && !compact, el => el.child(this.chip(i.issue_type, typeColor, t)))
      .when(!compact && Boolean(i.assignee), el => el.child(div().flex_none().max_w(90).truncate().text_size(11).text_color(t.dim).child("@" + i.assignee.split(/\s+/)[0])))
      .child(div().flex_none().w(22).text_right().text_size(11).font_semibold().text_color(c.priority[i.priority] ?? t.dim).child(typeof i.priority === "number" ? "P" + i.priority : ""));
  }

  shortId(id) {
    const prefix = this.beads?.prefix;
    return prefix && id.startsWith(prefix + "-") ? id.slice(prefix.length + 1) : id;
  }

  list(t, c, mono) {
    const rows = this.rows(), compact = this.wide() ? this.width * 0.45 < 420 : this.width < 420;
    if (!rows.length) return div().flex_1().p(16).text_size(12.5).text_color(t.dim)
      .child(this.issues.length ? "Nothing matches this filter." : "No issues yet. Create one with bd create \"…\".");
    return v_flex().id("beads-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).py(4)
      .children(rows.map(r => this.listRow(r, t, c, mono, compact)));
  }

  // Detail

  link(prefix, issue, t, c, mono) {
    return h_flex().id(prefix + "-" + issue.id).h(26).px(6).gap(6).items_center().rounded(5).cursor_pointer().hover(s => s.bg(t.hover))
      .on_click((_e, cx) => this.show(issue.id, cx))
      .child(this.statusIcon(issue, t, c, 13))
      .child(div().flex_none().text_size(11.5).font_family(mono).text_color(t.dim).child(this.shortId(issue.id)))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(isDone(issue) ? t.muted : t.foreground).child(issue.title ?? ""))
      .when(Boolean(issue.via), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(issue.via)))
      .child(div().flex_none().text_size(11).text_color(c.priority[issue.priority] ?? t.dim).child(typeof issue.priority === "number" ? "P" + issue.priority : ""));
  }

  section(title, body, t) {
    return v_flex().gap(4).child(div().text_size(11).font_semibold().text_color(t.dim).child(title.toUpperCase())).child(body);
  }

  markdown(id, text, t) {
    return div().text_size(13).text_color(t.foreground).child(TextView.markdown(id, text).selectable(true));
  }

  detailView(t, c, mono) {
    const base = this.byId.get(this.detailId);
    if (!base) return div().p(16).text_color(t.dim).child("This issue is no longer in the database.");
    const i = { ...base, ...(this.detail ?? {}) };
    const rel = relations(base, this.issues);
    const sec = sectionOf(base, this.byId);
    const facts = [
      ["Status", (SECTIONS.find(s => s.id === sec)?.label ?? i.status) + (sec !== i.status && !isDone(i) ? " (" + i.status.replace("_", " ") + ")" : "")],
      ["Type", i.issue_type], ["Priority", typeof i.priority === "number" ? "P" + i.priority : null],
      ["Assignee", i.assignee], ["Owner", i.owner], ["Created", i.created_at ? ago(i.created_at) + (i.created_by ? " by " + i.created_by : "") : null],
      ["Updated", ago(i.updated_at)], ["Started", ago(i.started_at)], ["Closed", ago(i.closed_at)],
      ["Due", i.due_at ? i.due_at.slice(0, 10) : null], ["Deferred until", i.defer_until ? i.defer_until.slice(0, 16).replace("T", " ") : null],
      ["External", i.external_ref], ["Spec", i.spec_id],
    ].filter(([, v]) => v);
    const texts = [["Description", i.description], ["Design", i.design], ["Acceptance criteria", i.acceptance_criteria], ["Notes", i.notes]].filter(([, v]) => v && String(v).trim());
    const comments = this.detail?.comments ?? [];
    return v_flex().id("beads-detail").flex_1().min_h(0).min_w(0).overflow_y_scrollbar()
      .child(v_flex().p(14).gap(14)
        .child(v_flex().gap(6)
          .child(h_flex().gap(6).items_center()
            .child(this.button("beads-back", "arrow-left", this.history?.length ? "Back (esc)" : "Close (esc)", (cx) => this.back(cx), t))
            .child(this.statusIcon(base, t, c))
            .child(div().id("beads-copy-id").flex_none().text_size(12).font_family(mono).text_color(t.muted).cursor_pointer().hover(s => s.text_color(t.foreground)).tooltip("Copy ID (c)")
              .on_click((_e, cx) => { cx.write_to_clipboard(i.id); this.copied = i.id; cx.notify(); }).child(i.id))
            .child(div().flex_1())
            .when(this.copied === i.id, el => el.child(div().text_size(11).text_color(t.dim).child("copied")))
            .child(this.button("beads-copy", "copy", "Copy ID", (cx) => { cx.write_to_clipboard(i.id); this.copied = i.id; cx.notify(); }, t)))
          .child(div().text_size(16).font_semibold().text_color(t.foreground).child(i.title ?? ""))
          .child(h_flex().gap(5).flex_wrap()
            .child(this.chip(i.issue_type ?? "task", c.type[i.issue_type], t))
            .when(typeof i.priority === "number", el => el.child(this.chip("P" + i.priority, c.priority[i.priority], t)))
            .children((i.labels ?? []).map(l => this.chip("#" + l, t.accent, t)))))
        .when(Boolean(rel.parent), el => el.child(this.section("Parent", this.link("beads-parent", rel.parent, t, c, mono), t)))
        .when(Boolean(rel.progress), el => {
          const p = rel.progress, pct = p.total ? p.closed / p.total : 0;
          return el.child(v_flex().gap(4)
            .child(h_flex().justify_between().text_size(11).text_color(t.dim).child("PROGRESS").child(p.closed + " of " + p.total + " closed"))
            .child(div().h(5).w_full().rounded(3).bg(t.raised).child(div().h_full().rounded(3).bg(t.done).w(Math.max(0, Math.min(1, pct)) * Math.max(80, (this.detailWidth ?? 300) - 28)))));
        })
        .child(v_flex().gap(3).children(facts.map(([k, v]) => h_flex().gap(8).text_size(12)
          .child(div().w(100).flex_none().text_color(t.dim).child(k)).child(div().flex_1().min_w(0).text_color(t.foreground).child(String(v))))))
        .when(Boolean(i.close_reason), el => el.child(this.section("Close reason", this.markdown("beads-close-" + i.id, i.close_reason, t), t)))
        .children(texts.map(([k, v]) => this.section(k, this.markdown("beads-" + k + "-" + i.id, v, t), t)))
        .when(rel.blockedBy.length > 0, el => el.child(this.section("Blocked by", v_flex().children(rel.blockedBy.map(x => this.link("beads-bb", x, t, c, mono))), t)))
        .when(rel.blocks.length > 0, el => el.child(this.section("Blocks", v_flex().children(rel.blocks.map(x => this.link("beads-bl", x, t, c, mono))), t)))
        .when(rel.children.length > 0, el => el.child(this.section("Children (" + rel.children.length + ")", v_flex().children(rel.children.map(x => this.link("beads-ch", x, t, c, mono))), t)))
        .when(rel.related.length > 0, el => el.child(this.section("Related", v_flex().children(rel.related.map(x => this.link("beads-rel", x, t, c, mono))), t)))
        .when(comments.length > 0 || (i.comment_count ?? 0) > 0, el => el.child(this.section("Comments (" + (comments.length || i.comment_count) + ")",
          v_flex().gap(8).children(comments.map((m, n) => v_flex().gap(3).p(8).rounded(6).bg(t.surface).border_1().border_color(t.border)
            .child(h_flex().gap(6).text_size(11).text_color(t.dim).child(div().font_semibold().text_color(t.muted).child(m.author ?? "")).child(ago(m.created_at)))
            .child(this.markdown("beads-c-" + i.id + "-" + n, m.text ?? "", t)))), t))));
  }

  message(t, title, body) {
    return v_flex().flex_1().p(18).gap(6).child(div().font_semibold().text_color(t.foreground).child(title))
      .when(Boolean(body), el => el.child(div().text_size(12).text_color(t.dim).child(body)));
  }

  render(cx) {
    if (this.loc && JSON.stringify(location()) !== this.key && !props()?.repo) this.relocate(cx);
    const t = theme(), c = this.colors(t), mono = settings().font_family ?? "JetBrains Mono";
    let body;
    if (this.status === "nobd") body = this.message(t, "bd isn't available", "Install beads (bd) to see this project's issues. " + (this.error ?? ""));
    else if (this.status === "none") body = this.message(t, "No beads here", (this.loc?.cwd ?? "No folder") + " has no .beads database. Run bd init to start one.");
    else if (this.status === "locating" || (this.status !== "error" && !this.issues.length && this.loading)) body = this.message(t, "Loading beads…");
    else if (this.status === "error" && !this.issues.length) body = this.message(t, "Couldn't read beads", this.error);
    else {
      const wide = this.wide(), detail = Boolean(this.detailId);
      const listPane = v_flex().min_h(0).min_w(0).when(wide && detail, el => el.w(Math.max(320, this.width * 0.45)).flex_none().border_r(1).border_color(t.border)).when(!(wide && detail), el => el.flex_1())
        .child(this.toolbar(t, c)).child(this.list(t, c, mono));
      body = h_flex().flex_1().min_h(0).items_start()
        .when(!detail || wide, el => el.child(listPane.h_full()))
        .when(detail, el => el.child(v_flex().h_full().flex_1().min_w(0).id("beads-detail-wrap")
          .on_size_change((s, cx) => { if (this.detailWidth !== s.width) { this.detailWidth = s.width; cx.notify(); } })
          .child(this.detailView(t, c, mono))));
      if (this.error) body = v_flex().flex_1().min_h(0).child(div().px(10).py(4).text_size(11).text_color(t.blocked).child(this.error)).child(body);
    }
    return v_flex().id("beads").track_focus(this.handle).on_key_down((e, cx) => this.onKey(e, cx))
      .on_size_change((s, cx) => { if (this.width !== s.width) { this.width = s.width; cx.notify(); } })
      .size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13)
      .child(this.header(t)).child(body);
  }
}
