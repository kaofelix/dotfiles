import { describe, expect, test } from "bun:test";
import { workPlaces, markdownBlocks, timelineOf, timelineRows, mergeStatus, tokens, filterToken, hasToken, toggleToken, nodesQuery, nodesOf, shortNames, avatarFile, avatarUrl, initials, withSubIssues, subIssuesOf, subIssuesQuery, normalizeMilestones, milestoneItems, milestoneRows, epicGroups, ownerGroups, homeRows, projectsOf, kindSettled, kindPending, seedResult, scopeOptions, togglePin, applyPage, buildRows, deserialize, emptyResult, isLoaded, kindCount, kindHasMore, normalize, normalizeDetail, parseQuery, plan, repoCounts, repoFromRemote, repoFromRemotes, cardLayout, chipWidth, CARD_H, searchString, sectionQuery, sectionsFor, serialize } from "../home/dot_config/herdr-app/mods/github/model.js";

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

  test("cards keep two lines, fitting labels into what's left and folding the rest into +n", () => {
    const labels = ["bug", "area: onboarding", "priority: high", "needs-triage"].map(name => ({ name }));
    expect(cardLayout([], { width: 400, used: 100 })).toEqual({ shown: 0, hidden: 0, height: CARD_H });
    expect(cardLayout(labels, { width: 900, used: 100, milestone: "GTC DC 2026" })).toMatchObject({ shown: 5, hidden: 0 });
    const narrow = cardLayout(labels, { width: 300, used: 120, milestone: "GTC DC 2026" });
    expect(narrow.shown + narrow.hidden).toBe(5);
    expect(narrow.hidden).toBeGreaterThan(0);
    let prev = -1;
    for (let w = 200; w <= 1200; w += 20) { const l = cardLayout(labels, { width: w, used: 120 }); expect(l.shown).toBeGreaterThanOrEqual(prev); expect(l.height).toBe(CARD_H); prev = l.shown; }
    expect(chipWidth("bug")).toBeLessThan(chipWidth("area: onboarding"));
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
  const ms = (number, extra) => ({ id: "M" + number, number, title: "M" + number, url: "u" + number, state: "OPEN", dueOn: null, closedAt: null, open: { totalCount: 1 }, closed: { totalCount: 0 }, prs: { totalCount: 0 }, ...extra });
  test("milestones list open ones by due date, undated last, then closed ones newest first", () => {
    const list = normalizeMilestones({ repository: { milestones: { nodes: [ms(1), ms(2, { dueOn: "2026-12-01T00:00:00Z" }), ms(3, { dueOn: "2026-11-01T00:00:00Z" }),
      ms(4, { state: "CLOSED", closedAt: "2026-01-01T00:00:00Z" }), ms(5, { state: "CLOSED", closedAt: "2026-05-01T00:00:00Z" })] } } });
    expect(list.map(m => m.number + ":" + m.state)).toEqual(["3:open", "2:open", "1:open", "5:closed", "4:closed"]);
    expect(list[0]).toMatchObject({ open: 1, closed: 0, due: "2026-11-01T00:00:00Z" });
  });

  test("a milestone's open work groups by epic, keeps outside parents as headers, and others last", () => {
    const epic = issue("E", "o/r", 1, { issueType: { name: "Epic" }, subIssuesSummary: { total: 3, completed: 1 } });
    const kid = (id, n, parent, who) => issue(id, "o/r", n, { parent, assignees: { nodes: who ? [{ login: who }] : [] } });
    const items = milestoneItems({ repository: { milestone: { issues: { totalCount: 6, nodes: [epic, kid("A", 2, { id: "E", number: 1 }, "ann"), kid("B", 3, { id: "E", number: 1 }),
      kid("C", 4, { id: "X", number: 99, title: "Outside", url: "ux" }, "bob"), kid("D", 5, null, "ann")] }, pullRequests: { totalCount: 1, nodes: [pr("P", "o/r", 7)] } } } });
    const groups = epicGroups(items.issues);
    expect(groups.map(g => (g.head?.id ?? g.parent?.number ?? g.label) + ":" + g.items.map(i => i.id).join(","))).toEqual(["E:A,B", "99:C", "Other open work:D"]);
    expect(ownerGroups(items.issues).map(g => g.label + ":" + g.items.map(i => i.id).join(","))).toEqual(["ann:A,D", "bob:C", "me:E", "Unassigned:B"]);
    const m = normalizeMilestones({ repository: { milestones: { nodes: [ms(9)] } } });
    const rows = milestoneRows(m, new Map([[9, items]]), { expanded: new Set([9]) });
    expect(rows.map(r => r.kind + (r.depth ? r.depth : "") + ":" + (r.item?.id ?? r.label ?? r.parent?.number ?? r.text ?? r.milestone?.number))).toEqual(
      ["milestone:9", "item1:E", "item2:A", "item2:B", "group1:99", "item2:C", "group1:Other open work", "item2:D", "group1:Open pull requests", "item2:P", "note1:1 more open issues on GitHub"]);
    expect(rows.find(r => r.item?.id === "E")).toMatchObject({ epic: true, owner: true });
    expect(milestoneRows(m, new Map(), { expanded: new Set([9]) }).at(-1)).toMatchObject({ kind: "note", loading: true });
    expect(milestoneRows(m, new Map([[9, items]]), {}).length).toBe(1);
    expect(milestoneRows(m, new Map([[9, items]]), { state: "closed" })).toEqual([]);
    expect(milestoneRows(m, new Map([[9, items]]), { expanded: new Set([9]), query: "nothing-like-this" }).at(-1)).toMatchObject({ text: "Nothing here matches this filter." });
  });
  test("epics' open sub-issues outside the milestone join their epic, once", () => {
    const epic = normalize(issue("E", "o/r", 1, { issueType: { name: "Epic" }, subIssuesSummary: { total: 3, completed: 1 } }));
    const inside = normalize(issue("A", "o/r", 2, { parent: { id: "E", number: 1 } }));
    const q = subIssuesQuery(["E"]);
    expect(q).toContain('e0: node(id: "E")');
    const subs = subIssuesOf({ e0: { subIssues: { nodes: [issue("A", "o/r", 2), issue("B", "o/r", 3), issue("C", "o/r", 4, { state: "CLOSED", stateReason: "COMPLETED" })] } } }, ["E"]);
    const all = withSubIssues([epic, inside], subs);
    expect(all.map(i => i.id + (i.borrowed ? "*" : ""))).toEqual(["E", "A", "B*"]);
    expect(epicGroups(all).map(g => (g.head?.id ?? g.label) + ":" + g.items.map(i => i.id).join(","))).toEqual(["E:A,B"]);
  });
  test("avatars have safe file names, a URL per login and initials to fall back on", () => {
    expect(avatarFile("kaofelix")).toBe("kaofelix.png");
    expect(avatarFile("dependabot[bot]")).toBe("dependabot_bot_.png");
    expect(avatarUrl("dependabot[bot]")).toBe("https://github.com/dependabot.png?size=64");
    expect(initials("senthilr-nv")).toBe("SN");
    expect(initials("cv")).toBe("C");
    expect(initials("")).toBe("?");
  });
  test("sidebar names are short unless two repositories share one", () => {
    expect([...shortNames(["NVIDIA/NemoClaw", "cv/pit", "kaofelix/pit", "o/x"]).values()]).toEqual(["NemoClaw", "cv/pit", "kaofelix/pit", "x"]);
  });
  test("items carry their milestone, and the filter takes quoted milestone, label, type and no: words", () => {
    const a = normalize(issue("A", "o/r", 1, { milestone: { number: 3, title: "Roadmap: GTC DC 2026" }, labels: { nodes: [{ name: "area: ci", color: "fff" }] }, issueType: { name: "Epic" } }));
    const b = normalize(issue("B", "o/r", 2, { assignees: { nodes: [] }, labels: { nodes: [] } }));
    expect(a.milestone).toEqual({ number: 3, title: "Roadmap: GTC DC 2026" });
    const ids = (q) => [a, b].filter(i => parseQuery(q, "me").every(p => p(i))).map(i => i.id);
    expect(tokens('x milestone:"GTC DC" -label:"area: ci" y')).toEqual(["x", 'milestone:"GTC DC"', '-label:"area: ci"', "y"]);
    expect(ids('milestone:"gtc dc"')).toEqual(["A"]);
    expect(ids("no:milestone")).toEqual(["B"]);
    expect(ids('label:"area: ci"')).toEqual(["A"]);
    expect(ids('-label:"area: ci"')).toEqual(["B"]);
    expect(ids("type:epic")).toEqual(["A"]);
    expect(ids("no:assignee")).toEqual(["B"]);
    expect(ids('"Issue 2"')).toEqual(["B"]);
  });

  test("chips stand for filter words that toggle", () => {
    expect(filterToken("label", "bug")).toBe("#bug");
    expect(filterToken("label", "area: ci")).toBe('label:"area: ci"');
    expect(filterToken("milestone", "Roadmap: GTC DC 2026")).toBe('milestone:"Roadmap: GTC DC 2026"');
    expect(filterToken("author", "cv")).toBe("@cv");
    expect(filterToken("type", "Epic")).toBe("type:epic");
    const q = toggleToken("ci:fail", filterToken("label", "area: ci"));
    expect(q).toBe('ci:fail label:"area: ci"');
    expect(hasToken(q, 'label:"AREA: CI"')).toBe(true);
    expect(toggleToken(q, 'label:"area: ci"')).toBe("ci:fail");
  });

  test("home shows a Pinned block first, only when something is pinned", () => {
    const p = plan("me", "open"), res = answer(p, { pr_mine: [pr("A", "o/a", 2)] });
    const pin = normalize(issue("X", "o/z", 9, { state: "CLOSED", stateReason: "COMPLETED" }));
    expect(homeRows(res).some(r => r.id === "pinned")).toBe(false);
    const rows = homeRows(res, { pinned: [pin] });
    expect(rows.slice(0, 2).map(r => r.kind + ":" + (r.id ?? r.item?.id))).toEqual(["block:pinned", "item:X"]);
    expect(homeRows(res, { pinned: [pin], query: "o/a" }).slice(0, 2).map(r => r.kind)).toEqual(["block", "note"]);
    expect(nodesQuery(["X", "Y"])).toContain('nodes(ids: ["X","Y"]) { ...PR ...IS }');
    expect(nodesOf({ nodes: [issue("X", "o/z", 9), null] }).map(i => i.id)).toEqual(["X"]);
  });
  test("the merge box names what stands in the way, conflicts first", () => {
    const base = normalize(pr("P", "o/r", 1, { baseRefName: "main", commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] } }));
    const d = (extra) => normalizeDetail({ mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", reviewThreads: { totalCount: 0, nodes: [] }, ...extra });
    const fail = { commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [{ __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "FAILURE" }, { __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "SUCCESS" }] } } } }] } };
    expect(mergeStatus(normalize(issue("I", "o/r", 2)))).toBe(null);
    expect(mergeStatus(base, d({}))).toMatchObject({ tone: "ready", title: "Ready to merge", text: "All requirements are met." });
    expect(mergeStatus({ ...base, reviewers: ["ann", "bob"] }, d({ latestOpinionatedReviews: { nodes: [{ author: { login: "ann" }, state: "COMMENTED" }] } })).approvals.pending).toBe(1);
    const merged = mergeStatus({ ...base, state: "merged" }, d({ mergedAt: "2026-01-01T00:00:00Z", mergedBy: { login: "cv" }, mergeCommit: { oid: "74ccd7aff", abbreviatedOid: "74ccd7a", url: "mu" } }));
    expect(merged).toMatchObject({ tone: "merged", compact: true, text: "cv merged into main", merged: { by: "cv", short: "74ccd7a", url: "mu" } });
    // An item from an older list still says open; the details know better.
    expect(mergeStatus(base, d({ mergedAt: "2026-01-01T00:00:00Z", mergedBy: { login: "cv" } })).tone).toBe("merged");
    expect(mergeStatus({ ...base, conflicts: true }, d(fail))).toMatchObject({ tone: "blocked", title: "Merge conflicts", action: "conflicts" });
    expect(mergeStatus(base, d({ mergeStateStatus: "DIRTY", mergeable: "CONFLICTING" })).title).toBe("Merge conflicts");
    expect(mergeStatus(base, d(fail))).toMatchObject({ title: "Checks failing", text: "1 check failed.", checks: { pass: 1, fail: 1, total: 2 } });
    expect(mergeStatus({ ...base, review: "required" }, d({})).title).toBe("Review required");
    expect(mergeStatus(base, d({ mergeStateStatus: "BEHIND" })).title).toBe("Out of date");
    expect(mergeStatus(base, d({ reviewThreads: { totalCount: 3, nodes: [{ isResolved: true }, { isResolved: false }, { isResolved: false }] } }))).toMatchObject({ title: "Unresolved conversations", threads: { total: 3, unresolved: 2 } });
    expect(mergeStatus(base, d({ latestOpinionatedReviews: { nodes: [{ author: { login: "a" }, state: "APPROVED" }] } })).approvals).toMatchObject({ approved: 1 });
    expect(mergeStatus({ ...base, state: "merged" }).tone).toBe("merged");
    expect(mergeStatus({ ...base, state: "draft" }, d({}))).toMatchObject({ tone: "draft", action: "ready" });
  });
  test("markdown splits into plain runs and folded <details> blocks, nested ones too", () => {
    const md = "Intro\n\n<details>\n<!-- note -->\n<summary>Authoring <b>session</b></summary>\n\n| a |\n| - |\n<details open><summary>Inner</summary>deep</details>\n</details>\n\nAfter";
    expect(markdownBlocks(md)).toEqual([
      { kind: "md", text: "Intro" },
      { kind: "details", summary: "Authoring session", open: false, blocks: [{ kind: "md", text: "| a |\n| - |" }, { kind: "details", summary: "Inner", open: true, blocks: [{ kind: "md", text: "deep" }] }] },
      { kind: "md", text: "After" },
    ]);
    expect(markdownBlocks("<details><summary>x</summary>never closed")).toEqual([{ kind: "details", summary: "x", open: false, blocks: [{ kind: "md", text: "never closed" }] }]);
    expect(markdownBlocks("plain")).toEqual([{ kind: "md", text: "plain" }]);
  });

  test("the timeline is newest first, with runs of commits by one author folded", () => {
    const commit = (oid, at, login) => ({ __typename: "PullRequestCommit", commit: { oid, abbreviatedOid: oid.slice(0, 7), messageHeadline: "c " + oid, committedDate: at, url: "u", author: { user: { login } } } });
    const data = { node: { timelineItems: { totalCount: 7, nodes: [
      commit("a1", "2026-01-01T00:00:00Z", "me"), commit("a2", "2026-01-02T00:00:00Z", "me"), commit("a3", "2026-01-03T00:00:00Z", "me"),
      { __typename: "IssueComment", id: "C", author: { login: "bot" }, body: "hi", createdAt: "2026-01-04T00:00:00Z", url: "cu" },
      { __typename: "LabeledEvent", createdAt: "2026-01-05T00:00:00Z", actor: { login: "me" }, label: { name: "v1", color: "fff" } },
      commit("a4", "2026-01-06T00:00:00Z", "me"), { __typename: "PullRequestRevisionMarker" } ] } } };
    const tl = timelineOf(data);
    expect(tl.events.map(e => e.kind + ":" + (e.oid ?? e.id ?? e.type))).toEqual(["commit:a4", "event:LabeledEvent", "comment:C", "commit:a3", "commit:a2", "commit:a1"]);
    expect(timelineRows(tl.events).map(r => r.kind + (r.count ? r.count : ""))).toEqual(["commit", "event", "comment", "commit", "fold2"]);
    expect(timelineRows(tl.events, { expanded: new Set(["run:a3"]) }).map(r => r.kind)).toEqual(["commit", "event", "comment", "commit", "commit", "commit"]);
    expect(tl.events[1]).toMatchObject({ text: "added", label: { name: "v1" } });
  });
  test("a pull request's work places are panes on its repository and head branch, a tab once, shown first", () => {
    const item = normalize(pr("P", "o/r", 1, { headRefName: "fix/x" }));
    const at = (pane, tab, extra) => ({ repo: "o/r", branch: "fix/x", pane, tab, space: "S", spaceName: "fix-x", tabName: "t" + tab, status: "idle", focused: false, active: false, changedAt: 0, ...extra });
    const places = [at("p1", "A", { changedAt: 5 }), at("p2", "A", { status: "working" }), at("p3", "B", { changedAt: 9 }), at("p4", "C", { active: true }),
      { ...at("p5", "D"), branch: "main" }, { ...at("p6", "E"), repo: "o/other" }];
    const got = workPlaces(item, places);
    expect(got.map(p => p.tab + ":" + p.panes.join(",") + ":" + p.status)).toEqual(["C:p4:idle", "B:p3:idle", "A:p1,p2:working"]);
    expect(workPlaces(normalize(issue("I", "o/r", 2)), places)).toEqual([]);
    expect(workPlaces({ ...item, head: null }, places)).toEqual([]);
  });
});
