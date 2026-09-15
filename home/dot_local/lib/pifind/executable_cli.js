#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { DuckDbSessionStore } from "./duckdb.js";
import { findSessions } from "./finder.js";
import { validateSessionPath } from "./launch.js";
import { selectCandidate } from "./selector.js";
import { SessionSearch } from "./session-search.js";

const HELP = `Usage: pifind <description>

Ask an LLM to find matching saved Pi sessions, select one interactively,
and resume it with pi --session.

Examples:
  pifind where did I debug the OAuth callback
  pifind "session about the Radius auto-model router"
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP);
    return 0;
  }

  const query = args.join(" ").trim();
  if (!query) {
    process.stderr.write(HELP);
    return 2;
  }

  const search = new SessionSearch(new DuckDbSessionStore());
  process.stderr.write("Finding matching Pi sessions…\n");
  const candidates = await findSessions(query, search, {
    onToolStart: (toolName) => {
      const labels = {
        search_sessions: "Searching session conversations…",
        preview_session: "Inspecting a candidate…",
        return_session_candidates: "Ranking candidates…",
      };
      if (labels[toolName]) process.stderr.write(`${labels[toolName]}\n`);
    },
  });

  const selected = selectCandidate(candidates);
  if (!selected) {
    process.stderr.write("No session selected.\n");
    return 0;
  }

  const sessionFile = await validateSessionPath(selected.sessionFile);
  const result = spawnSync("pi", ["--session", sessionFile], { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

main()
  .then((status) => { process.exitCode = status; })
  .catch((error) => {
    process.stderr.write(`pifind: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
