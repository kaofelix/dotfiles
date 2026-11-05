import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Select, Popup } from "gpui-base";
import { exec, home, machines, spaces, panes, theme, run, props, closeOverlay } from "herdr";
import { parseRemote, repoPath, sameRepo, detectForge, cloneCommand, cliFor, cloneArgv } from "./model.js";

const FORGE = { github: "GitHub", gitlab: "GitLab" };

// The sidebar's machine icons: a monitor for this computer, a server for the others.
// Fixed, so the trigger keeps its size whichever machine is chosen.
const DROPDOWN_WIDTH = 136;

const icon = (choice) => svg(`mods/workspace-chrome/${choice.name ? "server" : "monitor"}.svg`).size(13).flex_none();

const within = (folder, path) => Boolean(folder) && (folder === path || folder.startsWith(path + "/"));

export default class SpaceFromRemote extends View {
  init(_props, cx) {
    this.busy = "";
    this.error = "";
    this.open = false;
    this.hot = 0;
    this.trigger = cx.focus_handle();
    this.list = cx.focus_handle();
    // Start on the machine of the space being looked at; most clones belong there.
    this.machine = spaces().find(space => space.active)?.machine ?? null;
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

  // This computer first, then the other machines; offline ones stay visible but disabled.
  choices() {
    const others = machines().filter(machine => machine.name != null)
      .map(machine => ({ name: machine.name, label: machine.name, disabled: machine.layout === "unavailable" }));
    return [{ name: null, label: "This computer", disabled: false }, ...others];
  }

  // The dropdown's list; the highlight starts on the current machine.
  setOpen(open, cx) {
    if (open && this.busy) return;
    this.open = open;
    if (open) this.hot = Math.max(0, this.choices().findIndex(choice => choice.name === this.machine));
    else this.input.focus();
    cx.notify();
  }

  pick(choice, cx) {
    if (choice.disabled) return;
    this.machine = choice.name;
    this.error = "";
    this.setOpen(false, cx);
  }

  // Arrow keys skip offline machines; the list holds the keyboard while open.
  move(step, cx) {
    const choices = this.choices();
    for (let i = 1; i <= choices.length; i++) {
      const at = (this.hot + step * i + choices.length * i) % choices.length;
      if (!choices[at].disabled) { this.hot = at; break; }
    }
    cx.notify();
  }

  cycle(step, cx) {
    if (this.busy) return;
    const usable = this.choices().filter(choice => !choice.disabled);
    const at = usable.findIndex(choice => choice.name === this.machine);
    this.machine = usable[(at + step + usable.length) % usable.length].name;
    this.error = "";
    cx.notify();
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
        await this.cloneRemote(parsed);
      } catch (error) {
        this.error = error.message ?? String(error);
      }
      this.busy = "";
      cx.notify();
    });
  }

  async cloneRemote(parsed) {
    const on = this.machine;
    const where = on ?? "this computer";
    // Everything runs on the chosen machine: its CLIs, logins, network and folders.
    const ex = (command, args) => exec(command, args, { on });
    const found = await detectForge(parsed.host, { exec: ex });
    if (!found) throw new Error(`Could not tell whether ${parsed.host} is GitHub or GitLab from ${where}. Log in with gh or glab there first.`);
    const repo = repoPath(found.forge, parsed.segments);
    const homeDir = on ? (await ex("sh", ["-c", 'printf %s "$HOME"'])).stdout.trim() : home();
    const base = `${homeDir}/Code`;
    const dest = `${base}/${repo.name}`;
    await ex("mkdir", ["-p", base]);
    if ((await ex("test", ["-e", dest]).catch(() => null))?.code === 0) {
      const origin = await ex("git", ["-C", dest, "remote", "get-url", "origin"]).catch(() => null);
      if (!origin || origin.code !== 0 || !sameRepo(origin.stdout.trim(), found.forge, parsed.host, repo)) {
        throw new Error(`~/Code/${repo.name} already exists on ${where} with a different remote`);
      }
      this.show(repo.name, dest, base, null);
      return;
    }
    const installed = await ex("sh", ["-c", 'command -v "$1" >/dev/null 2>&1', "sh", cliFor(found.forge)])
      .then(result => result.code === 0, () => false);
    const clone = cloneCommand({ ...found, host: parsed.host, path: repo.path, installed, parsed });
    this.busy = installed
      ? `Opening a space on ${where} to clone from ${FORGE[found.forge]}…`
      : `${cliFor(found.forge)} is not on ${where}; cloning with git…`;
    this.show(repo.name, dest, base, cloneArgv(clone, parsed.host, dest));
  }

  // An existing checkout switches to its space; a new one gets a space whose
  // terminal runs the clone, so progress and credential prompts are visible.
  show(name, dest, base, argv) {
    const on = this.machine;
    const open = spaces().find(space => (space.machine ?? null) === on && (
      within(space.folder, dest) || panes().some(pane =>
        space.tabs.some(tab => tab.id === pane.tab) && within(pane.cwd, dest))));
    const machine = on ? { machine: on } : {};
    if (open) run("space.select", { id: open.id });
    else if (argv) run("space.new", { name, folder: base, argv, ...machine });
    else run("space.new", { name, folder: dest, ...machine });
    if (props()?.overlay) closeOverlay(props().overlay);
  }

  render() {
    const t = theme();
    const choices = this.choices();
    const current = choices.find(choice => choice.name === this.machine) ?? choices[0];
    const row = (choice, index) => div().id(`machine-${choice.name ?? "local"}`).h(28).px(10).flex().items_center().gap(8).flex_none()
      .text_size(12).rounded(6).text_color(choice.disabled ? t.dim : t.foreground)
      .bg(index === this.hot ? t.selected : t.popover)
      .when(!choice.disabled, el => el.cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_event, cx) => this.pick(choice, cx)))
      .child(icon(choice)).child(div().flex_1().min_w(0).truncate().child(choice.label + (choice.disabled ? " (offline)" : "")));
    const trigger = h_flex().id("machine-trigger").h_full().w(DROPDOWN_WIDTH).px(10).gap(6).flex_none().items_center().rounded(8)
      .border_1().border_color(t.border).bg(t.background).text_size(12).text_color(t.foreground)
      .track_focus(this.trigger)
      .when(!this.busy, el => el.cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_event, cx) => this.setOpen(!this.open, cx)))
      .child(icon(current)).child(div().flex_1().min_w(0).truncate().child(current.label)).child(div().text_color(t.dim).child(this.open ? "▴" : "▾"));
    const dropdown = Select.new("machine").h_full().flex_none().accessibility_label("Machine")
      .open(this.open).track_focus(this.trigger).content_focus_handle(this.list)
      .on_open_change((open, cx) => this.setOpen(open, cx))
      .child(Popup.new("machine-list", trigger).h_full().anchor("bottom_left")
        .when(this.open, el => el.content(v_flex().id("machine-options").track_focus(this.list)
          .p(4).gap(2).w(DROPDOWN_WIDTH).rounded(8).border_1().border_color(t.border).bg(t.popover)
          .on_key_down((event, cx) => {
            if (event.key === "down") this.move(1, cx);
            else if (event.key === "up") this.move(-1, cx);
            else if (event.key === "enter") this.pick(choices[this.hot], cx);
            else if (event.key === "escape") this.setOpen(false, cx);
            else return;
            cx.stop_propagation();
          })
          .children(choices.map(row)))));
    return v_flex().id("space-from-remote").track_focus(this.handle).size_full().min_h(0)
      .p(16).gap(12).bg(t.popover).text_color(t.foreground).text_size(13)
      .on_key_down((event, cx) => {
        if (event.key === "escape" && props()?.overlay) closeOverlay(props().overlay);
        else if (event.keystroke === "ctrl-n") this.cycle(1, cx);
        else if (event.keystroke === "ctrl-p") this.cycle(-1, cx);
        else return;
        cx.stop_propagation();
      })
      .child(h_flex().items_center().justify_between()
        .child(div().font_semibold().text_size(16).child("Space from remote"))
        .child(div().text_color(t.dim).child("~/Code")))
      .child(h_flex().h(36).flex_none().gap(8).items_center()
        .child(h_flex().flex_1().min_w(0).h_full().px(10).items_center().rounded(8)
          .border_1().border_color(t.accent).bg(t.background)
          .child(Input.new(this.input).flex_1().h_full().text_color(t.foreground)))
        .when(choices.length > 1, el => el.child(dropdown)))
      .child(div().flex_1().min_h(0).text_color(this.error ? t.blocked : t.muted).child(this.error || this.busy))
      .child(div().flex_none().text_size(11).text_color(t.dim)
        .child(`Enter clone and open${choices.length > 1 ? " · ^N ^P machine" : ""}${props()?.overlay ? " · Esc close" : ""}`));
  }
}
