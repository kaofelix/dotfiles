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
  reviewDecision mergeable comments { totalCount }
  labels(first: 8) { nodes { name color } } assignees(first: 5) { nodes { login } }
  reviewRequests(first: 8) { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
fragment IS on Issue { __typename id number title url state stateReason createdAt updatedAt closedAt
  author { login } repository { nameWithOwner isPrivate } comments { totalCount }
  labels(first: 8) { nodes { name color } } assignees(first: 5) { nodes { login } } }`;

export function sectionQuery() {
  return FRAGMENTS + "\nquery($q: String!, $first: Int!, $after: String) {\n  viewer { login }\n"
    + "  search(type: ISSUE, query: $q, first: $first, after: $after) { issueCount pageInfo { endCursor hasNextPage } nodes { ...PR ...IS } }\n"
    + "  rateLimit { cost remaining resetAt }\n}";
}

// Projects (v2) linked to a repository, for links in its header: they live on GitHub.
export const PROJECTS_QUERY = "query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { projectsV2(first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number title url closed } } } }";
export const projectsOf = (data) => (data?.repository?.projectsV2?.nodes ?? []).filter(Boolean)
  .map(p => ({ number: p.number, title: p.title, url: p.url, closed: Boolean(p.closed) })).sort((x, y) => Number(x.closed) - Number(y.closed));

export const REPOS_QUERY = "query { viewer { login repositories(first: 30, orderBy: {field: PUSHED_AT, direction: DESC}, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) { nodes { nameWithOwner } } } }";

export const DETAIL_QUERY = `query($id: ID!) { node(id: $id) {
  ... on PullRequest { body mergeStateStatus
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

// "login repo:nemo -#bug @alice is:draft ci:fail review:approved 123" -> predicates, all must hold.
export function parseQuery(query, login = null) {
  const preds = [];
  for (const raw of String(query ?? "").trim().split(/\s+/).filter(Boolean)) {
    const neg = raw.length > 1 && raw.startsWith("-"), tok = lower(neg ? raw.slice(1) : raw);
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
    } else if ((m = /^ci:(.+)$/.exec(tok))) pred = (i) => i.ci === ({ failing: "fail", failure: "fail", success: "pass", ok: "pass" }[m[1]] ?? m[1]);
    else if ((m = /^review:(.+)$/.exec(tok))) pred = (i) => i.review === ({ changes_requested: "changes", required: "required", none: null }[m[1]] ?? m[1]);
    else pred = (i) => has(i.title, tok) || has(i.repo, tok) || has(i.author, tok) || has(i.head, tok) || i.labels.some(l => has(l.name, tok));
    preds.push(neg ? (i) => !pred(i) : pred);
  }
  return preds;
}

const time = (v) => (v ? Date.parse(v) || 0 : 0);

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
export function homeRows(result, { query = "", collapsed = new Set(), limit = HOME_LIMIT } = {}) {
  if (!result) return [];
  const preds = parseQuery(query, result.login), rows = [];
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
export const togglePin = (pins, repo) => !isRepoScope(repo) ? pins : pins.includes(repo) ? pins.filter(p => p !== repo) : [...pins, repo];

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
    body: node.body ?? "", mergeState: node.mergeStateStatus ?? null,
    commentCount: node.comments?.totalCount ?? 0,
    comments: (node.comments?.nodes ?? []).map(c => ({ author: c.author?.login ?? "ghost", body: c.body ?? "", createdAt: c.createdAt, url: c.url })),
    reviews: (node.latestOpinionatedReviews?.nodes ?? []).map(r => ({ author: r.author?.login ?? "ghost", state: lower(r.state), at: r.submittedAt })),
    checks, linked: linked.filter(l => l && !seen.has(l.url) && seen.add(l.url)),
  };
}

export function checkSummary(checks) {
  const out = { pass: 0, fail: 0, pending: 0, skipped: 0, cancelled: 0 };
  for (const c of checks) out[c.state]++;
  return out;
}

// The list's width and which optional columns fit, as in beads: columns only drop as the pane narrows.
export const WIDE = 840, DETAIL_W = 440;
export function listWidth(paneWidth, detailOpen) {
  if (!detailOpen) return paneWidth;
  return paneWidth >= WIDE ? paneWidth - DETAIL_W : 0;
}
export function rowColumns(width) {
  return { repo: width >= 360, comments: width >= 480, author: width >= 540, labels: width >= 700 };
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
