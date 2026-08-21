const MAX_SEARCH_TERMS = 8;
const MAX_RESULTS = 20;

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function likeTerm(value) {
  return value
    .toLocaleLowerCase("en-US")
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export function buildSearchSql({ terms, match = "any", limit = 10 }) {
  const normalizedTerms = [...new Set(
    terms.map((term) => term.trim()).filter(Boolean).slice(0, MAX_SEARCH_TERMS),
  )];
  if (normalizedTerms.length === 0) throw new Error("At least one search term is required");
  if (match !== "any" && match !== "all") throw new Error("match must be 'any' or 'all'");

  const safeLimit = Math.max(1, Math.min(MAX_RESULTS, Math.trunc(limit)));
  const values = normalizedTerms.map((term) => `(${sqlString(likeTerm(term))})`).join(",\n    ");
  const requiredMatches = match === "all" ? `= ${normalizedTerms.length}` : ">= 1";

  return `
WITH terms(term) AS (
  VALUES
    ${values}
),
matches AS (
  SELECT
    conversation.filename,
    conversation.session_id,
    conversation.event_id,
    conversation.event_timestamp,
    conversation.role,
    term,
    left(regexp_replace(conversation.text, '[\\n\\r\\t]+', ' ', 'g'), 600) AS excerpt
  FROM pi_conversation AS conversation
  CROSS JOIN terms
  WHERE lower(text) LIKE '%' || term || '%' ESCAPE '\\'
),
qualified AS (
  SELECT filename
  FROM matches
  GROUP BY filename
  HAVING count(DISTINCT term) ${requiredMatches}
),
metadata AS (
  SELECT
    filename,
    max(CASE WHEN type = 'session' THEN id END) AS session_id,
    max(CASE WHEN type = 'session' THEN cwd END) AS cwd,
    arg_max(name, timestamp) FILTER (WHERE type = 'session_info') AS name,
    min(timestamp) AS started_at,
    max(timestamp) AS updated_at
  FROM pi_events
  GROUP BY filename
)
SELECT
  metadata.filename AS session_file,
  metadata.session_id,
  metadata.cwd,
  metadata.name,
  metadata.started_at,
  metadata.updated_at,
  count(DISTINCT matches.term) AS matched_terms,
  count(DISTINCT matches.event_id) AS matching_messages,
  left(string_agg(DISTINCT matches.excerpt, chr(10) || '---' || chr(10)), 2400) AS excerpts
FROM qualified
JOIN metadata USING (filename)
JOIN matches USING (filename)
GROUP BY ALL
ORDER BY matched_terms DESC, matching_messages DESC, updated_at DESC
LIMIT ${safeLimit};`.trim();
}

export function buildPreviewSql({ sessionFile, maxMessages = 30 }) {
  const safeLimit = Math.max(1, Math.min(80, Math.trunc(maxMessages)));
  return `
SELECT event_timestamp, event_id, role, left(text, 1600) AS text
FROM pi_conversation
WHERE filename = ${sqlString(sessionFile)}
ORDER BY event_timestamp DESC
LIMIT ${safeLimit};`.trim();
}

export class SessionSearch {
  constructor(store) {
    this.store = store;
  }

  search(options) {
    return this.store.query(buildSearchSql(options));
  }

  preview(options) {
    return this.store.query(buildPreviewSql(options));
  }
}
