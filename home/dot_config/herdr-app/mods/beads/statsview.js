// The Stats view of the beads mod: a window picker, headline numbers, charts and breakdowns, drawn from stats.js.
// Every bead it names is a link into the detail view (view.show(id)).
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { computeStats, formatDuration as dur } from "./stats.js";

export const WINDOWS = [{ days: 7, label: "7d" }, { days: 30, label: "30d" }, { days: 90, label: "90d" }, { days: null, label: "All" }];
const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0) + "%";

export function statsView(view, t, c, mono) {
  const days = view.prefs.statsWindow === undefined ? 30 : view.prefs.statsWindow;
  const s = computeStats(view.issues, { windowDays: days, query: view.query });
  const width = view.statsWidth ?? view.width ?? 600;
  const cols = width >= 900 ? 4 : width >= 560 ? 2 : 1;
  const card = (title, body, tip) => v_flex().flex_1().min_w(0).p(12).gap(8).rounded(8).bg(t.surface).border_1().border_color(t.border)
    .child(h_flex().gap(6).items_center().child(div().text_size(11).font_semibold().text_color(t.dim).child(title.toUpperCase()))
      .when(Boolean(tip), el => el.child(div().id("beads-tip-" + title).text_size(11).text_color(t.dim).tooltip(tip).child("ⓘ"))))
    .child(body);
  const grid = (items, n) => {
    const rows = [];
    for (let i = 0; i < items.length; i += n) {
      const chunk = items.slice(i, i + n);
      while (chunk.length < n) chunk.push(div().flex_1());
      rows.push(h_flex().gap(10).items_stretch().children(chunk));
    }
    return v_flex().gap(10).children(rows);
  };

  const headline = (label, value, sub, color) => card(label, v_flex().gap(2)
    .child(div().text_size(22).font_semibold().text_color(color ?? t.foreground).child(value))
    .child(div().text_size(11.5).text_color(t.dim).child(sub)), TIPS[label]);
  const heads = [
    headline("Lead time", dur(s.lead.p50), "median · 85% within " + dur(s.lead.p85)),
    headline("Cycle time", dur(s.cycle.p50), "median · 85% within " + dur(s.cycle.p85)),
    headline("Throughput", fmtRate(s.throughputPerDay), s.closed.length + " closed · " + fmtRate(s.arrivalsPerDay) + " created",
      s.arrivalsPerDay > s.throughputPerDay * 1.2 ? t.working : t.done),
    headline("Work in progress", String(s.wip.inProgress), s.wip.open + " open · " + s.wip.blocked + " blocked" + (s.forecastDays != null ? " · ~" + Math.ceil(s.forecastDays) + "d to clear" : "")),
  ];

  const toolbar = h_flex().px(14).pt(12).gap(8).items_center().flex_wrap()
    .child(h_flex().flex_none().rounded(6).border_1().border_color(t.border).overflow_hidden()
      .children(WINDOWS.map(w => div().id("beads-win-" + w.label).h(22).px(9).flex().items_center().cursor_pointer().text_size(11.5)
        .bg(days === w.days ? t.selected : t.background).text_color(days === w.days ? t.foreground : t.dim).hover(st => st.text_color(t.foreground))
        .on_click((_e, cx) => { view.prefs.statsWindow = w.days; view.savePrefs(); cx.notify(); }).child(w.label))))
    .child(div().text_size(11.5).text_color(t.dim).child(rangeLabel(s) + (view.query ? "  ·  filtered: " + view.query : "") + "  ·  epics excluded"));

  const body = v_flex().p(14).gap(10)
    .child(grid(heads, cols))
    .child(grid([
      card("Closed and created per " + (s.bucketDays === 7 ? "week" : "day"), throughputChart(s, t), TIPS.flow),
      card("Lead time distribution", histogramChart(s, t), TIPS.histogram),
    ], cols >= 2 ? 2 : 1))
    .child(grid([
      card("Cumulative flow", cfdChart(s, t, c), TIPS.cfd),
      card("Time split", splitView(s, t), TIPS.split),
    ], cols >= 2 ? 2 : 1))
    .child(grid([
      card("In progress, by age", agingList(view, s, t, c, mono), TIPS.aging),
      card("Waiting longest", waitingList(view, s, t, c, mono), TIPS.waiting),
      card("Slowest closed", slowestList(view, s, t, c, mono), TIPS.slowest),
    ], cols >= 4 ? 3 : cols >= 2 ? 2 : 1))
    .child(grid([
      card("By type", breakdown(s.byType, t, (k) => c.type[k]), null),
      card("By priority", breakdown(s.byPriority, t, (k) => c.priority[Number(k.slice(1))]), null),
      card("By assignee", breakdown(s.byAssignee, t), null),
    ].concat(s.byLabel.length ? [card("By label", breakdown(s.byLabel.slice(0, 10), t, () => t.accent), null)] : []), cols >= 4 ? 4 : cols >= 2 ? 2 : 1));

  return v_flex().id("beads-stats").flex_1().min_h(0).min_w(0).overflow_y_scrollbar()
    .on_size_change((sz, cx) => { if (view.statsWidth !== sz.width) { view.statsWidth = sz.width; cx.notify(); } })
    .child(toolbar)
    .child(s.closed.length || s.wip.inProgress || s.wip.open ? body
      : div().p(16).text_size(12.5).text_color(t.dim).child("Nothing in this window" + (view.query ? " matches the filter" : "") + ". Try a longer window."));
}

const TIPS = {
  "Lead time": "From created to closed: how long someone waits for a bead. Beads closed in this window.",
  "Cycle time": "From started (in progress) to closed: how long the work took once picked up. Beads that were never started are left out.",
  "Throughput": "Beads closed per day in this window, next to beads created per day. Yellow: more arrive than get closed.",
  "Work in progress": "Beads in progress now, with what's waiting. The days to clear are what's open and in progress divided by throughput (Little's law).",
  flow: "Closed (green) and created (grey) in each bucket. Hover a bar for numbers.",
  histogram: "How many beads closed in this window took each lead time.",
  cfd: "Every bead that existed at the end of each bucket: closed, in progress and open, stacked. A widening middle band means work is piling up in progress.",
  split: "Queue: created to started. Working: started to closed. Flow efficiency is the share of lead time spent working.",
  aging: "In-progress beads by how long since they started. Red: older than 85% of recently closed beads' cycle time.",
  waiting: "Open and blocked beads that were created longest ago.",
  slowest: "Beads closed in this window with the longest lead time.",
};

function fmtRate(perDay) {
  if (perDay >= 1 || perDay === 0) return (Math.round(perDay * 10) / 10) + "/day";
  return (Math.round(perDay * 70) / 10) + "/wk";
}

function rangeLabel(s) {
  const d = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d(s.from) + " – " + d(s.now);
}

function bucketLabel(b) {
  const d = new Date(b.start);
  return b.days === 7 ? "week of " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Bars: closed (green) and created (thin grey) side by side per bucket.
function throughputChart(s, t) {
  const H = 96, max = Math.max(1, ...s.buckets.map(b => Math.max(b.created, b.closed)));
  const dense = s.buckets.length > 40;
  return v_flex().gap(4)
    .child(h_flex().h(H).items_end().gap(dense ? 1 : 2).children(s.buckets.map((b, i) =>
      h_flex().id("beads-tp-" + i).flex_1().min_w(0).h_full().items_end().gap(1).tooltip(bucketLabel(b) + ": " + b.closed + " closed, " + b.created + " created")
        .child(div().flex_1().min_w(1).rounded_t(2).bg(t.done).h(Math.max(b.closed ? 2 : 0, (b.closed / max) * H)))
        .child(div().w(dense ? 1 : 3).flex_none().rounded_t(1).bg(t.dim).h(Math.max(b.created ? 2 : 0, (b.created / max) * H))))))
    .child(h_flex().justify_between().text_size(10.5).text_color(t.dim)
      .child(div().child(bucketLabel(s.buckets[0] ?? { start: s.from, days: 1 })))
      .child(div().child("max " + max))
      .child(div().child(s.bucketDays === 7 ? "this week" : "today")));
}

function histogramChart(s, t) {
  const max = Math.max(1, ...s.leadHistogram.map(b => b.count));
  return v_flex().gap(3).children(s.leadHistogram.map(b => h_flex().gap(8).items_center().text_size(11.5)
    .child(div().w(46).flex_none().text_color(t.dim).child(b.label))
    .child(div().flex_1().h(12).rounded(3).bg(t.raised).child(div().h_full().rounded(3).bg(t.accent).w(share(b.count, max))))
    .child(div().w(28).flex_none().text_right().text_color(b.count ? t.foreground : t.dim).child(String(b.count)))))
    .child(div().pt(2).text_size(10.5).text_color(t.dim).child(s.lead.n + " beads · mean " + dur(s.lead.mean) + " · 95% within " + dur(s.lead.p95)));
}

// Stacked columns: closed at the bottom, in progress, then open on top, scaled to the largest total.
function cfdChart(s, t, c) {
  const H = 96, max = Math.max(1, ...s.buckets.map(b => b.flow.open + b.flow.wip + b.flow.done));
  const last = s.buckets[s.buckets.length - 1]?.flow ?? { open: 0, wip: 0, done: 0 };
  const key = (color, label, n) => h_flex().gap(4).items_center().child(div().size(8).rounded(2).bg(color)).child(label + " " + n);
  return v_flex().gap(4)
    .child(h_flex().h(H).items_end().gap(s.buckets.length > 40 ? 0 : 1).children(s.buckets.map((b, i) =>
      v_flex().id("beads-cfd-" + i).flex_1().min_w(0).h_full().justify_end().tooltip(bucketLabel(b) + ": " + b.flow.done + " closed, " + b.flow.wip + " in progress, " + b.flow.open + " open")
        .child(div().w_full().bg(c.status.open).opacity(0.55).h((b.flow.open / max) * H))
        .child(div().w_full().bg(t.working).h((b.flow.wip / max) * H))
        .child(div().w_full().bg(t.done).opacity(0.85).h((b.flow.done / max) * H)))))
    .child(h_flex().gap(12).text_size(10.5).text_color(t.dim)
      .child(key(t.done, "closed", last.done)).child(key(t.working, "in progress", last.wip)).child(key(c.status.open, "open", last.open)));
}

function splitView(s, t) {
  const q = s.queue.p50 ?? 0, w = s.cycle.p50 ?? 0, total = q + w;
  const eff = s.flowEfficiency;
  return v_flex().gap(8)
    .child(h_flex().h(14).w_full().rounded(4).overflow_hidden().bg(t.raised)
      .when(total > 0, el => el.child(div().h_full().bg(t.dim).w(share(q, total))).child(div().h_full().bg(t.accent).w(share(w, total)))))
    .child(h_flex().justify_between().text_size(11.5)
      .child(v_flex().child(div().text_color(t.dim).child("Queue (median)")).child(div().text_size(15).font_semibold().child(dur(s.queue.p50))))
      .child(v_flex().items_end().child(div().text_color(t.dim).child("Working (median)")).child(div().text_size(15).font_semibold().child(dur(s.cycle.p50)))))
    .child(h_flex().gap(6).items_baseline().text_size(11.5)
      .child(div().text_size(15).font_semibold().text_color(eff == null ? t.dim : eff >= 0.4 ? t.done : eff >= 0.15 ? t.working : t.blocked).child(eff == null ? "—" : Math.round(eff * 100) + "%"))
      .child(div().text_color(t.dim).child("flow efficiency: time worked out of total lead time")));
}

function beadRow(view, prefix, issue, right, rightColor, t, c, mono) {
  return h_flex().id(prefix + "-" + issue.id).h(24).px(4).gap(6).items_center().rounded(5).cursor_pointer().hover(st => st.bg(t.hover))
    .on_click((_e, cx) => view.show(issue.id, cx))
    .child(view.statusIcon(issue, t, c, 12))
    .child(div().flex_none().text_size(11).font_family(mono).text_color(t.dim).child(view.shortId(issue.id)))
    .child(div().flex_1().min_w(0).truncate().text_size(12).child(issue.title ?? ""))
    .child(div().flex_none().text_size(11.5).font_semibold().text_color(rightColor ?? t.muted).child(right));
}

const empty = (t, text) => div().text_size(12).text_color(t.dim).child(text);

function agingList(view, s, t, c, mono) {
  if (!s.aging.length) return empty(t, "Nothing in progress.");
  return v_flex().children(s.aging.slice(0, 8).map(a => beadRow(view, "beads-age", a.issue, dur(a.age), a.late ? t.blocked : t.muted, t, c, mono)))
    .when(s.cycle.p85 != null, el => el.child(div().pt(4).text_size(10.5).text_color(t.dim).child("red: older than " + dur(s.cycle.p85) + " (85% of cycle times)")));
}

function waitingList(view, s, t, c, mono) {
  if (!s.oldestOpen.length) return empty(t, "Nothing waiting.");
  return v_flex().children(s.oldestOpen.map(a => beadRow(view, "beads-wait", a.issue, dur(a.age), null, t, c, mono)));
}

function slowestList(view, s, t, c, mono) {
  if (!s.slowest.length) return empty(t, "Nothing closed in this window.");
  return v_flex().children(s.slowest.map(a => beadRow(view, "beads-slow", a.issue, dur(a.lead), null, t, c, mono)));
}

function breakdown(rows, t, colorOf = () => null) {
  if (!rows.length) return empty(t, "None.");
  const max = Math.max(1, ...rows.map(r => r.closed + r.open));
  return v_flex().gap(4)
    .child(h_flex().gap(6).text_size(10.5).text_color(t.dim).child(div().flex_1())
      .child(div().w(56).flex_none().text_right().child("closed/open")).child(div().w(44).flex_none().text_right().child("lead p50")))
    .children(rows.map(r => h_flex().gap(6).items_center().text_size(12)
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_color(colorOf(r.key) ?? t.foreground).child(String(r.key)))
        .child(h_flex().h(4).w_full().rounded(2).bg(t.raised).overflow_hidden()
          .child(div().h_full().bg(t.done).w(share(r.closed, max)))
          .child(div().h_full().bg(t.dim).w(share(r.open, max)))))
      .child(div().w(56).flex_none().text_right().text_color(t.muted).child(r.closed + " / " + r.open))
      .child(div().w(44).flex_none().text_right().text_color(t.dim).child(dur(r.leadP50)))));
}
