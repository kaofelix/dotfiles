// GitHub for the person at the keyboard: their pull requests and issues across repositories (review requests, their
// own, assigned, involved), or everything in one repository, with CI, review state and a detail view. Read-only:
// one `gh api graphql` call per scope and state, polled every couple of minutes. Links open in the browser or copy.
//
// It lives in the side panel (the layout's panel-body stack, beside Files) because it's about the person, not a space:
// it stays as it was across spaces. Pinned repositories sit one click away; any other is a search in the scope list.
// Props (optional, e.g. as a pane): { scope: "me" | "owner/name" } starts there; { kind: "pr" | "issue" } picks the list.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView, ScrollHandle, Select, Popup } from "gpui-base";
import { exec, theme, settings, props, nextCommand, openOverlay, appHome, checking, layout, panes, spaces } from "herdr";
import { readFile, writeFile, readdir, mkdir, unlink } from "fs/promises";
import { KINDS, STATES, DETAIL_QUERY, PAGE, REPOS_QUERY, WIDE, DETAIL_W, age, applyPage, buildRows, checkSummary, deserialize, emptyResult, isClosed, isLoaded,
  isRepoScope, seedResult, kindCount, kindHasMore, kindPending, kindSettled, listWidth, normalizeDetail, plan, ref, repoCounts, repoFromRemotes, repoUrl, rowColumns, scopeOptions, searchUrl, sectionOf, togglePin,
  sectionQuery, serialize } from "./model.js";

const ICON = (n) => "mods/github/icons/" + n + ".svg";
const POLL_MS = 120000, TICK_MS = 15000, PARALLEL = 3;
// Results, opened items and prefs are kept in files every pane shares (localStorage is per pane, so a new pane would start
// empty): it opens with what was shown last and refreshes behind it.
const KEEP_RESULTS = 8, KEEP_DETAILS = 40;
const cacheDir = () => appHome() + "/cache/github";
const resultFile = (key) => cacheDir() + "/result-" + encodeURIComponent(key) + ".json";
async function readJson(path) { try { return json(await readFile(path, "utf8")); } catch { return null; } }
// One write per file at a time, the latest winning, so a slow write never lands after a newer one.
const writing = new Map();
function writeJson(path, value) {
  if (checking()) return;
  const text = JSON.stringify(value), busy = writing.get(path);
  if (busy) { busy.next = text; return; }
  const job = { next: null };
  writing.set(path, job);
  (async () => {
    try { await mkdir(cacheDir(), { recursive: true }); } catch { /* exists */ }
    for (let t = text; t != null; t = job.next, job.next = null) {
      try { await writeFile(path, t); } catch (e) { console.warn("github: cache: " + (e?.message ?? e)); }
    }
    writing.delete(path);
  })();
}
// GitHub answers 502/504 when a search runs past its ~10 s budget: try that page again, smaller.
const overloaded = (e) => /HTTP 50[234]|timed? ?out|timeout|something went wrong/i.test(String(e?.message ?? e));
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };

// gh often lives in Homebrew or a version manager that the app's PATH lacks: try it directly, then with those folders.
const via = new Map();
const WITH_PATH = 'PATH="$HOME/.local/share/mise/shims:$HOME/.asdf/shims:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:$PATH" exec gh "$@"';
async function gh(args, { cwd, on, timeout = 30000 } = {}) {
  const machine = on ?? "";
  if (via.get(machine) !== "path") {
    try { const r = await exec("gh", args, { cwd, on, timeout }); via.set(machine, "direct"); return r; }
    catch (e) { if (via.get(machine) === "direct") throw e; }
  }
  const r = await exec("sh", ["-c", WITH_PATH, "sh", ...args], { cwd, on, timeout });
  if (r.code === 127) throw new Error("gh was not found on PATH, in mise or asdf shims, ~/.local/bin or Homebrew");
  via.set(machine, "path");
  return r;
}
async function graphql(query, vars, opts) {
  const args = ["api", "graphql", "-f", "query=" + query];
  // -F types numbers (Int variables); -f keeps text as text, even "123".
  for (const [k, v] of Object.entries(vars ?? {})) args.push(typeof v === "number" ? "-F" : "-f", k + "=" + v);
  const r = await gh(args, opts);
  const d = json(r.stdout);
  if (!d?.data) throw new Error((d?.errors?.[0]?.message ?? r.stderr ?? "gh api graphql failed").trim().split("\n").slice(0, 3).join("\n"));
  return { data: d.data, error: d.errors?.[0]?.message ?? null };
}

const stripComments = (s) => String(s ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();

export default class GitHub extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.prefs = { scope: "me", kind: "pr", state: "open", group: true, collapsed: [], pins: [] };
    this.checkouts = new Map(); // "owner/name" -> { root, on }: a local clone, found from the open terminals' folders
    this.probed = new Set(); this.scopeQuery = ""; this.wasShown = true;
    this.collapsed = new Set();
    this.cache = new Map(); // "scope|state" -> { result, at }: at is the last refresh of first pages
    this.saved = new Map(); // "scope|state" -> what the cache files held, until first used
    this.details = new Map(); // item id -> { updatedAt, detail }
    this.ready = false;
    this.history = []; this.selected = null; this.detailId = null; this.query = ""; this.width = 0;
    this.status = "loading"; this.error = null; this.recent = []; this.loading = new Set();
    this.handle = cx.focus_handle(); this.scopeTrigger = cx.focus_handle(); this.scopeList = cx.focus_handle(); this.scopeHot = 0;
    this.scroll = ScrollHandle.new();
    this.filter = InputState.new({ placeholder: "Filter  text · repo:name · @author · #label · is:draft · ci:fail · review:approved · -term" });
    this.filter.on("change", (_e, cx) => { this.query = this.filter.value(); cx.notify(); });
    this.filter.on("focus", (_e, cx) => { this.filtering = true; cx.notify(); });
    this.filter.on("blur", (_e, cx) => { this.filtering = false; cx.notify(); });
    this.filter.on("submit", (_e, cx) => { const first = this.rows().find(r => r.kind === "item"); if (first) this.open(first, cx); this.handle.focus(); });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          const item = this.current();
          if (c === "focus") this.handle.focus();
          else if (c === "reload") this.load(cx, true);
          else if (c === "scope") this.setPicking(!this.picking, cx);
          else if (c === "copy" && item) this.copy(item.url, cx);
          else if (c === "browse" && item) cx.open_url(item.url);
        } catch (e) { console.warn("github: " + c + ": " + (e?.message ?? e)); }
        cx.notify();
      }
    });
    cx.timer.every(TICK_MS, (cx) => this.poll(cx));
    this.scanCheckouts(cx);
    // What the last pane showed comes first; loading starts after, so it refreshes the cache rather than replacing it.
    cx.spawn(async (cx) => {
      await this.restore();
      if (p.scope) this.prefs.scope = p.scope;
      if (p.kind) this.prefs.kind = p.kind;
      this.ready = true;
      cx.notify();
      this.load(cx);
    });
    cx.spawn(async (cx) => {
      try { const { data } = await graphql(REPOS_QUERY, {}, this.opts()); this.recent = (data.viewer?.repositories?.nodes ?? []).map(r => r.nameWithOwner); cx.notify(); }
      catch { /* the scope list still has the repos in the results */ }
    });
  }

  async restore() {
    const [prefs, details, names] = await Promise.all([readJson(cacheDir() + "/prefs.json"), readJson(cacheDir() + "/details.json"), readdir(cacheDir()).catch(() => [])]);
    if (prefs) { Object.assign(this.prefs, prefs); this.collapsed = new Set(this.prefs.collapsed ?? []); }
    if (Array.isArray(details)) this.details = new Map(details);
    const files = names.filter(n => n.startsWith("result-") && n.endsWith(".json"));
    const saved = await Promise.all(files.map(n => readJson(cacheDir() + "/" + n)));
    for (const x of saved) if (x?.key && x.result) this.saved.set(x.key, x);
  }
  savePrefs() { writeJson(cacheDir() + "/prefs.json", { ...this.prefs, collapsed: [...this.collapsed] }); }
  opts(timeout) { return { timeout }; }
  cacheKey() { return this.prefs.scope + "|" + this.prefs.state; }
  entry() { return this.ensure(this.prefs.scope, this.prefs.state); }
  result() { return this.entry().result; }

  // The cache entry for a scope and state: from memory, else from the cache files, else empty.
  ensure(scope, state) {
    const key = scope + "|" + state;
    if (this.cache.has(key)) return this.cache.get(key);
    // Until the cache files are read, a render gets a throwaway empty entry, so it can't hide what they hold.
    if (!this.ready) return { result: emptyResult(plan(scope, state)), at: 0, plan: plan(scope, state) };
    const p = plan(scope, state), saved = this.saved.get(key);
    this.saved.delete(key);
    const restored = saved ? deserialize(saved.result, p) : null;
    // Nothing kept for this state: start from what the scope's other states hold, then refresh.
    const result = restored ?? seedResult(p, state, STATES.filter(s => s.id !== state).map(s => this.peek(scope, s.id)).filter(Boolean)) ?? emptyResult(p);
    const entry = { result, at: restored && isLoaded(result) ? saved.at ?? 0 : 0, plan: p };
    this.cache.set(key, entry);
    if (result.login) this.login ??= result.login;
    return entry;
  }

  // A scope and state's result without making an entry for it: in memory, else as the cache files hold it.
  peek(scope, state) {
    const key = scope + "|" + state, e = this.cache.get(key);
    if (e) return e.result;
    const saved = this.saved.get(key);
    return saved ? deserialize(saved.result, plan(scope, state)) : null;
  }

  persist(key) {
    const e = this.cache.get(key);
    if (!e || !isLoaded(e.result)) return;
    writeJson(resultFile(key), { key, at: e.at, result: serialize(e.result) });
    if (checking()) return;
    // The oldest scope/state files beyond the limit go.
    (async () => {
      const names = (await readdir(cacheDir()).catch(() => [])).filter(n => n.startsWith("result-") && n.endsWith(".json"));
      if (names.length <= KEEP_RESULTS) return;
      const dated = await Promise.all(names.map(async n => ({ n, at: (await readJson(cacheDir() + "/" + n))?.at ?? 0 })));
      for (const { n } of dated.sort((a, b) => b.at - a.at).slice(KEEP_RESULTS)) await unlink(cacheDir() + "/" + n).catch(() => {});
    })();
  }

  persistDetails() {
    const entries = [...this.details.entries()].filter(([, d]) => d.detail).slice(-KEEP_DETAILS);
    writeJson(cacheDir() + "/details.json", entries);
  }

  // Local clones, for "Review diff": each open terminal folder's git root and GitHub remote (upstream before origin).
  // Folders are asked once; a clone in the shown space wins over one elsewhere.
  scanCheckouts(cx) {
    const sp = spaces(), shownSpace = sp.find(x => x.active)?.id, todo = [];
    for (const p of panes()) {
      if (!p.cwd) continue;
      const space = sp.find(x => x.tabs?.some(t => t.id === p.tab));
      const on = space?.machine ?? null, key = (on ?? "") + "|" + p.cwd;
      if (this.probed.has(key)) continue;
      this.probed.add(key); todo.push({ cwd: p.cwd, on, here: space?.id === shownSpace });
    }
    if (!todo.length || checking()) return;
    cx.spawn(async (cx) => {
      for (const { cwd, on, here } of todo.slice(0, 12)) {
        const [root, remotes] = await Promise.all([
          exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { on, timeout: 5000 }).catch(() => null),
          exec("git", ["-C", cwd, "remote", "-v"], { on, timeout: 5000 }).catch(() => null)]);
        if (root?.code !== 0 || remotes?.code !== 0) continue;
        const repo = repoFromRemotes(remotes.stdout.split("\n").filter(l => l.includes("(fetch)")));
        if (repo && (here || !this.checkouts.has(repo))) this.checkouts.set(repo, { root: root.stdout.trim(), on });
      }
      cx.notify();
    });
  }

  // Whether this copy is on screen: in the side panel, its stack child is active and the panel is open.
  isShown() {
    const find = (n, id) => !n || typeof n !== "object" ? null : n.id === id ? n : (n.children ?? []).map(c => find(c, id)).find(Boolean) ?? null;
    const root = layout(), body = find(root, "panel-body");
    if (!body || !find(body, "github")) return true;
    return !find(root, "panel")?.hidden && body.active === "github";
  }

  poll(cx) {
    // Hidden, it waits: shown again, it catches up at once (see render).
    if (!this.isShown()) return;
    this.scanCheckouts(cx);
    const e = this.entry();
    if (Date.now() - e.at >= POLL_MS) this.load(cx);
    const item = this.current();
    if (item) this.fetchDetail(item, cx);
  }

  // Refreshes the first page of every section (later pages stay), a few at a time; each lands as it comes.
  load(cx, force = false) {
    if (!this.ready) return;
    const key = this.cacheKey(), entry = this.entry();
    if (this.loading.has(key)) return;
    if (!force && Date.now() - entry.at < POLL_MS) return;
    this.loading.add(key); cx.notify();
    if (force) for (const d of this.details.values()) d.stale = true;
    cx.spawn(async (cx) => {
      const queue = [...entry.plan];
      let failures = 0;
      const worker = async () => {
        for (let x; (x = queue.shift());) {
          // Saved as each section lands, so a pane closed mid-load still leaves the next one something to show.
          try { await this.page(entry, x.key, false, cx); this.persist(key); }
          catch (e) { failures++; this.noteError(entry, x.key, e); }
          cx.notify();
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      this.loading.delete(key);
      if (failures < entry.plan.length) { entry.at = Date.now(); this.persist(key); }
      if (this.detailId && entry.result.items.has(this.detailId)) this.fetchDetail(entry.result.items.get(this.detailId), cx);
      cx.notify();
    });
  }

  // One page of one section: the next one (more) or the first again. A page GitHub gives up on is retried smaller.
  async page(entry, sectionKey, more, cx) {
    const s = sectionOf(entry.result, sectionKey);
    if (!s || (more && !s.cursor)) return;
    const vars = { q: s.search, ...(more ? { after: s.cursor } : {}) };
    let data;
    try { data = (await graphql(sectionQuery(), { ...vars, first: PAGE }, this.opts(30000))).data; }
    catch (e) {
      if (!overloaded(e)) throw e;
      data = (await graphql(sectionQuery(), { ...vars, first: Math.ceil(PAGE / 3) }, this.opts(30000))).data;
    }
    applyPage(entry.result, sectionKey, data, more);
    this.login = entry.result.login ?? this.login;
    this.status = "ready"; this.error = null;
  }

  noteError(entry, sectionKey, e) {
    const msg = String(e?.message ?? e), s = sectionOf(entry.result, sectionKey);
    if (s) s.error = msg;
    if (!isLoaded(entry.result)) {
      this.error = msg;
      this.status = /auth|login|token|401/i.test(msg) ? "noauth" : /not found on PATH/.test(msg) ? "nogh" : "error";
    }
  }

  // "Load more" (or retry) at the end of a section.
  more(sectionKey, cx) {
    const key = this.cacheKey(), entry = this.entry(), busy = key + "|" + sectionKey;
    if (this.loading.has(busy)) return;
    const s = sectionOf(entry.result, sectionKey);
    if (!s) return;
    this.loading.add(busy); cx.notify();
    cx.spawn(async (cx) => {
      try { await this.page(entry, sectionKey, s.loaded && Boolean(s.cursor), cx); this.persist(key); }
      catch (e) { this.noteError(entry, sectionKey, e); }
      finally { this.loading.delete(busy); cx.notify(); }
    });
  }

  // Body, checks, reviews, comments and links come per item, refetched when it changes.
  fetchDetail(item, cx) {
    const have = this.details.get(item.id);
    if (have && have.updatedAt === item.updatedAt && !have.stale) return;
    if (this.fetching?.has(item.id)) return;
    (this.fetching ??= new Set()).add(item.id);
    cx.spawn(async (cx) => {
      try {
        const { data } = await graphql(DETAIL_QUERY, { id: item.id }, this.opts());
        // Re-inserted so the most recently opened are the ones kept.
        this.details.delete(item.id);
        this.details.set(item.id, { updatedAt: item.updatedAt, detail: normalizeDetail(data.node) });
        this.persistDetails();
      } catch (e) { this.details.set(item.id, { updatedAt: item.updatedAt, error: String(e?.message ?? e) }); }
      finally { this.fetching.delete(item.id); cx.notify(); }
    });
  }

  // State

  rows() {
    return buildRows(this.result(), this.prefs.kind, { query: this.query, collapsed: this.collapsed, group: this.prefs.group && !isRepoScope(this.prefs.scope) });
  }

  current() { return this.detailId ? this.findItem(this.detailId) : null; }
  findItem(id) { for (const e of this.cache.values()) { const i = e.result.items.get(id); if (i) return i; } return null; }
  isLoading() { return this.loading.size > 0; }

  setScope(scope, cx, remember = true) {
    if (scope === this.prefs.scope) return this.setPicking(false, cx);
    if (remember) this.history.push(this.prefs.scope);
    this.prefs.scope = scope; this.picking = false; this.selected = null; this.detailId = null;
    this.handle.focus(); this.savePrefs(); this.load(cx); cx.notify();
  }
  setKind(kind, cx) { this.prefs.kind = kind; this.selected = null; this.detailId = null; this.savePrefs(); cx.notify(); }
  setState(state, cx) { this.prefs.state = state; this.selected = null; this.detailId = null; this.savePrefs(); this.load(cx); cx.notify(); }
  togglePin(repo, cx) { this.prefs.pins = togglePin(this.prefs.pins ?? [], repo); this.savePrefs(); cx.notify(); }
  toggleGroup(cx) { this.prefs.group = !this.prefs.group; this.savePrefs(); cx.notify(); }
  toggleCollapsed(key, cx) { if (this.collapsed.has(key)) this.collapsed.delete(key); else this.collapsed.add(key); this.savePrefs(); cx.notify(); }

  setPicking(open, cx) {
    this.picking = open; this.scopeQuery = "";
    if (open) { this.scopeHot = Math.max(0, this.scopes().findIndex(s => s.id === this.prefs.scope)); this.scopeList.focus(); }
    else this.handle.focus();
    cx.notify();
  }

  // Where the dropdown can go (see scopeOptions), narrowed by what's typed while it's open.
  scopes() {
    const mine = this.ensure("me", this.prefs.state).result;
    return scopeOptions({ login: this.login, pins: this.prefs.pins ?? [], current: this.prefs.scope, counts: repoCounts(mine, this.prefs.kind), recent: this.recent, query: this.scopeQuery });
  }

  open(row, cx) {
    this.selected = row.key; this.detailId = row.item.id;
    this.fetchDetail(row.item, cx); cx.notify();
  }

  close(cx) { this.detailId = null; cx.notify(); }

  reveal(key) { const i = this.rows().findIndex(r => r.key === key); if (i >= 0) this.scroll.scroll_to_item(i); }

  step(delta, cx) {
    const rows = this.rows().filter(r => r.kind === "item" || (r.kind === "more" && !r.pending));
    if (!rows.length) return;
    const at = rows.findIndex(r => r.key === this.selected);
    const next = rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? (delta > 0 ? 0 : rows.length - 1) : at + delta))];
    this.selected = next.key; this.reveal(next.key);
    if (this.detailId && this.width >= WIDE && next.kind === "item") this.open(next, cx);
    cx.notify();
  }

  selectedItem() { return this.rows().find(r => r.key === this.selected)?.item ?? this.current(); }

  copy(text, cx) { cx.write_to_clipboard(text); this.copied = text; cx.notify(); cx.timer.after(1500, (cx) => { if (this.copied === text) { this.copied = null; cx.notify(); } }); }

  // A pull request with a local clone open in some terminal can be reviewed in the Changes dialog, as pr-picker does.
  canReview(item) { return item?.kind === "pr" && this.checkouts.has(item.repo); }
  review(item) {
    if (!this.canReview(item)) return;
    const c = this.checkouts.get(item.repo);
    openOverlay({ mod: "changes-panel", kind: "dialog", modal: true, width: 0.94, height: 0.92, props: { repo: c.root, machine: c.on, pr: item.number } });
  }

  onKey(e, cx) {
    const k = e.keystroke;
    if (this.filtering) {
      if (k === "escape") { this.filter.set_value(""); this.query = ""; this.handle.focus(); cx.notify(); cx.stop_propagation(); }
      else if (k === "down") { this.handle.focus(); this.step(1, cx); cx.stop_propagation(); }
      return;
    }
    const item = this.selectedItem();
    const actions = {
      "j": () => this.step(1, cx), "down": () => this.step(1, cx), "k": () => this.step(-1, cx), "up": () => this.step(-1, cx),
      "enter": () => { const r = this.rows().find(r => r.key === this.selected); if (r?.kind === "item") this.open(r, cx); else if (r?.kind === "more") this.more(r.sectionKey, cx); },
      "space": () => actions.enter(),
      "o": () => item && cx.open_url(item.url),
      "c": () => item && this.copy(item.url, cx),
      "shift-c": () => item && this.copy(ref(item), cx),
      "d": () => this.review(item),
      "1": () => this.setKind("pr", cx), "2": () => this.setKind("issue", cx),
      "tab": () => this.setKind(this.prefs.kind === "pr" ? "issue" : "pr", cx),
      "s": () => this.setState(STATES[(STATES.findIndex(s => s.id === this.prefs.state) + 1) % STATES.length].id, cx),
      "g": () => this.toggleGroup(cx),
      "p": () => this.setPicking(!this.picking, cx),
      "m": () => this.setScope("me", cx),
      "P": () => actions["shift-p"](),
      "shift-p": () => { const repo = isRepoScope(this.prefs.scope) ? this.prefs.scope : item?.repo; if (repo) this.togglePin(repo, cx); },
      "R": () => item && this.setScope(item.repo, cx),
      "shift-r": () => item && this.setScope(item.repo, cx),
      "/": () => this.filter.focus(), "cmd-f": () => this.filter.focus(),
      "r": () => this.load(cx, true),
      "escape": () => {
        if (this.picking) this.setPicking(false, cx);
        else if (this.detailId) this.close(cx);
        else if (this.query) { this.filter.set_value(""); this.query = ""; cx.notify(); }
        else if (this.history.length) this.setScope(this.history.pop(), cx, false);
        else return false;
      },
      "backspace": () => actions.escape(),
    };
    const fn = actions[k];
    if (!fn || fn() === false) return;
    cx.stop_propagation();
  }

  // Look

  stateLook(item, t) {
    if (item.kind === "pr") return { open: ["pr-open", t.ansi2], draft: ["pr-draft", t.dim], merged: ["pr-merged", t.ansi5], closed: ["pr-closed", t.ansi1] }[item.state] ?? ["pr-open", t.muted];
    return { open: ["issue-open", t.ansi2], completed: ["issue-closed", t.ansi5], not_planned: ["issue-skip", t.dim], duplicate: ["issue-skip", t.dim] }[item.state] ?? ["issue-open", t.muted];
  }
  stateIcon(item, t, size = 14) { const [icon, color] = this.stateLook(item, t); return svg(ICON(icon)).size(size).flex_none().text_color(color); }
  ciColor(ci, t) { return { pass: t.done, fail: t.blocked, pending: t.working, skipped: t.dim, cancelled: t.dim }[ci] ?? t.dim; }
  reviewLook(review, t) { return { approved: ["approved", t.done], changes: ["changes", t.blocked], required: ["review", t.working] }[review] ?? null; }
  labelColor(hex, t) { return /^[0-9a-f]{6}$/i.test(hex ?? "") ? "#" + hex : t.muted; }

  chip(label, color, t) {
    return div().flex_none().px(5).h(17).flex().items_center().rounded(4).border_1().border_color(color ?? t.border).text_color(color ?? t.muted).text_size(10.5).child(label);
  }

  spinner(t, size = 11, tip = null) {
    const el = svg(ICON("reload")).size(size).flex_none().text_color(t.dim).spin(900);
    return tip ? div().flex_none().tooltip(tip).child(el) : el;
  }

  iconButton(id, icon, tip, onClick, t, active = false) {
    return div().id(id).size(24).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
      .text_color(active ? t.foreground : t.dim).when(active, el => el.bg(t.selected))
      .hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(svg(ICON(icon)).size(14));
  }

  textButton(id, label, tip, onClick, t, icon) {
    return h_flex().id(id).h(24).px(8).gap(5).flex_none().items_center().rounded(5).cursor_pointer().text_size(12).text_color(t.muted)
      .border_1().border_color(t.border).hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .when(Boolean(icon), el => el.child(svg(ICON(icon)).size(12))).child(label);
  }

  segment(id, label, on, onClick, t, count) {
    return h_flex().id(id).h(22).px(9).gap(5).items_center().cursor_pointer().text_size(11.5)
      .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.dim).hover(s => s.text_color(t.foreground))
      .on_click((_e, cx) => onClick(cx)).child(label)
      .when(count != null, el => el.child(typeof count === "object" ? count : div().text_color(t.dim).child(String(count))));
  }

  header(t) {
    return h_flex().h(34).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(svg(ICON("github")).size(15).flex_none().text_color(t.accent))
      .child(div().font_semibold().child("GitHub"))
      .child(this.scopeDropdown(t))
      .when(isRepoScope(this.prefs.scope), el => {
        const pinned = (this.prefs.pins ?? []).includes(this.prefs.scope);
        return el.child(this.iconButton("gh-pin", pinned ? "pin-off" : "pin", (pinned ? "Unpin " : "Pin ") + this.prefs.scope + " (P)", (cx) => this.togglePin(this.prefs.scope, cx), t, pinned))
          .child(this.iconButton("gh-repo-web", "external", "Open the repository on GitHub", (cx) => cx.open_url(repoUrl(this.prefs.scope, this.prefs.kind)), t));
      })
      .child(div().flex_1())
      .when(this.entry().at > 0, el => el.child(div().flex_none().text_size(11).text_color(t.dim).tooltip("Last refreshed").child(age(new Date(this.entry().at).toISOString()) + " ago")))
      .child(this.iconButton("gh-reload", "reload", "Reload (r)", (cx) => this.load(cx, true), t))
      .when(this.isLoading(), el => el.child(svg(ICON("reload")).size(12).flex_none().text_color(t.dim).spin(900)));
  }

  scopeDropdown(t) {
    const scopes = this.scopes(), open = Boolean(this.picking);
    const label = this.prefs.scope === "me" ? "All my work" : this.prefs.scope;
    const trigger = h_flex().id("gh-scope").h(22).px(7).gap(4).items_center().rounded(5).cursor_pointer().text_size(12).min_w(0)
      .text_color(open ? t.foreground : t.muted).when(open, el => el.bg(t.hover))
      .hover(s => s.bg(t.hover).text_color(t.foreground)).track_focus(this.scopeTrigger).tooltip("Scope (p)")
      .on_click((_e, cx) => this.setPicking(!this.picking, cx))
      .child(svg(ICON(this.prefs.scope === "me" ? "layers" : "folder")).size(12).flex_none())
      .child(div().truncate().child(label)).child(svg(ICON("chevron-down")).size(11).flex_none());
    const row = (s, i) => h_flex().id("gh-scope-" + s.id).h(26).px(8).gap(6).items_center().rounded(5).cursor_pointer().text_size(12.5)
      .bg(i === this.scopeHot ? t.selected : t.popover).hover(st => st.bg(t.hover))
      .on_click((_e, cx) => this.setScope(s.id, cx))
      .child(div().w(12).text_color(t.accent).child(s.id === this.prefs.scope ? "✓" : ""))
      .child(div().flex_1().truncate().when(s.id === "me", el => el.font_semibold()).child(s.label))
      .when(Boolean(s.note), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(s.note)))
      .when(s.id !== "me", el => el.child(div().id("gh-scope-pin-" + s.id).size(20).flex_none().flex().items_center().justify_center().rounded(4)
        .text_color(s.pinned ? t.accent : t.dim).hover(st => st.bg(t.raised).text_color(t.foreground)).tooltip(s.pinned ? "Unpin" : "Pin")
        .on_click((_e, cx) => { cx.stop_propagation(); this.togglePin(s.id, cx); }).child(svg(ICON(s.pinned ? "pin-off" : "pin")).size(12))));
    const GROUPS = { pinned: "Pinned", repos: "Repositories" };
    const items = [];
    items.push(h_flex().h(26).px(8).mb(2).gap(6).items_center().rounded(5).border_1().border_color(t.border).bg(t.surface).text_size(12)
      .child(svg(ICON("search")).size(12).flex_none().text_color(t.dim))
      .child(div().flex_1().truncate().text_color(this.scopeQuery ? t.foreground : t.dim).child(this.scopeQuery || "Type to find a repo, or owner/name")));
    scopes.forEach((s, i) => {
      if (s.group !== "me" && s.group !== scopes[i - 1]?.group) items.push(div().px(8).pt(6).pb(2).text_size(10.5).font_semibold().text_color(t.dim).child(GROUPS[s.group].toUpperCase()));
      items.push(row(s, i));
    });
    if (!scopes.length) items.push(div().px(8).py(6).text_size(12).text_color(t.dim).child("No repository matches. Type owner/name to open any."));
    return Select.new("gh-scope-select").flex_none().min_w(0).accessibility_label("GitHub scope")
      .open(open).track_focus(this.scopeTrigger).content_focus_handle(this.scopeList)
      .on_open_change((o, cx) => this.setPicking(o, cx))
      .child(Popup.new("gh-scope-list", trigger).anchor("top_left")
        .when(open, el => el.content(v_flex().id("gh-scope-options").track_focus(this.scopeList)
          .mt(4).p(4).gap(1).min_w(260).max_w(440).max_h(420).overflow_y_scrollbar().rounded(8).border_1().border_color(t.border).bg(t.popover).shadow_md()
          .on_key_down((e, cx) => {
            const k = e.key, plain = !/^(cmd|ctrl|alt)-/.test(e.keystroke);
            const retype = (q) => { this.scopeQuery = q; this.scopeHot = 0; cx.notify(); };
            if (k === "down" || k === "up") { if (scopes.length) this.scopeHot = (this.scopeHot + (k === "down" ? 1 : scopes.length - 1)) % scopes.length; cx.notify(); }
            else if (k === "enter") { if (scopes[this.scopeHot]) this.setScope(scopes[this.scopeHot].id, cx); }
            else if (k === "escape") { if (this.scopeQuery) retype(""); else this.setPicking(false, cx); }
            else if (k === "backspace") retype(this.scopeQuery.slice(0, -1));
            else if (e.keystroke === "cmd-p" && scopes[this.scopeHot]) this.togglePin(scopes[this.scopeHot].id, cx);
            else if (plain && e.key_char && e.key_char.length === 1 && e.key_char >= " ") retype(this.scopeQuery + e.key_char);
            else return;
            cx.stop_propagation();
          })
          .children(items))));
  }

  // All my work and each pinned repository, one click away; the current one is highlighted.
  pinRow(t) {
    const chip = (id, label, icon, tip) => {
      const on = this.prefs.scope === id;
      return h_flex().id("gh-chip-" + id).h(22).px(7).gap(4).flex_none().items_center().rounded(5).cursor_pointer().text_size(11.5)
        .border_1().border_color(on ? t.accent : t.border).bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
        .on_click((_e, cx) => this.setScope(id, cx))
        .child(svg(ICON(icon)).size(11).flex_none()).child(div().max_w(150).truncate().child(label));
    };
    return h_flex().gap(5).flex_wrap().items_center()
      .child(chip("me", "Mine", "layers", "All my work (m)"))
      .children((this.prefs.pins ?? []).map(p => chip(p, p.split("/")[1] ?? p, "pin", p)));
  }

  toolbar(t) {
    const res = this.result(), scope = this.prefs.scope;
    return v_flex().flex_none().px(10).py(8).gap(7).border_b(1).border_color(t.border)
      .child(h_flex().gap(8).items_center().flex_wrap()
        .child(h_flex().flex_none().rounded(6).border_1().border_color(t.border).overflow_hidden()
          .children(KINDS.map((k, i) => this.segment("gh-kind-" + k.id, k.label, this.prefs.kind === k.id, (cx) => this.setKind(k.id, cx), t, !isLoaded(res) ? null : kindPending(res, k.id) ? this.spinner(t, 10, "Counting") : kindCount(res, k.id) + (kindHasMore(res, k.id) ? "+" : "")))))
        .child(h_flex().flex_none().rounded(6).border_1().border_color(t.border).overflow_hidden()
          .children(STATES.map(s => this.segment("gh-state-" + s.id, s.label, this.prefs.state === s.id, (cx) => this.setState(s.id, cx), t))))
        .child(div().flex_1())
        .when(!isRepoScope(scope), el => el.child(div().id("gh-group").h(22).px(8).flex().items_center().gap(4).rounded(5).cursor_pointer().text_size(11.5)
          .text_color(this.prefs.group ? t.foreground : t.dim).when(this.prefs.group, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
          .tooltip("Group by repository (g)").on_click((_e, cx) => this.toggleGroup(cx)).child(svg(ICON("folder")).size(12)).child("by repo")))
      )
      .when((this.prefs.pins ?? []).length > 0, el => el.child(this.pinRow(t)))
      .child(h_flex().h(28).px(8).gap(6).items_center().rounded(6).border_1().border_color(this.filtering ? t.accent : t.input).bg(t.surface)
        .child(svg(ICON("search")).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.filter).flex_1().text_size(12.5))
        .when(Boolean(this.query), el => el.child(div().id("gh-clear").flex_none().cursor_pointer().text_color(t.dim).hover(s => s.text_color(t.foreground))
          .on_click((_e, cx) => { this.filter.set_value(""); this.query = ""; cx.notify(); }).child(svg(ICON("x")).size(12)))));
  }

  listRow(row, t, mono, cols) {
    if (row.kind === "section") {
      return h_flex().id("gh-row-" + row.key).h(28).flex_none().px(10).mt(4).gap(6).items_center().cursor_pointer()
        .text_size(11).font_semibold().text_color(t.muted).hover(s => s.text_color(t.foreground))
        .on_click((_e, cx) => this.toggleCollapsed(row.key, cx))
        .child(svg(ICON(row.collapsed ? "chevron-right" : "chevron-down")).size(11).text_color(t.dim))
        .child(row.label.toUpperCase())
        .when(!row.pending, el => el.child(div().text_color(t.dim).font_normal().child(String(row.count))))
        .when(row.pending, el => el.child(this.spinner(t, 10, "Counting")))
        .when(row.truncated, el => el.child(div().id("gh-more-" + row.id).text_color(t.accent).font_normal().cursor_pointer().tooltip("See all " + row.total + " on GitHub")
          .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(searchUrl(row.search, this.prefs.kind)); }).child("of " + row.total + " ↗")))
        .when(row.loading, el => el.child(svg(ICON("reload")).size(10).text_color(t.dim).spin(900)));
    }
    if (row.kind === "more" && row.pending) {
      return h_flex().id("gh-row-" + row.key).h(26).flex_none().pl(14).pr(10).mx(4).gap(6).items_center().text_size(11.5).text_color(t.dim)
        .child(this.spinner(t, 11)).child("Checking for more…");
    }
    if (row.kind === "more") {
      const busy = this.loading.has(this.cacheKey() + "|" + row.sectionKey);
      const label = busy ? "Loading…" : row.error ? (row.retry ? "Couldn't load: retry" : "Couldn't load more: retry") : "Load " + Math.min(PAGE, row.total - row.loaded) + " more  ·  " + row.loaded + " of " + row.total;
      return h_flex().id("gh-row-" + row.key).h(26).flex_none().pl(14).pr(10).mx(4).gap(6).items_center().rounded(5).cursor_pointer()
        .text_size(11.5).text_color(row.error ? t.blocked : t.accent).when(row.key === this.selected, el => el.bg(t.raised)).hover(s => s.bg(t.hover))
        .when(Boolean(row.error), el => el.tooltip(row.error))
        .on_click((_e, cx) => this.more(row.sectionKey, cx))
        .when(busy, el => el.child(svg(ICON("reload")).size(11).text_color(t.dim).spin(900)))
        .child(label);
    }
    if (row.kind === "repo") {
      return h_flex().id("gh-row-" + row.key).h(26).flex_none().pl(14).pr(10).mx(4).gap(6).items_center().rounded(5).cursor_pointer()
        .text_size(12).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => this.toggleCollapsed(row.key, cx))
        .child(svg(ICON(row.collapsed ? "chevron-right" : "chevron-down")).size(11).text_color(t.dim))
        .child(div().flex_none().text_color(t.dim).child(row.repo.split("/")[0] + "/"))
        .child(div().flex_none().font_semibold().child(row.repo.split("/")[1] ?? ""))
        .child(div().text_size(11).text_color(t.dim).child(String(row.count)))
        .child(div().flex_1())
        .child(div().id("gh-go-" + row.key).flex_none().px(5).h(18).flex().items_center().rounded(4).text_size(11).text_color(t.dim)
          .hover(s => s.bg(t.border).text_color(t.foreground)).tooltip("Everything in " + row.repo)
          .on_click((_e, cx) => { cx.stop_propagation(); this.setScope(row.repo, cx); }).child("open repo →"));
    }
    const i = row.item, selected = row.key === this.selected, shown = this.detailId === i.id;
    const rv = this.reviewLook(i.review, t), repoName = isRepoScope(this.prefs.scope) ? null : this.prefs.group ? null : i.repo.split("/")[1];
    return h_flex().id("gh-row-" + row.key).h(30).flex_none().pl(10 + row.depth * 16).pr(10).mx(4).gap(7).items_center().rounded(6).cursor_pointer()
      .when(selected, el => el.bg(shown ? t.selected : t.raised)).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => { this.handle.focus(); this.open(row, cx); })
      .child(this.stateIcon(i, t))
      .child(div().flex_none().text_size(11.5).font_family(mono).text_color(t.dim).child("#" + i.number))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(isClosed(i) ? t.muted : t.foreground).child(i.title))
      .when(cols.labels, el => el.children(i.labels.slice(0, 2).map(l => this.chip(l.name, this.labelColor(l.color, t), t))))
      .when(Boolean(repoName) && cols.repo, el => el.child(div().flex_none().max_w(120).truncate().text_size(11).text_color(t.dim).child(repoName)))
      .when(i.conflicts && !isClosed(i), el => el.child(div().flex_none().text_size(11).text_color(t.blocked).tooltip("Merge conflicts").child("⚠")))
      .when(Boolean(rv) && !isClosed(i), el => el.child(this.chip(rv[0], rv[1], t)))
      .when(i.kind === "pr", el => el.child(div().size(7).flex_none().rounded(4).bg(this.ciColor(i.ci, t)).tooltip("CI: " + (i.ci ?? "none"))))
      .when(cols.comments, el => el.child(h_flex().flex_none().w(30).gap(3).items_center().justify_end().text_size(11).text_color(t.dim)
        .when(i.comments > 0, el => el.child(svg(ICON("comment")).size(10)).child(String(i.comments)))))
      .when(cols.author, el => el.child(div().flex_none().w(84).truncate().text_right().text_size(11).text_color(i.author === this.login ? t.dim : t.muted).child(i.author)))
      .child(div().flex_none().w(30).text_right().text_size(11).text_color(t.dim).tooltip("Updated").child(age(i.updatedAt)));
  }

  list(t, mono) {
    const rows = this.rows(), cols = rowColumns(listWidth(this.width, Boolean(this.detailId)));
    if (!rows.length) {
      const what = this.prefs.kind === "pr" ? "pull requests" : "issues";
      return div().flex_1().p(16).text_size(12.5).text_color(t.dim)
        .child(!kindSettled(this.result(), this.prefs.kind) ? h_flex().gap(6).items_center().child(this.spinner(t, 12)).child("Loading…")
          : this.query ? "Nothing matches this filter." : "No " + (this.prefs.state === "all" ? "" : this.prefs.state + " ") + what + " here.");
    }
    return v_flex().id("gh-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).py(4)
      .children(rows.map(r => this.listRow(r, t, mono, cols)));
  }

  // Details

  section(title, body, t) {
    return v_flex().gap(5).child(div().text_size(11).font_semibold().text_color(t.dim).child(title.toUpperCase())).child(body);
  }

  kv(k, v, t, mono) {
    return h_flex().gap(8).text_size(12).items_start()
      .child(div().w(84).flex_none().text_color(t.dim).child(k))
      .child(div().flex_1().min_w(0).text_color(t.foreground).when(Boolean(mono), el => el.font_family(mono).text_size(11.5)).child(String(v)));
  }

  markdown(id, text, t) {
    return div().text_size(13).text_color(t.foreground).child(TextView.markdown(id, text).selectable(true));
  }

  linkRow(id, l, t, mono) {
    return h_flex().id(id).h(26).px(6).gap(6).items_center().rounded(5).cursor_pointer().hover(s => s.bg(t.hover))
      .on_click((_e, cx) => { const local = this.findLinked(l); if (local) { this.detailId = local.id; this.fetchDetail(local, cx); cx.notify(); } else cx.open_url(l.url); })
      .child(this.stateIcon(l, t, 13))
      .child(div().flex_none().text_size(11.5).font_family(mono).text_color(t.dim).child((l.repo !== this.current()?.repo ? l.repo + "#" : "#") + l.number))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(isClosed(l) ? t.muted : t.foreground).child(l.title));
  }

  findLinked(l) {
    for (const e of this.cache.values()) for (const i of e.result.items.values()) if (i.url === l.url) return i;
    return null;
  }

  detailView(t, mono) {
    const i = this.current();
    if (!i) return div().p(16).text_color(t.dim).child("This item is no longer listed.");
    const d = this.details.get(i.id), detail = d?.detail;
    const rv = this.reviewLook(i.review, t), [, stateColor] = this.stateLook(i, t);
    const stateLabel = { open: "Open", draft: "Draft", merged: "Merged", closed: "Closed", completed: "Closed", not_planned: "Not planned", duplicate: "Duplicate" }[i.state] ?? i.state;
    const copied = this.copied && (this.copied === i.url || this.copied === ref(i));
    const facts = [
      ["Author", i.author], ["Created", age(i.createdAt) + " ago"], ["Updated", age(i.updatedAt) + " ago"],
      [i.state === "merged" ? "Merged" : "Closed", i.closedAt ? age(i.closedAt) + " ago" : null],
      ["Branch", i.head ? i.base + " ← " + i.head : null],
      ["Changes", i.additions != null ? "+" + i.additions + " −" + i.deletions + " in " + i.files + " file" + (i.files === 1 ? "" : "s") : null],
      ["Assignees", i.assignees.join(", ")], ["Reviewers", i.reviewers.join(", ")],
    ].filter(([, v]) => v);
    const checks = detail?.checks ?? [], sum = checkSummary(checks);
    const notable = checks.filter(c => c.state === "fail" || c.state === "pending");
    const showAll = this.expandedChecks === i.id;
    const body = stripComments(detail?.body);
    return v_flex().id("gh-detail").flex_1().min_h(0).min_w(0).overflow_y_scrollbar()
      .child(v_flex().p(14).gap(14)
        .child(v_flex().gap(6)
          .child(h_flex().gap(6).items_center()
            .child(this.iconButton("gh-back", "arrow-left", "Close (esc)", (cx) => this.close(cx), t))
            .child(this.stateIcon(i, t))
            .child(div().id("gh-ref").min_w(0).truncate().text_size(12).font_family(mono).text_color(t.muted).cursor_pointer().hover(s => s.text_color(t.foreground))
              .tooltip("Copy " + ref(i) + " (C)").on_click((_e, cx) => this.copy(ref(i), cx)).child(ref(i)))
            .child(div().flex_1())
            .when(Boolean(copied), el => el.child(div().text_size(11).text_color(t.dim).child("copied")))
            .child(this.iconButton("gh-copy", "link", "Copy link (c)", (cx) => this.copy(i.url, cx), t))
            .child(this.iconButton("gh-web", "external", "Open on GitHub (o)", (cx) => cx.open_url(i.url), t)))
          .child(div().text_size(16).font_semibold().child(i.title))
          .child(h_flex().gap(5).flex_wrap()
            .child(this.chip(stateLabel, stateColor, t))
            .when(Boolean(rv) && !isClosed(i), el => el.child(this.chip(rv[0] === "review" ? "review required" : rv[0] === "changes" ? "changes requested" : rv[0], rv[1], t)))
            .when(i.kind === "pr" && Boolean(i.ci), el => el.child(this.chip("CI " + i.ci, this.ciColor(i.ci, t), t)))
            .when(i.conflicts && !isClosed(i), el => el.child(this.chip("conflicts", t.blocked, t)))
            .when(i.private, el => el.child(this.chip("private", t.dim, t)))
            .children(i.labels.map(l => this.chip(l.name, this.labelColor(l.color, t), t))))
          .child(h_flex().gap(6).flex_wrap().pt(2)
            .child(this.textButton("gh-open", "Open", "Open on GitHub (o)", (cx) => cx.open_url(i.url), t, "external"))
            .child(this.textButton("gh-copy-link", "Copy link", "Copy the URL (c)", (cx) => this.copy(i.url, cx), t, "copy"))
            .when(this.canReview(i), el => el.child(this.textButton("gh-diff", "Review diff", "Open the diff in Changes (d)", () => this.review(i), t, "diff")))
            .when(this.prefs.scope !== i.repo, el => el.child(this.textButton("gh-scope-repo", i.repo.split("/")[1], "Everything in " + i.repo + " (R)", (cx) => this.setScope(i.repo, cx), t, "folder")))))
        .child(v_flex().gap(3).children(facts.map(([k, v]) => this.kv(k, v, t))))
        .when(i.kind === "pr" && checks.length > 0, el => el.child(this.section("Checks", v_flex().gap(2)
          .child(h_flex().gap(8).text_size(12).flex_wrap()
            .when(sum.fail > 0, el => el.child(div().text_color(t.blocked).child(sum.fail + " failing")))
            .when(sum.pending > 0, el => el.child(div().text_color(t.working).child(sum.pending + " running")))
            .child(div().text_color(t.done).child(sum.pass + " passed"))
            .when(sum.skipped + sum.cancelled > 0, el => el.child(div().text_color(t.dim).child((sum.skipped + sum.cancelled) + " skipped")))
            .child(div().id("gh-checks-all").text_color(t.accent).cursor_pointer().on_click((_e, cx) => { this.expandedChecks = showAll ? null : i.id; cx.notify(); }).child(showAll ? "hide ▾" : "all ▸")))
          .children((showAll ? checks : notable).map((c, n) => h_flex().id("gh-check-" + n).h(22).px(6).gap(6).items_center().rounded(4).text_size(12)
            .when(Boolean(c.url), el => el.cursor_pointer().hover(s => s.bg(t.hover)).on_click((_e, cx) => cx.open_url(c.url)))
            .child(div().size(7).flex_none().rounded(4).bg(this.ciColor(c.state, t)))
            .child(div().flex_1().min_w(0).truncate().text_color(c.state === "fail" ? t.foreground : t.muted).child(c.name)))), t)))
        .when((detail?.reviews ?? []).length > 0, el => el.child(this.section("Reviews", v_flex().gap(2).children(detail.reviews.map(r => h_flex().gap(8).text_size(12)
          .child(div().w(110).flex_none().truncate().text_color(t.muted).child(r.author))
          .child(div().flex_1().text_color({ approved: t.done, changes_requested: t.blocked }[r.state] ?? t.dim).child(r.state.replace("_", " ")))
          .child(div().flex_none().text_color(t.dim).child(age(r.at))))), t)))
        .when((detail?.linked ?? []).length > 0, el => el.child(this.section(i.kind === "pr" ? "Closes / linked" : "Linked", v_flex().children(detail.linked.map((l, n) => this.linkRow("gh-link-" + n, l, t, mono))), t)))
        .child(this.section("Description", d ? (d.error ? div().text_size(12).text_color(t.blocked).child(d.error)
          : body ? this.markdown("gh-body-" + i.id, body.length > 20000 ? body.slice(0, 20000) + "\n\n…" : body, t) : div().text_size(12).text_color(t.dim).child("No description."))
          : div().text_size(12).text_color(t.dim).child("Loading…"), t))
        .when((detail?.comments ?? []).length > 0, el => el.child(this.section("Comments (" + detail.commentCount + ")" + (detail.commentCount > detail.comments.length ? " · latest " + detail.comments.length : ""),
          v_flex().gap(8).children(detail.comments.map((m, n) => v_flex().gap(3).p(8).rounded(6).bg(t.surface).border_1().border_color(t.border)
            .child(h_flex().gap(6).text_size(11).text_color(t.dim).child(div().font_semibold().text_color(t.muted).child(m.author)).child(age(m.createdAt) + " ago")
              .child(div().flex_1()).child(div().id("gh-c-web-" + n).cursor_pointer().hover(s => s.text_color(t.foreground)).on_click((_e, cx) => cx.open_url(m.url)).child("↗")))
            .child(this.markdown("gh-c-" + i.id + "-" + n, stripComments(m.body).slice(0, 8000), t)))), t))));
  }

  message(t, title, body) {
    return v_flex().flex_1().p(18).gap(6).child(div().font_semibold().child(title))
      .when(Boolean(body), el => el.child(div().text_size(12).text_color(t.dim).child(body)));
  }

  render(cx) {
    const t = theme(), mono = settings().font_family ?? "JetBrains Mono";
    const shown = this.isShown();
    if (shown && !this.wasShown) cx.timer.after(0, (cx) => this.poll(cx));
    this.wasShown = shown;
    let body;
    if (this.status === "nogh") body = this.message(t, "gh isn't available", "Install the GitHub CLI (brew install gh) and sign in with gh auth login. " + (this.error ?? ""));
    else if (this.status === "noauth") body = this.message(t, "gh isn't signed in", "Run gh auth login in a terminal, then reload (r). " + (this.error ?? ""));
    else if (this.status === "error" && !isLoaded(this.result())) body = this.message(t, "Couldn't reach GitHub", this.error);
    else {
      const wide = this.width >= WIDE, detail = Boolean(this.detailId);
      const listPane = v_flex().min_h(0).min_w(0).h_full()
        .when(wide && detail, el => el.w(listWidth(this.width, true)).flex_none().border_r(1).border_color(t.border)).when(!(wide && detail), el => el.flex_1())
        .child(this.toolbar(t)).child(this.list(t, mono));
      body = h_flex().flex_1().min_h(0).items_start()
        .when(!detail || wide, el => el.child(listPane))
        .when(detail, el => el.child(v_flex().h_full().flex_1().min_w(0).when(wide, el => el.w(DETAIL_W)).child(this.detailView(t, mono))));
      if (this.error) body = v_flex().flex_1().min_h(0).child(div().px(10).py(4).text_size(11).text_color(t.blocked).child(this.error)).child(body);
    }
    return v_flex().id("github").track_focus(this.handle).on_key_down((e, cx) => this.onKey(e, cx))
      .on_size_change((s, cx) => { if (this.width !== s.width) { this.width = s.width; cx.notify(); } })
      .size_full().min_h(0).overflow_hidden().bg(t.background).border_l(1).border_color(t.border).text_color(t.foreground).text_size(13)
      .child(this.header(t)).child(body);
  }
}
