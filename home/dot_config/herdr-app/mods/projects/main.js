import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { readdir } from "fs/promises";
import { home, spaces, panes, theme, run, props, closeOverlay, watchFolder } from "herdr";
import { projectRows } from "./model.js";

export default class Projects extends View {
  init(_props, cx) {
    this.root = home() + "/Code";
    this.projects = [];
    this.query = "";
    this.at = 0;
    this.loading = true;
    this.error = "";
    this.input = InputState.new({ placeholder: "Find a project…" });
    this.scroll = VirtualListScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input.on("change", (_event, cx) => {
      this.query = this.input.value();
      this.at = 0;
      this.scroll.scroll_to_item(0);
      cx.notify();
    });
    this.input.on("submit", () => this.open(this.rows()[this.at]));
    this.input.focus();
    cx.spawn(async (cx) => {
      await this.refresh(cx);
      try {
        for (;;) {
          await watchFolder(this.root);
          await this.refresh(cx);
        }
      } catch (error) {
        this.error = `Could not watch ~/Code: ${error.message ?? error}. Reopen to refresh.`;
        cx.notify();
      }
    });
  }

  async refresh(cx) {
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      const projects = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
        .map(entry => ({ name: entry.name, path: this.root + "/" + entry.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      // Ignore recursive watcher events from edits inside existing projects.
      if (!this.loading && !this.error && JSON.stringify(projects) === JSON.stringify(this.projects)) return;
      this.projects = projects;
      this.error = "";
    } catch (error) {
      this.error = `Could not read ~/Code: ${error.message ?? error}`;
    }
    this.loading = false;
    this.at = 0;
    cx.notify();
  }

  rows() {
    return projectRows(this.projects, this.query, spaces(), panes(), home());
  }

  open(project) {
    if (!project) return;
    // Resolve again: the user may have opened or closed a space since rendering.
    const current = this.rows().find(row => row.path === project.path);
    if (!current) return;
    if (current.space) run("space.select", { id: current.space.id });
    else run("space.new", { name: current.name, folder: current.path });
    if (props()?.overlay) closeOverlay(props().overlay);
  }

  render() {
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    return v_flex().id("projects").track_focus(this.handle).size_full().min_h(0)
      .p(16).gap(12).bg(t.popover).text_color(t.foreground).text_size(13)
      .on_key_down((event, cx) => {
        const down = event.key === "down" || event.keystroke === "ctrl-n";
        const up = event.key === "up" || event.keystroke === "ctrl-p";
        if (event.key === "escape" && props()?.overlay) {
          closeOverlay(props().overlay);
        } else if ((down || up) && rows.length) {
          this.at = (this.at + (down ? 1 : rows.length - 1)) % rows.length;
          this.scroll.scroll_to_item(this.at, "center");
          cx.notify();
        } else return;
        cx.stop_propagation();
      })
      .child(h_flex().items_center().justify_between()
        .child(div().font_semibold().text_size(16).child("Open project"))
        .child(div().text_color(t.dim).child("~/Code")))
      .child(h_flex().h(36).flex_none().px(10).items_center().rounded(8)
        .border_1().border_color(t.accent).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_color(t.foreground)))
      .when(!!this.error, el => el.child(div().text_color(t.blocked).child(this.error)))
      .child(rows.length ? v_flex().relative().flex_1().min_h(0)
        .child(v_virtual_list("project-list", rows.length, 42, index => rows[index].path,
          range => rows.slice(range.start, range.end).map((row, offset) =>
            h_flex().h(42).px(10).gap(10).items_center().rounded(6)
              .when(range.start + offset === this.at, el => el.bg(t.selected))
              .child(div().flex_1().truncate().child(row.name))
              .child(svg(`mods/projects/${row.space ? "arrow-right" : "square-plus"}.svg`)
                .size(16).flex_none().text_color(row.space ? t.accent : t.dim))))
          .size_full().track_scroll(this.scroll)
          .on_item_click(path => this.open(rows.find(row => row.path === path))))
        .child(Scrollbar.vertical("project-list").absolute().inset_0())
        : div().flex_1().text_color(t.muted).child(this.loading ? "Loading projects…"
          : this.query ? "No matching projects" : "No project folders in ~/Code"))
      .child(div().flex_none().text_size(11).text_color(t.dim)
        .child(`${rows.length} projects · ↑ ↓ / C-p C-n select${rows.length ? rows[this.at].space
          ? " · Enter switch to space" : " · Enter create space" : ""}${props()?.overlay ? " · Esc close" : ""}`));
  }
}
