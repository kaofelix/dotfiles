// Where the pointer is, for keys that act on "this file". Pure.

// The row under `y` (px below the top of the list), walking down the row heights from `top`,
// the first row drawn. The list reports no scroll offset, so a partly hidden first row skews
// the result by at most its hidden part. Null below the last row.
export function rowAt(sizes, top, y, count = sizes.length) {
  for (let i = Math.max(0, top); i < count; i++) {
    y -= sizes[i] ?? 0;
    if (y < 0) return i;
  }
  return null;
}

// Which part of a file header a press `fromRight` px from its right edge landed on. Parts
// are laid out from the right as: editor, gap, Viewed; `pad` is the header's right padding.
export function headerPart(fromRight, { editor, viewed }, pad, gap) {
  const x = fromRight - pad;
  if (x < editor) return "editor";
  if (x < editor + gap + viewed) return "viewed";
  return "header";
}
