---
name: emacsclient
description: Use emacsclient to open files in Emacs, inspect the selected buffer or region, evaluate Elisp, manage Emacs windows, or inspect project.el state.
---

# Emacsclient Integration

## Operational Rules

Assume the Emacs server is available and run the requested operation directly. If `emacsclient` fails because it cannot connect to the server, stop and tell the user to start Emacs.

- Shell-quote every path and place `--` before file arguments.
- Treat user-provided paths and search text as data, not executable Elisp. Prefer `emacsclient` file arguments over interpolating them into Elisp strings.
- For contextual inspection, operate on `(window-buffer (selected-window))`. This means Emacs' selected window; if multiple frames make the intended target ambiguous, inspect the frames or ask the user rather than guessing.
- Guard optional state such as active regions and current projects.
- Split, delete, or otherwise mutate windows only when the user explicitly requests it.

An operation is complete when it succeeds against the intended buffer or frame. Otherwise, report the server, state, or frame ambiguity that prevented it.

## Opening Files

```bash
# Open file without waiting
emacsclient -n -- "<file>"

# Open at a specific line
emacsclient -n +<line> -- "<file>"

# Open at a specific line and column
emacsclient -n +<line>:<column> -- "<file>"

# Open directory in Dired
emacsclient -n -- "<directory>"
```

## Evaluating Elisp

```bash
emacsclient --eval '<elisp-expression>'
```

Use this pattern for the selected buffer:

```elisp
(with-current-buffer (window-buffer (selected-window))
  <expression>)
```

## Inspecting the Selected Buffer

```bash
# Buffer name
emacsclient --eval '(with-current-buffer (window-buffer (selected-window)) (buffer-name))'

# File path; nil when the buffer is not visiting a file
emacsclient --eval '(with-current-buffer (window-buffer (selected-window)) buffer-file-name)'

# Major mode
emacsclient --eval '(with-current-buffer (window-buffer (selected-window)) major-mode)'

# Active minor modes
emacsclient --eval '(with-current-buffer (window-buffer (selected-window))
  (cl-remove-if-not (lambda (mode) (and (boundp mode) (symbol-value mode)))
    (mapcar (function car) minor-mode-alist)))'

# Current line number
emacsclient --eval '(with-current-buffer (window-buffer (selected-window)) (line-number-at-pos))'

# Default directory
emacsclient --eval '(with-current-buffer (window-buffer (selected-window)) default-directory)'
```

### Variables

```bash
# Global value
emacsclient --eval '<variable-name>'

# Value in the selected buffer
emacsclient --eval '(with-current-buffer (window-buffer (selected-window)) <variable-name>)'
```

### Selected Region

```bash
emacsclient --eval '(with-current-buffer (window-buffer (selected-window))
  (when (use-region-p)
    (buffer-substring-no-properties (region-beginning) (region-end))))'
```

### Text Around Point

```bash
emacsclient --eval '(with-current-buffer (window-buffer (selected-window))
  (buffer-substring-no-properties
    (max (point-min) (- (point) 100))
    (min (point-max) (+ (point) 100))))'
```

## Project.el

These expressions return `nil` outside a project instead of raising an error.

```bash
# Current project root
emacsclient --eval '(with-current-buffer (window-buffer (selected-window))
  (let ((project (project-current nil)))
    (when project (project-root project))))'

# Current project object
emacsclient --eval '(with-current-buffer (window-buffer (selected-window))
  (project-current nil))'

# Number of project files
emacsclient --eval '(with-current-buffer (window-buffer (selected-window))
  (let ((project (project-current nil)))
    (when project (length (project-files project)))))'
```

## Frames and Windows

```bash
# Buffers visible in the selected frame
emacsclient --eval '(mapcar (lambda (window) (buffer-name (window-buffer window))) (window-list))'

# Number of frames
emacsclient --eval '(length (frame-list))'

# Split the selected window
emacsclient --eval '(split-window-right)'
emacsclient --eval '(split-window-below)'

# Delete other windows in the selected frame
emacsclient --eval '(delete-other-windows)'
```

## Function Availability

```bash
emacsclient --eval '(fboundp (quote <function-name>))'
```
