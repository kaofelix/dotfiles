// Pick one of a repository's open pull requests and review it in a Changes dialog.
// Opened by tabs-flat's `pr` command with props { repo, machine }. Type to filter (or a number for
// one that isn't listed), ↑/↓ and Enter to open, Esc to leave.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, settings, props, closeOverlay, openOverlay, exec } from "herdr";

const ROW_H = 34;
const LIST_H = 340;

// Rows for a filter: matching PRs, then "#N" for a number that isn't among them.
export function matches(prs, filter) {
  const f = filter.trim().toLowerCase().replace(/^#/, "");
  const shown = !f ? prs : prs.filter((p) => String(p.number).startsWith(f)
    || [p.title, p.author, p.headRefName].some((s) => s.toLowerCase().includes(f)));
  if (/^\d+$/.test(f) && !prs.some((p) => String(p.number) === f)) return [...shown, { number: Number(f), title: "Open by number", author: "", headRefName: "" }];
  return shown;
}

async function toplevel(dir, on) {
  const result = await exec("git", ["-C", dir, "rev-parse", "--show-toplevel"], on).catch(() => null);
  return result?.code === 0 ? result.stdout.trim() : null;
}

// Open pull requests, newest first: [{ number, title, author, headRefName, isDraft }].
async function pullRequests(repo, on) {
  const result = await exec("gh", ["pr", "list", "--limit", "100", "--json", "number,title,author,headRefName,isDraft"], { cwd: repo, ...on }).catch(() => null);
  if (result?.code !== 0) throw new Error(result?.stderr?.trim() || "gh pr list failed. Is the GitHub CLI (gh) installed and signed in?");
  return JSON.parse(result.stdout).map((p) => ({ ...p, author: p.author?.login ?? "" }));
}

export default class PrPicker extends View {
  init(_props, cx) {
    this.repo = null;
    this.prs = [];
    this.loading = true;
    this.error = null;
    this.at = 0;
    this.scroll = 0;
    this.input = InputState.new({ placeholder: "Filter by title, author, branch or number…" });
    this.input.on("change", (_e, cx) => { this.at = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.open(this.rows()[this.at], cx));
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    cx.spawn(async (cx) => {
      try {
        const dir = props()?.repo;
        this.machine = props()?.machine ?? null;
        const on = this.machine ? { on: this.machine } : {};
        this.repo = dir && await toplevel(dir, on);
        if (!this.repo) throw new Error("Not in a git repository. Open this from a terminal inside one.");
        this.prs = await pullRequests(this.repo, on);
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      this.loading = false;
      cx.notify();
    });
  }

  rows() {
    return matches(this.prs, this.input.value());
  }

  close() {
    closeOverlay(props().overlay);
  }

  open(pr) {
    if (!pr || !this.repo) return;
    this.close();
    openOverlay({ mod: "changes-panel", kind: "dialog", modal: true, width: 0.94, height: 0.92, props: { repo: this.repo, machine: this.machine, pr: pr.number } });
  }

  render() {
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    // Keep the selected row in view: the list is a strip moved only as far as that takes.
    const height = Math.min(LIST_H, rows.length * ROW_H);
    const maxScroll = Math.max(0, rows.length * ROW_H - height);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    if (this.at * ROW_H < this.scroll) this.scroll = this.at * ROW_H;
    if ((this.at + 1) * ROW_H > this.scroll + height) this.scroll = (this.at + 1) * ROW_H - height;
    const first = Math.floor(this.scroll / ROW_H), last = Math.min(rows.length, Math.ceil((this.scroll + height) / ROW_H));
    const mono = settings().font_family;

    const row = (pr, i) => h_flex().id(`pr-${pr.number}`).absolute().left(0).right(0).top(i * ROW_H - this.scroll).h(ROW_H)
      .mx(4).px(10).gap(10).items_center().rounded(7).cursor_pointer()
      .when(i === this.at, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover))
      .on_click(() => this.open(pr))
      .child(div().w(52).flex_none().font_family(mono).text_size(12).text_color(t.muted).child(`#${pr.number}`))
      .child(div().flex_1().min_w(0).truncate().text_color(pr.author ? t.foreground : t.muted).child(pr.title))
      .when(pr.isDraft, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("draft")))
      .child(div().flex_none().max_w(140).truncate().text_size(11).text_color(t.dim).child(pr.author));

    const status = this.loading ? "Loading pull requests…" : this.error ?? (rows.length ? null : "No open pull requests match.");
    return v_flex().id("pr-picker").w_full().min_h(0).p(18).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") this.at = (this.at + 1) % Math.max(1, rows.length);
        else if (k === "up") this.at = (this.at + rows.length - 1) % Math.max(1, rows.length);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Review a pull request"))
        .child(div().id("pr-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => this.close()).child("Esc")))
      .child(h_flex().h(36).flex_none().px(10).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)))
      .when(Boolean(status), (el) => el.child(div().px(10).py(8).text_size(12).text_color(this.error ? t.error ?? t.blocked : t.dim).child(status)))
      .when(rows.length > 0, (el) => el.child(div().id("pr-list").relative().h(height).flex_none().overflow_hidden().mb(6)
        .on_scroll_wheel((e, cx) => {
          this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
          // The selection follows the wheel, so the next frame doesn't scroll back to it.
          this.at = Math.max(Math.ceil(this.scroll / ROW_H), Math.min(this.at, Math.floor((this.scroll + height) / ROW_H) - 1));
          cx.notify();
        })
        .children(rows.slice(first, last).map((pr, j) => row(pr, first + j)))));
  }
}
