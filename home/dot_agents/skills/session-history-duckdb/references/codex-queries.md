# Codex query recipes

- [Discovery first](#discovery-first)
- [Profile selected files](#profile-selected-files)
- [Complete bounded episodes](#complete-bounded-episodes)
- [Selected tools and collaboration](#selected-tools-and-collaboration)
- [Usage](#usage)

Run helper-view SQL from the project directory without changing it:

```bash
skill_dir="$HOME/.agents/skills/session-history-duckdb"
CODEX_SESSION_GLOB="$HOME/.codex/sessions/2026/11/**/*.jsonl" \
  bash "$skill_dir/adapters/codex/scripts/query.sh" -box <<'SQL'
SELECT filename, session_id, cwd, started_at FROM codex_sessions;
SQL
```

## Discovery first

Inventory metadata first, using `cwd` to identify the project. Search within that
scope and rank source files before loading payloads:

```sql
SELECT c.filename, count(*) AS matches,
       min(c.event_time) AS first_match, max(c.event_time) AS last_match
FROM codex_conversation AS c
JOIN codex_sessions AS s USING (filename)
WHERE s.cwd = '/absolute/project'
  AND c.text ILIKE '%refactor%'
GROUP BY c.filename ORDER BY matches DESC LIMIT 20;

SELECT filename, count(*) AS matching_calls, max(event_time) AS last_match
FROM codex_tool_calls
WHERE tool_arguments_text ILIKE '%test%'
GROUP BY filename ORDER BY matching_calls DESC LIMIT 20;
```

Then set `CODEX_SESSION_GLOB` to a selected file and preview positions:

```sql
SELECT event_timestamp, event_ordinal, message_id, role, phase,
       left(text, 400) AS preview
FROM codex_conversation
WHERE text ILIKE '%refactor%'
ORDER BY event_time, event_ordinal LIMIT 20;
```

## Profile selected files

```sql
SELECT event_type, payload_type, count(*) AS n
FROM codex_events GROUP BY ALL ORDER BY n DESC;

SELECT role, json_extract_string(item.value, '$.type') AS content_type,
       count(*) AS n
FROM codex_messages, json_each(content) AS item
GROUP BY ALL ORDER BY role, content_type;
```

## Complete bounded episodes

Use the initiating request and subsequent exchange to choose a contiguous time
interval; these timestamps are examples. Include a filename predicate if the
scope contains several files:

```sql
SELECT count(*) AS rows, sum(length(text)) AS text_characters
FROM codex_conversation
WHERE event_time >= TIMESTAMP '2026-11-01 10:00:00'
  AND event_time < TIMESTAMP '2026-11-01 11:00:00';

SELECT event_timestamp, event_ordinal, message_id, role, phase, text
FROM codex_conversation
WHERE event_time >= TIMESTAMP '2026-11-01 10:00:00'
  AND event_time < TIMESTAMP '2026-11-01 11:00:00'
ORDER BY event_time NULLS LAST, event_ordinal NULLS LAST;
```

Read every row in the declared unit, chunking without gaps. Nullable ordinals
limit tie resolution; inspect raw events if ordering is material. For a whole
selected rollout use `adapters/codex/scripts/conversation-text.sh`.
`--include-context` / `codex_conversation_full` retains synthetic repository
context only when needed as evidence.

## Selected tools and collaboration

Preview within the selected file/interval before reading complete executions:

```sql
SELECT call_timestamp, call_ordinal, tool_call_id, tool_namespace, tool_name,
       left(tool_arguments_text, 300) AS arguments_preview,
       left(result_text, 400) AS result_preview
FROM codex_tool_executions
WHERE call_timestamp >= '2026-11-01T10:00:00'
  AND call_timestamp < '2026-11-01T11:00:00'
ORDER BY call_timestamp, call_ordinal LIMIT 20;

SELECT * FROM codex_tool_executions
WHERE tool_call_id = 'chosen-call-id';
```

Collaboration calls such as `spawn_agent`, `send_message`, `followup_task`,
`wait_agent`, `interrupt_agent`, and `list_agents` appear in the same tool views.
Aggregate their counts by filename for discovery; retrieve full arguments/results
only for chosen calls. Tool joins are filename plus call ID.

## Usage

Token records are per response. Sum projected usage fields, not raw cumulative
`thread_token_usage` or `turn_token_usage` snapshots:

```sql
SELECT session_id, sum(input_tokens) AS input_tokens,
       sum(cached_input_tokens) AS cached_input_tokens,
       sum(output_tokens) AS output_tokens,
       sum(reasoning_output_tokens) AS reasoning_tokens,
       sum(total_tokens) AS total_tokens
FROM codex_token_usage GROUP BY session_id ORDER BY total_tokens DESC;
```

Read [codex-schema.md](codex-schema.md) for payload variants, metadata and
reasoning boundaries. A matching field name in another adapter need not carry
the same accounting semantics.
