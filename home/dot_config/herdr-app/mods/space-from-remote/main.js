import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { exec, home, spaces, panes, theme, run, props, closeOverlay } from "herdr";
import { parseRemote, repoPath, sameRepo, detectForge, cloneCommand, cloneArgv } from "./model.js";

const FORGE = { github: "GitHub", gitlab: "GitLab" };

const within = (folder, path) => Boolean(folder) && (folder === path || folder.startsWith(path + "/"));

export default class SpaceFromRemote extends View {
  init(_props, cx) {
    this.base = home() + "/Code";
    this.busy = "";
    this.error = "";
    this.input = InputState.new({ placeholder: "Paste a GitHub or GitLab URL…" });
    this.handle = cx.focus_handle();
    this.input.on("submit", (_event, cx) => this.start(cx));
    this.input.on("change", (_event, cx) => {
      if (!this.error) return;
      this.error = "";
      cx.notify();
    });
    this.input.focus();
  }

  start(cx) {
    if (this.busy) return;
    const parsed = parseRemote(this.input.value());
    if (!parsed) {
      this.error = "Not a repository URL. Try https://github.com/owner/repo";
      cx.notify();
      return;
    }
    this.busy = `Checking ${parsed.host}…`;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await this.open(parsed);
      } catch (error) {
        this.error = error.message ?? String(error);
      }
      this.busy = "";
      cx.notify();
    });
  }

  async open(parsed) {
    const found = await detectForge(parsed.host, { exec });
    if (!found) throw new Error(`Could not tell whether ${parsed.host} is GitHub or GitLab. Log in with gh or glab first.`);
    const repo = repoPath(found.forge, parsed.segments);
    const dest = `${this.base}/${repo.name}`;
    const clone = cloneCommand({ ...found, host: parsed.host, path: repo.path });
    if (await exists(dest)) {
      const origin = await exec("git", ["-C", dest, "remote", "get-url", "origin"]).catch(() => null);
      if (!origin || origin.code !== 0 || !sameRepo(origin.stdout.trim(), found.forge, parsed.host, repo)) {
        throw new Error(`~/Code/${repo.name} already exists with a different remote`);
      }
      this.show(repo.name, dest, null);
      return;
    }
    const installed = await exec("sh", ["-c", 'command -v "$1" >/dev/null 2>&1', "sh", clone.cli])
      .then(result => result.code === 0, () => false);
    if (!installed) throw new Error(`${clone.cli} is not installed`);
    this.busy = `Opening a space to clone from ${FORGE[found.forge]}…`;
    this.show(repo.name, dest, cloneArgv(clone, parsed.host, dest));
  }

  // An existing checkout switches to its space; a new one gets a space whose
  // terminal runs the clone, so progress and credential prompts are visible.
  show(name, dest, argv) {
    const open = spaces().find(space => space.machine == null && (
      within(space.folder, dest) || panes().some(pane =>
        space.tabs.some(tab => tab.id === pane.tab) && within(pane.cwd, dest))));
    if (open) run("space.select", { id: open.id });
    else if (argv) run("space.new", { name, folder: this.base, argv });
    else run("space.new", { name, folder: dest });
    if (props()?.overlay) closeOverlay(props().overlay);
  }

  render() {
    const t = theme();
    return v_flex().id("space-from-remote").track_focus(this.handle).size_full().min_h(0)
      .p(16).gap(12).bg(t.popover).text_color(t.foreground).text_size(13)
      .on_key_down((event, cx) => {
        if (event.key !== "escape" || !props()?.overlay) return;
        closeOverlay(props().overlay);
        cx.stop_propagation();
      })
      .child(h_flex().items_center().justify_between()
        .child(div().font_semibold().text_size(16).child("Space from remote"))
        .child(div().text_color(t.dim).child("~/Code")))
      .child(h_flex().h(36).flex_none().px(10).items_center().rounded(8)
        .border_1().border_color(t.accent).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_color(t.foreground)))
      .child(div().flex_1().min_h(0).text_color(this.error ? t.blocked : t.muted).child(this.error || this.busy))
      .child(div().flex_none().text_size(11).text_color(t.dim)
        .child(`Enter clone and open${props()?.overlay ? " · Esc close" : ""}`));
  }
}

async function exists(path) {
  return exec("test", ["-e", path]).then(result => result.code === 0, () => false);
}
