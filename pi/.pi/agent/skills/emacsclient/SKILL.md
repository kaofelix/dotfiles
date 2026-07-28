---
name: emacsclient
description: Use emacsclient to open files, inspect or debug a running Emacs, evaluate or reload Elisp, or manage windows.
---

# Emacsclient Integration

## Operational Rules

Assume the Emacs server is available and run the requested operation directly. If `emacsclient` fails because it cannot connect to the server, stop and tell the user to start Emacs.

- Shell-quote every path and place `--` before file arguments.
- Treat user-provided paths and search text as data, not executable Elisp. Prefer `emacsclient` file arguments over interpolating them into Elisp strings.
- For contextual inspection, operate on `(window-buffer (selected-window))`. This means Emacs' selected window; if multiple frames make the intended target ambiguous, inspect the frames or ask the user rather than guessing.
- Guard optional state such as active regions and current projects. Resolve transient buffers with `get-buffer` immediately before using them because their names and existence can change.
- Prefer small, labeled results such as plists over unbounded dumps of hooks, faces, properties, or buffer text.
- Check unfamiliar, internal, package-provided, or version-sensitive functions with `fboundp` before using them in live diagnostics. Prefer public functions.
- Use inline `--eval` for small expressions. Put complex instrumentation or reusable diagnostics in a temporary `.el` file and load it.
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

Guard access to a transient named buffer:

```elisp
(let ((buffer (get-buffer "<buffer-name>")))
  (when buffer
    (with-current-buffer buffer
      <expression>)))
```

### Reloading Elisp

```bash
# Reload a changed file
emacsclient --eval '(load-file "/absolute/path/to/file.el")'
```

For complex diagnostics, create a temporary directory with `mktemp -d`, write the diagnostic `.el` file there, load it with `load-file`, and remove the directory after restoring any temporary advice or hooks.

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

## Debugging Live Emacs

Advance on observed evidence and test one hypothesis at a time.

1. Inspect a compact, labeled baseline before changing state. This step is complete when the intended buffer and relevant live values are confirmed.
2. Reproduce the behavior and capture comparable before/after state. This step is complete when every relevant difference is known, including the finding that no Lisp-visible state changed.
3. Instrument the narrowest boundary containing the transition, such as a hook, timer, process filter, command boundary, or redisplay function. This step is complete when the transition is localized to one interval or function.
4. Change one suspected factor and reproduce again. This step is complete when the behavior follows that factor or the hypothesis is rejected.
5. Remove temporary advice, hooks, files, and live configuration changes. This step is complete when Emacs is restored and the conclusion names only verified evidence.

## Current Project Root

Returns `nil` when the selected buffer is outside a project.

```bash
emacsclient --eval '(with-current-buffer (window-buffer (selected-window))
  (let ((project (project-current nil)))
    (when project (project-root project))))'
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

## Function and Variable Availability

```bash
# Function
emacsclient --eval '(fboundp (quote <function-name>))'

# Variable
emacsclient --eval '(boundp (quote <variable-name>))'

# Loaded feature
emacsclient --eval '(featurep (quote <feature-name>))'
```
