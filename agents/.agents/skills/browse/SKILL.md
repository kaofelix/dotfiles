---
name: browse
description: Control an existing Chromium-based browser through browse-cli for browser automation, screenshots, form filling, page inspection, and UI debugging. Use when the user refers to an open browser tab or needs interaction with a logged-in browser session.
---

# Browse Browser Automation

Browse connects to the browser hosting its extension; it does not require a separate automation browser. Preserve that browser and its logged-in session.

## 1. Select the browser and target

```bash
command -v browse
browse --help
browse tab.list
```

- **Existing tab:** identify the user's tab by URL/title. Ask if the intended target is ambiguous.
- **New page:** use `browse tab.new "https://example.com"` and record the returned tab ID.
- **Separate workspace:** when isolation is useful, use `browse window.new "https://example.com"` in the connected browser and record both returned IDs. Reuse the user's existing tab when that is the task.

Set `TAB_ID` to the actual returned or listed ID. Pass `--tab-id "$TAB_ID"` on every page-scoped command, including naming, reads, waits, and interactions. Examples below assume this variable is set in the current shell invocation; re-establish it in fresh shells.

```bash
browse page.state --tab-id "$TAB_ID"
browse tab.name task --tab-id "$TAB_ID"  # Optional alias, not a substitute for targeting
```

Use `navigate URL --tab-id "$TAB_ID"` to change that tab's URL. Use `tab.switch ID` only when bringing the tab forward is useful; active-tab selection is not a targeting guarantee. After a pause or user handoff, confirm the target again.

**Complete when:** the connected browser is the intended one and the selected tab's URL/title match the task. If selection fails, stop dependent commands and use the recovery section; suppressing the error can send later commands to an unrelated tab.

## 2. Inspect before interacting

```bash
browse page.text --tab-id "$TAB_ID"
browse page.read --tab-id "$TAB_ID"
```

- **Content:** `page.text` extracts page text without the accessibility-tree overhead. For long output, save it to a temporary file and read all relevant content. Lazy-loaded or virtualized pages may require scrolling and further reads; text extraction alone does not prove the entire document was loaded.
- **Interaction:** `page.read` supplies viewport element refs. Re-read after navigation or substantial UI changes. Use `page.read --ref e5` for targeted detail; reach for `--all` only when broader coverage is needed, since large trees can exceed output limits.
- **Off-screen content:** scroll and inspect again. An existing ref can remain usable after scrolling; `scroll.to --ref e5` brings it into view. Refresh refs if the element is replaced or lookup fails.
- **Precise evidence:** use targeted JavaScript to inspect DOM state, links, or layout measurements rather than dumping the whole DOM.

```bash
browse js 'return {title: document.title, url: location.href}' --tab-id "$TAB_ID"
```

For multiline or quote-heavy JavaScript, write a temporary file and use `browse js --file /absolute/path/inspect.js --tab-id "$TAB_ID"`.

**Complete when:** the relevant content or controls have been observed on the selected page, with current refs or another verified target for the next interaction.

## 3. Interact and observe the transition

Use refs from the preceding read, replacing these illustrative refs with actual ones:

```bash
browse type "hello" --ref e5 --tab-id "$TAB_ID"
browse click --ref e6 --tab-id "$TAB_ID"
browse wait.element ".results" --tab-id "$TAB_ID"
browse page.read --tab-id "$TAB_ID"
```

Choose a wait matching the expected transition (`wait.element`, `wait.url`, or `wait.dom`); `wait.load` alone does not establish that an application's data or extension content script is ready. Inspect the resulting state after the wait.

For form batches, semantic locators, contenteditable input, frames, uploads, dialogs, or network/performance inspection, discover the installed interface before constructing a command:

```bash
browse --find form
browse form.fill --help
browse --help-topic frames
```

Honor the requested action boundary: filling a form is not permission to submit it. Hand password/2FA challenges back to the user when manual authentication is needed, then reconfirm the target before continuing.

**Complete when:** the expected transition is visible, or its failure is captured and diagnosed. A timeout after a potentially mutating action calls for inspection before any retry, to avoid duplicate submissions.

## 4. Verify and restore

Verify the requested outcome on the intended URL after the final change—not merely the command's exit status. For UI checks, exercise the relevant interaction and inspect its resulting state; use console or network evidence when needed.

```bash
browse screenshot --output /absolute/path/shot.png --tab-id "$TAB_ID"
browse screenshot --fullpage --output /absolute/path/page.png --tab-id "$TAB_ID"
```

Screenshots save to a file by default. Open the saved image to verify its contents. For a full-page claim, check that it actually covers the intended page; consult `screenshot --help` for capture-height and resolution limits.

For responsive checks, prefer tab-scoped `emulate.device` or `emulate.viewport` over resizing the user's window. Measure the actual layout after emulation:

```bash
browse emulate.device "iPhone 14" --tab-id "$TAB_ID"
browse js 'return {url: location.href, innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth}' --tab-id "$TAB_ID"
```

Compare the measured viewport and overflow with the intended requirement. After fixing a layout issue, repeat the failing measurement and visual check; an earlier desktop pass does not establish a mobile pass.

Record pre-existing emulation/window settings before changing them and restore them afterward, including on failure. When starting from desktop defaults, `emulate.device reset` restores desktop mode and `emulate.network reset` removes throttling. Both need the selected tab ID. Keep cleanup possible even if verification fails. Close only tabs/windows created for this task, and leave any requested handoff page open.

**Complete when:** final observations support each claimed result, temporary browser changes are restored, and the report distinguishes passes, failures, and unverified checks. Include the target and evidence paths where useful; report a blocker rather than claiming success from incomplete evidence.

## Recovery: diagnose the failing layer

| Symptom | Next action |
| --- | --- |
| `browse: command not found` | Check `command -v browse` and the configured package manager/PATH. Use a verified existing installation if found; otherwise report the missing executable before proposing installation. |
| Socket missing, connection refused, native host unavailable | Confirm which browser hosts the extension. Ask the user to reload that extension or restart their chosen browser, then retry `tab.list` once. Launching another browser or killing host processes requires agreement; multiple-browser conflicts are a hypothesis to verify, not the default diagnosis. |
| `Content script not loaded` | If reloading will not discard user input or repeat an unsafe action, reload the selected tab with `tab.reload --tab-id "$TAB_ID"`, wait for load, and retry the read once. Otherwise ask before reloading. |
| Missing/invalid tab ID, unexpected URL | Stop the action chain, run `tab.list`, select the intended page again, and confirm its URL/title before continuing. |
| Unknown command/option, missing required argument | Consult command-specific help and correct the syntax before retrying. |
| Timeout or restricted page | Inspect target/readiness and capture the exact error. Check whether the action already took effect. For browser-internal or authentication pages that cannot be automated, request a manual handoff. |

If the targeted recovery fails, report the exact command/error and the smallest user action needed. Resume only after new evidence or a changed condition; avoid repeating the same failing sequence.

## CLI help is the command reference

Use `browse --help`, `browse --help-full`, `browse --find TERM`, `browse COMMAND --help`, and `browse --help-topic TOPIC` for installed syntax. The upstream [README](https://github.com/juanibiapina/browse-cli#readme) covers setup and architecture.

Known distinctions worth checking when adapting older examples:

- `window.resize` requires the window's `--id`; global `--window-id` is not that argument.
- Cookie commands are `cookie.list` and `cookie.clear --name NAME`. Keep cookie mutations scoped to the requested task and selected tab.
