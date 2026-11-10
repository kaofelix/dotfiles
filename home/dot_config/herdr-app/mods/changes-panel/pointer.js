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
// are laid out from the right as: Viewed, gap, stats, gap, editor; `pad` is the header's right
// padding. The stats column is fixed-width so the editor button sits at a known place.
export function headerPart(fromRight, { viewed, stats, editor }, pad, gap) {
  const x = fromRight - pad;
  if (x < viewed + gap) return "viewed"; // the gap belongs to Viewed
  const editorAt = viewed + gap + stats + gap;
  if (x >= editorAt && x < editorAt + editor) return "editor";
  return "header";
}
