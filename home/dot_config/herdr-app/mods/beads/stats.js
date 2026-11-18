// Flow metrics for a beads database: lead, cycle and queue time, throughput, arrivals, WIP and its age, a cumulative
// flow and breakdowns. Pure, so tests load it directly; times are ms since the epoch.
//
//   lead   created → closed (what someone waiting on the bead experiences)
//   cycle  started → closed (how long the work itself took, once someone picked it up)
//   queue  created → started (how long it waited before anyone started)
//
// Epics and other containers (milestones, molecules) close when their children do, so they would only blur the numbers.
import { index, parseQuery, sectionOf } from "./model.js";

export const CONTAINERS = new Set(["epic", "milestone", "molecule", "convoy"]);
const HOUR = 3600e3, DAY = 24 * HOUR;
const time = (iso) => (iso ? Date.parse(iso) || null : null);

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { values: sorted, n: sorted.length, p50: percentile(sorted, 0.5), p85: percentile(sorted, 0.85), p95: percentile(sorted, 0.95),
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null };
}

const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function computeStats(issues, { now = Date.now(), windowDays = 30, query = "" } = {}) {
  const { byId } = index(issues);
  const preds = parseQuery(query);
  const work = issues.filter(i => !CONTAINERS.has(i.issue_type) && preds.every(p => p(i, sectionOf(i, byId))));
  const today = startOfDay(now);
  const first = Math.min(...work.map(i => time(i.created_at) ?? now), now);
  // A window never starts before the first bead: empty days would only dilute the rates.
  const age = Math.max(1, Math.round((today - startOfDay(first)) / DAY) + 1);
  const days = windowDays == null ? age : Math.min(windowDays, age);
  const from = today - (days - 1) * DAY;
  const inWindow = (ms) => ms != null && ms >= from && ms <= now;

  const closed = work.filter(i => i.status === "closed" && inWindow(time(i.closed_at)))
    .sort((a, b) => time(b.closed_at) - time(a.closed_at));
  const span = (i, a, b) => { const x = time(i[a]), y = time(i[b]); return x != null && y != null && y >= x ? y - x : null; };
  const values = (list, a, b) => list.map(i => span(i, a, b)).filter(v => v != null);
  const lead = summary(values(closed, "created_at", "closed_at"));
  const cycle = summary(values(closed, "started_at", "closed_at"));
  const queue = summary(values(work.filter(i => inWindow(time(i.started_at))), "created_at", "started_at"));
  const both = closed.filter(i => span(i, "started_at", "closed_at") != null);
  const flowEfficiency = both.length
    ? both.reduce((a, i) => a + span(i, "started_at", "closed_at"), 0) / both.reduce((a, i) => a + span(i, "created_at", "closed_at"), 0) : null;

  // Day buckets (weeks past 6 weeks): arrivals, departures and the cumulative flow at each bucket's end.
  const bucketDays = days > 42 ? 7 : 1;
  const buckets = [];
  for (let start = today - (Math.ceil(days / bucketDays) - 1) * bucketDays * DAY; start <= today; start += bucketDays * DAY) {
    const end = Math.min(start + bucketDays * DAY, now + 1);
    const flow = { open: 0, wip: 0, done: 0 };
    for (const i of work) {
      const c = time(i.created_at), s = time(i.started_at), d = i.status === "closed" ? time(i.closed_at) : null;
      if (c == null || c >= end) continue;
      if (d != null && d < end) flow.done++;
      else if (s != null && s < end) flow.wip++;
      else flow.open++;
    }
    buckets.push({ start, days: bucketDays, created: work.filter(i => { const c = time(i.created_at); return c != null && c >= start && c < end; }).length,
      closed: closed.filter(i => { const d = time(i.closed_at); return d >= start && d < end; }).length, flow });
  }

  const active = work.filter(i => i.status !== "closed");
  const sections = active.map(i => sectionOf(i, byId));
  const wip = { inProgress: sections.filter(s => s === "in_progress").length, open: sections.filter(s => s === "open").length,
    blocked: sections.filter(s => s === "blocked").length, deferred: sections.filter(s => s === "deferred").length };
  const aging = active.filter(i => sectionOf(i, byId) === "in_progress").map(i => ({ issue: i, age: now - (time(i.started_at) ?? time(i.created_at)) }))
    .sort((a, b) => b.age - a.age).map(a => ({ ...a, late: cycle.p85 != null && a.age > cycle.p85 }));
  const oldestOpen = active.filter(i => ["open", "blocked"].includes(sectionOf(i, byId))).map(i => ({ issue: i, age: now - time(i.created_at) }))
    .sort((a, b) => b.age - a.age).slice(0, 8);
  const throughputPerDay = closed.length / days, arrivalsPerDay = work.filter(i => inWindow(time(i.created_at))).length / days;

  const group = (keyOf) => {
    const rows = new Map();
    for (const i of work) for (const key of [].concat(keyOf(i))) {
      if (!rows.has(key)) rows.set(key, { key, closedItems: [], open: 0 });
      const r = rows.get(key);
      if (closed.includes(i)) r.closedItems.push(i); else if (i.status !== "closed") r.open++;
    }
    return [...rows.values()].filter(r => r.closedItems.length || r.open)
      .map(r => ({ key: r.key, closed: r.closedItems.length, open: r.open, leadP50: percentile(values(r.closedItems, "created_at", "closed_at"), 0.5) }))
      .sort((a, b) => b.closed - a.closed || b.open - a.open || String(a.key).localeCompare(String(b.key)));
  };

  return {
    days, from, now, bucketDays, buckets, closed, lead, cycle, queue, flowEfficiency, wip, aging, oldestOpen,
    throughputPerDay, arrivalsPerDay, leadHistogram: histogram(lead.values),
    slowest: closed.map(i => ({ issue: i, lead: span(i, "created_at", "closed_at") })).filter(x => x.lead != null).sort((a, b) => b.lead - a.lead).slice(0, 6),
    // Days to clear what's waiting and in progress at the current pace (Little's law), not a promise.
    forecastDays: throughputPerDay > 0 ? (wip.inProgress + wip.open + wip.blocked) / throughputPerDay : null,
    byType: group(i => i.issue_type ?? "task"),
    byPriority: group(i => typeof i.priority === "number" ? "P" + i.priority : "none").sort((a, b) => a.key.localeCompare(b.key)),
    byAssignee: group(i => i.assignee || "unassigned"),
    byLabel: group(i => (i.labels?.length ? i.labels : [])),
  };
}

// Lead-time ranges people think in.
export const RANGES = [
  { label: "< 1h", max: HOUR }, { label: "1–4h", max: 4 * HOUR }, { label: "4–24h", max: DAY }, { label: "1–3d", max: 3 * DAY },
  { label: "3–7d", max: 7 * DAY }, { label: "1–2w", max: 14 * DAY }, { label: "> 2w", max: Infinity },
];
export function histogram(values, ranges = RANGES) {
  const out = ranges.map(r => ({ ...r, count: 0 }));
  for (const v of values) out[out.findIndex(r => v < r.max)].count++;
  return out;
}

export function formatDuration(ms) {
  if (ms == null) return "—";
  const fixed = (v) => (v < 10 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toString());
  if (ms < HOUR) return Math.max(1, Math.round(ms / 60e3)) + "m";
  if (ms < 48 * HOUR) return fixed(ms / HOUR) + "h";
  if (ms < 14 * DAY) return fixed(ms / DAY) + "d";
  return fixed(ms / (7 * DAY)) + "w";
}
