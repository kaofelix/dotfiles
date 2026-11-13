// Pure beads logic: status sections, the filter language, sorting, the tree rows and relations.
// No herdr imports, so tests can load it directly.

export const SECTIONS = [
  { id: "in_progress", label: "In progress" },
  { id: "open", label: "Open" },
  { id: "blocked", label: "Blocked" },
  { id: "deferred", label: "Deferred" },
  { id: "closed", label: "Closed" },
];

export const SORTS = [
  { key: "auto", label: "Smart" },
  { key: "priority", label: "Priority" },
  { key: "updated", label: "Updated" },
  { key: "created", label: "Created" },
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
];

const DONE = new Set(["closed", "tombstone"]);
export const isDone = (issue) => DONE.has(issue?.status);
const blockerIds = (issue) => (issue.dependencies ?? []).filter(d => d.type === "blocks").map(d => d.depends_on_id);

// Where an issue is listed. An open issue waiting on an unfinished blocker is blocked.
export function sectionOf(issue, byId) {
  const s = issue.status;
  if (DONE.has(s)) return "closed";
  if (s === "in_progress" || s === "hooked") return "in_progress";
  if (s === "blocked") return "blocked";
  if (s === "deferred" || s === "pinned") return "deferred";
  if (blockerIds(issue).some(id => { const b = byId.get(id); return b && !isDone(b); })) return "blocked";
  return "open";
}

const lower = (v) => String(v ?? "").toLowerCase();
const has = (v, q) => lower(v).includes(q);

// "login type:bug -#ui p0 p:1-2 @alice is:closed" -> predicates (issue, section) => boolean, all must hold.
export function parseQuery(query) {
  const preds = [];
  for (const raw of String(query ?? "").trim().split(/\s+/).filter(Boolean)) {
    const neg = raw.length > 1 && raw.startsWith("-") ? true : false;
    const tok = lower(neg ? raw.slice(1) : raw);
    let m, pred;
    if ((m = /^(?:is|status|s):(.+)$/.exec(tok))) {
      const v = m[1].replace(/-/g, "_"), want = v === "wip" || v === "active" ? "in_progress" : v === "done" ? "closed" : v;
      pred = (i, sec) => sec === want || i.status === want || lower(i.issue_type) === want || (want === "ready" && sec === "open");
    } else if ((m = /^(?:type|t):(.+)$/.exec(tok))) pred = (i) => lower(i.issue_type).startsWith(m[1]);
    else if ((m = /^(?:p|priority:)(\d)$/.exec(tok)) || (m = /^p:(\d)$/.exec(tok))) pred = (i) => i.priority === Number(m[1]);
    else if ((m = /^p:(\d)-(\d)$/.exec(tok))) pred = (i) => i.priority >= Number(m[1]) && i.priority <= Number(m[2]);
    else if ((m = /^(?:@|assignee:)(.*)$/.exec(tok))) pred = m[1] ? (i) => has(i.assignee, m[1]) : (i) => !i.assignee;
    else if ((m = /^(?:#|label:)(.+)$/.exec(tok))) pred = (i) => (i.labels ?? []).some(l => has(l, m[1]));
    else if ((m = /^(?:parent|epic):(.+)$/.exec(tok))) pred = (i) => has(i.parent, m[1]);
    else pred = (i) => has(i.id, tok) || has(i.title, tok) || has(i.description, tok) || (i.labels ?? []).some(l => has(l, tok));
    preds.push(neg ? (i, s) => !pred(i, s) : pred);
  }
  return preds;
}

const time = (v) => (v ? Date.parse(v) || 0 : 0);
const naturalId = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true });
const priority = (i) => (typeof i.priority === "number" ? i.priority : 9);

export function comparator(sort, section) {
  const key = sort?.key ?? "auto", desc = Boolean(sort?.desc);
  if (key === "auto") {
    // Active work: most urgent first; closed: most recently closed first.
    if (section === "closed") return (a, b) => time(b.closed_at ?? b.updated_at) - time(a.closed_at ?? a.updated_at) || naturalId(a, b);
    return (a, b) => priority(a) - priority(b) || naturalId(a, b);
  }
  const by = {
    priority: (a, b) => priority(a) - priority(b),
    // Dates read newest first unless reversed.
    updated: (a, b) => time(b.updated_at) - time(a.updated_at),
    created: (a, b) => time(b.created_at) - time(a.created_at),
    id: naturalId,
    title: (a, b) => lower(a.title).localeCompare(lower(b.title)),
  }[key] ?? naturalId;
  return (a, b) => (desc ? -1 : 1) * (by(a, b) || naturalId(a, b));
}

export function index(issues) {
  const byId = new Map(issues.map(i => [i.id, i]));
  const kids = new Map();
  for (const i of issues) {
    if (!i.parent || !byId.has(i.parent) || i.parent === i.id) continue;
    if (!kids.has(i.parent)) kids.set(i.parent, []);
    kids.get(i.parent).push(i);
  }
  return { byId, kids };
}

// Flat rows for the list: a header per non-empty section, then that section's issues as a tree.
// Ancestors outside the section (or filtered out) still show, marked context, so a closed task
// stays grouped under its open epic.
export function buildRows(issues, { query = "", sort, collapsed = new Set(), hidden = new Set() } = {}) {
  const { byId } = index(issues);
  const preds = parseQuery(query);
  const sectionById = new Map(issues.map(i => [i.id, sectionOf(i, byId)]));
  const rows = [];
  for (const { id: section, label } of SECTIONS) {
    if (hidden.has(section)) continue;
    const members = issues.filter(i => sectionById.get(i.id) === section && preds.every(p => p(i, section)));
    if (!members.length) continue;
    const shown = new Set(), member = new Set(members.map(i => i.id));
    for (const i of members) {
      let cur = i, guard = 0;
      while (cur && !shown.has(cur.id) && guard++ < 64) { shown.add(cur.id); cur = cur.parent ? byId.get(cur.parent) : null; }
    }
    const children = new Map(), roots = [];
    for (const id of shown) {
      const i = byId.get(id), p = i.parent && shown.has(i.parent) && i.parent !== id ? i.parent : null;
      if (!p) roots.push(i);
      else { if (!children.has(p)) children.set(p, []); children.get(p).push(i); }
    }
    const cmp = comparator(sort, section);
    const sectionKey = `section:${section}`;
    rows.push({ kind: "section", key: sectionKey, id: section, label, count: members.length, collapsed: collapsed.has(sectionKey) });
    if (collapsed.has(sectionKey)) continue;
    const seen = new Set();
    const walk = (list, depth) => {
      for (const i of list.sort(cmp)) {
        if (seen.has(i.id)) continue;
        seen.add(i.id);
        const key = `${section}:${i.id}`, kids = children.get(i.id) ?? [];
        rows.push({ kind: "issue", key, section, issue: i, depth, context: !member.has(i.id), hasChildren: kids.length > 0, collapsed: collapsed.has(key) });
        if (kids.length && !collapsed.has(key)) walk(kids, depth + 1);
      }
    };
    walk(roots, 0);
  }
  return rows;
}

// Everything the detail view links to.
export function relations(issue, issues) {
  const { byId, kids } = index(issues);
  const get = (id) => byId.get(id) ?? { id, title: "(not loaded)", status: "unknown" };
  const deps = issue.dependencies ?? [];
  const children = [...(kids.get(issue.id) ?? [])].sort(comparator({ key: "id" }));
  const blocks = issues.filter(o => o.id !== issue.id && (o.dependencies ?? []).some(d => d.type === "blocks" && d.depends_on_id === issue.id));
  const related = [
    ...deps.filter(d => d.type !== "blocks" && d.type !== "parent-child").map(d => ({ ...get(d.depends_on_id), via: d.type })),
    ...issues.filter(o => o.id !== issue.id && (o.dependencies ?? []).some(d => d.depends_on_id === issue.id && d.type !== "blocks" && d.type !== "parent-child"))
      .map(o => ({ ...o, via: o.dependencies.find(d => d.depends_on_id === issue.id).type })),
  ];
  return {
    parent: issue.parent ? get(issue.parent) : null,
    children,
    blockedBy: blockerIds(issue).map(get),
    blocks,
    related,
    progress: children.length ? { closed: children.filter(isDone).length, total: children.length } : null,
  };
}

// "3h ago", "2d ago", or the date for anything older than a month.
export function ago(iso, now = Date.now()) {
  const t = time(iso);
  if (!t) return "";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}
