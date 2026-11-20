# GitHub

A read-only dashboard of your pull requests and issues across repositories, or of everything in one repository.

- **Opening it:** it lives in the side panel beside Files (`github` in `main-flat`'s `panel-body` stack). The **GitHub** button in `tabs-flat`
  and `cmd-shift-h` (`tabs-flat.github`) show or hide it. It isn't tied to a space: switching spaces leaves it open as it was.
- **Props** (when used elsewhere, e.g. as a pane): `{ scope?, kind? }`. `scope` is `"me"` or `"owner/name"`; `kind` is `"pr"` or `"issue"`.
- **Pinned repositories:** pin from the scope list's pin button, the header's pin while a repository is shown, or `P` (the shown repository, else the selected item's).
  Pins show as chips under the toolbar, after **Home**, for one-click switching, and first in the scope list. They're kept with the other choices.
- **Home** (`h`, the header dropdown's first entry): my open work in two blocks, *Pull requests* and *Issues*, each one list across repositories:
  review requests first (tagged **to review**), then newest first, eight each. **View all** (`1`, `2`) opens that kind's full list: *Review requested*,
  *Created by me*, *Reviewed by me*, *Assigned to me* and *Involved* for pull requests; *Assigned to me*, *Created by me* and *Involved* for issues, with
  Open / Closed / All and **by repo** (`g`), where a repository's **open repo →** narrows to it. `esc` goes back to Home.
- **A repository** (a pin, the dropdown, `R` on an item): *Review requested*, *Created by me*, then *Everyone else*. Its header pins it, opens it on GitHub,
  and has a **Projects** menu of the projects linked to it (open ones first), each opening on GitHub.
- **Milestones** (a repository's third tab, `3`): one row per milestone (Open / Closed / All), open ones by due date, with the due date (red once past),
  a progress bar and closed/total. Click (or `enter`) expands one; **focus** (`f`, alt-click) shows only it. Expanded, its open work is grouped by epic:
  each epic with its open sub-issues (marked **sub** when they aren't in the milestone themselves), then **Other open work**, then its open pull requests.
  Rows show the owner's avatar (a pull request with nobody assigned, its author's), **unassigned** in yellow; **by owner** (`w`) groups by assignee instead. What's expanded is kept per repository; `o` opens the milestone on GitHub.
- **Sidebar** (`b`, the header's first button): Home, pinned repositories, then the rest (from your results and recent pushes), with its own search
  (`enter` opens the first match, a typed `owner/name` any repository) and a pin button per row. It's shown or hidden, never folded; the choice is kept.
  With it shown, the pin chips above the toolbar go, since the sidebar has them.
- **The dropdown** (`p`) lists Home, pins, the repositories in your results and the ones you pushed to recently. Typing narrows it; a typed `owner/name`
  not listed opens that repository. `cmd-p` there pins the highlighted one. `esc` goes back to the previous scope.
- **Lists:** PRs / Issues (`tab`, `1`, `2`) and Open / Closed / All (`s`). Each section loads its 25 most recently updated items; **Load more** at its end (or `enter` on it) fetches the next 25, and `of N ↗` opens the full GitHub search. A count with `+` has more to load.
  Rows show state, number, title, labels, repository, conflicts, review decision, CI (green, red, yellow), comments, author and last update.
- **Filter:** free text (title, repository, author, branch, labels; quote to keep spaces), `repo:`, `org:`, `@author` (`@me`), `assignee:`, `#label` or `label:"area: ci"`, a number,
  `milestone:"GTC DC"`, `type:epic`, `no:milestone|assignee|label`,
  `is:open|draft|merged|closed|completed|not_planned|private|conflict`, `ci:pass|fail|pending`, `review:approved|changes|required|none`, and `-` to negate.
- **Chips are filters:** click a row's label, milestone (◆, without "Roadmap:"), type, review chip or repository name to add it to the filter;
  it's highlighted while it's there, and a second click takes it away.
- **Pinned items:** `x` or the pin in an item's details pins a pull request or issue; Home then starts with a **Pinned** block (only while something is pinned).
  Pins are kept with their last-seen state and refreshed by id, so closed or merged ones stay until unpinned. Pinned rows elsewhere show a pin.
- **Where it's open:** a pull request whose head branch is checked out in a terminal (a clone of its repository, matched by remote
  and Herdr's live branch) gets a robot on its row, after its chips, tinted by its agent's state (a count when in several places; hover names them); click it, or `J`, to go
  there (space, tab and pane). Its details list every such place under **Open in**. Folders are asked for their remote once each.
- **Merge box** (a pull request's details, at the top, as on GitHub's new PR page): what stands between it and merging, in GitHub's order
  (merge conflicts, draft, failing checks, changes requested, out of date, review required, running checks, open conversations), else ready to merge,
  A draft offers **Ready for review** (runs `gh pr ready`; the panel's first write action, undone on GitHub with Convert to draft).
  Ready to merge offers **Merge on GitHub**; merged and closed ones get a single line instead (who merged it, the merge commit, when, **Copy SHA**),
  and a list that still says open is corrected by the details. Approvals counts requested reviewers who haven't answered as pending.
  with **Resolve on GitHub** (its conflict editor) for conflicts and **Review diff** whenever the repository is cloned in an open terminal. Under it, **Checks**, **Conversations** (review threads) and
  **Approvals**, each with a bar; clicking Checks lists them all.
- **Activity** (a pull request's details, after its description): the timeline as GitHub draws it, newest first (the latest 100 entries).
  Comments and reviews are cards (approvals and requested changes coloured), commits and events one line each on a rail: labels (clickable),
  review requests, force-pushes, renames, milestones, assignments, mentions, merge and close. Three or more commits in a row by one author fold
  into "n more commits by …"; a commit's short SHA copies the full one.
- **Collapsible sections:** `<details>`/`<summary>` in any description, comment or review is drawn folded with its summary (open if it says `open`),
  nested ones too, as on GitHub; click to open.
- **Details:** state, review and CI chips, labels, branch and size, assignees and requested reviewers; failing and running checks (all on request, each opens its run),
  linked issues and pull requests and the description; for issues, the latest reviews and comments, for pull requests the Activity.
  **Open** opens it in the browser and **Copy link** copies its URL. **Review diff** (in the merge box, or `d`) opens it in the Changes dialog when its repository is cloned in a folder an open terminal is in.
- **Commands:** `github.reload`, `github.scope`, `github.home`, `github.sidebar`, `github.next-pin`, `github.milestones`, `github.focus-next-milestone`, `github.copy` and `github.browse` (from keys.json or `herdr-app do`).
- **Keys:** `j`/`k` move, `enter` opens, `o` opens on GitHub, `c` copies the URL, `C` copies `owner/repo#N`, `d` reviews the diff,
  `R` narrows to the item's repo, `P` pins the repository, `x` pins the item, `h` (or `m`) Home, `/` filters, `r` reloads.

Each section is its own `gh api graphql` search (about 3 of the 5000 hourly points per page), three at a time, so sections fill in as they arrive.
GitHub gives up on a search after about 10 s (502/504); a page that does is retried with 9 items, and a section that still fails shows a retry row.
Milestones and the open work of those opened are kept too (`milestones.json`). Results for the last 8 scope/state pairs, the last 40 opened items and the pane's choices are kept in `~/.config/herdr-app/cache/github/`, shared by every GitHub pane (localStorage is per pane, so a new pane would start empty). While the side panel shows something else, polling pauses; shown again, it catches up. A new copy shows the cache at once and refreshes behind them.
A state with nothing kept yet starts from the scope's others (All from Open and Closed, Open or Closed from All, filtered) until its own pages land.
First pages refresh every 2 minutes (`r` now) and keep the pages loaded after them; an opened item is refetched when it changes.
Avatars (authors on rows, owners in milestones, people in details; hover for the username) are downloaded once with `curl` into `cache/github/avatars/`, initials until then.
If Herdr's PATH lacks `gh`, it is looked up in the mise/asdf shims, `~/.local/bin` and Homebrew.
Pure logic lives in `model.js` (`tests/herdr-github.test.ts`).
