// Kubernetes for the project in view: the cluster's workloads as an architecture map (namespaces as bands, callers to
// the left of what they call) or a list, with health, and a detail view of pods, services, containers, volumes,
// connections, network policies and events. Read-only; Logs, Shell and Describe open kubectl in a pane beside it.
//
// Props: { repo?, on?, context? } pins a folder, machine and kubectl context; without them it follows the focused
// pane and kubectl's current context. { select } opens a workload's details by name; { view: "list" } starts in the list.
import { View, div, svg, PathBuilder } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, theme, settings, props, nextCommand, run } from "herdr";
import { BOX, SHORT_KIND, SYSTEM_NAMESPACES, age, buildGraph, health, images, layoutGraph, visibleGraph } from "./model.js";

const ICON = (n) => "mods/kube/icons/" + n + ".svg";
const POLL_MS = 5000, WIDE = 900;
// Everything but events (fetched per detail: they're most of the bytes).
const KINDS = "namespaces,pods,deployments,statefulsets,daemonsets,replicasets,jobs,cronjobs,services,ingresses,configmaps,persistentvolumeclaims,networkpolicies,horizontalpodautoscalers";
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };

function location() {
  const p = props() ?? {};
  if (p.repo) return { cwd: p.repo, on: p.on ?? null };
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(x => x.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}

// kubectl often comes from a version manager the app's PATH lacks: try it directly, then with the usual folders.
const via = new Map();
const WITH_PATH = 'PATH="$HOME/.local/share/mise/shims:$HOME/.asdf/shims:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:$PATH" exec kubectl "$@"';
async function kubectl(args, { cwd, on, timeout = 20000 } = {}) {
  const machine = on ?? "";
  if (via.get(machine) !== "path") {
    try { const r = await exec("kubectl", args, { cwd, on, timeout }); via.set(machine, "direct"); return r; }
    catch (e) { if (via.get(machine) === "direct") throw e; }
  }
  const r = await exec("sh", ["-c", WITH_PATH, "sh", ...args], { cwd, on, timeout });
  if (r.code === 127) throw new Error("kubectl was not found on PATH, in mise or asdf shims, ~/.local/bin or Homebrew");
  via.set(machine, "path");
  return r;
}
// Runs "kubectl <context args> -- <args>" for a pane, by mode:
//   page   output into less (describe), so it stays until q
//   logs   follow; on exit (pod gone, ^C) say why and wait for a key
//   shell  args = namespace pod container selector: use the pod if it still exists, else a live one matching the
//          selector; try bash, then sh; for images without a shell (distroless) offer kubectl debug
const RUNNER = String.raw`PATH="$HOME/.local/share/mise/shims:$HOME/.asdf/shims:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:$PATH"
mode=$1; shift; ctx=""; while [ "$1" != "--" ] && [ $# -gt 0 ]; do ctx="$ctx $1"; shift; done; shift
k() { kubectl $ctx "$@"; }
hold() { [ -n "$2" ] || set -- "$1" 0; printf '\n\033[2m%s — press any key to close\033[0m' "$1"; stty -echo -icanon 2>/dev/null; dd bs=1 count=1 >/dev/null 2>&1; code=$2; exit "$code"; }
command -v kubectl >/dev/null || hold "kubectl not found" 1
case $mode in
page)
  out=$(k "$@" 2>&1); code=$?
  printf '%s\n' "$out" | LESS=-RFX less -R +g; [ $code -eq 0 ] || hold "kubectl exited with $code" $code; exit 0 ;;
logs)
  k "$@"; code=$?; hold "logs ended (exit $code)" 0 ;;
shell)
  ns=$1 pod=$2 c=$3 sel=$4
  if ! k -n "$ns" get pod "$pod" >/dev/null 2>&1; then
    [ -n "$sel" ] && pod=$(k -n "$ns" get pods -l "$sel" --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    [ -n "$pod" ] || hold "pod $2 is gone and no running replacement was found" 1
    printf '\033[2m%s was replaced; using %s\033[0m\n' "$2" "$pod"
  fi
  cflag=""; [ -n "$c" ] && cflag="-c $c"
  if k -n "$ns" exec "$pod" $cflag -- sh -c 'exit 0' >/dev/null 2>&1; then
    k -n "$ns" exec -it "$pod" $cflag -- sh -c 'command -v bash >/dev/null && exec bash -l || exec sh -l'
    exit 0
  fi
  printf '%s/%s has no shell (a distroless image?).\nStart a debug container that shares its processes? [y/N] ' "$ns" "$pod"
  stty -echo -icanon 2>/dev/null; a=$(dd bs=1 count=1 2>/dev/null); stty echo icanon 2>/dev/null; echo
  case $a in y|Y) k -n "$ns" debug -it "$pod" --image=busybox:1.37 --profile=general $( [ -n "$c" ] && echo --target="$c" ) -- sh; hold "debug session ended" 0 ;; esac
  exit 0 ;;
esac`;
const errorText = (r) => (r.stderr || r.stdout || "kubectl failed").trim().split("\n").filter(l => !/^E\d{4} /.test(l) || true).slice(-3).join("\n");

const alpha = (c, a) => (/^#[0-9a-f]{6}$/i.test(c) ? c + a : c);

export default class Kube extends View {
  init(_props, cx) {
    this.graph = null; this.items = []; this.selected = null; this.detailOpen = false; this.events = null;
    this.width = 0; this.status = "loading"; this.error = null; this.query = ""; this.expanded = new Set();
    this.handle = cx.focus_handle();
    this.filter = InputState.new({ placeholder: "Filter  name · ns:loom · kind:deploy · is:failing · image:postgres · app=web · -term" });
    this.filter.on("change", (_e, cx) => { this.query = this.filter.value(); cx.notify(); });
    this.filter.on("focus", (_e, cx) => { this.filtering = true; cx.notify(); });
    this.filter.on("blur", (_e, cx) => { this.filtering = false; cx.notify(); });
    this.filter.on("submit", (_e, cx) => { const first = this.visible().nodes[0]; if (first) this.select(first.id, cx, true); this.handle.focus(); });
    // Commands (keys.json "kube.<name>"): focus, reload, and logs / shell / describe for the selected workload.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          const n = this.graph?.byId.get(this.selected);
          if (c === "focus") this.handle.focus();
          else if (c === "reload") { this.signature = null; this.load(cx); }
          else if (c === "logs" && n) this.logs(n);
          else if (c === "shell" && n?.pods[0]) this.shell(n.pods[0], n);
          else if (c === "describe" && n) this.describe(n);
        } catch (e) { console.warn("kube: " + c + ": " + (e?.message ?? e)); }
        cx.notify();
      }
    });
    cx.timer.every(POLL_MS, (cx) => this.poll(cx));
    this.relocate(cx);
  }

  prefsKey() { return "prefs:" + (this.loc?.cwd ?? ""); }
  savePrefs() { localStorage.setItem(this.prefsKey(), JSON.stringify({ ...this.prefs, hidden: [...this.prefs.hidden] })); }

  relocate(cx) {
    this.loc = location(); this.key = JSON.stringify(this.loc);
    const saved = json(localStorage.getItem(this.prefsKey()) ?? "") ?? {};
    this.prefs = { view: "map", showSystem: false, context: null, ...saved, hidden: new Set(saved.hidden ?? []) };
    if (props()?.context) this.prefs.context = props().context;
    if (props()?.view) this.prefs.view = props().view;
    this.graph = null; this.items = []; this.signature = null; this.selected = null; this.detailOpen = false; this.error = null; this.status = "loading";
    const key = this.key;
    cx.spawn(async (cx) => {
      try {
        const r = await kubectl(["config", "get-contexts", "-o", "name"], this.opts());
        const current = await kubectl(["config", "current-context"], this.opts());
        if (this.key !== key) return;
        this.contexts = r.stdout.split("\n").map(s => s.trim()).filter(Boolean);
        this.currentContext = current.code === 0 ? current.stdout.trim() : null;
        if (this.prefs.context && !this.contexts.includes(this.prefs.context)) this.prefs.context = null;
        if (!this.contexts.length) { this.status = "nocontext"; cx.notify(); return; }
        await this.load(cx);
      } catch (e) { if (this.key === key) { this.status = "nokubectl"; this.error = String(e?.message ?? e); cx.notify(); } }
    });
  }

  context() { return this.prefs.context ?? this.currentContext ?? this.contexts?.[0] ?? null; }
  opts(timeout) { return { cwd: this.loc?.cwd ?? undefined, on: this.loc?.on, timeout }; }
  ctxArgs() { const c = this.context(); return c ? ["--context", c] : []; }

  poll(cx) {
    if (!props()?.repo && JSON.stringify(location()) !== this.key) return this.relocate(cx);
    if (this.contexts?.length && !this.loading) this.load(cx);
  }

  async load(cx) {
    if (this.loading) return;
    this.loading = true;
    const key = this.key, context = this.context();
    try {
      const r = await kubectl([...this.ctxArgs(), "get", KINDS + (this.extraKinds ? "," + this.extraKinds : ""), "-A", "-o", "json", "--request-timeout=10s"], this.opts(30000));
      if (this.key !== key || this.context() !== context) return;
      if (r.code !== 0) {
        // A custom kind we added may have gone; retry without them next time.
        if (this.extraKinds && /the server doesn't have a resource type/.test(r.stderr)) this.extraKinds = null;
        this.error = errorText(r); this.status = this.graph ? "ready" : "error"; return;
      }
      if (r.stdout === this.signature) { this.error = null; return; }
      const data = json(r.stdout);
      if (!data?.items) { this.error = "kubectl returned something that isn't a list"; return; }
      this.signature = r.stdout; this.items = data.items; this.error = null; this.status = "ready";
      this.graph = buildGraph(data.items);
      this.addOwnerKinds(data.items);
      if (this.selected && !this.graph.byId.has(this.selected)) { this.selected = null; this.detailOpen = false; }
      const want = props()?.select;
      if (want && !this.openedProp) {
        const n = this.graph.nodes.find(n => n.name === want || n.id === want);
        if (n) { this.openedProp = true; this.select(n.id, cx, true); }
      }
      if (this.detailOpen && this.selected) this.fetchEvents(cx);
    } catch (e) {
      if (this.key === key) { this.error = String(e?.message ?? e); if (!this.graph) this.status = "error"; }
    } finally { this.loading = false; cx.notify(); }
  }

  // Pods owned by custom resources (Agent Sandbox's Sandbox, say): fetch those kinds too, for their status.
  addOwnerKinds(items) {
    const kinds = new Set((this.extraKinds ?? "").split(",").filter(Boolean));
    const before = kinds.size;
    for (const o of items) for (const ref of o.metadata?.ownerReferences ?? []) {
      const group = ref.apiVersion?.includes("/") ? ref.apiVersion.split("/")[0] : "";
      if (!group || /(^|\.)k8s\.io$/.test(group) && !group.includes("x-k8s") || group === "apps" || group === "batch") continue;
      kinds.add(ref.kind.toLowerCase() + "." + group);
    }
    if (kinds.size !== before) { this.extraKinds = [...kinds].join(","); this.signature = null; }
  }

  fetchEvents(cx) {
    const n = this.graph?.byId.get(this.selected);
    if (!n) return;
    const key = this.key, id = n.id;
    cx.spawn(async (cx) => {
      try {
        const r = await kubectl([...this.ctxArgs(), "get", "events", "-n", n.ns, "-o", "json"], this.opts());
        const d = json(r.stdout);
        if (this.key !== key || this.selected !== id || !d?.items) return;
        const names = new Set([n.name, ...n.pods.map(p => p.metadata.name)]);
        const ours = d.items.filter(e => names.has(e.involvedObject?.name) || e.involvedObject?.name?.startsWith(n.name + "-"));
        const when = (e) => Date.parse(e.lastTimestamp ?? e.eventTime ?? e.metadata?.creationTimestamp ?? "") || 0;
        this.events = { id, list: ours.sort((a, b) => when(b) - when(a)).slice(0, 25), when };
        cx.notify();
      } catch { /* events are optional */ }
    });
  }

  // State

  visible() {
    if (!this.graph) return { nodes: [], edges: [] };
    return visibleGraph(this.graph, { showSystem: this.prefs.showSystem, hidden: this.prefs.hidden, query: this.query });
  }

  select(id, cx, open = false) {
    if (this.selected !== id) { this.events = null; this.selected = id; if (this.detailOpen || open) this.fetchEvents(cx); }
    if (open && !this.detailOpen) { this.detailOpen = true; this.fetchEvents(cx); }
    cx.notify();
  }

  closeDetail(cx) { this.detailOpen = false; cx.notify(); }

  order() {
    const v = this.visible();
    if (this.prefs.view === "list") return v.nodes.map(n => n.id);
    const l = this.layout ?? layoutGraph(v.nodes, v.edges);
    return v.nodes.map(n => n.id).sort((a, b) => { const p = l.pos.get(a), q = l.pos.get(b); return (p?.y ?? 0) - (q?.y ?? 0) || (p?.x ?? 0) - (q?.x ?? 0); });
  }

  step(delta, cx) {
    const ids = this.order();
    if (!ids.length) return;
    const at = ids.indexOf(this.selected);
    const next = ids[Math.max(0, Math.min(ids.length - 1, at < 0 ? (delta > 0 ? 0 : ids.length - 1) : at + delta))];
    this.select(next, cx);
  }

  toggleNs(ns, cx) { if (this.prefs.hidden.has(ns)) this.prefs.hidden.delete(ns); else this.prefs.hidden.add(ns); this.savePrefs(); cx.notify(); }
  setView(view, cx) { this.prefs.view = view; this.savePrefs(); cx.notify(); }
  toggleSystem(cx) { this.prefs.showSystem = !this.prefs.showSystem; this.savePrefs(); cx.notify(); }
  pickContext(c, cx) { this.prefs.context = c; this.picking = false; this.savePrefs(); this.graph = null; this.signature = null; this.status = "loading"; this.extraKinds = null; this.selected = null; this.detailOpen = false; cx.notify(); this.load(cx); }

  // kubectl in a pane below this one. Terminal panes close when their program exits, so every command runs in
  // the RUNNER script, which keeps the pane open on failure (and pages describe) instead of vanishing.
  terminal(mode, args) {
    const pane = panes().find(p => p.mod === "kube" && p.tab === focused()?.tab)?.pane;
    run("pane.split", { direction: "down", ...(pane ? { pane } : {}), argv: ["sh", "-c", RUNNER, "kube", mode, ...this.ctxArgs(), "--", ...args] });
  }

  logs(n) {
    // A Service has no logs of its own: follow its first workload's pods instead.
    const target = ["Deployment", "StatefulSet", "DaemonSet", "Job"].includes(n.kind) ? n.kind.toLowerCase() + "/" + n.name
      : n.pods[0] ? "pod/" + n.pods[0].metadata.name : null;
    if (!target) return;
    this.terminal("logs", ["logs", "-n", n.ns, "-f", "--tail=200", "--all-containers", "--prefix", "--max-log-requests=20", target]);
  }
  // Pods come and go (rollouts): the runner picks a live pod by the workload's labels when it starts.
  shell(pod, n) {
    const ns = pod.metadata.namespace, c = pod.spec?.containers?.[0]?.name ?? "";
    const labels = Object.entries(n?.obj && (n.obj.spec?.selector?.matchLabels) || {}).map(([k, v]) => k + "=" + v).join(",");
    this.terminal("shell", [ns, pod.metadata.name, c, labels]);
  }
  describe(n) {
    const ref = n.obj?.apiVersion?.includes("/") && !["apps", "batch"].includes(n.obj.apiVersion.split("/")[0]) ? n.kind.toLowerCase() + "." + n.obj.apiVersion.split("/")[0] : n.kind.toLowerCase();
    this.terminal("page", ["describe", "-n", n.ns, ref, n.name]);
  }

  onKey(e, cx) {
    const k = e.keystroke;
    if (this.filtering) {
      if (k === "escape") { this.filter.set_value(""); this.query = ""; this.handle.focus(); cx.notify(); cx.stop_propagation(); }
      return;
    }
    const n = this.graph?.byId.get(this.selected);
    const actions = {
      "j": () => this.step(1, cx), "down": () => this.step(1, cx), "k": () => this.step(-1, cx), "up": () => this.step(-1, cx),
      "enter": () => n && this.select(n.id, cx, true), "space": () => n && this.select(n.id, cx, true),
      "/": () => this.filter.focus(), "cmd-f": () => this.filter.focus(),
      "v": () => this.setView(this.prefs.view === "map" ? "list" : "map", cx),
      "r": () => { this.signature = null; this.load(cx); },
      ".": () => this.toggleSystem(cx),
      "l": () => n && this.logs(n), "d": () => n && this.describe(n), "s": () => n?.pods[0] && this.shell(n.pods[0], n),
      "c": () => n && cx.write_to_clipboard(n.name),
      "escape": () => { if (this.picking) { this.picking = false; cx.notify(); } else if (this.detailOpen) this.closeDetail(cx); else if (this.query) { this.filter.set_value(""); this.query = ""; cx.notify(); } else return false; },
    };
    const fn = actions[k];
    if (!fn || fn() === false) return;
    cx.stop_propagation();
  }

  // Look

  stateColor(state, t) { return { ok: t.done, degraded: t.working, failing: t.blocked, idle: t.dim }[state] ?? t.muted; }
  kindColor(kind, t) { return { Deployment: t.ansi4, StatefulSet: t.ansi5, DaemonSet: t.ansi6, CronJob: t.ansi3, Job: t.ansi3, Service: t.ansi2, Ingress: t.ansi2 }[kind] ?? t.ansi13 ?? t.accent; }
  edgeColor(kinds, t) { return kinds.has("manages") ? t.ansi5 : kinds.has("routes") ? t.ansi2 : kinds.has("calls") ? t.accent : t.dim; }

  chip(label, color, t) {
    return div().flex_none().px(5).h(17).flex().items_center().rounded(4).border_1().border_color(color ?? t.border).text_color(color ?? t.muted).text_size(10.5).child(label);
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

  header(t) {
    const ctx = this.context();
    return h_flex().h(34).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(svg(ICON("kube")).size(15).flex_none().text_color(t.accent))
      .child(div().font_semibold().child("Kubernetes"))
      .child(h_flex().id("kube-context").h(22).px(7).gap(4).items_center().rounded(5).cursor_pointer().text_size(12).text_color(t.muted).min_w(0)
        .hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip("Switch context")
        .on_click((_e, cx) => { this.picking = !this.picking; cx.notify(); })
        .child(div().truncate().child(ctx ?? "no context")).child(svg(ICON("chevron-down")).size(11)))
      .child(div().flex_1())
      .when(this.status === "ready", el => el
        .child(h_flex().flex_none().rounded(6).border_1().border_color(t.border).overflow_hidden()
          .child(this.segment("kube-view-map", "Map", this.prefs.view === "map", (cx) => this.setView("map", cx), t))
          .child(this.segment("kube-view-list", "List", this.prefs.view === "list", (cx) => this.setView("list", cx), t))))
      .child(this.iconButton("kube-reload", "reload", "Reload (r)", (cx) => { this.signature = null; this.load(cx); }, t))
      .when(this.loading, el => el.child(svg(ICON("reload")).size(12).flex_none().text_color(t.dim).spin(900)));
  }

  segment(id, label, on, onClick, t) {
    return div().id(id).h(22).px(9).flex().items_center().cursor_pointer().text_size(11.5)
      .bg(on ? t.selected : t.background).text_color(on ? t.foreground : t.dim).hover(s => s.text_color(t.foreground))
      .on_click((_e, cx) => onClick(cx)).child(label);
  }

  contextPicker(t) {
    return v_flex().mx(10).mt(6).p(4).rounded(6).border_1().border_color(t.border).bg(t.popover).flex_none()
      .children((this.contexts ?? []).map(c => h_flex().id("kube-ctx-" + c).h(26).px(8).gap(6).items_center().rounded(5).cursor_pointer().text_size(12.5)
        .hover(s => s.bg(t.hover)).on_click((_e, cx) => this.pickContext(c, cx))
        .child(div().w(12).text_color(t.accent).child(c === this.context() ? "✓" : ""))
        .child(div().flex_1().truncate().child(c))
        .when(c === this.currentContext, el => el.child(div().text_size(11).text_color(t.dim).child("current")))));
  }

  toolbar(t) {
    const g = this.graph, shown = g.namespaces.filter(ns => this.prefs.showSystem || !SYSTEM_NAMESPACES.has(ns));
    const counts = new Map();
    for (const n of g.nodes) counts.set(n.ns, (counts.get(n.ns) ?? 0) + 1);
    return v_flex().flex_none().px(10).py(8).gap(7).border_b(1).border_color(t.border)
      .child(h_flex().h(28).px(8).gap(6).items_center().rounded(6).border_1().border_color(this.filtering ? t.accent : t.input).bg(t.surface)
        .child(svg(ICON("search")).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.filter).flex_1().text_size(12.5))
        .when(Boolean(this.query), el => el.child(div().id("kube-clear").flex_none().cursor_pointer().text_color(t.dim).hover(s => s.text_color(t.foreground))
          .on_click((_e, cx) => { this.filter.set_value(""); this.query = ""; cx.notify(); }).child(svg(ICON("x")).size(12)))))
      .child(h_flex().gap(5).flex_wrap().items_center()
        .children(shown.filter(ns => counts.get(ns)).map(ns => {
          const on = !this.prefs.hidden.has(ns), bad = g.nodes.some(n => n.ns === ns && health(n).state === "failing");
          return h_flex().id("kube-ns-" + ns).h(22).px(8).gap(5).items_center().rounded(11).cursor_pointer().text_size(11.5)
            .border_1().border_color(on ? (bad ? t.blocked : t.input) : t.border).text_color(on ? t.foreground : t.dim).when(on, el => el.bg(t.raised))
            .hover(s => s.bg(t.hover)).tooltip(on ? "Hide " + ns : "Show " + ns).on_click((_e, cx) => this.toggleNs(ns, cx))
            .child(ns).child(div().text_color(t.dim).child(String(counts.get(ns))));
        }))
        .child(div().id("kube-system").h(22).px(8).flex().items_center().rounded(11).cursor_pointer().text_size(11.5)
          .text_color(this.prefs.showSystem ? t.foreground : t.dim).border_1().border_color(t.border).border_dashed()
          .hover(s => s.bg(t.hover)).tooltip("System namespaces (.)").on_click((_e, cx) => this.toggleSystem(cx))
          .child(this.prefs.showSystem ? "− system" : "+ system")));
  }

  // The map

  mapView(t, mono) {
    const v = this.visible();
    if (!v.nodes.length) return this.empty(t);
    const l = this.layout = layoutGraph(v.nodes, v.edges);
    const sel = this.selected, near = new Set();
    if (sel) for (const e of v.edges) if (e.from === sel || e.to === sel) { near.add(e.from); near.add(e.to); }
    const groups = new Map(), labels = [];
    for (const e of v.edges) {
      const a = l.pos.get(e.from), b = l.pos.get(e.to);
      if (!a || !b) continue;
      const hot = sel && (e.from === sel || e.to === sel), dimmed = sel && !hot;
      const dashed = !e.kinds.has("calls") && !e.kinds.has("manages") && !e.kinds.has("routes");
      const color = alpha(this.edgeColor(e.kinds, t), dimmed ? "40" : hot ? "ff" : "b0");
      const gk = color + (dashed ? "-d" : "") + (hot ? "-h" : "");
      if (!groups.has(gk)) groups.set(gk, { color, dashed, width: hot ? 2 : 1.4, lines: [], heads: [] });
      const g = groups.get(gk);
      let x1, y1, x2, y2, c1x, c1y, c2x, c2y, mx, my;
      if (l.back.has(e.key) || b.x <= a.x) {
        // Back edges run under the boxes, from bottom to bottom.
        x1 = a.x + a.w / 2; y1 = a.y + a.h; x2 = b.x + b.w / 2 + 10; y2 = b.y + b.h;
        const drop = Math.max(y1, y2) + 26;
        c1x = x1; c1y = drop; c2x = x2; c2y = drop; mx = (x1 + x2) / 2; my = drop - 6;
        g.lines.push([x1, y1, c1x, c1y, c2x, c2y, x2, y2 + 6]);
        g.heads.push([[x2, y2 + 1], [x2 - 4, y2 + 8], [x2 + 4, y2 + 8]]);
      } else {
        x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x - 7; y2 = b.y + b.h / 2;
        const dx = Math.max(30, (x2 - x1) / 2);
        g.lines.push([x1, y1, x1 + dx, y1, x2 - dx, y2, x2, y2]);
        g.heads.push([[x2 + 6, y2], [x2 - 1, y2 - 4], [x2 - 1, y2 + 4]]);
        mx = (x1 + x2) / 2; my = (y1 + y2) / 2 - 8;
      }
      const ports = [...e.ports].filter(Boolean);
      if (ports.length && !dimmed) labels.push(div().absolute().left(mx - 22).top(my - 4).w(44).flex().justify_center()
        .child(div().px(4).rounded(3).bg(t.background).text_size(10).font_family(mono).text_color(hot ? t.foreground : t.dim).child(":" + ports.join(","))));
    }
    const layers = [];
    for (const g of groups.values()) {
      let p = PathBuilder.stroke(g.width);
      if (g.dashed) p = p.dash_array([4, 4]);
      for (const [x1, y1, a, b, c, d, x2, y2] of g.lines) p = p.move_to(x1, y1).cubic_bezier_to(x2, y2, a, b, c, d);
      layers.push(window.paint_path(p.build(), g.color).absolute().top(0).left(0).w(l.width).h(l.height + 30));
      let f = PathBuilder.fill();
      for (const tri of g.heads) f = f.add_polygon(tri, true);
      layers.push(window.paint_path(f.build(), g.color).absolute().top(0).left(0).w(l.width).h(l.height + 30));
    }
    const bands = l.bands.map(b => div().absolute().left(BOX.margin).top(b.y).w(l.width - BOX.margin * 2).h(b.h).rounded(8)
      .bg(alpha(t.surface, "c0")).border_1().border_color(t.border)
      .child(h_flex().absolute().left(10).top(7).gap(6).items_center().text_size(11).text_color(t.dim)
        .child(div().font_semibold().text_color(t.muted).child(b.ns))
        .when(this.graph.nodes.some(n => n.ns === b.ns && n.isolated), el => el.child(div().child("· ingress isolated by policy")))));
    const boxes = v.nodes.map(n => {
      const p = l.pos.get(n.id), h = health(n), selected = n.id === sel, faded = sel && !selected && !near.has(n.id);
      const ports = [...new Set(n.services.flatMap(s => (s.spec?.ports ?? []).map(x => x.port)))].slice(0, 3);
      const facts = [h.desired != null ? h.ready + "/" + h.desired : null, ports.length ? ":" + ports.join(",") : null,
        n.pvcs.length ? n.pvcs.length + " vol" : null, h.restarts ? "↻" + h.restarts : null].filter(Boolean).join("  ·  ");
      return v_flex().id("kube-node-" + n.id).tooltip(n.kind + " " + n.ns + "/" + n.name).absolute().left(p.x).top(p.y).w(p.w).h(p.h).px(9).py(7).gap(3).rounded(7).cursor_pointer()
        .bg(selected ? t.selected : t.background).border_1().border_color(selected ? t.accent : h.state === "failing" ? t.blocked : t.input)
        .when(Boolean(faded), el => el.opacity(0.45)).hover(s => s.border_color(t.accent))
        .on_click((e, cx) => { this.handle.focus(); this.select(n.id, cx, true); })
        .child(h_flex().gap(6).items_center()
          .child(div().size(7).flex_none().rounded(4).bg(this.stateColor(h.state, t)))
          .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_semibold().child(n.name))
          .when(n.isolated, el => el.child(svg(ICON("shield")).size(11).flex_none().text_color(t.dim)))
          .child(div().flex_none().text_size(10).text_color(this.kindColor(n.kind, t)).child(SHORT_KIND[n.kind] ?? n.kind.toLowerCase())))
        .child(div().pl(13).truncate().text_size(11).text_color(h.reason ? t.blocked : t.dim).child(h.reason ? h.reason + (facts ? "  ·  " + facts : "") : facts || images(n)[0]?.split("/").pop() || ""));
    });
    const legend = h_flex().gap(12).px(16).pb(10).text_size(10.5).text_color(t.dim)
      .child(this.legendItem("calls (config)", t.accent, false, t)).child(this.legendItem("manages", t.ansi5, false, t))
      .child(this.legendItem("allowed by policy", t.muted, true, t)).child(h_flex().gap(4).items_center().child(svg(ICON("shield")).size(10)).child("ingress isolated"));
    return v_flex().id("kube-map").flex_1().min_h(0).min_w(0).overflow_scrollbar()
      .child(div().relative().flex_none().w(l.width).h(l.height + 30).children([...bands, ...layers, ...labels, ...boxes]))
      .child(legend);
  }

  legendItem(label, color, dashed, t) {
    return h_flex().gap(5).items_center().child(div().w(18).h(0).border_t(dashed ? 1 : 2).border_color(color).when(dashed, el => el.border_dashed())).child(label);
  }

  empty(t) {
    return div().flex_1().p(16).text_size(12.5).text_color(t.dim).child(this.query ? "Nothing matches this filter." : "No workloads in the shown namespaces.");
  }

  // The list

  listView(t, mono) {
    const v = this.visible();
    if (!v.nodes.length) return this.empty(t);
    const rows = [];
    let ns = null;
    for (const n of v.nodes) {
      if (n.ns !== ns) {
        ns = n.ns;
        rows.push(div().h(26).mt(4).px(12).flex().items_center().text_size(11).font_semibold().text_color(t.muted).child(ns.toUpperCase()));
      }
      const h = health(n), sel = n.id === this.selected, open = this.expanded.has(n.id);
      rows.push(h_flex().id("kube-row-" + n.id).h(30).mx(4).pl(8).pr(10).gap(7).items_center().rounded(6).cursor_pointer()
        .when(sel, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
        .on_click((_e, cx) => { this.handle.focus(); this.select(n.id, cx, true); })
        .child(n.pods.length ? div().id("kube-fold-" + n.id).size(16).flex_none().flex().items_center().justify_center().rounded(4).text_color(t.dim).hover(s => s.bg(t.border))
          .on_click((_e, cx) => { cx.stop_propagation(); if (open) this.expanded.delete(n.id); else this.expanded.add(n.id); cx.notify(); })
          .child(svg(ICON(open ? "chevron-down" : "chevron-right")).size(12)) : div().w(16).flex_none())
        .child(div().size(7).flex_none().rounded(4).bg(this.stateColor(h.state, t)))
        .child(div().flex_none().w(52).text_size(10.5).text_color(this.kindColor(n.kind, t)).child(SHORT_KIND[n.kind] ?? n.kind.toLowerCase()))
        .child(div().flex_1().min_w(0).truncate().text_size(13).child(n.name))
        .when(Boolean(h.reason), el => el.child(div().flex_none().text_size(11).text_color(t.blocked).child(h.reason)))
        .when(this.width > 560, el => el.child(div().flex_none().max_w(200).truncate().text_size(11).font_family(mono).text_color(t.dim).child(images(n)[0]?.split("/").pop()?.slice(0, 40) ?? "")))
        .child(div().flex_none().w(36).text_right().text_size(11.5).text_color(t.muted).child(h.desired != null ? h.ready + "/" + h.desired : ""))
        .child(div().flex_none().w(34).text_right().text_size(11).text_color(h.restarts ? t.working : t.dim).child(h.restarts ? "↻" + h.restarts : ""))
        .child(div().flex_none().w(34).text_right().text_size(11).text_color(t.dim).child(age(n.obj?.metadata?.creationTimestamp ?? n.pods[0]?.metadata?.creationTimestamp))));
      if (open) for (const p of n.pods) rows.push(this.podRow(p, t, mono, 36));
    }
    return v_flex().id("kube-list").flex_1().min_h(0).overflow_y_scrollbar().py(4).children(rows);
  }

  podRow(p, t, mono, indent = 0) {
    const cs = p.status?.containerStatuses ?? [];
    const readyCount = cs.filter(c => c.ready).length, restarts = cs.reduce((a, c) => a + (c.restartCount ?? 0), 0);
    const waiting = cs.map(c => c.state?.waiting?.reason ?? c.state?.terminated?.reason).find(Boolean);
    const phase = waiting ?? p.status?.phase ?? "";
    const ok = phase === "Running" && readyCount === cs.length || phase === "Succeeded";
    return h_flex().id("kube-pod-" + p.metadata.namespace + "-" + p.metadata.name).h(26).pl(8 + indent).pr(10).mx(4).gap(7).items_center().rounded(5)
      .child(div().size(6).flex_none().rounded(3).bg(ok ? t.done : phase === "Pending" || phase === "ContainerCreating" ? t.working : t.blocked))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(mono).text_color(t.muted).child(p.metadata.name))
      .child(div().flex_none().text_size(11).text_color(ok ? t.dim : t.blocked).child(phase))
      .child(div().flex_none().w(30).text_right().text_size(11).text_color(t.muted).child(readyCount + "/" + cs.length))
      .child(div().flex_none().w(30).text_right().text_size(11).text_color(restarts ? t.working : t.dim).child(restarts ? "↻" + restarts : ""))
      .child(div().flex_none().w(30).text_right().text_size(11).text_color(t.dim).child(age(p.status?.startTime ?? p.metadata.creationTimestamp)))
      .child(div().id("kube-sh-" + p.metadata.name).flex_none().cursor_pointer().text_color(t.dim).hover(s => s.text_color(t.foreground)).tooltip("Shell in this pod")
        .on_click((_e, cx) => { cx.stop_propagation(); this.shell(p, this.graph?.nodes.find(x => x.pods.includes(p))); }).child(svg(ICON("terminal")).size(12)));
  }

  // Details

  section(title, body, t) {
    return v_flex().gap(5).child(div().text_size(11).font_semibold().text_color(t.dim).child(title.toUpperCase())).child(body);
  }

  kv(k, v, t, mono) {
    return h_flex().gap(8).text_size(12).items_start()
      .child(div().w(96).flex_none().text_color(t.dim).child(k))
      .child(div().flex_1().min_w(0).text_color(t.foreground).when(Boolean(mono), el => el.font_family(mono).text_size(11.5)).child(String(v)));
  }

  link(id, label, sub, t, onClick) {
    return h_flex().id(id).h(24).px(6).gap(6).items_center().rounded(5).cursor_pointer().hover(s => s.bg(t.hover))
      .on_click((_e, cx) => onClick(cx))
      .child(div().flex_none().max_w(200).truncate().text_size(12.5).child(label))
      .child(div().flex_1().min_w(0).truncate().text_right().text_size(11).text_color(t.dim).child(sub ?? ""));
  }

  detailView(t, mono) {
    const n = this.graph.byId.get(this.selected);
    if (!n) return div().p(16).text_color(t.dim).child("This workload is gone.");
    const h = health(n), all = this.graph.edges;
    const out = all.filter(e => e.from === n.id), inn = all.filter(e => e.to === n.id);
    const nameOf = (id) => { const o = this.graph.byId.get(id); return o ? (o.ns !== n.ns ? o.ns + "/" : "") + o.name : id; };
    const describeEdge = (e) => [[...e.kinds].join(", "), [...e.via].join(", "), [...e.ports].filter(Boolean).map(p => ":" + p).join(" ")].filter(Boolean).join(" · ");
    const conds = (n.obj?.status?.conditions ?? []).filter(c => c.type);
    const labels = Object.entries(n.obj?.metadata?.labels ?? n.pods[0]?.metadata?.labels ?? {}).filter(([k]) => !/pod-template-hash|controller-revision-hash|pod-index|statefulset.kubernetes.io/.test(k));
    const events = this.events?.id === n.id ? this.events : null;
    return v_flex().id("kube-detail").flex_1().min_h(0).min_w(0).overflow_y_scrollbar()
      .child(v_flex().p(14).gap(14)
        .child(v_flex().gap(6)
          .child(h_flex().gap(6).items_center()
            .child(this.iconButton("kube-back", "arrow-left", "Close (esc)", (cx) => this.closeDetail(cx), t))
            .child(div().size(8).flex_none().rounded(4).bg(this.stateColor(h.state, t)))
            .child(div().text_size(12).text_color(this.kindColor(n.kind, t)).child(n.kind))
            .child(div().text_size(12).text_color(t.dim).child(n.ns))
            .child(div().flex_1())
            .child(this.iconButton("kube-copy", "copy", "Copy name (c)", (cx) => cx.write_to_clipboard(n.name), t)))
          .child(div().text_size(16).font_semibold().child(n.name))
          .child(h_flex().gap(5).flex_wrap()
            .child(this.chip(h.state, this.stateColor(h.state, t), t))
            .when(h.desired != null, el => el.child(this.chip(h.ready + "/" + h.desired + " ready", t.muted, t)))
            .when(h.restarts > 0, el => el.child(this.chip(h.restarts + " restarts", t.working, t)))
            .when(Boolean(h.reason), el => el.child(this.chip(h.reason, t.blocked, t)))
            .when(n.isolated, el => el.child(this.chip("ingress isolated", t.dim, t)))
            .children(n.hpas.map(a => this.chip("HPA " + (a.spec?.minReplicas ?? 1) + "–" + a.spec?.maxReplicas, t.ansi3, t))))
          .child(h_flex().gap(6).flex_wrap().pt(2)
            .when(n.pods.length > 0, el => el.child(this.textButton("kube-logs", "Logs", "Follow logs in a pane (l)", () => this.logs(n), t, "logs")))
            .when(n.pods.length > 0, el => el.child(this.textButton("kube-shell", "Shell", "Shell in " + n.pods[0].metadata.name + " (s)", () => this.shell(n.pods[0], n), t, "terminal")))
            .child(this.textButton("kube-describe", "Describe", "kubectl describe in a pane (d)", () => this.describe(n), t, "list"))))
        .when(out.length + inn.length > 0, el => el.child(this.section("Connections", v_flex()
          .children(out.map(e => this.link("kube-out-" + e.key, "→ " + nameOf(e.to), describeEdge(e), t, (cx) => this.select(e.to, cx, true))))
          .children(inn.map(e => this.link("kube-in-" + e.key, "← " + nameOf(e.from), describeEdge(e), t, (cx) => this.select(e.from, cx, true)))), t)))
        .when(n.pods.length > 0, el => el.child(this.section("Pods (" + n.pods.length + ")", v_flex().children(n.pods.map(p => this.podRow(p, t, mono))), t)))
        .when(n.services.length > 0, el => el.child(this.section("Services", v_flex().gap(3).children(n.services.map(s =>
          this.kv(s.metadata.name, [s.spec?.type, s.spec?.clusterIP === "None" ? "headless" : s.spec?.clusterIP,
            (s.spec?.ports ?? []).map(p => (p.name ? p.name + " " : "") + p.port + (p.targetPort && p.targetPort !== p.port ? "→" + p.targetPort : "")).join(", ")].filter(Boolean).join("  ·  "), t))), t)))
        .children((n.containers ?? []).map((c, i) => this.containerView(n, c, i, t, mono)))
        .when(n.pvcs.length > 0, el => el.child(this.section("Volumes", v_flex().gap(3).children(n.pvcs.map(p =>
          this.kv(p.metadata.name, [p.status?.phase, p.status?.capacity?.storage, p.spec?.storageClassName, (p.spec?.accessModes ?? []).join(",")].filter(Boolean).join("  ·  "), t))), t)))
        .when(n.policies.length > 0, el => el.child(this.section("Network policies", v_flex().gap(2)
          .child(div().text_size(11.5).text_color(t.dim).child(n.isolated ? "Ingress is denied except from the peers below." : "Selected by:"))
          .children(n.policies.map(p => div().text_size(12).font_family(mono).child(p)))
          .children(inn.filter(e => e.kinds.has("allowed")).map(e => div().text_size(12).text_color(t.muted).child("allows " + nameOf(e.from) + ([...e.ports].filter(Boolean).length ? " on :" + [...e.ports].join(",") : "")))), t)))
        .when(conds.length > 0, el => el.child(this.section("Conditions", v_flex().gap(2).children(conds.map(c =>
          this.kv(c.type, c.status + (c.reason ? " · " + c.reason : "") + (c.message ? " — " + c.message : ""), t))), t)))
        .when(labels.length > 0, el => el.child(this.section("Labels", h_flex().gap(4).flex_wrap().children(labels.map(([k, v]) => this.chip(k + "=" + v, t.muted, t))), t)))
        .child(this.section("Events", events ? (events.list.length ? v_flex().gap(4).children(events.list.map((e, i) =>
          h_flex().gap(8).items_start().text_size(11.5)
            .child(div().w(34).flex_none().text_color(t.dim).child(age(new Date(events.when(e)).toISOString())))
            .child(div().w(70).flex_none().truncate().text_color(e.type === "Warning" ? t.blocked : t.muted).child(e.reason ?? ""))
            .child(div().flex_1().min_w(0).text_color(t.foreground).child((e.count > 1 ? "×" + e.count + " " : "") + (e.message ?? "")))))
          : div().text_size(12).text_color(t.dim).child("No recent events.")) : div().text_size(12).text_color(t.dim).child("Loading events…"), t)));
  }

  containerView(n, c, i, t, mono) {
    const env = (c.env ?? []).map(e => {
      const f = e.valueFrom;
      const v = e.value ?? (f?.secretKeyRef ? "secret " + f.secretKeyRef.name + "/" + f.secretKeyRef.key
        : f?.configMapKeyRef ? "config " + f.configMapKeyRef.name + "/" + f.configMapKeyRef.key
        : f?.fieldRef ? "field " + f.fieldRef.fieldPath : f?.resourceFieldRef ? "resource " + f.resourceFieldRef.resource : "");
      return [e.name, v, Boolean(f)];
    });
    const from = (c.envFrom ?? []).map(f => (f.configMapRef ? "config map " + f.configMapRef.name : "secret " + f.secretRef?.name) + (f.prefix ? " (prefix " + f.prefix + ")" : ""));
    const res = c.resources ?? {}, fmt = (o) => o ? Object.entries(o).map(([k, v]) => k + " " + v).join(", ") : null;
    const open = this.expanded.has("env:" + n.id + ":" + i);
    return this.section("Container " + c.name, v_flex().gap(3)
      .child(this.kv("Image", c.image ?? "", t, mono))
      .when((c.ports ?? []).length > 0, el => el.child(this.kv("Ports", c.ports.map(p => (p.name ? p.name + " " : "") + p.containerPort + "/" + (p.protocol ?? "TCP")).join(", "), t)))
      .when(Boolean(c.command || c.args), el => el.child(this.kv("Command", [...(c.command ?? []), ...(c.args ?? [])].join(" "), t, mono)))
      .when(Boolean(fmt(res.requests) || fmt(res.limits)), el => el.child(this.kv("Resources", ["requests " + (fmt(res.requests) ?? "—"), "limits " + (fmt(res.limits) ?? "—")].join("  ·  "), t)))
      .when(from.length > 0, el => el.child(this.kv("Env from", from.join(", "), t)))
      .when(env.length > 0, el => el.child(h_flex().id("kube-env-" + i).gap(8).text_size(12).cursor_pointer()
        .on_click((_e, cx) => { const k = "env:" + n.id + ":" + i; if (open) this.expanded.delete(k); else this.expanded.add(k); cx.notify(); })
        .child(div().w(96).flex_none().text_color(t.dim).child("Env"))
        .child(div().text_color(t.accent).child(env.length + " variables " + (open ? "▾" : "▸")))))
      .when(open, el => el.child(v_flex().gap(1).pl(104).children(env.map(([k, v, ref]) => h_flex().gap(6).text_size(11.5).font_family(mono)
        .child(div().flex_none().text_color(t.muted).child(k)).child(div().flex_1().min_w(0).truncate().text_color(ref ? t.dim : t.foreground).child(v))))))
      .when((c.volumeMounts ?? []).filter(m => !m.name.startsWith("kube-api-access")).length > 0, el => el.child(this.kv("Mounts",
        c.volumeMounts.filter(m => !m.name.startsWith("kube-api-access")).map(m => m.mountPath + (m.readOnly ? " (ro)" : "")).join(", "), t, mono))), t);
  }

  message(t, title, body) {
    return v_flex().flex_1().p(18).gap(6).child(div().font_semibold().child(title))
      .when(Boolean(body), el => el.child(div().text_size(12).text_color(t.dim).child(body)));
  }

  render(cx) {
    if (this.loc && !props()?.repo && JSON.stringify(location()) !== this.key) this.relocate(cx);
    const t = theme(), mono = settings().font_family ?? "JetBrains Mono";
    let body;
    if (this.status === "nokubectl") body = this.message(t, "kubectl isn't available", this.error);
    else if (this.status === "nocontext") body = this.message(t, "No Kubernetes contexts", "kubectl has no contexts configured. Create a cluster (kind create cluster) or point KUBECONFIG at one.");
    else if (this.status === "loading" && !this.graph) body = this.message(t, "Loading cluster…", this.context());
    else if (!this.graph) body = this.message(t, "Couldn't reach " + (this.context() ?? "the cluster"), this.error);
    else {
      const detail = this.detailOpen && this.selected, wide = this.width >= WIDE;
      const main = v_flex().min_h(0).min_w(0).h_full().flex_1().child(this.toolbar(t)).child(this.prefs.view === "list" ? this.listView(t, mono) : this.mapView(t, mono));
      body = h_flex().flex_1().min_h(0).items_start()
        .when(!detail || wide, el => el.child(main))
        .when(Boolean(detail), el => el.child(v_flex().h_full().min_w(0).when(wide, el => el.w(400).flex_none().border_l(1).border_color(t.border)).when(!wide, el => el.flex_1())
          .child(this.detailView(t, mono))));
      if (this.error) body = v_flex().flex_1().min_h(0).child(div().px(10).py(4).text_size(11).text_color(t.blocked).child(this.error)).child(body);
    }
    return v_flex().id("kube").track_focus(this.handle).on_key_down((e, cx) => this.onKey(e, cx))
      .on_size_change((s, cx) => { if (this.width !== s.width) { this.width = s.width; cx.notify(); } })
      .size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13)
      .child(this.header(t)).when(Boolean(this.picking), el => el.child(this.contextPicker(t))).child(body);
  }
}
