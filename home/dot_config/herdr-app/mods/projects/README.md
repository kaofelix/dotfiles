# Local project picker

Press **Cmd+O**, or run `herdr-app do mod.open --name projects`.

The picker lists non-hidden directories directly under `~/Code`. Type any
ordered letters from a project name to fuzzy search. Use Up/Down or Ctrl+P/Ctrl+N
to select, then Enter to open, or click a row. Escape closes the picker.

Projects with an existing local space appear first when the search is empty.
Opening one switches to that space, including renamed spaces and terminals
inside project subdirectories. Otherwise it creates a named space with a shell
in the project folder. Remote spaces are excluded from matching.

A colored arrow marks an open space; a muted square-plus marks a project that
will create a new space. The footer describes the selected action. Icons are
local SVG files, tinted with the current theme through gpui-kit's `svg()`.

The directory list refreshes when folders are added or removed. This first
version does not scan nested projects or query GitHub.

The same mod can be opened beside a terminal as a pane:

```sh
herdr-app do pane.split '{"direction":"right","pane":"<pane-id>","mod":"projects"}'
```

Get the target pane ID from `herdr-app ls`. A pane stays available after opening
a project; the keyboard shortcut opens a temporary dialog.

Source files are managed by chezmoi. From the dotfiles checkout, apply just this
mod and its shortcut with:

```sh
chezmoi --source="$PWD" apply "$HOME/.config/herdr-app/mods/projects" "$HOME/.config/herdr-app/keys.json"
```
