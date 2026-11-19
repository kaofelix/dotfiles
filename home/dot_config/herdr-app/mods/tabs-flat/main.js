import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { candidateFolders, pickRoot } from "./projects.js";
import { spaces, panes, focused, run, openOverlay, nextCommand, theme, window, shared, layout, settings, readTextFile, exec } from "herdr";

// A project with Kubernetes in it: the nearest parent with one of these (a git root ends the search).
const KUBE_MARKERS = ["deploy/k8s", "k8s", "kubernetes", "manifests", "charts", "helm", "kustomization.yaml", "Chart.yaml", "skaffold.yaml", "Tiltfile", "kind.yaml", "kind-config.yaml"];
async function kubeRoot(cwd, on) {
  let dir = cwd.replace(/[\\/]+$/, "");
  for (let i = 0; dir && i < 32; i++) {
    const r = await exec("sh", ["-c", 'cd "$1" || exit 2; shift; for m; do [ -e "$m" ] && exit 0; done; [ -e .git ] && exit 3; exit 1', "sh", dir, ...KUBE_MARKERS], { on, timeout: 5000 }).catch(() => null);
    if (r?.code === 0) return dir;
    if (!r || r.code !== 1) return null;
    const up = dir.replace(/[\\/][^\\/]*$/, "");
    if (up === dir) break;
    dir = up;
  }
  return null;
}

// The beads database (.beads/metadata.json) in a folder or the nearest parent that has one.
async function beadsRoot(cwd, on) {
  let dir = cwd.replace(/[\\/]+$/, "");
  for (let i = 0; dir && i < 32; i++) {
    if (await readTextFile(dir + "/.beads/metadata.json", { on }).catch(() => null) !== null) return dir;
    const up = dir.replace(/[\\/][^\\/]*$/, "");
    if (up === dir) break;
    dir = up;
  }
  return null;
}

const PANEL_WIDTHS = { files: 368, github: 640 };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    // `tabs-flat.changes` from a key toggles the Changes pane; `tabs-flat.pr` picks a pull request;
    // `tabs-flat.beads` toggles the Beads pane, `tabs-flat.kube` the Kubernetes one.
    this.beads = new Map(); // "machine|cwd" -> beads root or null (pending: undefined)
    this.kube = new Map(); // same, for Kubernetes projects
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        // One failed toggle must not end the loop and leave the key dead.
        try { if (command === "changes") this.toggleDiff(); else if (command === "pr") this.pickPullRequest(); else if (command === "beads") this.toggleBeads(); else if (command === "kube") this.toggleKube(); else if (command === "github") this.toggleGitHub(); } catch (e) { console.warn(`tabs-flat: ${command}: ${e?.message ?? e}`); }
      }
    });
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    // The side panel's width per child: GitHub's rows want more room than the file tree. A drag is remembered for the child shown.
    this.panelWidths = { ...PANEL_WIDTHS, ...JSON.parse(localStorage.getItem("panelWidths") ?? "{}") };
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  // Changes: a changes-panel pane split beside the focused terminal; again closes it.
  toggleDiff() {
    const f = focused();
    if (!f) return;
    const open = panes().find(p => p.tab === f.tab && p.mod === "changes-panel");
    if (open) return run("pane.close", { pane: open.pane });
    run("pane.split", { direction: "right", mod: "changes-panel", props: this.repoOf(f) });
  }

  // The project a button acts on: the focused folder's, else any of the space's terminals' (a focused panel has no
  // folder). Folders are looked up once each and cached; a result redraws the bar.
  projectFor(cache, find, f, cx) {
    if (!f) return null;
    const on = spaces().find(s => s.id === f.space)?.machine ?? null;
    const { root, unknown } = pickRoot(candidateFolders(f, spaces(), panes()), on, cache);
    if (cx) for (const cwd of unknown) {
      const key = (on ?? "") + "|" + cwd;
      cache.set(key, undefined);
      cx.spawn(async (cx) => { cache.set(key, await find(cwd, on)); cx.notify(); });
    }
    return root;
  }
  beadsFor(f, cx) { return this.projectFor(this.beads, beadsRoot, f, cx); }
  kubeFor(f, cx) { return this.projectFor(this.kube, kubeRoot, f, cx); }

  // GitHub is the person's work, not a space's: it lives in the side panel (beside Files) and stays put across spaces.
  githubOpen() {
    const root = layout();
    return !find(root, "panel")?.hidden && find(root, "panel-body")?.active === "github";
  }
  toggleGitHub() {
    if (this.githubOpen()) return run("layout.hide", { id: "panel" });
    this.showPanel("github");
    run("github.focus");
  }

  toggleKube() {
    const f = focused();
    if (!f) return;
    const open = panes().find(p => p.tab === f.tab && p.mod === "kube");
    if (open) return run("pane.close", { pane: open.pane });
    run("pane.split", { direction: "right", mod: "kube", props: this.kubeFor(f) ?? (f.cwd ? { repo: f.cwd } : {}) });
  }

  toggleBeads() {
    const f = focused();
    if (!f) return;
    const open = panes().find(p => p.tab === f.tab && p.mod === "beads");
    if (open) return run("pane.close", { pane: open.pane });
    const target = this.beadsFor(f);
    run("pane.split", { direction: "right", mod: "beads", props: target ?? {} });
  }

  // A pull request of the focused terminal's repository, reviewed in a Changes dialog.
  pickPullRequest() {
    const f = focused();
    openOverlay({ mod: "pr-picker", kind: "dialog", width: 640, props: this.repoOf(f) });
  }

  // The focused terminal's folder and the machine it is on (null: this computer).
  repoOf(f) {
    return f?.cwd ? { repo: f.cwd, machine: spaces().find(s => s.id === f.space)?.machine ?? null } : {};
  }

  showPanel(id) {
    run("layout.select", { stack: "panel-body", child: id });
    const px = this.panelWidths[id];
    if (px) run("layout.resize", { id: "panel", px });
    run("layout.show", { id: "panel" });
    // Until the resize lands (or a second passes), the old width isn't a drag.
    this.resizing = { id, px, until: Date.now() + 1000 };
  }

  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    // A drag on the shown child's width is remembered for it; the resize a switch asked for isn't one.
    const px = panel.size?.px, rz = this.resizing;
    if (rz && (rz.id !== now || (rz.px && px !== rz.px)) && Date.now() < rz.until) { /* still switching */ }
    else {
      this.resizing = null;
      if (now && px && Math.abs((this.panelWidths[now] ?? 0) - px) >= 1) {
        this.panelWidths[now] = px;
        localStorage.setItem("panelWidths", JSON.stringify(this.panelWidths));
      }
    }
    // GitHub isn't a space's: switching spaces leaves it open, and it isn't remembered as the space's panel.
    if (now === "github") { this.space = space.id; this.pending = null; return; }
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) this.showPanel(want);
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render(cx) {
    const t = theme();
    const beads = this.beadsFor(focused(), cx), kube = this.kubeFor(focused(), cx);
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).w(32).h_full().flex_none().flex().items_center().justify_center().text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h_full().px(10).gap(6).items_center().flex_none().text_size(12)
        .bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu-plus", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(0, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 0;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    // Changes is the snappy-diff dialog, not a panel: only Files lives in the side panel.
    this.syncPanel(space, panel, body, enabled.filter(id => id !== "changes"));
    const panelButton = (id, label, icon, open) => {
      const f = focused();
      // Changes is a pane, not the side panel: active while one is open in this tab.
      const on = id === "github" ? this.githubOpen() : open ? panes().some(p => p.tab === f?.tab && p.mod === ({ beads: "beads", kube: "kube" }[id] ?? "changes-panel"))
        : panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h_full().px(10).gap(5).flex_none().items_center()
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (open) return open();
          if (on) run("layout.hide", { id: "panel" });
          else this.showPanel(id);
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).pr(0).pl(lightsPadding).gap(0).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(0).overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg", () => this.toggleDiff())))
      .when(Boolean(beads) || panes().some(p => p.tab === focused()?.tab && p.mod === "beads"), el => el.child(panelButton("beads", "Beads", "mods/beads/icons/beads.svg", () => this.toggleBeads())))
      .when(Boolean(kube) || panes().some(p => p.tab === focused()?.tab && p.mod === "kube"), el => el.child(panelButton("kube", "Kube", "mods/kube/icons/kube.svg", () => this.toggleKube())))
      .child(panelButton("github", "GitHub", "mods/github/icons/github.svg", () => this.toggleGitHub()))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/tabs-flat/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/tabs-flat/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/tabs-flat/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
