import assert from "node:assert/strict";
import test from "node:test";

import { CandidateCollector } from "../candidate-collector.js";

test("the agent can only return validated, unique session candidates", async () => {
  const collector = new CandidateCollector({
    validatePath: async (path) => path.startsWith("/sessions/") ? path : Promise.reject(new Error("invalid")),
  });

  await collector.accept([
    { sessionFile: "/sessions/a.jsonl", title: "Auth work", explanation: "Discussed OAuth", excerpt: "callback", confidence: 0.9 },
    { sessionFile: "/sessions/a.jsonl", title: "Duplicate", explanation: "same", excerpt: "", confidence: 0.4 },
  ]);

  assert.deepEqual(collector.candidates, [
    { sessionFile: "/sessions/a.jsonl", title: "Auth work", explanation: "Discussed OAuth", excerpt: "callback", confidence: 0.9 },
  ]);
  await assert.rejects(
    collector.accept([{ sessionFile: "/tmp/evil.jsonl", title: "Bad", explanation: "Bad", excerpt: "", confidence: 1 }]),
    /invalid/,
  );
});
