---
name: herdr-clone-check
description: Check whether Herdr app mods or layouts cloned from shipped ones (for example files-flat, changes-flat, main-flat in ~/.config/herdr-app) are missing upstream changes. Use after a Herdr app update, when asked whether cloned mods or layouts are stale or out of date, or before porting upstream changes into a clone.
---

# Herdr clone check

Herdr rewrites its shipped mods and layouts on every start, but clones
(`herdr-app do mod.clone` / `layout.clone`) are never updated. A clone records
`cloned_from: {name, version}` in its `mod.json` or layout file. The shipped
original stays on disk and is always current, so a clone can be compared with
its original.

The version alone is a weak signal: a version bump may not touch the mods you
cloned. Compare content instead.

## Check

```sh
~/.agents/skills/herdr-clone-check/scripts/check-clones.sh [NAME...]
```

For every clone it prints the cloned-from version next to the installed app
version, then a unified diff from the shipped original to the clone. Clone-only
noise is removed (`cloned_from`, asset paths like `mods/files-flat/` →
`mods/files/`, JSON key order), and generated files (`gpui-kit.d.ts`,
`jsconfig.json`) are ignored.

The diff holds your own edits plus any upstream changes the clone is missing.
Your edits are in git, so read the diff for hunks you don't recognize as yours.
Those are the upstream changes.

## Port a change

1. Decide which unfamiliar hunks you want. Skipping one is fine.
2. Apply the wanted change to the clone, keeping your own edits. For a tracked
   clone, edit the live file, then `chezmoi --source="$PWD" re-add <file>` from
   the dotfiles checkout and review the diff.
3. Update `cloned_from.version` in the clone's `mod.json` (or layout file) to
   the app's current version.

Never edit shipped mods or layouts to test a diff; Herdr overwrites them at the
next start.
