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
- **The dropdown** (`p`) lists Home, pins, the repositories in your results and the ones you pushed to recently. Typing narrows it; a typed `owner/name`
  not listed opens that repository. `cmd-p` there pins the highlighted one. `esc` goes back to the previous scope.
- **Lists:** PRs / Issues (`tab`, `1`, `2`) and Open / Closed / All (`s`). Each section loads its 25 most recently updated items; **Load more** at its end (or `enter` on it) fetches the next 25, and `of N ↗` opens the full GitHub search. A count with `+` has more to load.
  Rows show state, number, title, labels, repository, conflicts, review decision, CI (green, red, yellow), comments, author and last update.
- **Filter:** free text (title, repository, author, branch, labels), `repo:`, `org:`, `@author` (`@me`), `assignee:`, `#label`, a number,
  `is:open|draft|merged|closed|completed|not_planned|private|conflict`, `ci:pass|fail|pending`, `review:approved|changes|required|none`, and `-` to negate.
- **Details:** state, review and CI chips, labels, branch and size, assignees and requested reviewers; failing and running checks (all on request, each opens its run),
  the latest reviews, linked issues and pull requests, the description and the latest comments.
  **Open** opens it in the browser and **Copy link** copies its URL. A pull request whose repository is cloned in a folder an open terminal is in also gets **Review diff**, which opens it in the Changes dialog.
- **Commands:** `github.reload`, `github.scope`, `github.home`, `github.next-pin`, `github.copy` and `github.browse` (from keys.json or `herdr-app do`).
- **Keys:** `j`/`k` move, `enter` opens, `o` opens on GitHub, `c` copies the URL, `C` copies `owner/repo#N`, `d` reviews the diff,
  `R` narrows to the item's repo, `P` pins, `h` (or `m`) Home, `/` filters, `r` reloads.

Each section is its own `gh api graphql` search (about 3 of the 5000 hourly points per page), three at a time, so sections fill in as they arrive.
GitHub gives up on a search after about 10 s (502/504); a page that does is retried with 9 items, and a section that still fails shows a retry row.
Results for the last 8 scope/state pairs, the last 40 opened items and the pane's choices are kept in `~/.config/herdr-app/cache/github/`, shared by every GitHub pane (localStorage is per pane, so a new pane would start empty). While the side panel shows something else, polling pauses; shown again, it catches up. A new copy shows the cache at once and refreshes behind them.
A state with nothing kept yet starts from the scope's others (All from Open and Closed, Open or Closed from All, filtered) until its own pages land.
First pages refresh every 2 minutes (`r` now) and keep the pages loaded after them; an opened item is refetched when it changes.
If Herdr's PATH lacks `gh`, it is looked up in the mise/asdf shims, `~/.local/bin` and Homebrew.
Pure logic lives in `model.js` (`tests/herdr-github.test.ts`).
