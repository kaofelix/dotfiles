// Which folders say what project the tab bar is looking at. A panel (Kubernetes, Beads, Changes) has no folder of
// its own, so the space's other terminals decide too: the focused one first, then its tab, then the rest of the
// space, then the space's own folder. No herdr imports, so tests load it directly.

export function candidateFolders(f, spaces, panes) {
  if (!f) return [];
  const space = spaces.find(s => s.id === f.space);
  const tabs = space?.tabs?.map(t => t.id) ?? [f.tab];
  const out = [];
  const add = (cwd) => { if (cwd && !out.includes(cwd)) out.push(cwd); };
  add(f.cwd);
  const terminals = panes.filter(p => p.cwd && tabs.includes(p.tab));
  for (const p of terminals) if (p.tab === f.tab) add(p.cwd);
  for (const p of terminals) if (p.tab !== f.tab) add(p.cwd);
  add(space?.folder);
  return out;
}

// The first candidate known to be a project. `known` maps "machine|cwd" to a root (or null: not one); folders not in
// it yet are returned as `unknown` so the caller can look them up.
export function pickRoot(folders, on, known) {
  const unknown = [];
  for (const cwd of folders) {
    const key = (on ?? "") + "|" + cwd;
    if (!known.has(key)) { unknown.push(cwd); continue; }
    const root = known.get(key);
    if (root) return { root: { repo: root, on }, unknown };
  }
  return { root: null, unknown };
}
