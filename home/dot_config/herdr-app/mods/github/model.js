// Pure GitHub dashboard logic: the searches behind each section, the GraphQL query, turning results into items and
// rows, the filter language, and parsing remotes. No herdr imports, so tests load it directly.

export const KINDS = [{ id: "pr", label: "PRs" }, { id: "issue", label: "Issues" }];
export const STATES = [{ id: "open", label: "Open" }, { id: "closed", label: "Closed" }, { id: "all", label: "All" }];

// Sections are searches; an item is listed under the first section that found it.
const S = {
  review: { id: "review", label: "Review requested", q: "review-requested:@me" },
  mine: { id: "mine", label: "Created by me", q: "author:@me" },
  reviewed: { id: "reviewed", label: "Reviewed by me", q: "reviewed-by:@me -author:@me" },
  assigned: { id: "assigned", label: "Assigned to me", q: "assignee:@me" },
  involved: { id: "involved", label: "Involved", q: "involves:@me" },
  others: { id: "others", label: "Everyone else", q: "" },
};
const SECTIONS = {
  me: { pr: [S.review, S.mine, S.reviewed, S.assigned, S.involved], issue: [S.assigned, S.mine, S.involved] },
  repo: { pr: [S.review, S.mine, S.others], issue: [S.assigned, S.mine, S.others] },
};
export const isRepoScope = (scope) => Boolean(scope) && scope !== "me";
export const sectionsFor = (kind, scope) => SECTIONS[isRepoScope(scope) ? "repo" : "me"][kind];

export function searchString(section, { kind, scope, state }) {
  return [kind === "pr" ? "is:pr" : "is:issue", state === "all" ? "" : "is:" + state,
    isRepoScope(scope) ? "repo:" + scope : "archived:false", section.q, "sort:updated-desc"].filter(Boolean).join(" ");
}

// Every section of both kinds, so the kind switch shows counts and flips without a wait. Each section is its own
// request: GitHub's GraphQL gives up after about 10 s, which one search of 50 heavy pull requests can take on its own.
export const PAGE = 25, SMALL_PAGE = 10;
export function plan(scope, state) {
  const out = [];
  for (const { id: kind } of KINDS) for (const section of sectionsFor(kind, scope))
    out.push({ key: kind + "_" + section.id, kind, section, search: searchString(section, { kind, scope, state }) });
  return out;
}

const FRAGMENTS = `
fragment PR on PullRequest { __typename id number title url state isDraft createdAt updatedAt closedAt mergedAt
  author { login } repository { nameWithOwner isPrivate } headRefName baseRefName additions deletions changedFiles
  reviewDecision mergeable comments { totalCount } milestone { number title }
  labels(first: 8) { nodes { name color } } assignees(first: 5) { nodes { login } }
  reviewRequests(first: 8) { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
fragment IS on Issue { __typename id number title url state stateReason createdAt updatedAt closedAt
  author { login } repository { nameWithOwner isPrivate } comments { totalCount } milestone { number title }
  labels(first: 8) { nodes { name color } } assignees(first: 5) { nodes { login } } }`;

export function sectionQuery() {
  return FRAGMENTS + "\nquery($q: String!, $first: Int!, $after: String) {\n  viewer { login }\n"
    + "  search(type: ISSUE, query: $q, first: $first, after: $after) { issueCount pageInfo { endCursor hasNextPage } nodes { ...PR ...IS } }\n"
    + "  rateLimit { cost remaining resetAt }\n}";
}

// Milestones: a repository's, open ones by due date (undated last), then closed ones, most recently closed first.
export const MILESTONES_QUERY = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {
  milestones(first: 50, states: [OPEN, CLOSED], orderBy: {field: DUE_DATE, direction: ASC}) { nodes { id number title url state dueOn closedAt description
    open: issues(states: OPEN) { totalCount } closed: issues(states: CLOSED) { totalCount } prs: pullRequests(states: OPEN) { totalCount } } } } }`;
export function normalizeMilestones(data) {
  const list = (data?.repository?.milestones?.nodes ?? []).filter(Boolean).map(m => ({
    id: m.id, number: m.number, title: m.title ?? "", url: m.url, state: m.state === "CLOSED" ? "closed" : "open", due: m.dueOn ?? null, closedAt: m.closedAt ?? null,
    description: m.description ?? "", open: m.open?.totalCount ?? 0, closed: m.closed?.totalCount ?? 0, prs: m.prs?.totalCount ?? 0 }));
  const dueAt = (x) => time(x.due) || Infinity;
  return [...list.filter(x => x.state === "open").sort((x, y) => dueAt(x) - dueAt(y) || x.number - y.number),
    ...list.filter(x => x.state === "closed").sort((x, y) => time(y.closedAt) - time(x.closedAt))];
}
// A milestone's open work. Pull requests can't be ordered here (GitHub errors), so they're sorted after.
export const MILESTONE_ITEMS_QUERY = FRAGMENTS + `
query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { milestone(number: $number) {
  issues(states: OPEN, first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) { totalCount nodes { ...IS issueType { name } parent { id number title url } subIssuesSummary { total completed } } }
  pullRequests(states: OPEN, first: 30) { totalCount nodes { ...PR } } } } }`;
export function milestoneItems(data) {
  const ms = data?.repository?.milestone;
  const byUpdated = (x, y) => time(y.updatedAt) - time(x.updatedAt);
  return { issues: (ms?.issues?.nodes ?? []).filter(Boolean).map(normalize), prs: (ms?.pullRequests?.nodes ?? []).filter(Boolean).map(normalize).sort(byUpdated),
    issueTotal: ms?.issues?.totalCount ?? 0, prTotal: ms?.pullRequests?.totalCount ?? 0 };
}
// Sub-issues of a milestone's epics: often not in the milestone themselves (the epic is), so asked for separately and
// only for epics with open ones. Aliased per epic, in one request.
export function subIssuesQuery(ids) {
  // GitHub refuses a fragment that's defined but unused: only the issue one goes in.
  return FRAGMENTS.slice(FRAGMENTS.indexOf("fragment IS")) + "\nquery {\n" + ids.map((id, n) => "  e" + n + ": node(id: " + JSON.stringify(id) + ") { ... on Issue { id subIssues(first: 50) { nodes { ...IS issueType { name } subIssuesSummary { total completed } } } } }").join("\n") + "\n}";
}
export function subIssuesOf(data, ids) {
  const out = new Map();
  ids.forEach((id, n) => out.set(id, (data?.["e" + n]?.subIssues?.nodes ?? []).filter(Boolean).map(x => ({ ...normalize(x), parent: { id, number: null } }))));
  return out;
}
// Folds epics' open sub-issues into a milestone's issues (once each; those already there keep their own record).
export function withSubIssues(issues, subs) {
  if (!subs?.size) return issues;
  const have = new Set(issues.map(i => i.id)), out = [...issues];
  for (const [parentId, kids] of subs) {
    const parent = issues.find(i => i.id === parentId);
    for (const k of kids) if (!isClosed(k) && !have.has(k.id)) { have.add(k.id); out.push({ ...k, parent: { id: parentId, number: parent?.number ?? null, title: parent?.title ?? "" }, borrowed: true }); }
  }
  return out;
}
export const isEpic = (i) => ["epic", "initiative"].includes(lower(i.type)) || Boolean(i.subs);

// By epic: each epic (or any parent) heads its sub-issues; a parent outside the milestone still heads its children
// here, as a group row. Everything else is "Other open work", last.
export function epicGroups(issues) {
  const inside = new Map(issues.map(i => [i.id, i])), groups = new Map(), other = [];
  const group = (id, make) => { if (!groups.has(id)) groups.set(id, { ...make(), items: [] }); return groups.get(id); };
  for (const i of issues) {
    if (i.parent) group(i.parent.id, () => inside.has(i.parent.id) ? { key: i.parent.id, head: inside.get(i.parent.id) } : { key: i.parent.id, parent: i.parent }).items.push(i);
    else if (isEpic(i) || issues.some(x => x.parent?.id === i.id)) group(i.id, () => ({ key: i.id, head: i })).head = i;
    else other.push(i);
  }
  // A head that's also someone's child stays with its own group.
  const out = [...groups.values()].map(g => ({ ...g, items: g.items.filter(i => !groups.has(i.id) || i.id === g.key) }));
  if (other.length) out.push({ key: "other", label: "Other open work", items: other });
  return out;
}

// By owner: each assignee's issues (an issue with two shows under both), most work first; unassigned last.
export function ownerGroups(issues) {
  const groups = new Map(), none = [];
  for (const i of issues) {
    if (!i.assignees.length) none.push(i);
    for (const a of i.assignees) { if (!groups.has(a)) groups.set(a, []); groups.get(a).push(i); }
  }
  const out = [...groups.entries()].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0])).map(([a, items]) => ({ key: "@" + a, label: a, owner: a, items }));
  if (none.length) out.push({ key: "@", label: "Unassigned", unassigned: true, items: none });
  return out;
}

// The Milestones tab: a row per milestone (by the state switch), and under each expanded one its open work by epic or
// by owner, then its open pull requests. Items show their owners, so gaps are visible.
export function milestoneRows(milestones, items, { state = "open", expanded = new Set(), byOwner = false, query = "", login = null } = {}) {
  const preds = parseQuery(query, login), rows = [];
  for (const m of (milestones ?? []).filter(x => state === "all" || x.state === state)) {
    const key = "ms:" + m.number, open = expanded.has(m.number);
    rows.push({ kind: "milestone", key, milestone: m, expanded: open });
    if (!open) continue;
    const got = items?.get(m.number);
    if (!got || got.loading && !got.issues) { rows.push({ kind: "note", key: key + ":note", loading: true, depth: 1 }); continue; }
    if (got.error && !got.issues) { rows.push({ kind: "note", key: key + ":note", text: "Couldn't load: " + got.error, error: true, depth: 1 }); continue; }
    const issues = withSubIssues(got.issues, got.subs).filter(i => preds.every(p => p(i))), prs = got.prs.filter(i => preds.every(p => p(i)));
    if (!issues.length && !prs.length) { rows.push({ kind: "note", key: key + ":note", text: query ? "Nothing here matches this filter." : "Nothing open in this milestone.", depth: 1 }); continue; }
    for (const g of byOwner ? ownerGroups(issues) : epicGroups(issues)) {
      const gkey = key + ":g:" + g.key;
      if (g.head) rows.push({ kind: "item", key: gkey, section: key, item: g.head, depth: 1, owner: true, epic: true });
      else rows.push({ kind: "group", key: gkey, label: g.label ?? null, parent: g.parent ?? null, count: g.items.length, unassigned: Boolean(g.unassigned), depth: 1 });
      for (const i of g.items) if (i.id !== g.head?.id) rows.push({ kind: "item", key: gkey + ":" + i.id, section: key, item: i, depth: 2, owner: true });
    }
    if (prs.length) {
      rows.push({ kind: "group", key: key + ":prs", label: "Open pull requests", count: prs.length, depth: 1 });
      for (const i of prs) rows.push({ kind: "item", key: key + ":prs:" + i.id, section: key, item: i, depth: 2, owner: true });
    }
    if (got.issueTotal > got.issues.length) rows.push({ kind: "note", key: key + ":more", text: (got.issueTotal - got.issues.length) + " more open issues on GitHub", url: m.url, depth: 1 });
  }
  return rows;
}

// Projects (v2) linked to a repository, for links in its header: they live on GitHub.
export const PROJECTS_QUERY = "query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { projectsV2(first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number title url closed } } } }";
export const projectsOf = (data) => (data?.repository?.projectsV2?.nodes ?? []).filter(Boolean)
  .map(p => ({ number: p.number, title: p.title, url: p.url, closed: Boolean(p.closed) })).sort((x, y) => Number(x.closed) - Number(y.closed));

export const REPOS_QUERY = "query { viewer { login repositories(first: 30, orderBy: {field: PUSHED_AT, direction: DESC}, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) { nodes { nameWithOwner } } } }";

export const DETAIL_QUERY = `query($id: ID!) { node(id: $id) {
  ... on PullRequest { body mergeStateStatus mergeable reviewDecision mergedAt mergedBy { login } mergeCommit { oid abbreviatedOid url }
    reviewThreads(first: 100) { totalCount nodes { isResolved } }
    comments(last: 10) { totalCount nodes { author { login } body createdAt url } }
    latestOpinionatedReviews(first: 20) { nodes { author { login } state submittedAt } }
    closingIssuesReferences(first: 10) { nodes { number title url state stateReason repository { nameWithOwner } } }
    commits(last: 1) { nodes { commit { oid statusCheckRollup { state contexts(first: 80) { nodes { __typename
      ... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } }
      ... on StatusContext { context state targetUrl } } } } } } } }
  ... on Issue { body
    comments(last: 10) { totalCount nodes { author { login } body createdAt url } }
    timelineItems(itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT], last: 15) { nodes {
      ... on CrossReferencedEvent { source { ... on PullRequest { __typename number title url state isDraft repository { nameWithOwner } } ... on Issue { __typename number title url state stateReason repository { nameWithOwner } } } }
      ... on ConnectedEvent { subject { ... on PullRequest { __typename number title url state isDraft repository { nameWithOwner } } ... on Issue { __typename number title url state stateReason repository { nameWithOwner } } } } } } }
} }`;

const CI = { SUCCESS: "pass", FAILURE: "fail", ERROR: "fail", PENDING: "pending", EXPECTED: "pending" };
const REVIEW = { APPROVED: "approved", CHANGES_REQUESTED: "changes", REVIEW_REQUIRED: "required" };

// "open" | "draft" | "merged" | "closed" for a pull request; "open" | "completed" | "not_planned" | "duplicate" for an issue.
export function stateOf(n) {
  if (n.__typename === "PullRequest") return n.state === "MERGED" ? "merged" : n.state === "CLOSED" ? "closed" : n.isDraft ? "draft" : "open";
  if (n.state === "OPEN") return "open";
  return { NOT_PLANNED: "not_planned", DUPLICATE: "duplicate" }[n.stateReason] ?? "completed";
}
export const isClosed = (item) => !["open", "draft"].includes(item.state);

export function normalize(n) {
  const pr = n.__typename === "PullRequest";
  return {
    id: n.id, kind: pr ? "pr" : "issue", repo: n.repository?.nameWithOwner ?? "", private: Boolean(n.repository?.isPrivate),
    number: n.number, title: n.title ?? "", url: n.url, state: stateOf(n), author: n.author?.login ?? "ghost",
    labels: (n.labels?.nodes ?? []).map(l => ({ name: l.name, color: l.color })),
    assignees: (n.assignees?.nodes ?? []).map(a => a.login),
    reviewers: (n.reviewRequests?.nodes ?? []).map(r => r.requestedReviewer?.login ?? (r.requestedReviewer?.slug && "@" + r.requestedReviewer.slug)).filter(Boolean),
    ci: CI[n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state] ?? null,
    review: REVIEW[n.reviewDecision] ?? null, conflicts: n.mergeable === "CONFLICTING",
    comments: n.comments?.totalCount ?? 0, additions: n.additions ?? null, deletions: n.deletions ?? null, files: n.changedFiles ?? null,
    head: n.headRefName ?? null, base: n.baseRefName ?? null,
    milestone: n.milestone ? { number: n.milestone.number, title: n.milestone.title ?? "" } : null,
    // Planning, from milestone queries: the issue type (Epic, Task…), its parent issue and its sub-issues' progress.
    type: n.issueType?.name ?? null, parent: n.parent ? { id: n.parent.id, number: n.parent.number, title: n.parent.title ?? "", url: n.parent.url ?? null } : null,
    subs: n.subIssuesSummary?.total ? { total: n.subIssuesSummary.total, completed: n.subIssuesSummary.completed ?? 0 } : null,
    createdAt: n.createdAt, updatedAt: n.updatedAt, closedAt: n.mergedAt ?? n.closedAt ?? null,
  };
}

// A scope and state's results: items by id, and per kind its sections in order, each with the ids it fetched so far
// (an item may be in several; the list shows it under the first), its cursor and whether more pages are left.
export function emptyResult(p) {
  const sections = { pr: [], issue: [] };
  for (const x of p) sections[x.kind].push({ key: x.key, id: x.section.id, label: x.section.label, kind: x.kind, search: x.search,
    total: 0, ids: [], cursor: null, hasMore: false, pages: 0, loaded: false, error: null });
  return { login: null, items: new Map(), sections };
}

export const sectionOf = (result, key) => [...result.sections.pr, ...result.sections.issue].find(s => s.key === key) ?? null;

// Folds one page of a section's search into the result. A first page again (a refresh) puts its items first and keeps
// the later pages already loaded, so polling never takes back what "Load more" showed.
export function applyPage(result, key, data, append = false) {
  const s = sectionOf(result, key), r = data?.search;
  if (!s || !r) return result;
  const ids = [];
  for (const node of r.nodes ?? []) {
    if (!node?.id) continue;
    result.items.set(node.id, normalize(node));
    if (!ids.includes(node.id)) ids.push(node.id);
  }
  const next = { cursor: r.pageInfo?.endCursor ?? null, hasMore: Boolean(r.pageInfo?.hasNextPage) };
  if (append) { s.ids = [...s.ids, ...ids.filter(id => !s.ids.includes(id))]; Object.assign(s, next); s.pages++; }
  else if (s.pages > 1) s.ids = [...ids, ...s.ids.filter(id => !ids.includes(id))];
  else { s.ids = ids; Object.assign(s, next); s.pages = 1; }
  s.total = r.issueCount ?? s.total; s.loaded = true; s.error = null; s.seeded = false;
  result.login = data.viewer?.login ?? result.login;
  return result;
}

// For localStorage, and back. A saved result whose sections no longer match the plan is dropped.
export function serialize(result) {
  return { login: result.login, items: [...result.items.values()], sections: result.sections };
}
export function deserialize(saved, p) {
  const keys = p.map(x => x.key).join(","), got = [...(saved?.sections?.pr ?? []), ...(saved?.sections?.issue ?? [])].map(s => s.key).join(",");
  if (!saved?.items || keys !== got) return null;
  const sections = { pr: saved.sections.pr.map(s => ({ ...s, error: null })), issue: saved.sections.issue.map(s => ({ ...s, error: null })) };
  return { login: saved.login ?? null, items: new Map(saved.items.map(i => [i.id, i])), sections };
}

// A first look at a scope's state from what its other states already hold: Open after All shows All's open items,
// All after Open shows what Open and Closed had. Sections match by id across states; the first refresh replaces it
// (pages stay 0, so applyPage takes the fetched page as is). Null when the others hold nothing.
export const STATE_MATCH = { open: (i) => !isClosed(i), closed: (i) => isClosed(i), all: () => true };
export function seedResult(p, state, sources) {
  const usable = sources.filter(isLoaded);
  if (!usable.length) return null;
  const result = emptyResult(p), keep = STATE_MATCH[state] ?? STATE_MATCH.all;
  for (const s of [...result.sections.pr, ...result.sections.issue]) {
    const ids = [];
    for (const src of usable) {
      const from = sectionOf(src, s.key);
      for (const id of from?.ids ?? []) {
        const item = src.items.get(id);
        if (!item || ids.includes(id) || !keep(item)) continue;
        ids.push(id);
        if (!result.items.has(id) || time(result.items.get(id).updatedAt) < time(item.updatedAt)) result.items.set(id, item);
      }
    }
    s.ids = ids.sort((a, b) => time(result.items.get(b).updatedAt) - time(result.items.get(a).updatedAt));
    s.total = ids.length; s.loaded = true; s.seeded = true;
  }
  result.login = usable.find(r => r.login)?.login ?? null;
  return result;
}

export const isLoaded = (result) => Boolean(result) && [...result.sections.pr, ...result.sections.issue].some(s => s.loaded);

const lower = (v) => String(v ?? "").toLowerCase();
const has = (v, q) => lower(v).includes(q);

// Words of a filter; a value in quotes keeps its spaces: label:"area: ci" milestone:"GTC DC".
export const tokens = (query) => String(query ?? "").match(/-?[^\s"]*"[^"]*"?|\S+/g) ?? [];
const unquote = (v) => v.replace(/"/g, "");

// "login repo:nemo -#bug @alice is:draft ci:fail review:approved milestone:"GTC DC" no:milestone 123" -> predicates, all must hold.
export function parseQuery(query, login = null) {
  const preds = [];
  for (const raw of tokens(query)) {
    const neg = raw.length > 1 && raw.startsWith("-"), tok = unquote(lower(neg ? raw.slice(1) : raw));
    if (!tok) continue;
    let m, pred;
    const who = (v) => (v === "me" || v === "@me") && login ? lower(login) : v;
    if ((m = /^repo:(.+)$/.exec(tok))) pred = (i) => has(i.repo, m[1]);
    else if ((m = /^(?:org|owner):(.+)$/.exec(tok))) pred = (i) => lower(i.repo.split("/")[0]).startsWith(m[1]);
    else if ((m = /^(?:@|author:)(.+)$/.exec(tok))) { const w = who(m[1]); pred = (i) => has(i.author, w); }
    else if ((m = /^assignee:(.+)$/.exec(tok))) { const w = who(m[1]); pred = (i) => i.assignees.some(a => has(a, w)); }
    else if (/^#?\d+$/.test(tok)) pred = (i) => String(i.number).startsWith(tok.replace("#", ""));
    else if ((m = /^(?:#|label:)(.+)$/.exec(tok))) pred = (i) => i.labels.some(l => has(l.name, m[1]));
    else if ((m = /^(?:is|state):(.+)$/.exec(tok))) {
      const v = m[1];
      pred = (i) => v === "closed" ? isClosed(i) : v === "private" ? i.private : v === "pr" ? i.kind === "pr" : v === "issue" ? i.kind === "issue"
        : v === "conflict" ? i.conflicts : i.state === v.replace("-", "_");
    } else if ((m = /^(?:milestone|ms):(.+)$/.exec(tok))) pred = (i) => has(i.milestone?.title, m[1]);
    else if ((m = /^type:(.+)$/.exec(tok))) pred = (i) => lower(i.type) === m[1];
    else if ((m = /^no:(.+)$/.exec(tok))) pred = (i) => m[1] === "milestone" ? !i.milestone : m[1] === "assignee" ? !i.assignees.length : m[1] === "label" ? !i.labels.length : true;
    else if ((m = /^ci:(.+)$/.exec(tok))) pred = (i) => i.ci === ({ failing: "fail", failure: "fail", success: "pass", ok: "pass" }[m[1]] ?? m[1]);
    else if ((m = /^review:(.+)$/.exec(tok))) pred = (i) => i.review === ({ changes_requested: "changes", required: "required", none: null }[m[1]] ?? m[1]);
    else pred = (i) => has(i.title, tok) || has(i.repo, tok) || has(i.author, tok) || has(i.head, tok) || i.labels.some(l => has(l.name, tok));
    preds.push(neg ? (i) => !pred(i) : pred);
  }
  return preds;
}

const time = (v) => (v ? Date.parse(v) || 0 : 0);

// The filter word a chip stands for, and adding or taking it away (clicking a chip twice undoes it).
export function filterToken(field, value) {
  const v = String(value ?? ""), q = /[\s"]/.test(v) ? '"' + v.replace(/"/g, "") + '"' : v;
  return { label: /[\s"]/.test(v) ? "label:" + q : "#" + v, milestone: "milestone:" + q, repo: "repo:" + q, author: "@" + q, assignee: "assignee:" + q,
    review: "review:" + q, type: "type:" + q.toLowerCase(), ci: "ci:" + q }[field] ?? q;
}
const same = (x, y) => lower(unquote(x)) === lower(unquote(y));
export const hasToken = (query, token) => tokens(query).some(w => same(w, token));
export function toggleToken(query, token) {
  const words = tokens(query);
  return (words.some(w => same(w, token)) ? words.filter(w => !same(w, token)) : [...words, token]).join(" ");
}

// Pinned pull requests and issues, refreshed by id (in one request) since they may be in no list at all.
export const nodesQuery = (ids) => FRAGMENTS + "\nquery {\n  nodes(ids: " + JSON.stringify(ids) + ") { ...PR ...IS }\n}";
export const nodesOf = (data) => (data?.nodes ?? []).filter(n => n?.id).map(normalize);

// Flat rows for the list: a header per section with matches, its items (optionally under repo headers), then a
// "more" row when the section has pages left or failed. Sections still loading show just their header.
export function buildRows(result, kind, { query = "", collapsed = new Set(), group = false, repo = null } = {}) {
  if (!result) return [];
  const preds = parseQuery(query, result.login), rows = [], taken = new Set();
  for (const s of result.sections[kind] ?? []) {
    const fresh = s.ids.filter(id => !taken.has(id));
    for (const id of fresh) taken.add(id);
    const items = fresh.map(id => result.items.get(id)).filter(i => i && (!repo || i.repo === repo) && preds.every(p => p(i)));
    const key = "section:" + s.id;
    // A seeded section (borrowed from another state) doesn't know its total or whether there's more until its page lands.
    const pending = Boolean(s.seeded) && !s.error;
    const header = { kind: "section", key, id: s.id, sectionKey: s.key, label: s.label, count: items.length, truncated: s.hasMore && !pending, total: s.total, search: s.search, collapsed: collapsed.has(key), loading: !s.loaded && !s.error, pending };
    const tail = pending ? { kind: "more", key: "more:" + s.id, section: s.id, sectionKey: s.key, pending: true }
      : (s.error || s.hasMore) ? { kind: "more", key: "more:" + s.id, section: s.id, sectionKey: s.key, loaded: s.ids.length, total: s.total, error: s.error, retry: !s.loaded } : null;
    // Borrowed items that don't include any of this section's: it's still loading, as far as anyone can tell.
    if (pending && !items.length) header.loading = true;
    if (header.loading) { if (!query) rows.push(header); continue; }
    if (!items.length && !(tail && !query)) continue;
    rows.push(header);
    if (header.collapsed) continue;
    if (!group) for (const i of items) rows.push({ kind: "item", key: s.id + ":" + i.id, section: s.id, item: i, depth: 0 });
    else {
      const byRepo = new Map();
      for (const i of items) { if (!byRepo.has(i.repo)) byRepo.set(i.repo, []); byRepo.get(i.repo).push(i); }
      const repos = [...byRepo.entries()].sort((a, b) => time(b[1][0].updatedAt) - time(a[1][0].updatedAt) || a[0].localeCompare(b[0]));
      for (const [name, list] of repos) {
        const rkey = "repo:" + s.id + ":" + name;
        rows.push({ kind: "repo", key: rkey, section: s.id, repo: name, count: list.length, collapsed: collapsed.has(rkey) });
        if (!collapsed.has(rkey)) for (const i of list) rows.push({ kind: "item", key: s.id + ":" + i.id, section: s.id, item: i, depth: 1 });
      }
    }
    if (tail) rows.push(tail);
  }
  return rows;
}

// Distinct items of a kind (optionally in one repo), for the kind switch; more: some section has pages left.
export function kindCount(result, kind, repo = null) {
  const ids = new Set();
  for (const s of result?.sections[kind] ?? []) for (const id of s.ids) if (!repo || result.items.get(id)?.repo === repo) ids.add(id);
  return ids.size;
}
export const kindHasMore = (result, kind) => (result?.sections[kind] ?? []).some(s => s.hasMore);
// Every section of a kind has its own answer (or failed): only then is an empty list really empty.
export const kindSettled = (result, kind) => (result?.sections[kind] ?? []).every(s => (s.loaded && !s.seeded) || s.error);
// Home: a block per kind with my open work in one list (review requests first, tagged; then newest first), its first
// few items, and "View all" for the full list. A block with nothing yet says whether it's still loading.
export const HOME_LIMIT = 8;
export function homeRows(result, { query = "", collapsed = new Set(), limit = HOME_LIMIT, pinned = [] } = {}) {
  if (!result) return [];
  const preds = parseQuery(query, result.login), rows = [];
  // Pinned items come first, in their own block, only when there are any.
  if (pinned.length) {
    const shown = pinned.filter(i => preds.every(p => p(i))), key = "block:pinned";
    rows.push({ kind: "block", key, id: "pinned", label: "Pinned", count: shown.length, shown: shown.length, more: false, pending: false, collapsed: collapsed.has(key) });
    if (!collapsed.has(key)) {
      if (!shown.length) rows.push({ kind: "note", key: "note:pinned", text: "No pinned item matches this filter." });
      for (const i of shown) rows.push({ kind: "item", key: "pin:" + i.id, section: "home-pinned", item: i, depth: 0, showRepo: true });
    }
  }
  for (const { id: kind } of KINDS) {
    const seen = new Set(), review = [], rest = [];
    for (const s of result.sections[kind] ?? []) for (const id of s.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const i = result.items.get(id);
      if (i && preds.every(p => p(i))) (s.id === "review" ? review : rest).push(i);
    }
    rest.sort((x, y) => time(y.updatedAt) - time(x.updatedAt));
    const all = [...review, ...rest], key = "block:" + kind;
    rows.push({ kind: "block", key, id: kind, label: kind === "pr" ? "Pull requests" : "Issues", count: all.length, shown: Math.min(limit, all.length),
      more: kindHasMore(result, kind), pending: kindPending(result, kind) || !kindSettled(result, kind), collapsed: collapsed.has(key) });
    if (collapsed.has(key)) continue;
    if (!all.length) { rows.push({ kind: "note", key: "note:" + kind, loading: !kindSettled(result, kind), text: query ? "Nothing matches this filter." : kind === "pr" ? "No open pull requests." : "No open issues." }); continue; }
    for (const i of all.slice(0, limit)) rows.push({ kind: "item", key: "home:" + i.id, section: "home-" + kind, item: i, depth: 0, tag: review.includes(i) ? "to review" : null, showRepo: true });
  }
  return rows;
}

// Some section still shows another state's items: its count isn't known yet.
export const kindPending = (result, kind) => (result?.sections[kind] ?? []).some(s => s.seeded && !s.error);

// Repositories in a kind's sections, most items first: [{ repo, count }].
export function repoCounts(result, kind) {
  const counts = new Map(), seen = new Set();
  for (const s of result?.sections[kind] ?? []) for (const id of s.ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const r = result.items.get(id)?.repo;
    if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return [...counts.entries()].map(([repo, count]) => ({ repo, count })).sort((a, b) => b.count - a.count || a.repo.localeCompare(b.repo));
}

// "owner/name" from a github.com remote URL (https, ssh or scp-like), else null.
export function repoFromRemote(url) {
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(String(url ?? "").trim());
  return m ? m[1] + "/" + m[2] : null;
}

// From `git remote -v` lines: upstream (where a fork's pull requests go), then origin, then any GitHub remote.
export function repoFromRemotes(lines) {
  const found = new Map();
  for (const line of lines) {
    const [name, url] = line.trim().split(/\s+/);
    const repo = repoFromRemote(url);
    if (repo && !found.has(name)) found.set(name, repo);
  }
  return found.get("upstream") ?? found.get("origin") ?? found.values().next().value ?? null;
}

// The scope dropdown: all my work, pinned repositories, the one shown, those in my results (with counts), recently
// pushed ones. A query narrows by name; an "owner/name" not listed is offered as is, so any repository can be opened.
export const REPO_NAME = /^[\w.-]+\/[\w.-]+$/;
export function scopeOptions({ login = null, pins = [], current = "me", counts = [], recent = [], query = "" } = {}) {
  const out = [], seen = new Set();
  const add = (id, label, note, group) => { if (id && !seen.has(id)) { seen.add(id); out.push({ id, label, note, group, pinned: pins.includes(id) }); } };
  add("me", "Home", login ? "@" + login : "", "me");
  const count = new Map(counts.map(c => [c.repo, c.count]));
  for (const p of pins) add(p, p, count.has(p) ? String(count.get(p)) : "", "pinned");
  if (isRepoScope(current)) add(current, current, count.has(current) ? String(count.get(current)) : "", "repos");
  for (const { repo, count: n } of counts) add(repo, repo, String(n), "repos");
  for (const r of recent) add(r, r, "recent", "repos");
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return out;
  const hits = out.filter(o => o.id.toLowerCase().includes(q) || (o.id === "me" && "home · all my work · mine".includes(q)));
  if (REPO_NAME.test(q) && !out.some(o => o.id.toLowerCase() === q)) hits.push({ id: query.trim(), label: query.trim(), note: "open", group: "repos", pinned: false });
  return hits;
}
// Short names for a list of repositories: just the name, unless two share it (then owner/name).
export function shortNames(ids) {
  const names = new Map();
  for (const id of ids) { const n = id.split("/")[1] ?? id; names.set(n, (names.get(n) ?? 0) + 1); }
  return new Map(ids.map(id => { const n = id.split("/")[1] ?? id; return [id, names.get(n) > 1 ? id : n]; }));
}
export const togglePin = (pins, repo) => !isRepoScope(repo) ? pins : pins.includes(repo) ? pins.filter(p => p !== repo) : [...pins, repo];

// Avatars are downloaded once into the cache folder and shown from there: a file name safe for any login ("app[bot]").
export const avatarFile = (login) => String(login ?? "").replace(/[^A-Za-z0-9._-]/g, "_") + ".png";
export const avatarUrl = (login) => "https://github.com/" + encodeURIComponent(String(login ?? "").replace(/\[bot\]$/, "")) + ".png?size=64";
export const initials = (login) => String(login ?? "?").replace(/\[bot\]$/, "").split(/[-_.]/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";

// Where a pull request is being worked on: the panes whose folder is a clone of its repository on its head branch.
// places: [{ repo, branch, pane, tab, space, spaceName, tabName, status, focused, active, changedAt }] (one per pane,
// from Herdr's panes and the folders' remotes). Grouped per tab, the shown/most recently changed first.
const STATUS_RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
export function workPlaces(item, places) {
  if (item?.kind !== "pr" || !item.head) return [];
  const tabs = new Map();
  for (const p of places ?? []) {
    if (p.repo !== item.repo || p.branch !== item.head) continue;
    const t = tabs.get(p.tab) ?? { ...p, panes: [] };
    t.panes.push(p.pane);
    if ((STATUS_RANK[p.status] ?? 9) < (STATUS_RANK[t.status] ?? 9)) t.status = p.status;
    t.focused = t.focused || p.focused; t.changedAt = Math.max(t.changedAt ?? 0, p.changedAt ?? 0);
    tabs.set(p.tab, t);
  }
  return [...tabs.values()].sort((x, y) => Number(y.focused) - Number(x.focused) || Number(y.active) - Number(x.active) || (y.changedAt ?? 0) - (x.changedAt ?? 0));
}

export const ref = (item) => item.repo + "#" + item.number;
export const searchUrl = (search, kind) => "https://github.com/search?q=" + encodeURIComponent(search) + "&type=" + (kind === "pr" ? "pullrequests" : "issues");
export const repoUrl = (repo, kind) => "https://github.com/" + repo + (kind === "issue" ? "/issues" : "/pulls");

const CHECK_ORDER = { fail: 0, pending: 1, pass: 2, cancelled: 3, skipped: 4 };
function checkState(c) {
  if (c.__typename === "StatusContext") return CI[c.state] ?? "pending";
  if (c.status !== "COMPLETED") return "pending";
  return { SUCCESS: "pass", FAILURE: "fail", TIMED_OUT: "fail", STARTUP_FAILURE: "fail", ACTION_REQUIRED: "fail", CANCELLED: "cancelled", SKIPPED: "skipped", NEUTRAL: "skipped", STALE: "skipped" }[c.conclusion] ?? "pending";
}
const linkOf = (n) => n && n.number ? { kind: n.__typename === "Issue" ? "issue" : "pr", repo: n.repository?.nameWithOwner ?? "", number: n.number, title: n.title ?? "", url: n.url, state: stateOf({ ...n, __typename: n.__typename ?? "Issue" }) } : null;

// What the detail view adds to an item: body, checks (failing first), latest reviews, comments and linked work.
export function normalizeDetail(node) {
  if (!node) return null;
  const contexts = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [];
  const checks = contexts.map(c => ({
    name: c.__typename === "StatusContext" ? c.context : [c.checkSuite?.workflowRun?.workflow?.name, c.name].filter(Boolean).join(" / "),
    state: checkState(c), url: c.detailsUrl ?? c.targetUrl ?? null,
  })).sort((a, b) => CHECK_ORDER[a.state] - CHECK_ORDER[b.state] || a.name.localeCompare(b.name));
  const linked = [];
  for (const n of node.closingIssuesReferences?.nodes ?? []) linked.push(linkOf({ ...n, __typename: "Issue" }));
  for (const e of node.timelineItems?.nodes ?? []) linked.push(linkOf(e.source ?? e.subject));
  const seen = new Set();
  return {
    body: node.body ?? "", mergeState: node.mergeStateStatus ?? null, mergeable: node.mergeable ?? null,
    merged: node.mergedAt ? { by: node.mergedBy?.login ?? null, at: node.mergedAt, oid: node.mergeCommit?.oid ?? null, short: node.mergeCommit?.abbreviatedOid ?? null, url: node.mergeCommit?.url ?? null } : null,
    threads: node.reviewThreads ? { total: node.reviewThreads.totalCount ?? 0, unresolved: (node.reviewThreads.nodes ?? []).filter(x => x && !x.isResolved).length } : null,
    commentCount: node.comments?.totalCount ?? 0,
    comments: (node.comments?.nodes ?? []).map(c => ({ author: c.author?.login ?? "ghost", body: c.body ?? "", createdAt: c.createdAt, url: c.url })),
    reviews: (node.latestOpinionatedReviews?.nodes ?? []).map(r => ({ author: r.author?.login ?? "ghost", state: lower(r.state), at: r.submittedAt })),
    checks, linked: linked.filter(l => l && !seen.has(l.url) && seen.add(l.url)),
  };
}

// The merge box at the top of a pull request, as GitHub's new PR page has it: what stands between it and merging
// (conflicts first, as GitHub orders them), then checks, review threads and approvals. Works from the list's item alone
// until its details arrive. tone: "blocked" | "pending" | "ready" | "draft" | "merged" | "closed".
export function mergeStatus(item, detail = null) {
  if (item?.kind !== "pr") return null;
  const checks = detail?.checks ?? [], sum = checkSummary(checks);
  const reviews = detail?.reviews ?? [];
  const approvals = reviews.filter(r => r.state === "approved").length, changes = reviews.filter(r => r.state === "changes_requested").length;
  const threads = detail?.threads ?? null, state = detail?.mergeState ?? null;
  const conflicts = item.conflicts || detail?.mergeable === "CONFLICTING" || state === "DIRTY";
  const failing = sum.fail > 0 || (!checks.length && item.ci === "fail"), running = sum.pending > 0 || (!checks.length && item.ci === "pending");
  // Reviewers asked who haven't answered yet: GitHub's "n pending".
  const answered = new Set(reviews.map(r => r.author)), pending = (item.reviewers ?? []).filter(r => !answered.has(r)).length;
  const parts = { checks: { ...sum, total: checks.length, rollup: item.ci }, threads, approvals: { approved: approvals, changes, pending, decision: item.review } };
  const say = (tone, title, text, action = null) => ({ tone, title, text, action, ...parts });
  // Merged: who, which commit and when, on one line (GitHub drops the cells here).
  // The details are fresher than the list a stale item came from: merged there means merged.
  if (item.state === "merged" || detail?.merged) return { ...say("merged", "Merged", (detail?.merged?.by ?? "Someone") + " merged into " + (item.base ?? "its base branch")), merged: detail?.merged ?? { at: item.closedAt }, compact: true };
  if (item.state === "closed") return { ...say("closed", "Closed", "Closed without merging."), compact: true };
  if (conflicts) return say("blocked", "Merge conflicts", "Resolve the merge conflicts before this can merge.", "conflicts");
  if (item.state === "draft") return say("draft", "Draft", "Still a work in progress; draft pull requests can't be merged.", "ready");
  if (failing) return say("blocked", "Checks failing", (sum.fail || "Some") + " check" + (sum.fail === 1 ? "" : "s") + " failed.", "checks");
  if (item.review === "changes" || changes) return say("blocked", "Changes requested", "A reviewer asked for changes before this can merge.");
  if (state === "BEHIND") return say("blocked", "Out of date", "This branch is behind " + (item.base ?? "its base") + "; update it before merging.");
  if (item.review === "required") return say("pending", "Review required", "An approving review is required before this can merge.");
  if (running) return say("pending", "Checks running", sum.pending ? sum.pending + " check" + (sum.pending === 1 ? " is" : "s are") + " still running." : "Checks are still running.", "checks");
  if (threads?.unresolved) return say("pending", "Unresolved conversations", threads.unresolved + " review thread" + (threads.unresolved === 1 ? "" : "s") + " still open.");
  if (state === "BLOCKED") return say("blocked", "Blocked", "A branch rule is blocking the merge.");
  if (state === "UNSTABLE") return say("ready", "Ready to merge", "Some checks that aren't required failed.");
  if (state === "UNKNOWN" || (!detail && item.ci == null)) return say("pending", "Checking", "GitHub is still working out whether this can merge.");
  return say("ready", "Ready to merge", "All requirements are met.");
}

// Markdown in pieces: plain runs and <details> blocks (with their <summary>), nested ones inside, so each block can be
// drawn folded, as GitHub does. HTML comments go first; an unclosed <details> runs to the end.
export const stripHtmlComments = (s) => String(s ?? "").replace(/<!--[\s\S]*?-->/g, "");
export function markdownBlocks(text) {
  const src = stripHtmlComments(text), out = [];
  const open = /<details(\s[^>]*)?>/gi, tag = /<(\/?)details(?:\s[^>]*)?>/gi;
  let at = 0;
  for (let m; (open.lastIndex = at, m = open.exec(src));) {
    if (m.index > at && src.slice(at, m.index).trim()) out.push({ kind: "md", text: src.slice(at, m.index).trim() });
    let depth = 0, end = src.length, close = src.length;
    tag.lastIndex = m.index;
    for (let t; (t = tag.exec(src));) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) { close = t.index; end = t.index + t[0].length; break; }
    }
    let inner = src.slice(m.index + m[0].length, close);
    const sm = /<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i.exec(inner);
    const summary = sm ? sm[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "Details";
    if (sm) inner = inner.slice(0, sm.index) + inner.slice(sm.index + sm[0].length);
    out.push({ kind: "details", summary: summary || "Details", open: /\sopen(\s|=|$)/i.test(m[1] ?? ""), blocks: markdownBlocks(inner) });
    at = end;
  }
  if (src.slice(at).trim()) out.push({ kind: "md", text: src.slice(at).trim() });
  return out;
}

// A pull request's activity, as GitHub's timeline shows it: commits (runs of them by one author folded), comments,
// reviews and events, newest first.
export const TIMELINE_QUERY = `query($id: ID!, $last: Int!) { node(id: $id) { ... on PullRequest { timelineItems(last: $last) { totalCount nodes { __typename
  ... on PullRequestCommit { commit { oid abbreviatedOid messageHeadline committedDate url author { user { login } name } } }
  ... on IssueComment { id author { login } body createdAt url authorAssociation }
  ... on PullRequestReview { id author { login } state body createdAt url comments { totalCount } }
  ... on ReviewRequestedEvent { createdAt actor { login } requestedReviewer { ... on User { login } ... on Team { slug } } }
  ... on ReviewRequestRemovedEvent { createdAt actor { login } requestedReviewer { ... on User { login } ... on Team { slug } } }
  ... on LabeledEvent { createdAt actor { login } label { name color } }
  ... on UnlabeledEvent { createdAt actor { login } label { name color } }
  ... on HeadRefForcePushedEvent { createdAt actor { login } beforeCommit { abbreviatedOid } afterCommit { abbreviatedOid } }
  ... on BaseRefChangedEvent { createdAt actor { login } previousRefName currentRefName }
  ... on MergedEvent { createdAt actor { login } mergeRefName commit { abbreviatedOid } }
  ... on ClosedEvent { createdAt actor { login } }
  ... on ReopenedEvent { createdAt actor { login } }
  ... on ReadyForReviewEvent { createdAt actor { login } }
  ... on ConvertToDraftEvent { createdAt actor { login } }
  ... on CrossReferencedEvent { createdAt actor { login } source { ... on Issue { __typename number title url state stateReason repository { nameWithOwner } } ... on PullRequest { __typename number title url state isDraft repository { nameWithOwner } } } }
  ... on RenamedTitleEvent { createdAt actor { login } previousTitle currentTitle }
  ... on MilestonedEvent { createdAt actor { login } milestoneTitle }
  ... on DemilestonedEvent { createdAt actor { login } milestoneTitle }
  ... on AssignedEvent { createdAt actor { login } assignee { ... on User { login } } }
  ... on UnassignedEvent { createdAt actor { login } assignee { ... on User { login } } }
  ... on AutoMergeEnabledEvent { createdAt actor { login } }
  ... on AutoMergeDisabledEvent { createdAt actor { login } }
} } } } }`;
const who = (x) => x?.login ?? x?.slug ?? null;
export function timelineOf(data) {
  const nodes = data?.node?.timelineItems?.nodes ?? [], total = data?.node?.timelineItems?.totalCount ?? nodes.length;
  const events = [];
  for (const n of nodes) {
    const ev = (text, extra = {}) => events.push({ kind: "event", type: n.__typename, actor: n.actor?.login ?? null, at: n.createdAt, text, ...extra });
    switch (n.__typename) {
      case "PullRequestCommit": { const k = n.commit; events.push({ kind: "commit", oid: k.oid, short: k.abbreviatedOid, title: k.messageHeadline, at: k.committedDate, url: k.url, actor: k.author?.user?.login ?? k.author?.name ?? "someone" }); break; }
      case "IssueComment": events.push({ kind: "comment", id: n.id, actor: n.author?.login ?? "ghost", at: n.createdAt, body: n.body ?? "", url: n.url, role: n.authorAssociation }); break;
      case "PullRequestReview": events.push({ kind: "review", id: n.id, actor: n.author?.login ?? "ghost", at: n.createdAt, body: n.body ?? "", url: n.url, state: lower(n.state), threads: n.comments?.totalCount ?? 0 }); break;
      case "ReviewRequestedEvent": ev("requested a review from " + (who(n.requestedReviewer) ?? "someone"), { icon: "review" }); break;
      case "ReviewRequestRemovedEvent": ev("removed the review request for " + (who(n.requestedReviewer) ?? "someone"), { icon: "review" }); break;
      case "LabeledEvent": ev("added", { icon: "label", label: n.label }); break;
      case "UnlabeledEvent": ev("removed", { icon: "label", label: n.label }); break;
      case "HeadRefForcePushedEvent": ev("force-pushed " + (n.beforeCommit?.abbreviatedOid ?? "?") + " → " + (n.afterCommit?.abbreviatedOid ?? "?"), { icon: "push" }); break;
      case "BaseRefChangedEvent": ev("changed the base from " + n.previousRefName + " to " + n.currentRefName, { icon: "push" }); break;
      case "MergedEvent": ev("merged " + (n.commit?.abbreviatedOid ?? "") + " into " + (n.mergeRefName ?? "the base"), { icon: "merged" }); break;
      case "ClosedEvent": ev("closed this", { icon: "closed" }); break;
      case "ReopenedEvent": ev("reopened this", { icon: "open" }); break;
      case "ReadyForReviewEvent": ev("marked this ready for review", { icon: "open" }); break;
      case "ConvertToDraftEvent": ev("marked this as a draft", { icon: "draft" }); break;
      case "CrossReferencedEvent": if (n.source?.number) ev("mentioned this in", { icon: "link", link: linkOf(n.source) }); break;
      case "RenamedTitleEvent": ev("changed the title from “" + n.previousTitle + "” to “" + n.currentTitle + "”", { icon: "edit" }); break;
      case "MilestonedEvent": ev("added this to " + n.milestoneTitle, { icon: "milestone" }); break;
      case "DemilestonedEvent": ev("removed this from " + n.milestoneTitle, { icon: "milestone" }); break;
      case "AssignedEvent": ev(n.assignee?.login === n.actor?.login ? "self-assigned this" : "assigned " + (n.assignee?.login ?? "someone"), { icon: "person" }); break;
      case "UnassignedEvent": ev("unassigned " + (n.assignee?.login ?? "someone"), { icon: "person" }); break;
      case "AutoMergeEnabledEvent": ev("enabled auto-merge", { icon: "merged" }); break;
      case "AutoMergeDisabledEvent": ev("disabled auto-merge", { icon: "merged" }); break;
    }
  }
  events.sort((x, y) => time(y.at) - time(x.at));
  return { total, events };
}

// Newest first, with runs of three or more commits by one author folded after the first, as GitHub shows
// "3 additional commits by …". Opening a run (by its key) shows them all.
export function timelineRows(events, { expanded = new Set() } = {}) {
  const rows = [];
  for (let n = 0; n < events.length; n++) {
    const e = events[n];
    if (e.kind !== "commit") { rows.push({ ...e, key: e.id ?? e.kind + ":" + n }); continue; }
    let end = n;
    while (end + 1 < events.length && events[end + 1].kind === "commit" && events[end + 1].actor === e.actor) end++;
    const run = events.slice(n, end + 1), key = "run:" + e.oid;
    rows.push({ ...e, key: "c:" + e.oid });
    if (run.length >= 3 && !expanded.has(key)) rows.push({ kind: "fold", key, actor: e.actor, count: run.length - 1 });
    else for (const k of run.slice(1)) rows.push({ ...k, key: "c:" + k.oid });
    n = end;
  }
  return rows;
}

export function checkSummary(checks) {
  const out = { pass: 0, fail: 0, pending: 0, skipped: 0, cancelled: 0 };
  for (const c of checks) out[c.state]++;
  return out;
}

// The list's width and which optional columns fit, as in beads: columns only drop as the pane narrows.
// A list card: line 1 the title, line 2 the facts (number, repository, people, state), and labels after them when they
// fit, else on a third line. Fixed heights, so a list keeps a steady rhythm; labels beyond what fits fold into "+n".
export const CARD_H = { two: 50, three: 70 };
const CHAR_W = 6.2, CHIP_PAD = 14, CHIP_GAP = 5;
export const chipWidth = (text) => Math.ceil(String(text ?? "").length * CHAR_W) + CHIP_PAD;
// widths: the card's inner width and the room the facts on line 2 already take.
export function cardLayout(labels, { width, facts = 0, milestone = null } = {}) {
  const names = [...(milestone ? ["◆ " + milestone] : []), ...labels.map(l => l.name ?? l)];
  const fit = (room) => {
    let used = 0, n = 0;
    for (const name of names) {
      const w = chipWidth(name) + (n ? CHIP_GAP : 0), rest = names.length - n - 1, more = rest > 0 ? chipWidth("+" + rest) + CHIP_GAP : 0;
      if (used + w + more > room) break;
      used += w; n++;
    }
    return n;
  };
  if (!names.length) return { lines: 2, inline: 0, shown: 0, hidden: 0, height: CARD_H.two };
  const inlineRoom = width - facts - 12;
  // Everything fits beside the facts: two lines.
  if (fit(inlineRoom) === names.length) return { lines: 2, inline: names.length, shown: names.length, hidden: 0, height: CARD_H.two };
  // Otherwise a third line of their own, with what doesn't fit folded.
  const shown = Math.max(1, fit(width));
  return { lines: 3, inline: 0, shown, hidden: names.length - shown, height: CARD_H.three };
}

// "45s", "12m", "3h", "5d", "6w", "4mo", "2y" since an ISO time.
export function age(iso, now = Date.now()) {
  const t = time(iso);
  if (!t) return "";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return Math.floor(s) + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 86400 * 14) return Math.floor(s / 86400) + "d";
  if (s < 86400 * 60) return Math.floor(s / 604800) + "w";
  if (s < 86400 * 365) return Math.floor(s / 2592000) + "mo";
  return Math.floor(s / 31536000) + "y";
}
