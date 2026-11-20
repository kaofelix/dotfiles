// GitHub for the person at the keyboard. Home is a dashboard of their open pull requests and issues across repositories
// (review requests first), each with "View all" for the full sectioned list; a repository shows everything in it, with
// links to its projects on GitHub. CI, review state and a detail view throughout. Read-only:
// one `gh api graphql` call per scope and state, polled every couple of minutes. Links open in the browser or copy.
//
// It lives in the side panel (the layout's panel-body stack, beside Files) because it's about the person, not a space:
// it stays as it was across spaces. Pinned repositories sit one click away; any other is a search in the scope list.
// Props (optional, e.g. as a pane): { scope: "me" | "owner/name" } starts there; { kind: "pr" | "issue" } picks the list.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView, ScrollHandle, Select, Popup, Avatar, AvatarImage, AvatarFallback } from "gpui-base";
import { exec, theme, settings, props, nextCommand, openOverlay, appHome, checking, layout, panes, spaces, run } from "herdr";
import { readFile, writeFile, readdir, mkdir, unlink } from "fs/promises";
import { KINDS, STATES, DETAIL_QUERY, PAGE, PROJECTS_QUERY, REPOS_QUERY, MILESTONES_QUERY, MILESTONE_ITEMS_QUERY, homeRows, projectsOf, avatarFile, avatarUrl, initials, normalizeMilestones, milestoneItems, milestoneRows, subIssuesQuery, subIssuesOf, age, applyPage, buildRows, checkSummary, deserialize, emptyResult, isClosed, isLoaded,
  isRepoScope, seedResult, kindCount, kindHasMore, kindPending, kindSettled, normalizeDetail, plan, ref, repoCounts, repoFromRemotes, repoUrl, cardLayout, rowColumns, scopeOptions, searchUrl, sectionOf, shortNames, togglePin, filterToken, hasToken, toggleToken, nodesQuery, nodesOf, mergeStatus, workPlaces, markdownBlocks, TIMELINE_QUERY, timelineOf, timelineRows, parseHttp, checksOf, rollupOf, DETAIL_V, requiredQuery, requiredOf, ciLook, checkRunsPath, statusesPath,
  sectionQuery, serialize } from "./model.js";

const ICON = (n) => "mods/github/icons/" + n + ".svg";
const SIDEBAR_W = 180;
const POLL_MS = 120000, TICK_MS = 15000, PARALLEL = 3;
// An open pull request's checks are asked for this often while any is running, and every SETTLED_MS once none is.
const CHECKS_MS = 3000, CHECKS_SETTLED_MS = 30000;
// Results, opened items and prefs are kept in files every pane shares (localStorage is per pane, so a new pane would start
// empty): it opens with what was shown last and refreshes behind it.
const KEEP_RESULTS = 8, KEEP_DETAILS = 40;
const cacheDir = () => appHome() + "/cache/github";
// Avatars: downloaded once (curl, a few at a time) and drawn from there; image paths are relative to the app folder.
const AVATAR_DIR = "cache/github/avatars";
const AVATAR_FETCH = 'mkdir -p "$(dirname "$1")" && curl -fsSL -m 15 -o "$1.part" "$2" && mv "$1.part" "$1"';
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

const lower = (v) => String(v ?? "").toLowerCase();
const stripComments = (s) => String(s ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();

export default class GitHub extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.prefs = { scope: "me", view: "home", kind: "pr", state: "open", group: true, collapsed: [], pins: [], pinnedItems: [] };
    this.projects = new Map(); // "owner/name" -> [{ number, title, url, closed }] | "loading" | "error"
    this.milestones = new Map(); // "owner/name" -> { list, at, loading, error }
    this.avatarState = new Map(); // login -> "ready" | "loading" | "failed"
    this.avatarQueue = [];
    this.msItems = new Map(); // "owner/name#number" -> { issues, prs, issueTotal, prTotal, at, loading, error }
    this.checkouts = new Map(); // "owner/name" -> { root, on }: a local clone, found from the open terminals' folders
    this.folderRepos = new Map(); // "machine|folder" -> "owner/name", for matching panes to pull requests
    this.probed = new Set(); this.scopeQuery = ""; this.wasShown = true;
    this.collapsed = new Set();
    this.cache = new Map(); // "scope|state" -> { result, at }: at is the last refresh of first pages
    this.saved = new Map(); // "scope|state" -> what the cache files held, until first used
    this.details = new Map(); // item id -> { updatedAt, detail }
    this.timelines = new Map(); // pull request id -> { updatedAt, total, events, loading, error }
    this.folds = new Set(); // opened <details> blocks and commit runs, by key
    this.ready = false;
    this.history = []; this.selected = null; this.detailId = null; this.query = ""; this.width = 0;
    this.status = "loading"; this.error = null; this.recent = []; this.loading = new Set();
    this.handle = cx.focus_handle(); this.scopeTrigger = cx.focus_handle(); this.scopeList = cx.focus_handle(); this.scopeHot = 0;
    this.scroll = ScrollHandle.new(); this.detailScroll = ScrollHandle.new();
    this.activityFirst = Boolean(p.activityFirst); // for checking the timeline in a short pane
    this.filter = InputState.new({ placeholder: "Filter  text · repo:name · @author · #label · is:draft · ci:fail · review:approved · -term" });
    this.filter.on("change", (_e, cx) => { this.query = this.filter.value(); cx.notify(); });
    this.filter.on("focus", (_e, cx) => { this.filtering = true; cx.notify(); });
    this.filter.on("blur", (_e, cx) => { this.filtering = false; cx.notify(); });
    // The sidebar's own search narrows its repositories; enter opens the first.
    this.sideFilter = InputState.new({ placeholder: "Find a repo or owner/name" });
    this.sideFilter.on("change", (_e, cx) => { this.sideQuery = this.sideFilter.value(); cx.notify(); });
    this.sideFilter.on("focus", (_e, cx) => { this.sideTyping = true; cx.notify(); });
    this.sideFilter.on("blur", (_e, cx) => { this.sideTyping = false; cx.notify(); });
    this.sideFilter.on("submit", (_e, cx) => { const first = this.scopeChoices(this.sideQuery).find(o => o.id !== "me") ?? this.scopeChoices(this.sideQuery)[0]; if (first) { this.clearSide(); this.setScope(first.id, cx); } });
    this.sideQuery = "";
    this.filter.on("submit", (_e, cx) => { const first = this.rows().find(r => r.kind === "item"); if (first) this.open(first, cx); this.handle.focus(); });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          const item = this.current();
          if (c === "focus") this.handle.focus();
          else if (c === "reload") { this.load(cx, true); if (this.isMilestones()) this.loadMilestones(cx, true); }
          else if (c === "scope") this.setPicking(!this.picking, cx);
          else if (c === "home") this.goHome(cx);
          else if (c === "sidebar") this.toggleSidebar(cx);
          else if (c === "cards") this.toggleCards(cx);
          else if (c === "all-checks") { this.expandedChecks = this.detailId; cx.notify(); }
          // Opens a pull request or issue of the shown repository by number, listed or not (for keys and scripts).
          else if (/^show-\d+$/.test(c) && isRepoScope(this.prefs.scope)) {
            const n = Number(c.slice(5)), [owner, name] = this.prefs.scope.split("/");
            cx.spawn(async (cx) => {
              try {
                const { data } = await graphql(nodesQuery([]).replace(/query \{[\s\S]*$/, "") + "query($owner: String!, $name: String!, $n: Int!) { repository(owner: $owner, name: $name) { issueOrPullRequest(number: $n) { ...PR ...IS } } }", { owner, name, n }, this.opts());
                const node = data?.repository?.issueOrPullRequest;
                if (!node) return;
                const item = nodesOf({ nodes: [node] })[0];
                this.shown = item; this.detailId = item.id; this.fetchDetail(item, cx); cx.notify();
              } catch (e) { console.warn("github: show: " + (e?.message ?? e)); }
            });
          }
          else if (/^open-\d+$/.test(c)) { const n = Number(c.slice(5)); const row = this.rows().find(r => r.kind === "item" && r.item.number === n); if (row) this.open(row, cx); }
          else if (c === "pin-first") { const row = this.rows().find(r => r.kind === "item" && r.section !== "home-pinned"); if (row) this.toggleItemPin(row.item, cx); }
          else if (c === "open-first") { const row = this.rows().find(r => r.kind === "item"); if (row) this.open(row, cx); }
          else if (c === "milestones") { if (isRepoScope(this.prefs.scope)) this.setKind("milestone", cx); }
          else if (c === "focus-next-milestone") {
            const list = (this.milestones.get(this.prefs.scope)?.list ?? []).filter(m => this.prefs.state === "all" || m.state === this.prefs.state);
            const open = [...this.expandedMilestones()], at = list.findIndex(m => m.number === open[0]);
            if (list.length) this.focusMilestone(list[(at + 1) % list.length].number, cx);
          }
          else if (c === "next-pin") { const pins = this.prefs.pins ?? [], at = pins.indexOf(this.prefs.scope); if (pins.length) this.setScope(pins[(at + 1) % pins.length], cx); }
          else if (c === "copy" && item) this.copy(item.url, cx);
          else if (c === "browse" && item) cx.open_url(item.url);
        } catch (e) { console.warn("github: " + c + ": " + (e?.message ?? e)); }
        cx.notify();
      }
    });
    cx.timer.every(TICK_MS, (cx) => this.poll(cx));
    this.live = new Map(); // path -> etag and what it last said, so an unchanged answer is a 304
    this.optional = new Map(); // pr id -> { oid, optional }: whether its head's failures are all in checks that aren't required
    cx.timer.every(CHECKS_MS, (cx) => this.pollChecks(cx));
    this.scanCheckouts(cx);
    // What the last pane showed comes first; loading starts after, so it refreshes the cache rather than replacing it.
    cx.spawn(async (cx) => {
      await this.restore();
      if (p.scope) this.prefs.scope = p.scope;
      if (isRepoScope(this.prefs.scope)) this.fetchProjects(this.prefs.scope, cx);
      if (this.prefs.kind === "milestone" && !isRepoScope(this.prefs.scope)) this.prefs.kind = "pr";
      if (this.isMilestones()) this.loadMilestones(cx);
      if (p.kind) { this.prefs.kind = p.kind; if (this.prefs.scope === "me") this.prefs.view = "list"; }
      this.ready = true;
      cx.notify();
      this.load(cx);
      this.refreshPinned(cx, true);
    });
    cx.spawn(async (cx) => {
      try { const { data } = await graphql(REPOS_QUERY, {}, this.opts()); this.recent = (data.viewer?.repositories?.nodes ?? []).map(r => r.nameWithOwner); cx.notify(); }
      catch { /* the scope list still has the repos in the results */ }
    });
  }

  async restore() {
    const [prefs, details, names, ms, optional] = await Promise.all([readJson(cacheDir() + "/prefs.json"), readJson(cacheDir() + "/details.json"), readdir(cacheDir()).catch(() => []), readJson(cacheDir() + "/milestones.json"), readJson(cacheDir() + "/optional.json")]);
    if (Array.isArray(optional)) this.optional = new Map(optional);
    for (const n of await readdir(appHome() + "/" + AVATAR_DIR).catch(() => [])) if (n.endsWith(".png")) this.avatarState.set("file:" + n, "ready");
    for (const [k, v] of ms?.lists ?? []) this.milestones.set(k, { ...v, loading: false, error: null });
    for (const [k, v] of ms?.items ?? []) this.msItems.set(k, { ...v, subs: v.subs ? new Map(v.subs) : null, loading: false, error: null });
    if (prefs) { Object.assign(this.prefs, prefs); this.collapsed = new Set(this.prefs.collapsed ?? []); }
    if (Array.isArray(details)) this.details = new Map(details);
    const files = names.filter(n => n.startsWith("result-") && n.endsWith(".json"));
    const saved = await Promise.all(files.map(n => readJson(cacheDir() + "/" + n)));
    for (const x of saved) if (x?.key && x.result) this.saved.set(x.key, x);
  }
  toggleCards(cx) { this.prefs.cards = !this.prefs.cards; this.savePrefs(); cx.notify(); }
  savePrefs() { writeJson(cacheDir() + "/prefs.json", { ...this.prefs, collapsed: [...this.collapsed] }); }
  opts(timeout) { return { timeout }; }
  // Home is my open work, whatever the lists' state switch says.
  isHome() { return this.prefs.scope === "me" && this.prefs.view !== "list"; }
  // A repository's Milestones tab (prefs.kind "milestone"); Home and my lists don't have one.
  isMilestones() { return isRepoScope(this.prefs.scope) && this.prefs.kind === "milestone"; }
  listKind() { return this.prefs.kind === "milestone" ? "pr" : this.prefs.kind; }
  state() { return this.isHome() ? "open" : this.prefs.state; }
  cacheKey() { return this.prefs.scope + "|" + this.state(); }
  entry() { return this.ensure(this.prefs.scope, this.state()); }
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

  // Milestones and the open work of those opened, so the tab shows them at once next time; a refresh follows.
  persistMilestones() {
    const keep = (m) => [...m.entries()].filter(([, v]) => v.list || v.issues).slice(-30).map(([k, v]) => [k, { ...v, subs: v.subs ? [...v.subs.entries()] : undefined, loading: undefined, error: undefined }]);
    writeJson(cacheDir() + "/milestones.json", { lists: keep(this.milestones), items: keep(this.msItems) });
  }

  // An avatar for a login, round: a container's rounding doesn't clip an image, so the image is rounded itself. The picture once downloaded, initials until then (or if there isn't one). Hover names them.
  avatar(id, login, t, size = 18, tip = null) {
    if (!login) return div().w(size).flex_none();
    const file = avatarFile(login), ready = this.avatarState.get("file:" + file) === "ready";
    if (!ready && !this.avatarState.has(login) && !checking()) { this.avatarState.set(login, "queued"); this.avatarQueue.push(login); }
    const pic = Avatar.new().w(size).h(size).flex_none().rounded_full().overflow_hidden().bg(t.border)
      .fallback(AvatarFallback.new().size_full().flex().items_center().justify_center().text_size(Math.max(8, size * 0.42)).text_color(t.muted).child(initials(login)));
    return div().id(id).flex_none().tooltip(tip ?? login).child(ready ? pic.image(AvatarImage.new(AVATAR_DIR + "/" + file).size_full().rounded(size / 2)) : pic);
  }
  // Several people, overlapping slightly, up to three, then "+n".
  avatars(id, logins, t, size = 18, tip = null) {
    const shown = logins.slice(0, 3);
    return h_flex().id(id).flex_none().items_center().tooltip(tip ?? logins.join(", "))
      .children(shown.map((l, n) => div().when(n > 0, el => el.ml(-4)).rounded_full().border_1().border_color(t.background).child(this.avatar(id + "-" + n, l, t, size, tip ?? logins.join(", ")))))
      .when(logins.length > 3, el => el.child(div().ml(2).text_size(10.5).text_color(t.dim).child("+" + (logins.length - 3))));
  }
  fetchAvatars(cx) {
    if (this.avatarBusy || !this.avatarQueue.length) return;
    this.avatarBusy = true;
    cx.spawn(async (cx) => {
      const worker = async () => {
        for (let login; (login = this.avatarQueue.shift());) {
          const file = avatarFile(login);
          const r = await exec("sh", ["-c", AVATAR_FETCH, "sh", appHome() + "/" + AVATAR_DIR + "/" + file, avatarUrl(login)], { timeout: 20000 }).catch(() => null);
          this.avatarState.set(login, r?.code === 0 ? "ready" : "failed");
          if (r?.code === 0) { this.avatarState.set("file:" + file, "ready"); cx.notify(); }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      this.avatarBusy = false;
      cx.notify();
    });
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
      for (const { cwd, on, here } of todo.slice(0, 40)) {
        const [root, remotes] = await Promise.all([
          exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { on, timeout: 5000 }).catch(() => null),
          exec("git", ["-C", cwd, "remote", "-v"], { on, timeout: 5000 }).catch(() => null)]);
        if (root?.code !== 0 || remotes?.code !== 0) continue;
        const repo = repoFromRemotes(remotes.stdout.split("\n").filter(l => l.includes("(fetch)")));
        if (repo) this.folderRepos.set((on ?? "") + "|" + cwd, repo);
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
    if (this.isMilestones()) this.loadMilestones(cx);
    if (this.isHome()) this.refreshPinned(cx);
    const e = this.entry();
    if (Date.now() - e.at >= POLL_MS) this.load(cx);
    const item = this.current();
    if (item) this.fetchDetail(item, cx);
    this.learnOptional(this.rows().map(r => r.item).filter(Boolean), cx);
  }

  // Refreshes the first page of every section (later pages stay), a few at a time; each lands as it comes.
  load(cx, force = false) {
    if (!this.ready) return;
    const key = this.cacheKey(), entry = this.entry();
    if (this.loading.has(key)) return;
    if (!force && Date.now() - entry.at < POLL_MS) return;
    this.loading.add(key); cx.notify();
    if (force) { for (const d of this.details.values()) d.stale = true; for (const d of this.timelines.values()) d.stale = true; }
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
    this.learnOptional([...entry.result.items.values()], cx);
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

  // The one write action so far: marking a draft ready for review, as GitHub's draft box offers (undone on GitHub
  // with "Convert to draft"). Then the item, its details and the lists refresh.
  markReady(item, cx) {
    if (this.readying) return;
    this.readying = item.id; this.actionError = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await gh(["pr", "ready", String(item.number), "-R", item.repo], this.opts(30000));
        if (r.code !== 0) throw new Error((r.stderr || r.stdout || "gh pr ready failed").trim().split("\n")[0]);
        item.state = "open";
        for (const m of [this.details, this.timelines]) { const x = m.get(item.id); if (x) x.stale = true; }
        this.fetchDetail(item, cx);
        this.load(cx, true); this.refreshPinned(cx, true);
      } catch (e) { this.actionError = { id: item.id, msg: String(e?.message ?? e) }; }
      finally { this.readying = null; cx.notify(); }
    });
  }

  // A pull request's activity, newest first (the last 100 entries), refetched when it changes.
  fetchTimeline(item, cx) {
    if (checking()) return;
    const have = this.timelines.get(item.id);
    if (have?.loading || (have?.events && have.updatedAt === item.updatedAt && !have.stale)) return;
    this.timelines.set(item.id, { ...(have ?? {}), loading: true, error: null });
    cx.spawn(async (cx) => {
      try { this.timelines.set(item.id, { ...timelineOf((await graphql(TIMELINE_QUERY, { id: item.id, last: 100 }, this.opts(30000))).data), updatedAt: item.updatedAt, loading: false, error: null }); }
      catch (e) { this.timelines.set(item.id, { ...(this.timelines.get(item.id) ?? {}), loading: false, error: String(e?.message ?? e) }); }
      cx.notify();
    });
  }

  // Live checks for the open pull request: two ETag requests (check runs, statuses) that cost nothing when unchanged.
  // Only while it's shown and open; fast while any check runs, slow once they've settled.
  pollChecks(cx) {
    if (checking() || !this.isShown()) return;
    const item = this.current(), have = item && this.details.get(item.id), d = have?.detail;
    if (!item || item.kind !== "pr" || isClosed(item) || !d?.headOid || this.checksBusy) return;
    const running = d.checks.some(c => c.state === "pending") || item.ci === "pending";
    const at = this.checksAt?.get(item.id) ?? 0;
    if (!running && Date.now() - at < CHECKS_SETTLED_MS) return;
    this.checksBusy = true;
    (this.checksAt ??= new Map()).set(item.id, Date.now());
    cx.spawn(async (cx) => {
      try {
        const [runs, statuses] = await Promise.all([this.getLive(checkRunsPath(item.repo, d.headOid)), this.getLive(statusesPath(item.repo, d.headOid))]);
        if (!runs.changed && !statuses.changed) return;
        const now = this.details.get(item.id);
        if (!now?.detail || now.detail.headOid !== d.headOid) return;
        const checks = checksOf(runs.value, statuses.value, now.detail.checks);
        if (!checks.length && now.detail.checks.length) return;
        now.detail = { ...now.detail, checks };
        // The list's CI dot follows, wherever the item is listed.
        const ci = rollupOf(checks);
        for (const e of this.cache.values()) { const x = e.result.items.get(item.id); if (x) x.ci = ci; }
        for (const p of this.prefs.pinnedItems ?? []) if (p.id === item.id) p.ci = ci;
        if (this.shown?.id === item.id) this.shown.ci = ci;
        this.persistDetails();
        cx.notify();
      } catch (e) { console.warn("github: checks: " + (e?.message ?? e)); }
      finally { this.checksBusy = false; }
    });
  }
  // A REST GET with the last ETag: { changed, value } — unchanged (304) gives what it said last time.
  async getLive(path) {
    const had = this.live.get(path), args = ["api", "-i", path];
    if (had?.etag) args.push("-H", "If-None-Match: " + had.etag);
    const out = parseHttp((await gh(args, this.opts(15000))).stdout);
    if (out.status === 304 && had) return { changed: false, value: had.value };
    if (out.status !== 200) throw new Error("HTTP " + out.status + " for " + path);
    const value = json(out.body);
    this.live.set(path, { etag: out.headers.etag ?? null, value });
    if (this.live.size > 40) this.live.delete(this.live.keys().next().value);
    return { changed: true, value };
  }

  // Body, checks, reviews, comments and links come per item, refetched when it changes.
  fetchDetail(item, cx) {
    this.fetchTimeline(item, cx);
    const have = this.details.get(item.id);
    // Details saved by an older version are fetched again once.
    const old = Boolean(have?.detail) && have.detail.v !== DETAIL_V;
    if (have && have.updatedAt === item.updatedAt && !have.stale && !old) return;
    if (this.fetching?.has(item.id)) return;
    (this.fetching ??= new Set()).add(item.id);
    cx.spawn(async (cx) => {
      try {
        const { data } = await graphql(DETAIL_QUERY, { id: item.id, number: item.number }, this.opts());
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
    if (this.isHome()) return homeRows(this.result(), { query: this.query, collapsed: this.collapsed, pinned: this.pinnedItems() });
    if (this.isMilestones()) {
      const repo = this.prefs.scope, items = new Map();
      for (const [k, v] of this.msItems) if (k.startsWith(repo + "#")) items.set(Number(k.slice(repo.length + 1)), v);
      return milestoneRows(this.milestones.get(repo)?.list, items, { state: this.prefs.state, expanded: this.expandedMilestones(), byOwner: Boolean(this.prefs.msByOwner), query: this.query, login: this.login });
    }
    return buildRows(this.result(), this.listKind(), { query: this.query, collapsed: this.collapsed, group: this.prefs.group && !isRepoScope(this.prefs.scope) });
  }

  current() { return this.detailId ? this.findItem(this.detailId) : null; }
  // An item by id wherever it was listed: the lists' results, then milestones' open work (and their epics' sub-issues).
  findItem(id) {
    if (this.shown?.id === id) return this.shown;
    for (const e of this.cache.values()) { const i = e.result.items.get(id); if (i) return i; }
    for (const m of this.msItems.values()) {
      const i = m.issues?.find(x => x.id === id) ?? m.prs?.find(x => x.id === id);
      if (i) return i;
      for (const kids of m.subs?.values() ?? []) { const k = kids.find(x => x.id === id); if (k) return k; }
    }
    return (this.prefs.pinnedItems ?? []).find(p => p.id === id)  ?? null;
  }
  isLoading() { return this.loading.size > 0; }

  setScope(scope, cx, remember = true) {
    if (scope === this.prefs.scope) return this.setPicking(false, cx);
    if (remember) this.history.push(this.prefs.scope);
    this.prefs.scope = scope; this.picking = false; this.selected = null; this.detailId = null;
    if (scope === "me") { this.prefs.view = "home"; if (this.prefs.kind === "milestone") this.prefs.kind = "pr"; }
    else { this.fetchProjects(scope, cx); if (this.prefs.kind === "milestone") this.loadMilestones(cx); }
    this.handle.focus(); this.savePrefs(); this.load(cx); cx.notify();
  }
  // Home's "View all": the full sectioned list of my pull requests or issues; esc comes back.
  viewAll(kind, cx) {
    this.prefs.view = "list"; this.prefs.kind = kind; this.selected = null; this.detailId = null;
    this.handle.focus(); this.savePrefs(); this.load(cx); cx.notify();
  }
  goHome(cx) {
    if (this.prefs.scope !== "me") return this.setScope("me", cx);
    this.prefs.view = "home"; this.selected = null; this.detailId = null; this.savePrefs(); this.load(cx); cx.notify();
  }

  // A repository's projects, asked once per pane: they're links out, so a stale list is fine.
  fetchProjects(repo, cx) {
    if (!isRepoScope(repo) || this.projects.has(repo) || checking()) return;
    const [owner, name] = repo.split("/");
    this.projects.set(repo, "loading");
    cx.spawn(async (cx) => {
      try { this.projects.set(repo, projectsOf((await graphql(PROJECTS_QUERY, { owner, name }, this.opts())).data)); }
      catch { this.projects.set(repo, "error"); }
      cx.notify();
    });
  }
  setKind(kind, cx) {
    this.prefs.kind = kind; this.selected = null; this.detailId = null; this.savePrefs();
    if (kind === "milestone") this.loadMilestones(cx);
    cx.notify();
  }

  // Milestones of the shown repository, and the open work of each expanded one. Each is kept, shown, then refreshed.
  expandedMilestones() { return new Set((this.prefs.msExpanded ?? {})[this.prefs.scope] ?? []); }
  setExpanded(numbers, cx) {
    this.prefs.msExpanded = { ...(this.prefs.msExpanded ?? {}), [this.prefs.scope]: [...numbers] };
    this.savePrefs();
    for (const n of numbers) this.loadMilestoneItems(this.prefs.scope, n, cx);
    cx.notify();
  }
  toggleMilestone(number, cx) {
    const open = this.expandedMilestones();
    if (open.has(number)) open.delete(number); else open.add(number);
    this.setExpanded(open, cx);
  }
  // Focus: only this one open.
  focusMilestone(number, cx) {
    const open = this.expandedMilestones();
    this.setExpanded(open.size === 1 && open.has(number) ? new Set() : new Set([number]), cx);
  }
  loadMilestones(cx, force = false) {
    const repo = this.prefs.scope;
    if (!isRepoScope(repo) || checking()) return;
    const have = this.milestones.get(repo);
    if (have?.loading || (!force && have?.at && Date.now() - have.at < POLL_MS)) { for (const n of this.expandedMilestones()) this.loadMilestoneItems(repo, n, cx, force); return; }
    const [owner, name] = repo.split("/");
    this.milestones.set(repo, { ...(have ?? {}), loading: true, error: null }); cx.notify();
    cx.spawn(async (cx) => {
      try {
        const list = normalizeMilestones((await graphql(MILESTONES_QUERY, { owner, name }, this.opts(30000))).data);
        this.milestones.set(repo, { list, at: Date.now(), loading: false, error: null });
        this.persistMilestones();
      } catch (e) { this.milestones.set(repo, { ...(this.milestones.get(repo) ?? {}), loading: false, error: String(e?.message ?? e) }); }
      for (const n of this.expandedMilestones()) this.loadMilestoneItems(repo, n, cx, force);
      cx.notify();
    });
  }
  loadMilestoneItems(repo, number, cx, force = false) {
    if (checking()) return;
    const key = repo + "#" + number, have = this.msItems.get(key);
    if (have?.loading || (!force && have?.at && Date.now() - have.at < POLL_MS)) return;
    const [owner, name] = repo.split("/");
    this.msItems.set(key, { ...(have ?? {}), loading: true, error: null }); cx.notify();
    cx.spawn(async (cx) => {
      try {
        const got = milestoneItems((await graphql(MILESTONE_ITEMS_QUERY, { owner, name, number }, this.opts(30000))).data);
        const prev = this.msItems.get(key)?.subs;
        this.msItems.delete(key); this.msItems.set(key, { ...got, subs: prev ?? null, at: Date.now(), loading: false, error: null });
        cx.notify();
        // Then the epics' open sub-issues, which mostly aren't in the milestone themselves.
        const epics = got.issues.filter(i => i.subs && i.subs.completed < i.subs.total).map(i => i.id).slice(0, 20);
        if (epics.length) {
          try { this.msItems.get(key).subs = subIssuesOf((await graphql(subIssuesQuery(epics), {}, this.opts(30000))).data, epics); }
          catch { /* the epics still show, with their progress */ }
        }
        this.persistMilestones();
      } catch (e) { this.msItems.set(key, { ...(this.msItems.get(key) ?? {}), loading: false, error: String(e?.message ?? e) }); }
      cx.notify();
    });
  }
  setState(state, cx) { this.prefs.state = state; this.selected = null; this.detailId = null; this.savePrefs(); this.load(cx); cx.notify(); }
  // A chip clicked in a row adds its filter word (or takes it away if it's there), so lists narrow in a click.
  toggleFilter(token, cx) {
    const q = toggleToken(this.query, token);
    this.filter.set_value(q); this.query = q; this.selected = null; cx.notify();
  }
  // A clickable chip: the filter word it stands for, highlighted while it's in the filter.
  filterChip(id, label, color, token, t) {
    const on = hasToken(this.query, token);
    return div().id(id).flex_none().px(5).h(17).flex().items_center().rounded(4).border_1().cursor_pointer()
      .border_color(color ?? t.border).text_color(color ?? t.muted).text_size(10.5).when(on, el => el.bg(t.selected))
      .hover(s => s.bg(t.hover)).tooltip((on ? "Remove " : "Filter by ") + token)
      .on_click((_e, cx) => { cx.stop_propagation(); this.toggleFilter(token, cx); }).child(label);
  }

  // Pinned pull requests and issues: kept as they were last seen (so Home shows them at once), refreshed by id.
  isItemPinned(id) { return (this.prefs.pinnedItems ?? []).some(p => p.id === id); }
  toggleItemPin(item, cx) {
    const list = this.prefs.pinnedItems ?? [];
    this.prefs.pinnedItems = this.isItemPinned(item.id) ? list.filter(p => p.id !== item.id) : [...list, item];
    this.savePrefs(); cx.notify();
  }
  pinnedItems() { return (this.prefs.pinnedItems ?? []).map(p => this.findItem(p.id) ?? p); }
  refreshPinned(cx, force = false) {
    const ids = (this.prefs.pinnedItems ?? []).map(p => p.id);
    if (!ids.length || this.pinnedBusy || checking() || (!force && Date.now() - (this.pinnedAt ?? 0) < POLL_MS)) return;
    this.pinnedBusy = true;
    cx.spawn(async (cx) => {
      try {
        const fresh = new Map(nodesOf((await graphql(nodesQuery(ids.slice(0, 50)), {}, this.opts(30000))).data).map(i => [i.id, i]));
        this.prefs.pinnedItems = (this.prefs.pinnedItems ?? []).map(p => fresh.get(p.id) ?? p);
        this.pinnedAt = Date.now(); this.savePrefs();
      } catch { /* shown as last seen */ }
      finally { this.pinnedBusy = false; cx.notify(); }
    });
  }

  togglePin(repo, cx) { this.prefs.pins = togglePin(this.prefs.pins ?? [], repo); this.savePrefs(); cx.notify(); }
  toggleGroup(cx) { this.prefs.group = !this.prefs.group; this.savePrefs(); cx.notify(); }
  toggleCollapsed(key, cx) { if (this.collapsed.has(key)) this.collapsed.delete(key); else this.collapsed.add(key); this.savePrefs(); cx.notify(); }

  setPicking(open, cx) {
    this.picking = open; this.scopeQuery = "";
    if (open) { this.scopeHot = Math.max(0, this.scopes().findIndex(s => s.id === this.prefs.scope)); this.scopeList.focus(); }
    else this.handle.focus();
    cx.notify();
  }

  // Where the dropdown and the sidebar can go (see scopeOptions), narrowed by what's typed.
  scopeChoices(query) {
    const mine = this.ensure("me", this.state()).result;
    return scopeOptions({ login: this.login, pins: this.prefs.pins ?? [], current: this.prefs.scope, counts: repoCounts(mine, this.listKind()), recent: this.recent, query });
  }
  scopes() { return this.scopeChoices(this.scopeQuery); }

  toggleSidebar(cx) { this.prefs.sidebar = !this.prefs.sidebar; if (!this.prefs.sidebar) this.clearSide(); this.savePrefs(); this.handle.focus(); cx.notify(); }
  clearSide() { this.sideFilter.set_value(""); this.sideQuery = ""; }

  open(row, cx) {
    this.selected = row.key; this.detailId = row.item.id;
    this.fetchDetail(row.item, cx); cx.notify();
  }

  close(cx) { this.detailId = null; cx.notify(); }

  reveal(key) { const i = this.rows().findIndex(r => r.key === key); if (i >= 0) this.scroll.scroll_to_item(i); }

  step(delta, cx) {
    const rows = this.rows().filter(r => r.kind === "item" || r.kind === "milestone" || (r.kind === "more" && !r.pending));
    if (!rows.length) return;
    const at = rows.findIndex(r => r.key === this.selected);
    const next = rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? (delta > 0 ? 0 : rows.length - 1) : at + delta))];
    this.selected = next.key; this.reveal(next.key);
    if (this.detailId && next.kind === "item") this.open(next, cx);
    cx.notify();
  }

  selectedItem() { const r = this.rows().find(r => r.key === this.selected); return r?.kind === "milestone" ? null : r?.item ?? this.current(); }
  kinds() { return isRepoScope(this.prefs.scope) ? [...KINDS, { id: "milestone", label: "Milestones" }] : KINDS; }

  copy(text, cx) { cx.write_to_clipboard(text); this.copied = text; cx.notify(); cx.timer.after(1500, (cx) => { if (this.copied === text) { this.copied = null; cx.notify(); } }); }

  // Every terminal pane with a folder on a known repository and branch, from Herdr's live panes (branches update as
  // they're switched) and the remotes scanned once per folder.
  places() {
    const sp = spaces(), out = [];
    for (const p of panes()) {
      if (!p.cwd || !p.branch || p.mod) continue;
      const space = sp.find(x => x.tabs?.some(t => t.id === p.tab)), tab = space?.tabs.find(t => t.id === p.tab);
      const repo = this.folderRepos.get((space?.machine ?? "") + "|" + p.cwd);
      if (!repo || !space) continue;
      out.push({ repo, branch: p.branch, pane: p.pane, tab: p.tab, space: space.id, spaceName: space.name, tabName: tab?.name ?? "", tabIndex: tab?.index ?? 0,
        status: p.status ?? "idle", focused: p.focused, active: space.active && Boolean(tab?.active), changedAt: tab?.changed_at ?? 0, machine: space.machine });
    }
    return out;
  }
  workPlaces(item) { return workPlaces(item, this.places()); }
  // Show that space and tab, and focus the pane there.
  jump(place) {
    run("space.select", { id: place.space });
    run("tab.select", { id: place.tab });
    run("pane.focus", { pane: place.panes?.[0] ?? place.pane });
  }
  placeLabel(p) { return p.spaceName + (p.tabName && p.tabName !== p.spaceName && !/^\d+$/.test(p.tabName) ? " · " + p.tabName : ""); }
  statusColor(status, t) { return { blocked: t.blocked, done: t.done, working: t.working }[status] ?? t.dim; }
  // A robot where the pull request's branch is open in a terminal, tinted by its agent's state (a count when in more
  // than one place); hover names the places, a click goes to the best one. Only there when it's open somewhere.
  placeChip(id, item, t, size = 13) {
    const all = this.workPlaces(item);
    if (!all.length) return null;
    const p = all[0], color = p.status === "idle" ? t.muted : this.statusColor(p.status, t);
    return h_flex().id(id).flex_none().h(size + 4).px(2).gap(1).items_center().rounded(4).cursor_pointer()
      .text_color(color).hover(s => s.bg(t.hover).text_color(t.foreground))
      .tooltip("Open in " + all.map(x => this.placeLabel(x) + (x.status !== "idle" ? " (" + x.status + ")" : "")).join(", ") + ": go there (J)")
      .on_click((_e, cx) => { cx.stop_propagation(); this.jump(p); })
      .child(svg(ICON("robot")).size(size))
      .when(all.length > 1, el => el.child(div().text_size(9.5).child(String(all.length))));
  }

  // A pull request with a local clone open in some terminal can be reviewed in the Changes dialog, as pr-picker does.
  canReview(item) { return item?.kind === "pr" && this.checkouts.has(item.repo); }
  review(item) {
    if (!this.canReview(item)) return;
    const c = this.checkouts.get(item.repo);
    openOverlay({ mod: "changes-panel", kind: "dialog", modal: true, width: 0.94, height: 0.92, props: { repo: c.root, machine: c.on, pr: item.number } });
  }

  onKey(e, cx) {
    const k = e.keystroke;
    if (this.sideTyping) {
      if (k === "escape") { this.clearSide(); this.handle.focus(); cx.notify(); cx.stop_propagation(); }
      return;
    }
    if (this.filtering) {
      if (k === "escape") { this.filter.set_value(""); this.query = ""; this.handle.focus(); cx.notify(); cx.stop_propagation(); }
      else if (k === "down") { this.handle.focus(); this.step(1, cx); cx.stop_propagation(); }
      return;
    }
    const item = this.selectedItem();
    const actions = {
      "j": () => this.step(1, cx), "down": () => this.step(1, cx), "k": () => this.step(-1, cx), "up": () => this.step(-1, cx),
      "enter": () => { const r = this.rows().find(r => r.key === this.selected); if (r?.kind === "item") this.open(r, cx); else if (r?.kind === "more") this.more(r.sectionKey, cx); else if (r?.kind === "milestone") this.toggleMilestone(r.milestone.number, cx); },
      "space": () => actions.enter(),
      "o": () => { const r = this.rows().find(r => r.key === this.selected); if (r?.kind === "milestone") cx.open_url(r.milestone.url); else if (item) cx.open_url(item.url); },
      "c": () => item && this.copy(item.url, cx),
      "x": () => item && this.toggleItemPin(item, cx),
      "J": () => actions["shift-j"](),
      "shift-j": () => { const p = item && this.workPlaces(item)[0]; if (p) this.jump(p); },
      "shift-c": () => item && this.copy(ref(item), cx),
      "d": () => this.review(item),
      "1": () => this.isHome() ? this.viewAll("pr", cx) : this.setKind("pr", cx), "2": () => this.isHome() ? this.viewAll("issue", cx) : this.setKind("issue", cx),
      "3": () => isRepoScope(this.prefs.scope) && this.setKind("milestone", cx),
      "tab": () => { if (this.isHome()) return; const ks = this.kinds().map(k => k.id); this.setKind(ks[(ks.indexOf(this.prefs.kind) + 1) % ks.length], cx); },
      "f": () => { const r = this.rows().find(r => r.key === this.selected); if (r?.kind === "milestone") this.focusMilestone(r.milestone.number, cx); },
      "w": () => { if (this.isMilestones()) { this.prefs.msByOwner = !this.prefs.msByOwner; this.savePrefs(); cx.notify(); } },
      "h": () => this.goHome(cx),
      "s": () => !this.isHome() && this.setState(STATES[(STATES.findIndex(s => s.id === this.prefs.state) + 1) % STATES.length].id, cx),
      "g": () => this.toggleGroup(cx),
      "b": () => this.toggleSidebar(cx),
      "v": () => this.toggleCards(cx),
      "p": () => this.setPicking(!this.picking, cx),
      "m": () => this.goHome(cx),
      "P": () => actions["shift-p"](),
      "shift-p": () => { const repo = isRepoScope(this.prefs.scope) ? this.prefs.scope : item?.repo; if (repo) this.togglePin(repo, cx); },
      "R": () => item && this.setScope(item.repo, cx),
      "shift-r": () => item && this.setScope(item.repo, cx),
      "/": () => this.filter.focus(), "cmd-f": () => this.filter.focus(),
      "r": () => { this.load(cx, true); if (this.isMilestones()) this.loadMilestones(cx, true); this.refreshPinned(cx, true); },
      "escape": () => {
        if (this.picking) this.setPicking(false, cx);
        else if (this.detailId) this.close(cx);
        else if (this.query) { this.filter.set_value(""); this.query = ""; cx.notify(); }
        else if (this.prefs.scope === "me" && this.prefs.view === "list") this.goHome(cx);
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
  // Where an owner's avatar would be when there's none: an empty dashed circle of the same size, so the column stays aligned.
  nobody(id, t, size) {
    // Drawn, not a dashed border: a border's dashes are short and close, this one's few and long enough to read.
    return div().id(id).size(size).flex_none().tooltip("Nobody is assigned").child(svg(ICON("nobody")).size(size).text_color(t.dim));
  }

  // The CI dot. Failing only in checks that aren't required is green ringed in red: it can still merge.
  ciDot(id, item, t) {
    const look = this.ciOf(item);
    if (look !== "optional") return div().id(id).size(7).flex_none().rounded(4).bg(this.ciColor(look, t)).tooltip("CI: " + (look ?? "none"));
    // Halves don't clip round at this size, so it's a green dot in a red ring.
    return div().id(id).size(9).flex_none().rounded(5).border_2().border_color(t.blocked).bg(t.done).tooltip("CI: only checks that aren't required are failing");
  }
  // An item's CI look: details (fresher, with required flags) win; else what the light query learned for its head.
  ciOf(item) {
    if (item?.kind !== "pr") return null;
    const d = this.details.get(item.id)?.detail;
    if (d?.checks?.length && d.headOid && (!item.headOid || d.headOid === item.headOid) && d.checks.some(c => "required" in c)) {
      const fail = d.checks.filter(c => c.state === "fail");
      return ciLook(item.ci, fail.length > 0 && d.checks.some(c => c.required) && fail.every(c => !c.required));
    }
    const k = this.optional.get(item.id);
    return ciLook(item.ci, Boolean(k?.optional) && (!item.headOid || k.oid === item.headOid));
  }
  // Failing pull requests in view are asked, in one request, whether their failures are only optional checks; each head once.
  learnOptional(items, cx) {
    if (checking() || this.learning) return;
    const ask = [];
    for (const i of items) {
      if (i?.kind !== "pr" || i.ci !== "fail" || isClosed(i) || !i.headOid) continue;
      if (this.optional.get(i.id)?.oid === i.headOid) continue;
      const d = this.details.get(i.id)?.detail;
      if (d?.headOid === i.headOid && d.checks?.some(c => "required" in c)) continue;
      if (!ask.some(x => x.id === i.id)) ask.push(i);
      if (ask.length >= 20) break;
    }
    if (!ask.length) return;
    this.learning = true;
    cx.spawn(async (cx) => {
      try {
        const { data } = await graphql(requiredQuery(ask), {}, this.opts());
        for (const [id, v] of requiredOf(data, ask)) this.optional.set(id, v);
        writeJson(cacheDir() + "/optional.json", [...this.optional.entries()].slice(-200));
        cx.notify();
      } catch (e) { console.warn("github: required checks: " + (e?.message ?? e)); }
      finally { this.learning = false; }
    });
  }
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
      .child(this.iconButton("gh-sidebar", "sidebar", (this.prefs.sidebar ? "Hide" : "Show") + " the sidebar (b)", (cx) => this.toggleSidebar(cx), t, Boolean(this.prefs.sidebar)))
      .child(this.iconButton("gh-cards", "cards", this.prefs.cards ? "One line per item (v)" : "Two lines per item (v)", (cx) => this.toggleCards(cx), t, Boolean(this.prefs.cards)))
      .child(svg(ICON("github")).size(15).flex_none().text_color(t.accent))
      .child(div().font_semibold().child("GitHub"))
      .child(this.scopeDropdown(t))
      .when(this.prefs.scope === "me" && this.prefs.view === "list", el => el.child(div().text_color(t.dim).child("/"))
        .child(div().flex_none().text_size(12).text_color(t.foreground).child(this.prefs.kind === "pr" ? "Pull requests" : "Issues")))
      .when(isRepoScope(this.prefs.scope), el => {
        const pinned = (this.prefs.pins ?? []).includes(this.prefs.scope);
        return el.child(this.iconButton("gh-pin", pinned ? "pin-off" : "pin", (pinned ? "Unpin " : "Pin ") + this.prefs.scope + " (P)", (cx) => this.togglePin(this.prefs.scope, cx), t, pinned))
          .child(this.iconButton("gh-repo-web", "external", "Open the repository on GitHub", (cx) => cx.open_url((this.isMilestones() ? "https://github.com/" + this.prefs.scope + "/milestones" : repoUrl(this.prefs.scope, this.prefs.kind))), t))
          .child(this.projectsMenu(t));
      })
      .child(div().flex_1())
      .when(this.entry().at > 0, el => el.child(div().flex_none().text_size(11).text_color(t.dim).tooltip("Last refreshed").child(age(new Date(this.entry().at).toISOString()) + " ago")))
      .child(this.iconButton("gh-reload", "reload", "Reload (r)", (cx) => { this.load(cx, true); if (this.isMilestones()) this.loadMilestones(cx, true); }, t))
      .when(this.isLoading(), el => el.child(svg(ICON("reload")).size(12).flex_none().text_color(t.dim).spin(900)));
  }

  // The repository's projects (they live on GitHub): a menu of links, open ones first.
  projectsMenu(t) {
    const repo = this.prefs.scope, list = this.projects.get(repo), open = this.projectsOpen === repo;
    const trigger = h_flex().id("gh-projects").h(22).px(6).gap(4).flex_none().items_center().rounded(5).cursor_pointer().text_size(11.5)
      .text_color(open ? t.foreground : t.dim).when(open, el => el.bg(t.hover)).hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip("Projects on GitHub")
      .on_click((_e, cx) => { this.projectsOpen = open ? null : repo; cx.notify(); })
      .child(svg(ICON("project")).size(12)).child("Projects")
      .when(Array.isArray(list) && list.some(p => !p.closed), el => el.child(div().text_color(t.dim).child(String(list.filter(p => !p.closed).length))));
    const body = list === "loading" || list == null ? [h_flex().h(26).px(8).gap(6).items_center().text_size(12).text_color(t.dim).child(this.spinner(t)).child("Loading…")]
      : list === "error" ? [div().px(8).py(6).text_size(12).text_color(t.blocked).child("Couldn't list projects.")]
      : !list.length ? [div().px(8).py(6).text_size(12).text_color(t.dim).child("No projects are linked to " + repo + ".")]
      : list.map(p => h_flex().id("gh-project-" + p.number).h(26).px(8).gap(6).items_center().rounded(5).cursor_pointer().text_size(12.5)
          .text_color(p.closed ? t.dim : t.foreground).hover(st => st.bg(t.hover))
          .on_click((_e, cx) => { this.projectsOpen = null; cx.open_url(p.url); cx.notify(); })
          .child(svg(ICON("project")).size(12).flex_none().text_color(t.dim))
          .child(div().flex_1().truncate().child(p.title))
          .when(p.closed, el => el.child(div().flex_none().text_size(11).text_color(t.dim).child("closed")))
          .child(svg(ICON("external")).size(11).flex_none().text_color(t.dim)));
    return Select.new("gh-projects-select").flex_none().accessibility_label("Projects")
      .open(open).on_open_change((o, cx) => { this.projectsOpen = o ? repo : null; cx.notify(); })
      .child(Popup.new("gh-projects-list", trigger).anchor("top_left")
        .when(open, el => el.content(v_flex().id("gh-projects-options").mt(4).p(4).gap(1).min_w(240).max_w(400).max_h(360).overflow_y_scrollbar()
          .rounded(8).border_1().border_color(t.border).bg(t.popover).shadow_md().children(body))));
  }

  scopeDropdown(t) {
    const scopes = this.scopes(), open = Boolean(this.picking);
    const label = this.prefs.scope === "me" ? "Home" : this.prefs.scope;
    const trigger = h_flex().id("gh-scope").h(22).px(7).gap(4).items_center().rounded(5).cursor_pointer().text_size(12).min_w(0)
      .text_color(open ? t.foreground : t.muted).when(open, el => el.bg(t.hover))
      .hover(s => s.bg(t.hover).text_color(t.foreground)).track_focus(this.scopeTrigger).tooltip("Scope (p)")
      .on_click((_e, cx) => this.setPicking(!this.picking, cx))
      .child(svg(ICON(this.prefs.scope === "me" ? "home" : "folder")).size(12).flex_none())
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

  // Home, pinned repositories and the others (from my results and recent pushes), with its own search.
  sidebar(t) {
    const opts = this.scopeChoices(this.sideQuery), names = shortNames(opts.filter(o => o.id !== "me").map(o => o.id));
    const GROUPS = { pinned: "Pinned", repos: "Repositories" };
    const row = (o) => {
      const on = o.id === this.prefs.scope, me = o.id === "me";
      const icon = me ? "home" : o.group === "pinned" ? "pin" : "folder";
      return h_flex().id("gh-side-" + o.id).h(26).px(8).gap(6).items_center().rounded(5).cursor_pointer().text_size(12.5)
        .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
        .tooltip(me ? "Home (h)" : o.id).on_click((_e, cx) => { this.clearSide(); this.setScope(o.id, cx); })
        .child(svg(ICON(icon)).size(12).flex_none().text_color(on ? t.accent : t.dim))
        .child(div().flex_1().min_w(0).truncate().when(me, el => el.font_semibold()).child(me ? "Home" : names.get(o.id) ?? o.id))
        .when(Boolean(o.note) && !me && o.note !== "recent", el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(o.note)))
        .when(!me, el => el.child(div().id("gh-side-pin-" + o.id).size(18).flex_none().flex().items_center().justify_center().rounded(4)
          .text_color(o.pinned ? t.accent : t.dim).hover(s => s.bg(t.raised).text_color(t.foreground)).tooltip(o.pinned ? "Unpin" : "Pin")
          .on_click((_e, cx) => { cx.stop_propagation(); this.togglePin(o.id, cx); }).child(svg(ICON(o.pinned ? "pin-off" : "pin")).size(11))));
    };
    const items = [];
    opts.forEach((o, i) => {
      if (o.group !== "me" && o.group !== opts[i - 1]?.group) items.push(div().px(8).pt(10).pb(3).text_size(10.5).font_semibold().text_color(t.dim).child(GROUPS[o.group].toUpperCase()));
      items.push(row(o));
    });
    if (!opts.length) items.push(div().px(8).py(6).text_size(11.5).text_color(t.dim).child("No match. Type owner/name to open any repository."));
    return v_flex().w(SIDEBAR_W).flex_none().h_full().min_h(0).bg(t.chrome).border_r(1).border_color(t.border)
      .child(div().px(8).pt(8).pb(4).flex_none().child(h_flex().h(26).px(7).gap(5).items_center().rounded(5).border_1()
        .border_color(this.sideTyping ? t.accent : t.input).bg(t.surface)
        .child(svg(ICON("search")).size(12).flex_none().text_color(t.dim))
        .child(Input.new(this.sideFilter).flex_1().text_size(12))
        .when(Boolean(this.sideQuery), el => el.child(div().id("gh-side-clear").flex_none().cursor_pointer().text_color(t.dim).hover(s => s.text_color(t.foreground))
          .on_click((_e, cx) => { this.clearSide(); cx.notify(); }).child(svg(ICON("x")).size(11))))))
      .child(v_flex().id("gh-side-list").flex_1().min_h(0).overflow_y_scrollbar().px(4).pb(8).gap(1).children(items));
  }

  // Home and each pinned repository, one click away; the current one is highlighted.
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
      .child(chip("me", "Home", "home", "Home (h)"))
      .children((this.prefs.pins ?? []).map(p => chip(p, p.split("/")[1] ?? p, "pin", p)));
  }

  kindBadge(kind, res, t) {
    if (kind === "milestone") {
      const ms = this.milestones.get(this.prefs.scope);
      return ms?.list ? String(ms.list.filter(m => m.state === "open").length) : ms?.loading ? this.spinner(t, 10, "Loading") : null;
    }
    return !isLoaded(res) ? null : kindPending(res, kind) ? this.spinner(t, 10, "Counting") : kindCount(res, kind) + (kindHasMore(res, kind) ? "+" : "");
  }

  toolbar(t) {
    const res = this.result(), scope = this.prefs.scope, home = this.isHome();
    // Home and the pins come first, so they stay in place as the rows under them change with the view.
    return v_flex().flex_none().px(10).py(8).gap(7).border_b(1).border_color(t.border)
      .when((this.prefs.pins ?? []).length > 0 && !this.prefs.sidebar, el => el.child(this.pinRow(t)))
      .when(!home, el => el.child(h_flex().gap(8).items_center().flex_wrap()
        .child(h_flex().flex_none().rounded(6).border_1().border_color(t.border).overflow_hidden()
          .children(this.kinds().map((k, i) => this.segment("gh-kind-" + k.id, k.label, this.prefs.kind === k.id, (cx) => this.setKind(k.id, cx), t, this.kindBadge(k.id, res, t)))))
        .child(h_flex().flex_none().rounded(6).border_1().border_color(t.border).overflow_hidden()
          .children(STATES.map(s => this.segment("gh-state-" + s.id, s.label, this.prefs.state === s.id, (cx) => this.setState(s.id, cx), t))))
        .child(div().flex_1())
        .when(this.isMilestones(), el => el.child(div().id("gh-by-owner").h(22).px(8).flex().items_center().gap(4).rounded(5).cursor_pointer().text_size(11.5)
          .text_color(this.prefs.msByOwner ? t.foreground : t.dim).when(Boolean(this.prefs.msByOwner), el => el.bg(t.selected)).hover(s => s.bg(t.hover))
          .tooltip("Group a milestone's work by owner instead of by epic (w)").on_click((_e, cx) => { this.prefs.msByOwner = !this.prefs.msByOwner; this.savePrefs(); cx.notify(); })
          .child("by owner")))
        .when(!isRepoScope(scope), el => el.child(div().id("gh-group").h(22).px(8).flex().items_center().gap(4).rounded(5).cursor_pointer().text_size(11.5)
          .text_color(this.prefs.group ? t.foreground : t.dim).when(this.prefs.group, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
          .tooltip("Group by repository (g)").on_click((_e, cx) => this.toggleGroup(cx)).child(svg(ICON("folder")).size(12)).child("by repo")))
      ))
      .child(h_flex().h(28).px(8).gap(6).items_center().rounded(6).border_1().border_color(this.filtering ? t.accent : t.input).bg(t.surface)
        .child(svg(ICON("search")).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.filter).flex_1().text_size(12.5))
        .when(Boolean(this.query), el => el.child(div().id("gh-clear").flex_none().cursor_pointer().text_color(t.dim).hover(s => s.text_color(t.foreground))
          .on_click((_e, cx) => { this.filter.set_value(""); this.query = ""; cx.notify(); }).child(svg(ICON("x")).size(12)))));
  }

  listRow(row, t, mono, cols) {
    if (row.kind === "block") {
      return h_flex().id("gh-row-" + row.key).h(30).flex_none().px(10).mt(6).gap(6).items_center().cursor_pointer()
        .text_size(12).font_semibold().text_color(t.foreground).hover(s => s.text_color(t.foreground))
        .on_click((_e, cx) => this.toggleCollapsed(row.key, cx))
        .child(svg(ICON(row.collapsed ? "chevron-right" : "chevron-down")).size(11).text_color(t.dim))
        .child(svg(ICON(row.id === "pinned" ? "pin" : row.id === "pr" ? "pr-open" : "issue-open")).size(13).text_color(row.id === "pinned" ? t.accent : t.dim))
        .child(row.label)
        .child(row.pending ? this.spinner(t, 10, "Loading") : div().text_size(11).font_normal().text_color(t.dim).child(row.count > row.shown ? row.shown + " of " + row.count + (row.more ? "+" : "") : String(row.count)))
        .child(div().flex_1())
        .when(row.id !== "pinned", el => el.child(div().id("gh-all-" + row.id).flex_none().px(6).h(20).flex().items_center().rounded(4).text_size(11.5).font_normal().text_color(t.accent)
          .hover(s => s.bg(t.hover)).tooltip("Every section, with closed ones too (" + (row.id === "pr" ? "1" : "2") + ")")
          .on_click((_e, cx) => { cx.stop_propagation(); this.viewAll(row.id, cx); }).child("View all →")));
    }
    if (row.kind === "note") {
      return h_flex().id("gh-row-" + row.key).h(28).flex_none().pl(row.depth ? 14 + row.depth * 16 : 30).gap(6).items_center().text_size(12)
        .text_color(row.error ? t.blocked : row.url ? t.accent : t.dim)
        .when(Boolean(row.url), el => el.cursor_pointer().hover(s => s.text_color(t.foreground)).on_click((_e, cx) => cx.open_url(row.url)))
        .when(row.loading, el => el.child(this.spinner(t, 11)).child("Loading…")).when(!row.loading, el => el.child(row.text + (row.url ? " ↗" : "")));
    }
    if (row.kind === "milestone") return this.milestoneRow(row, t);
    if (row.kind === "group") {
      return h_flex().id("gh-row-" + row.key).h(26).flex_none().pl(14 + row.depth * 16).pr(10).mx(4).gap(6).items_center().text_size(11.5)
        .text_color(row.unassigned ? t.working : t.muted)
        .when(Boolean(row.parent), el => el.cursor_pointer().rounded(5).hover(s => s.bg(t.hover)).tooltip("Parent outside this milestone: open on GitHub")
          .on_click((_e, cx) => row.parent.url && cx.open_url(row.parent.url))
          .child(svg(ICON("issue-open")).size(12).text_color(t.dim)).child(div().flex_none().text_color(t.dim).child("#" + row.parent.number))
          .child(div().flex_1().min_w(0).truncate().child(row.parent.title)))
        .when(!row.parent, el => el.child(div().font_semibold().child(row.label)))
        .child(div().flex_none().text_color(t.dim).child(String(row.count)));
    }
    if (row.kind === "section") {
      return h_flex().id("gh-row-" + row.key).h(28).flex_none().px(10).mt(4).gap(6).items_center().cursor_pointer()
        .text_size(11).font_semibold().text_color(t.muted).hover(s => s.text_color(t.foreground))
        .on_click((_e, cx) => this.toggleCollapsed(row.key, cx))
        .child(svg(ICON(row.collapsed ? "chevron-right" : "chevron-down")).size(11).text_color(t.dim))
        .child(row.label.toUpperCase())
        .when(!row.pending, el => el.child(div().text_color(t.dim).font_normal().child(String(row.count))))
        .when(row.pending, el => el.child(this.spinner(t, 10, "Counting")))
        .when(row.truncated, el => el.child(div().id("gh-more-" + row.id).text_color(t.accent).font_normal().cursor_pointer().tooltip("See all " + row.total + " on GitHub")
          .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(searchUrl(row.search, this.listKind())); }).child("of " + row.total + " ↗")))
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
    return this.prefs.cards ? this.cardRow(row, t, mono, cols) : this.compactRow(row, t, mono, cols);
  }

  // One line per item (the default): optional columns drop as the list narrows.
  compactRow(row, t, mono, cols) {
    const i = row.item, selected = row.key === this.selected, shown = this.detailId === i.id;
    const rv = this.reviewLook(i.review, t), repoName = row.showRepo ? i.repo.split("/")[1] : isRepoScope(this.prefs.scope) ? null : this.prefs.group ? null : i.repo.split("/")[1];
    return h_flex().id("gh-row-" + row.key).h(30).flex_none().pl(10 + row.depth * 16).pr(10).mx(4).gap(7).items_center().rounded(6).cursor_pointer()
      .when(selected, el => el.bg(shown ? t.selected : t.raised)).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => { this.handle.focus(); this.open(row, cx); })
      .child(this.stateIcon(i, t))
      .child(div().flex_none().text_size(11.5).font_family(mono).text_color(t.dim).child("#" + i.number))
      .when(Boolean(row.epic) || (Boolean(i.type) && Boolean(row.owner) && i.type !== "Task"), el => el.child(this.filterChip("gh-ty-" + row.key, i.type ?? "Epic", row.epic ? t.ansi5 : t.dim, filterToken("type", i.type ?? "Epic"), t)))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(isClosed(i) ? t.muted : t.foreground).child(i.title))
      .when(Boolean(row.tag), el => el.child(this.chip(row.tag, t.accent, t)))
      .when(this.isItemPinned(i.id) && row.section !== "home-pinned", el => el.child(svg(ICON("pin")).size(11).flex_none().text_color(t.accent)))
      .when(Boolean(i.borrowed), el => el.child(div().flex_none().text_size(10.5).text_color(t.dim).tooltip("A sub-issue of this epic, not itself in the milestone").child("sub")))
      .when(cols.labels, el => el.children(i.labels.slice(0, 2).map((l, n) => this.filterChip("gh-lb-" + row.key + "-" + n, l.name, this.labelColor(l.color, t), filterToken("label", l.name), t))))
      .when(cols.labels && Boolean(i.milestone) && !row.owner, el => el.child(this.filterChip("gh-ms-" + row.key, "◆ " + i.milestone.title.replace(/^Roadmap:\s*/i, ""), t.muted, filterToken("milestone", i.milestone.title), t)))
      .when(Boolean(repoName) && cols.repo, el => el.child(div().id("gh-rp-" + row.key).flex_none().max_w(120).truncate().text_size(11).cursor_pointer()
        .text_color(hasToken(this.query, filterToken("repo", i.repo)) ? t.accent : t.dim).hover(s => s.text_color(t.foreground)).tooltip("Filter by repo:" + i.repo)
        .on_click((_e, cx) => { cx.stop_propagation(); this.toggleFilter(filterToken("repo", i.repo), cx); }).child(repoName)))
      .when(i.conflicts && !isClosed(i), el => el.child(div().id("gh-cf-" + row.key).flex_none().tooltip("Merge conflicts").child(svg(ICON("conflict")).size(12).text_color(t.blocked))))
      .when(Boolean(rv) && !isClosed(i), el => el.child(this.filterChip("gh-rv-" + row.key, rv[0], rv[1], filterToken("review", i.review), t)))
      .when(i.kind === "pr" && !isClosed(i), el => { const c = this.placeChip("gh-place-" + row.key, i, t); return c ? el.child(c) : el; })
      .when(i.kind === "pr", el => el.child(this.ciDot("gh-ci-" + row.key, i, t)))
      .when(cols.comments, el => el.child(h_flex().flex_none().w(30).gap(3).items_center().justify_end().text_size(11).text_color(t.dim)
        .when(i.comments > 0, el => el.child(svg(ICON("comment")).size(10)).child(String(i.comments)))))
      .when(Boolean(i.subs), el => el.child(div().flex_none().text_size(11).text_color(t.dim).tooltip("Sub-issues done").child(i.subs.completed + "/" + i.subs.total)))
      // When, then who: the avatar (or owners) is the row's last element.
      .child(div().flex_none().w(30).text_right().text_size(11).text_color(t.dim).tooltip("Updated").child(age(i.updatedAt)))
      .when(cols.author && !row.owner, el => el.child(h_flex().flex_none().w(20).justify_end().child(this.avatar("gh-au-" + row.key, i.author, t, 18, "Opened by " + i.author))))
      .when(Boolean(row.owner), el => el.child(h_flex().flex_none().w(52).justify_end()
        .when(i.assignees.length > 0, el => el.child(this.avatars("gh-as-" + row.key, i.assignees, t, 18, "Assigned: " + i.assignees.join(", "))))
        // A pull request without assignees is owned by whoever opened it.
        .when(!i.assignees.length && i.kind === "pr", el => el.child(this.avatar("gh-as-" + row.key, i.author, t, 18, "Opened by " + i.author)))
        .when(!i.assignees.length && i.kind !== "pr", el => el.child(this.nobody("gh-as-" + row.key, t, 18)))))
;
  }

  // Two lines per item (v): the title gets the first; labels and state the second.
  cardRow(row, t, mono, cols) {
    const i = row.item, selected = row.key === this.selected, shown = this.detailId === i.id;
    const rv = this.reviewLook(i.review, t), repoName = row.showRepo ? i.repo.split("/")[1] : isRepoScope(this.prefs.scope) ? null : this.prefs.group ? null : i.repo.split("/")[1];
    const closed = isClosed(i), place = i.kind === "pr" && !closed ? this.placeChip("gh-place-" + row.key, i, t, 15) : null;
    const milestone = i.milestone && !row.owner ? i.milestone.title.replace(/^Roadmap:\s*/i, "") : null;
    const typeChip = Boolean(row.epic) || (Boolean(i.type) && Boolean(row.owner) && i.type !== "Task");
    // Line 2 leaves the labels what its status icons don't take.
    const indent = 10 + row.depth * 16, inner = cols.width - indent - 10 - 12 - 26;
    const left = (typeChip ? 56 : 0) + (i.borrowed ? 26 : 0);
    const right = (rv && !closed ? 78 : 0) + (i.conflicts && !closed ? 18 : 0) + (i.kind === "pr" ? 14 : 0) + (i.comments ? 34 : 0) + (i.subs ? 38 : 0);
    const lay = cardLayout(i.labels, { width: inner, used: left + right + 16, milestone });
    const chips = [
      ...(milestone ? [this.filterChip("gh-ms-" + row.key, "◆ " + milestone, t.muted, filterToken("milestone", i.milestone.title), t)] : []),
      ...i.labels.map((l, n) => this.filterChip("gh-lb-" + row.key + "-" + n, l.name, this.labelColor(l.color, t), filterToken("label", l.name), t)),
    ];
    const hiddenNames = [...(milestone ? ["◆ " + milestone] : []), ...i.labels.map(l => l.name)].slice(lay.shown);
    const people = row.owner
      ? (i.assignees.length > 0 ? this.avatars("gh-as-" + row.key, i.assignees, t, 16, "Assigned: " + i.assignees.join(", "))
        // A pull request without assignees is owned by whoever opened it.
        : i.kind === "pr" ? this.avatar("gh-as-" + row.key, i.author, t, 16, "Opened by " + i.author)
        : this.nobody("gh-as-" + row.key, t, 16))
      : this.avatar("gh-au-" + row.key, i.author, t, 16, "Opened by " + i.author);
    // Plain cards: space between them keeps them apart; the hover and selection fill shows each one's extent.
    // A gutter on the left holds the state icon over where it's open (a robot), the same width with or without one.
    return h_flex().id("gh-row-" + row.key).h(lay.height).flex_none().gap(7).items_center().pl(indent).pr(10).mx(6).my(2).rounded(7).cursor_pointer()
      .when(selected, el => el.bg(shown ? t.selected : t.raised)).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => { this.handle.focus(); this.open(row, cx); })
      // Each gutter cell is as tall as the line beside it, so the icon centres on the title and the robot on the labels.
      .child(v_flex().flex_none().w(18).gap(4)
        .child(h_flex().h(20).justify_center().items_center().child(this.stateIcon(i, t)))
        .child(h_flex().h(17).justify_center().items_center().when(Boolean(place), el => el.child(place))))
      .child(v_flex().flex_1().min_w(0).gap(4)
        // Line 1: number and title; where, when and who on the right, the avatar last.
        .child(h_flex().h(20).gap(7).items_center().min_w(0)
          .child(div().flex_none().text_size(11.5).font_family(mono).text_color(t.dim).child("#" + i.number))
          .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(closed ? t.muted : t.foreground).child(i.title))
          .when(Boolean(row.tag), el => el.child(this.chip(row.tag, t.accent, t)))
          .when(this.isItemPinned(i.id) && row.section !== "home-pinned", el => el.child(svg(ICON("pin")).size(11).flex_none().text_color(t.accent)))
          .when(Boolean(repoName), el => el.child(div().id("gh-rp-" + row.key).flex_none().max_w(110).truncate().text_size(11).cursor_pointer()
            .text_color(hasToken(this.query, filterToken("repo", i.repo)) ? t.accent : t.dim).hover(s => s.text_color(t.foreground)).tooltip("Filter by repo:" + i.repo)
            .on_click((_e, cx) => { cx.stop_propagation(); this.toggleFilter(filterToken("repo", i.repo), cx); }).child(repoName)))
          .child(div().flex_none().text_size(11).text_color(t.dim).tooltip("Updated").child(age(i.updatedAt)))
          .child(people))
        // Line 2: what it's tagged with on the left; its state, as icons, on the right.
        .child(h_flex().gap(5).items_center().min_w(0).h(17).overflow_hidden()
          .when(typeChip, el => el.child(this.filterChip("gh-ty-" + row.key, i.type ?? "Epic", row.epic ? t.ansi5 : t.dim, filterToken("type", i.type ?? "Epic"), t)))
          .when(Boolean(i.borrowed), el => el.child(div().flex_none().text_size(10.5).text_color(t.dim).tooltip("A sub-issue of this epic, not itself in the milestone").child("sub")))
          .children(chips.slice(0, lay.shown))
          .when(lay.hidden > 0, el => el.child(div().id("gh-lbmore-" + row.key).flex_none().px(5).h(17).flex().items_center().rounded(4).border_1()
            .border_color(t.border).text_color(t.dim).text_size(10.5).tooltip(hiddenNames.join(" · ")).child("+" + lay.hidden)))
          .child(div().flex_1().min_w(4))
          .when(Boolean(rv) && !closed, el => el.child(this.filterChip("gh-rv-" + row.key, rv[0], rv[1], filterToken("review", i.review), t)))
          .when(i.conflicts && !closed, el => el.child(div().id("gh-cf-" + row.key).flex_none().tooltip("Merge conflicts").child(svg(ICON("conflict")).size(12).text_color(t.blocked))))
          .when(Boolean(i.subs), el => el.child(div().flex_none().text_size(11).text_color(t.dim).tooltip("Sub-issues done").child(i.subs.completed + "/" + i.subs.total)))
          .when(i.comments > 0, el => el.child(h_flex().flex_none().gap(3).items_center().text_size(11).text_color(t.dim).tooltip("Comments").child(svg(ICON("comment")).size(10)).child(String(i.comments))))
          .when(i.kind === "pr", el => el.child(this.ciDot("gh-ci-" + row.key, i, t)))));
  }

  milestoneRow(row, t) {
    const m = row.milestone, total = m.open + m.closed, pct = total ? m.closed / total : 0, selected = row.key === this.selected;
    const overdue = m.state === "open" && m.due && Date.parse(m.due) < Date.now();
    const due = m.due ? new Date(m.due).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(m.due).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : null;
    return h_flex().id("gh-row-" + row.key).h(34).flex_none().pl(10).pr(10).mx(4).mt(2).gap(8).items_center().rounded(6).cursor_pointer()
      .when(selected, el => el.bg(t.raised)).hover(s => s.bg(t.hover))
      .on_click((e, cx) => { this.handle.focus(); this.selected = row.key; if (e.modifiers?.alt) this.focusMilestone(m.number, cx); else this.toggleMilestone(m.number, cx); })
      .child(svg(ICON(row.expanded ? "chevron-down" : "chevron-right")).size(11).flex_none().text_color(t.dim))
      .child(svg(ICON("milestone")).size(13).flex_none().text_color(m.state === "closed" ? t.ansi5 : t.dim))
      .child(div().flex_1().min_w(0).truncate().text_size(13).font_semibold().text_color(m.state === "closed" ? t.muted : t.foreground).child(m.title))
      .when(Boolean(due), el => el.child(div().flex_none().text_size(11).text_color(overdue ? t.blocked : t.dim).tooltip(overdue ? "Past due" : "Due").child((overdue ? "overdue · " : "due ") + due)))
      .child(div().flex_none().w(72).h(5).rounded(3).bg(t.border).overflow_hidden().child(div().h_full().w(Math.round(72 * pct)).bg(m.state === "closed" ? t.ansi5 : t.done)))
      .child(div().flex_none().w(66).text_right().text_size(11).text_color(t.dim).tooltip(m.open + " open · " + m.closed + " closed" + (m.prs ? " · " + m.prs + " open PRs" : "")).child(m.closed + "/" + total))
      .child(div().id("gh-ms-focus-" + m.number).flex_none().px(5).h(18).flex().items_center().rounded(4).text_size(11).text_color(t.dim)
        .hover(s => s.bg(t.border).text_color(t.foreground)).tooltip("Show only this one (f, alt-click)")
        .on_click((_e, cx) => { cx.stop_propagation(); this.selected = row.key; this.focusMilestone(m.number, cx); }).child("focus"))
      .child(div().id("gh-ms-web-" + m.number).flex_none().size(20).flex().items_center().justify_center().rounded(4).text_color(t.dim)
        .hover(s => s.bg(t.border).text_color(t.foreground)).tooltip("Open on GitHub (o)")
        .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(m.url); }).child(svg(ICON("external")).size(11)));
  }

  list(t, mono) {
    const w = this.width - (this.prefs.sidebar ? SIDEBAR_W : 0), rows = this.rows(), cols = { ...rowColumns(w), width: w };
    if (!rows.length && this.isMilestones()) {
      const ms = this.milestones.get(this.prefs.scope);
      return div().flex_1().p(16).text_size(12.5).text_color(ms?.error ? t.blocked : t.dim)
        .child(!ms?.list && !ms?.error ? h_flex().gap(6).items_center().child(this.spinner(t, 12)).child("Loading…")
          : ms?.error && !ms?.list ? "Couldn't load milestones: " + ms.error
          : "No " + (this.prefs.state === "all" ? "" : this.prefs.state + " ") + "milestones in " + this.prefs.scope + ".");
    }
    if (!rows.length) {
      const what = this.listKind() === "pr" ? "pull requests" : "issues";
      return div().flex_1().p(16).text_size(12.5).text_color(t.dim)
        .child(!kindSettled(this.result(), this.listKind()) ? h_flex().gap(6).items_center().child(this.spinner(t, 12)).child("Loading…")
          : this.query ? "Nothing matches this filter." : "No " + (this.prefs.state === "all" ? "" : this.prefs.state + " ") + what + " here.");
    }
    return v_flex().id("gh-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).py(4)
      .children(rows.map(r => this.listRow(r, t, mono, cols)));
  }

  // Details

  section(title, body, t) {
    return v_flex().gap(5).child(div().text_size(11).font_semibold().text_color(t.dim).child(title.toUpperCase())).child(body);
  }

  kv(k, v, t, mono, people = null) {
    return h_flex().gap(8).text_size(12).items_start()
      .child(div().w(84).flex_none().text_color(t.dim).child(k))
      .when(Boolean(people?.length), el => el.child(this.avatars("gh-kv-" + k, people, t, 16)))
      .child(div().flex_1().min_w(0).text_color(t.foreground).when(Boolean(mono), el => el.font_family(mono).text_size(11.5)).child(String(v)));
  }

  // Markdown keeps the layout it first measured: keyed by the panel's width, a resize (or the full-width detail) redraws it.
  // <details> blocks, which the markdown view would print flat, are drawn folded with their summary, as on GitHub.
  markdown(id, text, t) {
    return v_flex().gap(6).text_size(13).text_color(t.foreground).children(this.mdBlocks(id, markdownBlocks(text), t));
  }
  mdBlocks(id, blocks, t) {
    return blocks.map((b, n) => {
      const key = id + "/" + n;
      if (b.kind === "md") return TextView.markdown(key + "@" + Math.round(this.width / 40), b.text).selectable(true);
      const open = this.folds.has(key) !== b.open;
      return v_flex().gap(4)
        .child(h_flex().id("gh-fold-" + key).gap(5).items_center().cursor_pointer().text_size(13).text_color(t.foreground).hover(st => st.text_color(t.accent))
          .on_click((_e, cx) => { if (this.folds.has(key)) this.folds.delete(key); else this.folds.add(key); cx.notify(); })
          .child(svg(ICON(open ? "chevron-down" : "chevron-right")).size(11).flex_none().text_color(t.dim))
          .child(div().flex_1().min_w(0).child(b.summary)))
        .when(open, el => el.child(v_flex().pl(16).gap(6).border_l(1).border_color(t.border).children(this.mdBlocks(key, b.blocks, t))));
    });
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
    for (const m of this.msItems.values()) {
      const i = [...(m.issues ?? []), ...(m.prs ?? []), ...[...(m.subs?.values() ?? [])].flat()].find(x => x.url === l.url);
      if (i) return i;
    }
    return null;
  }

  detailView(t, mono) {
    const i = this.current();
    if (!i) return v_flex().p(14).gap(10)
      .child(h_flex().gap(6).items_center().child(this.iconButton("gh-back", "arrow-left", "Back (esc)", (cx) => this.close(cx), t)).child(div().text_size(12).text_color(t.dim).child("Back")))
      .child(div().text_size(12.5).text_color(t.dim).child("This item is no longer listed. It may have closed or moved since the list loaded; reload (r) to check."));
    const d = this.details.get(i.id), detail = d?.detail;
    const rv = this.reviewLook(i.review, t), [, stateColor] = this.stateLook(i, t);
    const stateLabel = { open: "Open", draft: "Draft", merged: "Merged", closed: "Closed", completed: "Closed", not_planned: "Not planned", duplicate: "Duplicate" }[i.state] ?? i.state;
    const copied = this.copied && (this.copied === i.url || this.copied === ref(i));
    const facts = [
      ["Author", i.author], ["Created", age(i.createdAt) + " ago"], ["Updated", age(i.updatedAt) + " ago"],
      [i.state === "merged" ? "Merged" : "Closed", i.closedAt ? age(i.closedAt) + " ago" : null],
      ["Branch", i.head ? i.base + " ← " + i.head : null],
      ["Changes", i.additions != null ? "+" + i.additions + " −" + i.deletions + " in " + i.files + " file" + (i.files === 1 ? "" : "s") : null],
      ["Assignees", i.assignees.join(", ")], ["Reviewers", i.reviewers.join(", ")], ["Milestone", i.milestone?.title ?? null],
    ].filter(([, v]) => v);
    const checks = detail?.checks ?? [], sum = checkSummary(checks);
    const notable = checks.filter(c => c.state === "fail" || c.state === "pending");
    const showAll = this.expandedChecks === i.id;
    const body = stripComments(detail?.body);
    return v_flex().id("gh-detail").flex_1().min_h(0).min_w(0).overflow_y_scrollbar().track_scroll(this.detailScroll)
      .child(v_flex().p(14).gap(14)
        .when(this.activityFirst, el => el.child(this.activity(i, t, mono)))
        .child(v_flex().gap(6)
          .child(h_flex().gap(6).items_center()
            .child(this.iconButton("gh-back", "arrow-left", "Close (esc)", (cx) => this.close(cx), t))
            .child(this.stateIcon(i, t))
            .child(div().id("gh-ref").min_w(0).truncate().text_size(12).font_family(mono).text_color(t.muted).cursor_pointer().hover(s => s.text_color(t.foreground))
              .tooltip("Copy " + ref(i) + " (C)").on_click((_e, cx) => this.copy(ref(i), cx)).child(ref(i)))
            .child(div().flex_1())
            .when(Boolean(copied), el => el.child(div().text_size(11).text_color(t.dim).child("copied")))
            .child(this.iconButton("gh-pin-item", this.isItemPinned(i.id) ? "pin-off" : "pin", (this.isItemPinned(i.id) ? "Unpin from" : "Pin to") + " Home (x)", (cx) => this.toggleItemPin(i, cx), t, this.isItemPinned(i.id)))
            .child(this.iconButton("gh-copy", "link", "Copy link (c)", (cx) => this.copy(i.url, cx), t))
            .child(this.iconButton("gh-web", "external", "Open on GitHub (o)", (cx) => cx.open_url(i.url), t)))
          .child(div().text_size(16).font_semibold().child(i.title))
          .child(h_flex().gap(5).flex_wrap()
            .child(this.chip(stateLabel, stateColor, t))
            .when(Boolean(rv) && !isClosed(i), el => el.child(this.chip(rv[0] === "review" ? "review required" : rv[0] === "changes" ? "changes requested" : rv[0], rv[1], t)))
            .when(i.kind === "pr" && Boolean(i.ci), el => el.child(this.chip("CI " + i.ci, this.ciColor(i.ci, t), t)))
            .when(i.conflicts && !isClosed(i), el => el.child(this.chip("conflicts", t.blocked, t)))
            .when(i.private, el => el.child(this.chip("private", t.dim, t)))
            .children(i.labels.map((l, n) => this.filterChip("gh-dlb-" + n, l.name, this.labelColor(l.color, t), filterToken("label", l.name), t))))
          .child(h_flex().gap(6).flex_wrap().pt(2)
            .child(this.textButton("gh-open", "Open", "Open on GitHub (o)", (cx) => cx.open_url(i.url), t, "external"))
            .child(this.textButton("gh-copy-link", "Copy link", "Copy the URL (c)", (cx) => this.copy(i.url, cx), t, "copy"))
            .when(this.prefs.scope !== i.repo, el => el.child(this.textButton("gh-scope-repo", i.repo.split("/")[1], "Everything in " + i.repo + " (R)", (cx) => this.setScope(i.repo, cx), t, "folder")))))
        .when(i.kind === "pr", el => el.child(this.mergeBox(i, detail, t)))
        .when(i.kind === "pr" && this.workPlaces(i).length > 0, el => el.child(this.openIn(i, t)))
        .child(v_flex().gap(3).children(facts.map(([k, v]) => this.kv(k, v, t, null, { Author: [i.author], Assignees: i.assignees, Reviewers: i.reviewers.filter(r => !r.startsWith("@")) }[k]))))
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
            // As GitHub has it: the full name, then "Required" right after it.
            .child(div().min_w(0).truncate().text_color(c.state === "fail" ? t.foreground : t.muted).child(c.name))
            .when(Boolean(c.required), el => el.child(div().flex_none().px(5).h(16).flex().items_center().rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.dim).child("Required")))
            .child(div().flex_1()))), t)))
        .when(i.kind !== "pr" && (detail?.reviews ?? []).length > 0, el => el.child(this.section("Reviews", v_flex().gap(2).children(detail.reviews.map(r => h_flex().gap(8).text_size(12)
          .child(h_flex().w(130).flex_none().gap(6).items_center().child(this.avatar("gh-rv-av-" + r.author, r.author, t, 16)).child(div().min_w(0).truncate().text_color(t.muted).child(r.author)))
          .child(div().flex_1().text_color({ approved: t.done, changes_requested: t.blocked }[r.state] ?? t.dim).child(r.state.replace("_", " ")))
          .child(div().flex_none().text_color(t.dim).child(age(r.at))))), t)))
        .when((detail?.linked ?? []).length > 0, el => el.child(this.section(i.kind === "pr" ? "Closes / linked" : "Linked", v_flex().children(detail.linked.map((l, n) => this.linkRow("gh-link-" + n, l, t, mono))), t)))
        .child(this.section("Description", d ? (d.error ? div().text_size(12).text_color(t.blocked).child(d.error)
          : body ? this.markdown("gh-body-" + i.id, body.length > 20000 ? body.slice(0, 20000) + "\n\n…" : body, t) : div().text_size(12).text_color(t.dim).child("No description."))
          : div().text_size(12).text_color(t.dim).child("Loading…"), t))
        // Pull requests and issues alike end with their activity, newest first.
        .when(!this.activityFirst, el => el.child(this.activity(i, t, mono))));
  }

  // A pull request's activity as GitHub's timeline: comments and reviews as cards, commits and events as one-line
  // entries on a rail, newest first; a run of commits by one author folds into "n more commits by …".
  activity(i, t, mono) {
    const tl = this.timelines.get(i.id);
    const head = "Activity" + (tl?.events ? " (" + tl.total + ")" + (tl.total > tl.events.length ? " · latest " + tl.events.length : "") : "");
    if (!tl?.events) return this.section(head, div().text_size(12).text_color(tl?.error ? t.blocked : t.dim).child(tl?.error ? "Couldn't load: " + tl.error : "Loading…"), t);
    const rows = timelineRows(tl.events, { expanded: this.folds });
    const rail = (icon, color, body) => h_flex().min_h(26).gap(8).items_center()
      .child(div().w(22).flex_none().flex().justify_center().child(svg(ICON(icon)).size(13).text_color(color ?? t.dim)))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center().text_size(12).text_color(t.muted).child(body));
    const when = (at) => div().flex_none().text_size(11).text_color(t.dim).child(age(at) + " ago");
    const card = (e, n, title, color) => v_flex().ml(30).my(4).rounded(6).border_1().border_color(color ?? t.border).overflow_hidden()
      .child(h_flex().px(9).py(6).gap(6).items_center().bg(t.surface).border_b(e.body.trim() ? 1 : 0).border_color(t.border).text_size(11.5)
        .child(this.avatar("gh-tl-av-" + n, e.actor, t, 18)).child(div().font_semibold().text_color(t.foreground).child(e.actor))
        .when(Boolean(title), el => el.child(div().text_color(color ?? t.muted).child(title)))
        .child(when(e.at))
        .when(Boolean(e.role) && !["NONE", "CONTRIBUTOR"].includes(e.role), el => el.child(this.chip(lower(e.role), t.dim, t)))
        .child(div().flex_1())
        .child(div().id("gh-tl-web-" + n).cursor_pointer().text_color(t.dim).hover(s => s.text_color(t.foreground)).tooltip("Open on GitHub").on_click((_e, cx) => cx.open_url(e.url)).child(svg(ICON("external")).size(11))))
      .when(Boolean(e.body.trim()), el => el.child(div().px(10).py(8).child(this.markdown("gh-tl-" + i.id + "-" + (e.id ?? n), e.body.slice(0, 12000), t))));
    const items = rows.map((e, n) => {
      if (e.kind === "comment") return card(e, n, null, null);
      if (e.kind === "review") {
        const look = { approved: ["approved these changes", t.done], changes_requested: ["requested changes", t.blocked], commented: ["reviewed", t.muted], dismissed: ["review dismissed", t.dim] }[e.state] ?? [e.state, t.muted];
        return card(e, n, look[0] + (e.threads ? " · " + e.threads + " comment" + (e.threads === 1 ? "" : "s") : ""), e.state === "approved" || e.state === "changes_requested" ? look[1] : null);
      }
      if (e.kind === "commit") return rail("commit", t.dim, h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(this.avatar("gh-tl-cav-" + n, e.actor, t, 16))
        .child(div().id("gh-tl-c-" + n).flex_1().min_w(0).truncate().text_color(t.foreground).cursor_pointer().hover(s => s.text_color(t.accent)).on_click((_e, cx) => cx.open_url(e.url)).child(e.title))
        .child(when(e.at))
        .child(div().id("gh-tl-sha-" + n).flex_none().text_size(11).font_family(mono).text_color(t.dim).cursor_pointer().hover(s => s.text_color(t.foreground)).tooltip("Copy " + e.oid)
          .on_click((_e, cx) => this.copy(e.oid, cx)).child(e.short)));
      if (e.kind === "fold") return h_flex().id("gh-tl-fold-" + n).min_h(24).gap(8).items_center().cursor_pointer().hover(s => s.bg(t.hover)).rounded(5)
        .on_click((_e, cx) => { this.folds.add(e.key); cx.notify(); })
        .child(div().w(22).flex_none().flex().justify_center().child(svg(ICON("chevron-down")).size(11).text_color(t.dim)))
        .child(div().text_size(12).text_color(t.muted).child(e.count + " more commit" + (e.count === 1 ? "" : "s") + " by " + e.actor));
      // Issues close as done (purple check) or not planned (grey slash); pull requests merge or close.
      const issue = i.kind !== "pr";
      const icon = { label: "tag", tag: "tag", push: "commit", commit: "commit", merged: "pr-merged", closed: issue ? "issue-closed" : "pr-closed", skip: "issue-skip", open: issue ? "issue-open" : "pr-open", draft: "pr-draft", link: "link", edit: "edit", milestone: "milestone", person: "person", review: "eye" }[e.icon] ?? "dot";
      return rail(icon, e.icon === "merged" || (e.icon === "closed" && issue) ? t.ansi5 : e.icon === "closed" ? t.ansi1 : null, h_flex().flex_1().min_w(0).gap(5).items_center()
        .child(this.avatar("gh-tl-eav-" + n, e.actor, t, 16)).child(div().flex_none().font_semibold().text_color(t.foreground).child(e.actor ?? "someone"))
        .child(div().min_w(0).truncate().child(e.text))
        .when(Boolean(e.label), el => el.child(this.filterChip("gh-tl-lb-" + n, e.label.name, this.labelColor(e.label.color, t), filterToken("label", e.label.name), t)))
        .when(Boolean(e.commit), el => el.child(div().id("gh-tl-cm-" + n).min_w(0).truncate().cursor_pointer().on_click((_e, cx) => cx.open_url(e.commit.url))
          .child(h_flex().gap(5).child(div().flex_none().font_family(mono).text_color(t.accent).child(e.commit.short)).child(div().min_w(0).truncate().text_color(t.muted).child(e.commit.title)))))
        .when(Boolean(e.link), el => el.child(div().id("gh-tl-ln-" + n).min_w(0).truncate().text_color(t.accent).cursor_pointer().on_click((_e, cx) => cx.open_url(e.link.url))
          .child((e.link.repo !== i.repo ? e.link.repo : "") + "#" + e.link.number + " " + e.link.title)))
        .child(div().flex_1()).child(when(e.at)));
    });
    return this.section(head, v_flex().gap(0).children(items), t);
  }

  // Where this pull request's branch is open, each with its agent's state, to jump to.
  openIn(i, t) {
    const all = this.workPlaces(i);
    return h_flex().gap(8).items_start()
      .child(div().w(84).flex_none().pt(3).text_size(12).text_color(t.dim).child("Open in"))
      .child(h_flex().flex_1().min_w(0).gap(6).flex_wrap().children(all.map((p, n) => h_flex().id("gh-openin-" + n).h(24).px(8).gap(6).items_center().rounded(5).cursor_pointer()
        .border_1().border_color(p.focused ? t.accent : t.border).bg(t.surface).text_size(12).hover(s => s.bg(t.hover))
        .tooltip("Go to this " + (p.panes.length > 1 ? p.panes.length + "-pane tab" : "tab") + (p.machine ? " on " + p.machine : "") + " (J)")
        .on_click((_e, cx) => this.jump(p))
        .child(svg(ICON("robot")).size(13).flex_none().text_color(p.status === "idle" ? t.muted : this.statusColor(p.status, t)))
        .child(div().text_color(t.foreground).child(this.placeLabel(p)))
        .when(p.status !== "idle", el => el.child(div().text_size(11).text_color(this.statusColor(p.status, t)).child(p.status)))
        .child(svg(ICON("arrow-right")).size(11).text_color(t.dim)))));
  }

  // GitHub's merge box: a status (conflicts first) and three cells, checks, conversations and approvals.
  mergeBox(i, detail, t) {
    const m = mergeStatus(i, detail);
    if (!m) return div();
    const tone = { blocked: t.blocked, pending: t.working, ready: t.done, able: t.muted, draft: t.dim, merged: t.ansi5, closed: t.ansi1 }[m.tone] ?? t.muted;
    const mark = { blocked: "x", pending: "reload", ready: "check", able: "check", draft: "pr-draft", merged: "pr-merged", closed: "pr-closed" }[m.tone];
    const c = m.checks, done = c.pass + c.fail + c.skipped + c.cancelled;
    const bar = (parts) => h_flex().h(5).w_full().rounded(3).overflow_hidden().bg(t.border)
      .children(parts.filter(([n]) => n > 0).map(([n, color]) => div().h_full().flex_grow(n).flex_basis(0).bg(color)));
    const cell = (id, title, value, body, onClick) => v_flex().id(id).flex_1().min_w(0).px(10).py(7).gap(5)
      .when(Boolean(onClick), el => el.cursor_pointer().hover(s => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)))
      .child(h_flex().gap(5).items_center().text_size(11.5)
        .child(div().font_semibold().text_color(t.foreground).child(title))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(value)))
      .child(body);
    const checksText = !detail ? "…" : !c.total ? "none" : [c.fail && c.fail + " failing", c.pending && c.pending + " running", c.pass + " passed"].filter(Boolean).join(" · ");
    const th = m.threads, ap = m.approvals;
    // Merged or closed: one line, who/what/when, as GitHub shows it; nothing is left to check.
    if (m.compact) {
      const mg = m.merged;
      return h_flex().rounded(7).border_1().border_color(t.border).px(10).py(9).gap(10).items_center()
        .child(div().size(26).flex_none().rounded(13).flex().items_center().justify_center().bg(tone).text_color(t.background).child(svg(ICON(mark)).size(13)))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(13.5).font_semibold().text_color(t.foreground).child(m.title))
          .child(h_flex().gap(4).items_center().text_size(12).text_color(t.muted)
            .when(Boolean(mg?.by), el => el.child(this.avatar("gh-mb-by", mg.by, t, 14)))
            .child(div().child(m.text))
            .when(Boolean(mg?.short), el => el.child(div().text_color(t.dim).child("in")).child(div().id("gh-mb-sha").font_family(settings().font_family ?? "JetBrains Mono").text_size(11.5)
              .text_color(t.accent).cursor_pointer().hover(st => st.text_color(t.foreground)).tooltip("Open the merge commit").on_click((_e, cx) => cx.open_url(mg.url)).child(mg.short)))
            .when(Boolean(mg?.at ?? i.closedAt), el => el.child(div().text_color(t.dim).child(age(mg?.at ?? i.closedAt) + " ago")))))
        .when(m.tone === "merged" && Boolean(mg?.oid), el => el.child(this.textButton("gh-mb-copy", "Copy SHA", "Copy " + mg.oid, (cx) => this.copy(mg.oid, cx), t, "copy")));
    }
    return v_flex().rounded(7).border_1().border_color(m.tone === "blocked" ? tone : t.border).overflow_hidden()
      .child(h_flex().px(10).py(9).gap(10).items_center()
        .child(div().size(26).flex_none().rounded(13).flex().items_center().justify_center().bg(tone).text_color(t.background)
          .child(m.tone === "pending" ? svg(ICON(mark)).size(13).spin(1600) : svg(ICON(mark)).size(13)))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(13.5).font_semibold().text_color(t.foreground).child(m.title))
          .child(div().text_size(12).text_color(t.muted).child(m.text))
          .when(this.actionError?.id === i.id, el => el.child(div().text_size(11.5).text_color(t.blocked).child(this.actionError.msg))))
        .when(m.action === "ready", el => el.child(this.readying === i.id
          ? h_flex().h(24).px(8).gap(5).flex_none().items_center().text_size(12).text_color(t.dim).child(this.spinner(t, 12)).child("Marking ready…")
          : this.textButton("gh-mb-ready", "Ready for review", "Mark it ready for review (gh pr ready)", (cx) => this.markReady(i, cx), t, "pr-open")))
        .when(m.action === "conflicts", el => el.child(this.textButton("gh-resolve", "Resolve on GitHub", "Open GitHub's conflict editor", (cx) => cx.open_url(i.url + "/conflicts"), t, "external")))
        .when(m.tone === "ready" || m.tone === "able", el => el.child(this.textButton("gh-mb-merge", "Merge on GitHub", "Open it on GitHub to merge", (cx) => cx.open_url(i.url), t, "external")))
        .when(this.canReview(i) && !["merged", "closed"].includes(m.tone), el => el.child(this.textButton("gh-mb-diff", "Review diff", "Open the diff in Changes (d)", () => this.review(i), t, "diff"))))
      .child(h_flex().border_t(1).border_color(t.border).items_stretch()
        .child(cell("gh-mb-checks", "Checks", checksText,
          !detail || !c.total ? bar([[1, detail ? t.border : t.raised]]) : bar([[c.pass, t.done], [c.fail, t.blocked], [c.pending, t.working], [c.skipped + c.cancelled, t.dim]]),
          detail && c.total ? (cx) => { this.expandedChecks = this.expandedChecks === i.id ? null : i.id; cx.notify(); } : null))
        .child(div().w(1).bg(t.border))
        .child(cell("gh-mb-threads", "Conversations", !detail ? "…" : !th?.total ? "none" : th.unresolved ? th.unresolved + " of " + th.total + " open" : "all " + th.total + " resolved",
          bar(!th?.total ? [[1, detail ? t.border : t.raised]] : [[th.total - th.unresolved, t.done], [th.unresolved, t.working]])))
        .child(div().w(1).bg(t.border))
        .child(cell("gh-mb-approvals", "Approvals", !detail ? "…" : [ap.changes && ap.changes + " requested changes", ap.approved && ap.approved + " approved", ap.pending && ap.pending + " pending"].filter(Boolean).join(" · ") || (ap.decision === "required" ? "required" : "none"),
          bar(ap.changes ? [[1, t.blocked]] : ap.approved ? [[1, t.done]] : [[1, ap.decision === "required" ? t.working : detail ? t.border : t.raised]]))));
  }

  message(t, title, body) {
    return v_flex().flex_1().p(18).gap(6).child(div().font_semibold().child(title))
      .when(Boolean(body), el => el.child(div().text_size(12).text_color(t.dim).child(body)));
  }

  render(cx) {
    const t = theme(), mono = settings().font_family ?? "JetBrains Mono";
    const shown = this.isShown();
    if (shown && !this.wasShown) cx.timer.after(0, (cx) => this.poll(cx));
    // Avatars asked for while drawing are fetched after it.
    if (this.avatarQueue.length && !this.avatarBusy) cx.timer.after(0, (cx) => this.fetchAvatars(cx));
    this.wasShown = shown;
    let body;
    if (this.status === "nogh") body = this.message(t, "gh isn't available", "Install the GitHub CLI (brew install gh) and sign in with gh auth login. " + (this.error ?? ""));
    else if (this.status === "noauth") body = this.message(t, "gh isn't signed in", "Run gh auth login in a terminal, then reload (r). " + (this.error ?? ""));
    else if (this.status === "error" && !isLoaded(this.result())) body = this.message(t, "Couldn't reach GitHub", this.error);
    else {
      // An opened item takes the whole panel, at any width; esc (or back) returns to the list where it was.
      body = this.detailId
        ? v_flex().flex_1().min_h(0).min_w(0).child(this.detailView(t, mono))
        : v_flex().flex_1().min_h(0).min_w(0).child(this.toolbar(t)).child(this.list(t, mono));
      if (this.error) body = v_flex().flex_1().min_h(0).child(div().px(10).py(4).text_size(11).text_color(t.blocked).child(this.error)).child(body);
    }
    return v_flex().id("github").track_focus(this.handle).on_key_down((e, cx) => this.onKey(e, cx))
      .on_size_change((s, cx) => { if (this.width !== s.width) { this.width = s.width; cx.notify(); } })
      .size_full().min_h(0).overflow_hidden().bg(t.background).border_l(1).border_color(t.border).text_color(t.foreground).text_size(13)
      .child(this.header(t))
      .child(h_flex().flex_1().min_h(0).items_start()
        .when(Boolean(this.prefs.sidebar), el => el.child(this.sidebar(t)))
        .child(v_flex().flex_1().min_w(0).h_full().min_h(0).child(body)));
  }
}
