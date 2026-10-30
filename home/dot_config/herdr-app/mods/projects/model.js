export function normalizePath(path, home) {
  if (!path) return "";
  const expanded = path === "~" ? home : path.startsWith("~/") ? home + path.slice(1) : path;
  const parts = [];
  for (const part of expanded.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return "/" + parts.join("/");
}

// Ordered subsequence matching: reward adjacent letters and word boundaries.
export function fuzzyScore(name, query) {
  const text = name.toLowerCase();
  const needle = query.toLowerCase().replace(/\s+/g, "");
  if (!needle) return 0;
  let previous = -1;
  let score = 0;
  for (const letter of needle) {
    const at = text.indexOf(letter, previous + 1);
    if (at < 0) return null;
    score += 10 - (at - previous - 1);
    if (at === previous + 1) score += 8;
    if (at === 0 || /[-_.\s]/.test(name[at - 1]) || /[a-z][A-Z]/.test(name.slice(at - 1, at + 1))) score += 6;
    previous = at;
  }
  if (text === needle) score += 100;
  else if (text.startsWith(needle)) score += 30;
  return score;
}

export function projectRows(projects, query, spaces, panes, home) {
  return projects.flatMap(project => {
    const score = fuzzyScore(project.name, query);
    if (score === null) return [];
    const path = normalizePath(project.path, home);
    const contains = folder => {
      const candidate = normalizePath(folder, home);
      return candidate === path || candidate.startsWith(path + "/");
    };
    const matches = spaces.filter(space => space.machine == null && (
      contains(space.folder) || panes.some(pane =>
        space.tabs.some(tab => tab.id === pane.tab) && contains(pane.cwd))
    ));
    const space = matches.find(space => space.active) ?? matches[0];
    return [{ ...project, score, space }];
  }).sort((a, b) => b.score - a.score || Number(!!b.space) - Number(!!a.space) || a.name.localeCompare(b.name));
}
