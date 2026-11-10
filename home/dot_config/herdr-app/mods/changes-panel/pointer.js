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

// The fixed-width parts at a row's right edge, listed from the right as { id, width, click }.
// A row in the diff list can't have handlers of its own, so a press is told apart by where it
// landed: the row draws these parts at exactly these widths (see renderHeader) and this walks
// the same list. Each part also claims half the gap on either side, and the rightmost part the
// row's right padding. Returns the id of a clickable part, or null for the rest of the row.
export function partAt(fromRight, parts, pad, gap) {
  let edge = pad;
  for (const [i, part] of parts.entries()) {
    const start = i === 0 ? 0 : edge - gap / 2;
    const end = edge + part.width + gap / 2;
    if (fromRight >= start && fromRight < end) return part.click ? part.id : null;
    edge += part.width + gap;
  }
  return null;
}

// How much of a row the parts take, gaps included: what the rest of the row has left.
export function partsWidth(parts, gap) {
  return parts.reduce((sum, part) => sum + part.width + gap, 0);
}
