# Beads

A read-only viewer for [beads](https://github.com/gastownhall/beads) issues in the focused project.

- **Opening it:** `tabs-flat` shows a **Beads** button when the focused folder, or one of its parents, has `.beads/metadata.json`.
  The button, or `cmd-shift-b` (`tabs-flat.beads`), toggles a Beads pane split to the right. The pane is pinned to that project.
- **Props:** `{ repo?, on?, issue? }`. Without `repo`, the pane follows the focused pane's folder. `issue` opens that bead's details.
- **The list:** issues are grouped into the In progress, Blocked, Open, Deferred and Closed sections.
  An open issue with an unfinished `blocks` dependency counts as blocked.
  Children nest under their parent epic in every section. A parent outside a section is shown dimmed as context.
  The chips hide or show sections. Section and node folding is saved per project.
- **Filter:** free text matches the ID, title, description and labels. It also takes `type:bug`, `p0`, `p:1-2`, `@who` (`@` alone means unassigned), `#label`, `is:open|blocked|closed|wip` and `parent:<id>`.
  Prefix a term with `-` to negate it.
- **Sort:** **Smart** puts active work in priority order and closed work newest-closed first. You can also sort by priority, updated, created, ID or title. `s` cycles the sort and `S` reverses it.
- **Details:** status, people and dates, close reason, description, design, acceptance criteria, notes (markdown), parent, epic progress, blocked-by and blocks, children, related issues and comments.
  Links navigate between issues, and `esc` goes back. Below 720px wide, the details replace the list.
- **Keys:** `j`/`k` or the arrow keys move, `enter` opens, `h`/`l` fold, `/` filters, `r` reloads and `c` copies the ID.

Data comes from `bd list --all --json --limit 0 --readonly`, plus `bd show --include-comments` for the open issue.
For embedded Dolt, the pane polls the manifest every 4 s (reads leave it unchanged) and reloads only when it changes. Server-mode databases reload every 15 s.
If Herdr's PATH lacks `bd`, it is looked up in the mise/asdf shims, `~/.local/bin` and Homebrew.
Pure logic lives in `model.js` (`tests/herdr-beads.test.ts`).
