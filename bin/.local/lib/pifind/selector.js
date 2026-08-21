import { spawnSync } from "node:child_process";

function oneLine(value = "") {
  return value.replaceAll(/[\t\r\n]+/g, " ").replaceAll(/\s+/g, " ").trim();
}

function formatRows(candidates) {
  return candidates.map((candidate, index) => {
    const confidence = `${Math.round(candidate.confidence * 100)}%`;
    const location = candidate.cwd ? ` · ${oneLine(candidate.cwd)}` : "";
    const date = candidate.updatedAt ? ` · ${oneLine(candidate.updatedAt)}` : "";
    return [
      index + 1,
      `${confidence}  ${oneLine(candidate.title)}${location}${date}`,
      oneLine(candidate.explanation),
      oneLine(candidate.excerpt),
    ].join("\t");
  }).join("\n");
}

function defaultRunFzf(rows) {
  return spawnSync("fzf", [
    "--delimiter=\\t",
    "--with-nth=2..",
    "--layout=reverse",
    "--height=70%",
    "--border",
    "--wrap",
    "--prompt=Resume session> ",
    "--header=Select a Pi session to resume",
  ], {
    input: `${rows}\n`,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
}

export function selectCandidate(candidates, { runFzf = defaultRunFzf } = {}) {
  if (candidates.length === 0) return undefined;
  const result = runFzf(formatRows(candidates));
  if (result.error) throw result.error;
  if (result.status !== 0) return undefined;
  const index = Number.parseInt(result.stdout.split("\t", 1)[0], 10) - 1;
  return candidates[index];
}
