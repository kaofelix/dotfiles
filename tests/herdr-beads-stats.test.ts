import { describe, expect, test } from "bun:test";
import { computeStats, formatDuration, histogram, percentile } from "../home/dot_config/herdr-app/mods/beads/stats.js";

const H = 3600e3, D = 24 * H;
const now = new Date(2026, 10, 20, 12).getTime(); // local noon, so day buckets don't depend on the time zone
const at = (ms) => new Date(ms).toISOString();
const bead = (id, { created, started, closed, ...rest } = {}) => ({
  id, title: id, issue_type: "task", priority: 2, status: closed != null ? "closed" : started != null ? "in_progress" : "open",
  created_at: at(now - created), ...(started != null ? { started_at: at(now - started) } : {}), ...(closed != null ? { closed_at: at(now - closed) } : {}), ...rest,
});

describe("beads stats", () => {
  test("percentiles use the nearest rank", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect([percentile(xs, 0.5), percentile(xs, 0.85), percentile(xs, 0.95)]).toEqual([5, 9, 10]);
    expect(percentile([], 0.5)).toBeNull();
  });

  test("lead, cycle and queue time come from beads closed in the window, leaving epics out", () => {
    const issues = [
      bead("a", { created: 3 * D, started: 2 * D, closed: 1 * D }),        // lead 2d, cycle 1d, queue 1d
      bead("b", { created: 10 * H, closed: 4 * H }),                       // lead 6h, never started
      bead("c", { created: 40 * D, started: 39 * D, closed: 35 * D }),     // closed before the 7-day window
      bead("e", { created: 5 * D, closed: 1 * H, issue_type: "epic" }),
    ];
    const s = computeStats(issues, { now, windowDays: 7 });
    expect(s.closed.map(i => i.id)).toEqual(["b", "a"]); // most recently closed first
    expect(s.lead.values).toEqual([6 * H, 2 * D]);
    expect(s.cycle.values).toEqual([1 * D]);
    expect(s.queue.values).toEqual([1 * D]);
    expect(s.flowEfficiency).toBeCloseTo(0.5);
    expect(computeStats(issues, { now, windowDays: null }).closed.length).toBe(3);
  });

  test("throughput and arrivals are counted per day, with a cumulative flow at each day's end", () => {
    const issues = [
      bead("old", { created: 20 * D }),                                    // open the whole time
      bead("x", { created: 2 * D, started: 2 * D - H, closed: 1 * D }),    // closed yesterday
      bead("y", { created: 1 * D, started: 2 * H }),                       // in progress since today
    ];
    const s = computeStats(issues, { now, windowDays: 3 });
    expect(s.buckets.map(b => [b.created, b.closed])).toEqual([[1, 0], [1, 1], [0, 0]]);
    expect(s.buckets.map(b => [b.flow.open, b.flow.wip, b.flow.done])).toEqual([[1, 1, 0], [2, 0, 1], [1, 1, 1]]);
    expect(s.throughputPerDay).toBeCloseTo(1 / 3);
    expect(s.arrivalsPerDay).toBeCloseTo(2 / 3);
  });

  test("long windows group days into weeks", () => {
    const s = computeStats([bead("a", { created: 89 * D, closed: 79 * D })], { now, windowDays: 90 });
    expect(s.days).toBe(90);
    expect(s.bucketDays).toBe(7);
    expect(s.buckets.length).toBe(13);
    expect(s.buckets.reduce((n, b) => n + b.closed, 0)).toBe(1);
  });

  test("ageing work is ordered oldest first and flagged past the 85th percentile cycle time", () => {
    const issues = [
      ...[1, 2, 3, 4].map(n => bead("done" + n, { created: 5 * D, started: (n + 1) * H, closed: H / 2 })),
      bead("slow", { created: 3 * D, started: 2 * D }),
      bead("fresh", { created: 2 * H, started: H / 2 }),
      bead("waiting", { created: 9 * D }),
    ];
    const s = computeStats(issues, { now, windowDays: 30 });
    expect(s.aging.map(a => [a.issue.id, a.late])).toEqual([["slow", true], ["fresh", false]]);
    expect(s.oldestOpen.map(a => a.issue.id)).toEqual(["waiting"]);
    expect(s.wip).toMatchObject({ inProgress: 2, open: 1, blocked: 0 });
    expect(s.days).toBe(10); // the oldest bead is 9 days old
    expect(s.forecastDays).toBeCloseTo(3 / (4 / 10));
  });

  test("breakdowns group by type, priority, assignee and label", () => {
    const issues = [
      bead("b1", { created: 2 * D, closed: 1 * D, issue_type: "bug", priority: 0, assignee: "Ada", labels: ["ui"] }),
      bead("b2", { created: 5 * D, closed: 1 * D, issue_type: "bug", priority: 1, labels: ["ui", "api"] }),
      bead("f1", { created: 1 * D, issue_type: "feature", priority: 0, assignee: "Ada" }),
    ];
    const s = computeStats(issues, { now, windowDays: 30 });
    const row = (rows, key) => rows.find(r => r.key === key);
    expect(row(s.byType, "bug")).toMatchObject({ closed: 2, open: 0, leadP50: 1 * D });
    expect(row(s.byType, "feature")).toMatchObject({ closed: 0, open: 1, leadP50: null });
    expect(row(s.byPriority, "P0")).toMatchObject({ closed: 1, open: 1 });
    expect(row(s.byAssignee, "Ada")).toMatchObject({ closed: 1, open: 1 });
    expect(row(s.byAssignee, "unassigned")).toMatchObject({ closed: 1 });
    expect(row(s.byLabel, "ui").closed).toBe(2);
  });

  test("the filter narrows every number", () => {
    const issues = [bead("b", { created: 2 * D, closed: D, issue_type: "bug" }), bead("t", { created: 2 * D, closed: D })];
    expect(computeStats(issues, { now, windowDays: 7, query: "type:bug" }).closed.map(i => i.id)).toEqual(["b"]);
  });

  test("durations read in the largest sensible unit", () => {
    expect([formatDuration(25 * 60e3), formatDuration(3.5 * H), formatDuration(30 * H), formatDuration(3.2 * D), formatDuration(20 * D), formatDuration(null)])
      .toEqual(["25m", "3.5h", "30h", "3.2d", "2.9w", "—"]);
  });

  test("lead time histogram buckets by human ranges and keeps the slowest beads", () => {
    const counts = histogram([10 * 60e3, 2 * H, 5 * H, 30 * H, 4 * D, 20 * D]).map(b => b.count);
    expect(counts).toEqual([1, 1, 1, 1, 1, 0, 1]);
    const issues = [bead("quick", { created: 2 * H, closed: H }), bead("slow", { created: 6 * D, closed: H }), bead("mid", { created: 2 * D, closed: H })];
    expect(computeStats(issues, { now, windowDays: 30 }).slowest.map(s => s.issue.id)).toEqual(["slow", "mid", "quick"]);
  });

  test("a window longer than the project starts at its first bead, so rates aren't diluted", () => {
    const issues = [bead("a", { created: 4 * D, closed: 3 * D }), bead("b", { created: 2 * D, closed: 1 * D })];
    const s = computeStats(issues, { now, windowDays: 30 });
    expect(s.days).toBe(5);
    expect(s.buckets.length).toBe(5);
    expect(s.throughputPerDay).toBeCloseTo(2 / 5);
  });
});
