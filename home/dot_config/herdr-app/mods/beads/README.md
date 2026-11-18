# Beads

A read-only viewer for [beads](https://github.com/gastownhall/beads) issues in the focused project.

- **Opening it:** `tabs-flat` shows a **Beads** button when the focused folder, or one of its parents, has `.beads/metadata.json`.
  The button, or `cmd-shift-b` (`tabs-flat.beads`), toggles a Beads pane split to the right. The pane is pinned to that project.
- **Props:** `{ repo?, on?, issue? }`. Without `repo`, the pane follows the focused pane's folder. `issue` opens that bead's details.
- **The list:** issues are grouped into the In progress, Open, Blocked, Deferred and Closed sections.
  An open issue with an unfinished `blocks` dependency counts as blocked.
  Children nest under their parent epic in every section. A parent outside a section is shown dimmed as context.
  The chips hide or show sections. Section and node folding is saved per project.
- **Filter:** free text matches the ID, title, description and labels. It also takes `type:bug`, `p0`, `p:1-2`, `@who` (`@` alone means unassigned), `#label`, `is:open|blocked|closed|wip` and `parent:<id>`.
  Prefix a term with `-` to negate it.
- **Sort:** **Smart** puts active work in priority order and closed work newest-closed first. You can also sort by priority, updated, created, ID or title. `s` cycles the sort and `S` reverses it.
- **Details:** status, people and dates, close reason, description, design, acceptance criteria, notes (markdown), parent, epic progress, blocked-by and blocks, children, related issues and comments.
  Links navigate between issues, and `esc` goes back. Below 720px wide, the details replace the list.
- **Stats** (`t`, or List/Stats in the header): flow metrics for the last 7, 30 or 90 days, or for all time. A window never starts before the first bead. The filter applies to every metric, and epics, milestones and molecules are left out.
  - Headlines:
    - lead time (created → closed) and cycle time (started → closed), each as a median and an 85th percentile
    - throughput next to arrivals, coloured yellow when more beads arrive than close
    - WIP, with the days it would take to clear the open work at the current pace (Little's law)
  - Charts:
    - closed and created per day (per week past 6 weeks)
    - a lead-time histogram
    - a cumulative flow chart (closed, in progress and open at each day's end)
    - the queue/working time split, with flow efficiency
  - Lists of beads (each one opens its details):
    - in progress by age, in red past the 85th percentile cycle time
    - open beads waiting longest
    - the slowest beads closed in the window
  - Breakdowns by type, priority, assignee and label: closed/open counts and median lead time.
  - The metrics live in `stats.js` (`tests/herdr-beads-stats.test.ts`) and the view in `statsview.js`. The `view: "stats"` prop and the `beads.stats` / `beads.list` commands switch views.
- **Keys:** `j`/`k` or the arrow keys move, `enter` opens, `h`/`l` fold, `/` filters, `r` reloads, `c` copies the ID and `t` switches between List and Stats.

Data comes from `bd list --all --json --limit 0 --readonly`, plus `bd show --include-comments` for the open issue.
For embedded Dolt, the pane polls the manifest every 4 s (reads leave it unchanged) and reloads only when it changes. Server-mode databases reload every 15 s.
If Herdr's PATH lacks `bd`, it is looked up in the mise/asdf shims, `~/.local/bin` and Homebrew.
Pure logic lives in `model.js` (`tests/herdr-beads.test.ts`).
