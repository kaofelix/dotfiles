import assert from "node:assert/strict";
import test from "node:test";

import { buildSearchSql } from "../session-search.js";

test("session search treats terms as SQL data and supports all-term matching", () => {
  const sql = buildSearchSql({
    terms: ["OAuth", "Felix's callback"],
    match: "all",
    limit: 7,
  });

  assert.match(sql, /\('oauth'\)/);
  assert.match(sql, /\('felix''s callback'\)/);
  assert.match(sql, /lower\(text\) LIKE '%' \|\| term \|\| '%'/);
  assert.match(sql, /HAVING count\(DISTINCT term\) = 2/);
  assert.match(sql, /LIMIT 7/);
});
