import assert from "node:assert/strict";
import test from "node:test";

import { selectCandidate } from "../selector.js";

const candidates = [
  { sessionFile: "/sessions/a.jsonl", title: "OAuth callback", explanation: "Contains the callback investigation", excerpt: "fixed redirect URI", confidence: 0.92, cwd: "/code/app" },
  { sessionFile: "/sessions/b.jsonl", title: "Other", explanation: "Weaker match", excerpt: "oauth", confidence: 0.5 },
];

test("the selector maps the chosen display row back to its candidate", () => {
  let input;
  const selected = selectCandidate(candidates, {
    runFzf: (rows) => {
      input = rows;
      return { status: 0, stdout: "1\tOAuth callback\n" };
    },
  });

  assert.equal(selected, candidates[0]);
  assert.match(input, /92%/);
  assert.match(input, /Contains the callback investigation/);
});

test("cancelling the selector returns undefined", () => {
  assert.equal(selectCandidate(candidates, { runFzf: () => ({ status: 130, stdout: "" }) }), undefined);
});
