import assert from "node:assert/strict";
import test from "node:test";

import { validateSessionPath } from "../launch.js";

test("only existing JSONL files inside the Pi sessions directory can be launched", async () => {
  const root = "/home/felix/.pi/agent/sessions";
  const exists = async (path) => path.endsWith("valid.jsonl");
  const canonicalize = async (path) => path;
  const options = { root, exists, canonicalize };

  assert.equal(
    await validateSessionPath(`${root}/--project--/valid.jsonl`, options),
    `${root}/--project--/valid.jsonl`,
  );
  await assert.rejects(
    validateSessionPath("/tmp/valid.jsonl", options),
    /outside the Pi sessions directory/,
  );
  await assert.rejects(
    validateSessionPath(`${root}/--project--/notes.txt`, options),
    /not a JSONL session/,
  );
  await assert.rejects(
    validateSessionPath(`${root}/--project--/missing.jsonl`, options),
    /does not exist/,
  );
});
