import { describe, expect, test } from "bun:test";
import { homeRows, projectsOf, kindSettled, kindPending, seedResult, scopeOptions, togglePin, applyPage, buildRows, deserialize, emptyResult, isLoaded, kindCount, kindHasMore, normalize, normalizeDetail, parseQuery, plan, repoCounts, repoFromRemote, repoFromRemotes, rowColumns, listWidth, searchString, sectionQuery, sectionsFor, serialize } from "../home/dot_config/herdr-app/mods/github/model.js";

const pr = (id, repo, number, extra = {}) => ({ __typename: "PullRequest", id, number, title: "PR " + number, url: "https://github.com/" + repo + "/pull/" + number, state: "OPEN", isDraft: false,
  repository: { nameWithOwner: repo }, author: { login: "me" }, updatedAt: "2026-01-0" + (number % 9 + 1) + "T00:00:00Z", labels: { nodes: [] }, assignees: { nodes: [] }, ...extra });
const issue = (id, repo, number, extra = {}) => ({ __typename: "Issue", id, number, title: "Issue " + number, url: "https://github.com/" + repo + "/issues/" + number, state: "OPEN",
  repository: { nameWithOwner: repo }, author: { login: "alice" }, updatedAt: "2026-01-01T00:00:00Z", labels: { nodes: [{ name: "bug", color: "d73a4a" }] }, assignees: { nodes: [{ login: "me" }] }, ...extra });
const page = (nodes, { total = nodes.length, cursor = null, more = false } = {}) => ({ viewer: { login: "me" }, search: { issueCount: total, pageInfo: { endCursor: cursor, hasNextPage: more }, nodes } });
// Every section answered (empty unless given), as the pane's load does.
const answer = (p, byKey) => { const r = emptyResult(p); for (const x of p) applyPage(r, x.key, page(byKey[x.key] ?? [])); return r; };
const rowsOf = (rows) => rows.map(r => r.kind === "section" ? "# " + r.id + " " + r.count : r.kind === "repo" ? "## " + r.repo : "  ".repeat(r.depth) + r.item.repo + "#" + r.item.number);

describe("github model", () => {
  test("searches are scoped to me across repos, or to one repository, and to the chosen state", () => {
    expect(searchString(sectionsFor("pr", "me")[0], { kind: "pr", scope: "me", state: "open" })).toBe("is:pr is:open archived:false review-requested:@me sort:updated-desc");
    expect(searchString(sectionsFor("issue", "o/r").at(-1), { kind: "issue", scope: "o/r", state: "all" })).toBe("is:issue repo:o/r sort:updated-desc");
    expect(sectionsFor("pr", "o/r").map(s => s.id)).toEqual(["review", "mine", "others"]);
    const p = plan("me", "closed");
    expect(p.every(x => x.search.includes("is:closed"))).toBe(true);
    expect(sectionQuery()).toContain("search(type: ISSUE, query: $q, first: $first, after: $after)");
  });

  test("an item is listed under the first section that found it, and counted once per kind", () => {
    const p = plan("me", "open");
    const shared = pr("P1", "o/a", 1);
    const res = answer(p, { pr_review: [pr("P2", "o/b", 2, { author: { login: "bob" } })], pr_mine: [shared, pr("P3", "o/a", 3)], pr_involved: [shared, pr("P2", "o/b", 2)], issue_assigned: [issue("I1", "o/a", 9)], issue_involved: [issue("I1", "o/a", 9)] });
    expect(rowsOf(buildRows(res, "pr", {}))).toEqual(["# review 1", "o/b#2", "# mine 2", "o/a#1", "o/a#3"]);
    expect(kindCount(res, "pr")).toBe(3);
    expect(kindCount(res, "issue")).toBe(1);
    expect(repoCounts(res, "pr")).toEqual([{ repo: "o/a", count: 2 }, { repo: "o/b", count: 1 }]);
  });

  test("groups by repository under each section and folds sections and repos", () => {
    const p = plan("me", "open");
    const res = answer(p, { pr_mine: [pr("A", "o/a", 1), pr("B", "o/b", 8), pr("C", "o/a", 2)] });
    expect(rowsOf(buildRows(res, "pr", { group: true }))).toEqual(["# mine 3", "## o/b", "  o/b#8", "## o/a", "  o/a#1", "  o/a#2"]);
    expect(rowsOf(buildRows(res, "pr", { group: true, collapsed: new Set(["repo:mine:o/a"]) }))).toEqual(["# mine 3", "## o/b", "  o/b#8", "## o/a"]);
    expect(rowsOf(buildRows(res, "pr", { collapsed: new Set(["section:mine"]) }))).toEqual(["# mine 3"]);
  });

  test("pages append to a section, end in a load-more row, and a refresh keeps the pages loaded", () => {
    const p = plan("o/r", "all");
    const res = answer(p, {});
    expect(isLoaded(res)).toBe(true);
    applyPage(res, "pr_others", page([pr("A", "o/r", 1), pr("B", "o/r", 2)], { total: 5, cursor: "c1", more: true }));
    let rows = buildRows(res, "pr", {});
    expect(rows.map(r => r.kind)).toEqual(["section", "item", "item", "more"]);
    expect(rows.at(-1)).toMatchObject({ sectionKey: "pr_others", loaded: 2, total: 5 });
    expect(kindHasMore(res, "pr")).toBe(true);
    applyPage(res, "pr_others", page([pr("C", "o/r", 3), pr("B", "o/r", 2)], { total: 5, cursor: "c2", more: true }), true);
    applyPage(res, "pr_others", page([pr("D", "o/r", 4)], { total: 5 }), true);
    expect(rowsOf(buildRows(res, "pr", {}))).toEqual(["# others 4", "o/r#1", "o/r#2", "o/r#3", "o/r#4"]);
    // The poll refreshes the first page: a new item comes first, the later pages stay.
    applyPage(res, "pr_others", page([pr("E", "o/r", 5), pr("A", "o/r", 1)], { total: 6, cursor: "x", more: true }));
    expect(rowsOf(buildRows(res, "pr", {}))).toEqual(["# others 5", "o/r#5", "o/r#1", "o/r#2", "o/r#3", "o/r#4"]);
  });

  test("sections still loading show a header, failed ones a retry row", () => {
    const p = plan("me", "open");
    const res = emptyResult(p);
    expect(isLoaded(res)).toBe(false);
    applyPage(res, "pr_mine", page([pr("A", "o/a", 1)]));
    res.sections.pr.find(s => s.key === "pr_reviewed").error = "HTTP 502";
    const rows = buildRows(res, "pr", {});
    expect(rows.map(r => r.kind + ":" + (r.id ?? r.section ?? "") + (r.loading ? ":loading" : ""))).toEqual(
      ["section:review:loading", "section:mine", "item:mine", "section:reviewed", "more:reviewed", "section:assigned:loading", "section:involved:loading"]);
    expect(rows.find(r => r.kind === "more")).toMatchObject({ error: "HTTP 502", retry: true });
    expect(buildRows(res, "pr", { query: "PR" }).map(r => r.kind)).toEqual(["section", "item"]);
  });

  test("results survive a round trip through storage, and a changed plan drops them", () => {
    const p = plan("me", "open");
    const res = answer(p, { pr_mine: [pr("A", "o/a", 1)] });
    const back = deserialize(JSON.parse(JSON.stringify(serialize(res))), p);
    expect(rowsOf(buildRows(back, "pr", {}))).toEqual(rowsOf(buildRows(res, "pr", {})));
    expect(deserialize(JSON.parse(JSON.stringify(serialize(res))), plan("o/r", "open"))).toBe(null);
  });

  test("normalizes state, CI, review and conflicts", () => {
    const n = normalize(pr("X", "o/a", 1, { isDraft: true, reviewDecision: "CHANGES_REQUESTED", mergeable: "CONFLICTING", commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] } }));
    expect(n).toMatchObject({ kind: "pr", state: "draft", ci: "fail", review: "changes", conflicts: true });
    expect(normalize(pr("Y", "o/a", 2, { state: "MERGED" })).state).toBe("merged");
    expect(normalize(issue("Z", "o/a", 3, { state: "CLOSED", stateReason: "NOT_PLANNED" })).state).toBe("not_planned");
    expect(normalize(issue("W", "o/a", 4, { state: "CLOSED", stateReason: "COMPLETED" })).state).toBe("completed");
  });

  test("the filter understands repo, author, labels, state, CI, review, numbers and negation", () => {
    const items = [normalize(pr("A", "nvidia/nemo", 12, { isDraft: true, commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] } })),
      normalize(pr("B", "me/dotfiles", 7, { author: { login: "bob" }, reviewDecision: "APPROVED", labels: { nodes: [{ name: "ui" }] } })),
      normalize(issue("C", "me/dotfiles", 120))];
    const ids = (q) => items.filter(i => parseQuery(q, "me").every(p => p(i))).map(i => i.id);
    expect(ids("repo:nemo")).toEqual(["A"]);
    expect(ids("@me")).toEqual(["A"]);
    expect(ids("-@me")).toEqual(["B", "C"]);
    expect(ids("#ui")).toEqual(["B"]);
    expect(ids("is:draft")).toEqual(["A"]);
    expect(ids("ci:failing")).toEqual(["A"]);
    expect(ids("review:approved")).toEqual(["B"]);
    expect(ids("#12")).toEqual(["A", "C"]);
    expect(ids("assignee:me")).toEqual(["C"]);
    expect(ids("dotfiles -is:issue")).toEqual(["B"]);
  });

  test("reads the repository from git remotes, preferring upstream", () => {
    expect(repoFromRemote("git@github.com:kaofelix/dotfiles.git")).toBe("kaofelix/dotfiles");
    expect(repoFromRemote("https://github.com/NVIDIA/NemoClaw")).toBe("NVIDIA/NemoClaw");
    expect(repoFromRemote("ssh://git@github.com/o/r.git")).toBe("o/r");
    expect(repoFromRemote("git@gitlab.com:o/r.git")).toBe(null);
    expect(repoFromRemotes(["origin\tgit@github.com:me/fork.git (fetch)", "upstream\thttps://github.com/org/proj.git (fetch)"])).toBe("org/proj");
    expect(repoFromRemotes(["mine\tgit@github.com:me/x.git (fetch)"])).toBe("me/x");
  });

  test("details list failing checks first and dedupe linked work", () => {
    const linkedPr = { __typename: "PullRequest", number: 5, title: "Fix", url: "u5", state: "MERGED", repository: { nameWithOwner: "o/a" } };
    const d = normalizeDetail({
      body: "hi", comments: { totalCount: 3, nodes: [{ author: { login: "a" }, body: "x", createdAt: "t", url: "c" }] },
      commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [
        { __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "SUCCESS" },
        { __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "FAILURE", checkSuite: { workflowRun: { workflow: { name: "CI" } } } },
        { __typename: "StatusContext", context: "deploy", state: "PENDING" }] } } } }] },
      timelineItems: { nodes: [{ source: linkedPr }, { subject: linkedPr }] },
    });
    expect(d.checks.map(c => c.name + ":" + c.state)).toEqual(["CI / test:fail", "deploy:pending", "lint:pass"]);
    expect(d.linked).toEqual([{ kind: "pr", repo: "o/a", number: 5, title: "Fix", url: "u5", state: "merged" }]);
    expect(d.commentCount).toBe(3);
  });

  test("row columns only drop as the pane narrows", () => {
    for (const detail of [false, true]) {
      let previous = null;
      for (let width = 1600; width >= 200; width -= 10) {
        const shown = rowColumns(listWidth(width, detail));
        if (previous) for (const [k, on] of Object.entries(shown)) if (on) expect([k, previous[k]]).toEqual([k, true]);
        previous = shown;
      }
    }
  });
  test("the scope list puts all my work, then pins, then repos, and a typed owner/name opens any repo", () => {
    const opts = scopeOptions({ login: "me", pins: ["o/p"], current: "o/c", counts: [{ repo: "o/a", count: 3 }, { repo: "o/p", count: 1 }], recent: ["o/a", "o/r"] });
    expect(opts.map(o => o.group + ":" + o.id + ":" + o.note + (o.pinned ? ":pinned" : ""))).toEqual(
      ["me:me:@me", "pinned:o/p:1:pinned", "repos:o/c:", "repos:o/a:3", "repos:o/r:recent"]);
    expect(scopeOptions({ pins: ["o/p"], recent: ["x/abc"], query: "AB" }).map(o => o.id)).toEqual(["x/abc"]);
    expect(scopeOptions({ query: "all my" }).map(o => o.id)).toEqual(["me"]);
    expect(scopeOptions({ recent: ["x/abc"], query: "new/repo" })).toEqual([{ id: "new/repo", label: "new/repo", note: "open", group: "repos", pinned: false }]);
    expect(scopeOptions({ recent: ["x/abc"], query: "x/abc" }).map(o => o.id)).toEqual(["x/abc"]);
  });

  test("pins toggle in order, and all my work can't be pinned", () => {
    expect(togglePin([], "o/a")).toEqual(["o/a"]);
    expect(togglePin(["o/a"], "o/b")).toEqual(["o/a", "o/b"]);
    expect(togglePin(["o/a", "o/b"], "o/a")).toEqual(["o/b"]);
    expect(togglePin(["o/a"], "me")).toEqual(["o/a"]);
  });
  test("a state nobody loaded yet starts from the scope's other states, filtered and newest first", () => {
    const closed = (id, repo, n) => ({ ...pr(id, repo, n), state: "CLOSED", closedAt: "2026-01-01T00:00:00Z" });
    const open = answer(plan("me", "open"), { pr_mine: [pr("A", "o/a", 1)], issue_assigned: [issue("I", "o/a", 2)] });
    const shut = answer(plan("me", "closed"), { pr_mine: [closed("C", "o/a", 3)] });
    const all = seedResult(plan("me", "all"), "all", [open, shut]);
    expect(isLoaded(all)).toBe(true);
    expect(all.sections.pr.find(s => s.key === "pr_mine").ids.sort()).toEqual(["A", "C"]);
    expect(all.sections.issue.find(s => s.key === "issue_assigned").ids).toEqual(["I"]);
    const onlyOpen = seedResult(plan("me", "open"), "open", [all]);
    expect(onlyOpen.sections.pr.find(s => s.key === "pr_mine").ids).toEqual(["A"]);
    // Until its page lands, a seeded section has no count or "load more": they're pending.
    const rows = buildRows(all, "pr", {}).filter(r => r.id === "mine" || r.section === "mine");
    expect(rows[0]).toMatchObject({ kind: "section", id: "mine", pending: true, truncated: false });
    expect(rows.at(-1)).toMatchObject({ kind: "more", section: "mine", pending: true });
    expect(kindPending(all, "pr")).toBe(true);
    expect(kindSettled(all, "pr")).toBe(false);
    // An empty borrowed section reads as loading, not as an empty one.
    const review = buildRows(all, "pr", {}).find(r => r.id === "review");
    expect(review).toMatchObject({ kind: "section", loading: true, count: 0 });
    expect(buildRows(all, "pr", {}).some(r => r.kind === "more" && r.section === "review")).toBe(false);
    expect(kindSettled(answer(plan("me", "open"), {}), "pr")).toBe(true);
    expect(kindSettled(emptyResult(plan("me", "open")), "pr")).toBe(false);
    // The first fetched page replaces the seed.
    applyPage(all, "pr_mine", page([pr("N", "o/a", 9)], { total: 40, cursor: "c", more: true }));
    expect(all.sections.pr.find(s => s.key === "pr_mine").ids).toEqual(["N"]);
    const after = buildRows(all, "pr", {}).filter(r => r.section === "mine" || r.id === "mine");
    expect(after[0]).toMatchObject({ pending: false, truncated: true, total: 40 });
    expect(after.at(-1)).toMatchObject({ kind: "more", loaded: 1, total: 40 });
    expect(after.at(-1).pending).toBeUndefined();
    expect(seedResult(plan("me", "all"), "all", [emptyResult(plan("me", "open"))])).toBe(null);
  });
  test("home lists my open work per kind: review requests first and tagged, then newest, a few each", () => {
    const p = plan("me", "open");
    const res = answer(p, { pr_review: [pr("R", "o/b", 1, { author: { login: "bob" } })], pr_mine: [pr("A", "o/a", 2), pr("B", "o/a", 5)], pr_involved: [pr("A", "o/a", 2), pr("R", "o/b", 1)] });
    const rows = homeRows(res, { limit: 2 });
    expect(rows.map(r => r.kind + ":" + (r.id ?? r.item?.id ?? r.key) + (r.tag ? ":" + r.tag : ""))).toEqual(["block:pr", "item:R:to review", "item:B", "block:issue", "note:note:issue"]);
    expect(rows[0]).toMatchObject({ label: "Pull requests", count: 3, shown: 2, pending: false });
    expect(rows.at(-1)).toMatchObject({ loading: false, text: "No open issues." });
    expect(homeRows(res, { query: "o/a" }).filter(r => r.kind === "item").map(r => r.item.id)).toEqual(["B", "A"]);
    expect(homeRows(res, { collapsed: new Set(["block:pr"]) }).map(r => r.kind)).toEqual(["block", "block", "note"]);
    expect(homeRows(emptyResult(p)).find(r => r.kind === "note")).toMatchObject({ loading: true });
  });

  test("projects come open first, closed after", () => {
    expect(projectsOf({ repository: { projectsV2: { nodes: [{ number: 1, title: "Old", url: "u1", closed: true }, { number: 2, title: "Tracker", url: "u2", closed: false }] } } }).map(p => p.title)).toEqual(["Tracker", "Old"]);
    expect(projectsOf(null)).toEqual([]);
  });
});
