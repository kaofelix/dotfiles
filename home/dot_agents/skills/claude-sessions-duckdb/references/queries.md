# Claude Code query recipes

- [Scope and invocation](#scope-and-invocation)
- [Profile before reading](#profile-before-reading)
- [Conversation and fragment discovery](#conversation-and-fragment-discovery)
- [Tool evidence](#tool-evidence)
- [Subagents and compaction](#subagents-and-compaction)
- [Activity and usage](#activity-and-usage)

## Scope and invocation

From the skill directory, pass SQL through stdin or `-c`:

```bash
CLAUDE_SESSION_GLOB="/absolute/path/to/session.jsonl" \
  bash ./scripts/query.sh -box <<'SQL'
SELECT event_type, count(*) FROM claude_events GROUP BY event_type;
SQL
```

Use one file for conversation inspection. For discovery, choose a project glob:
`$HOME/.claude/projects/<discovered-project>/*.jsonl` selects top-level files;
`**/*.jsonl` includes subagents. SQL examples below run within the chosen scope.
Use the environment variable rather than interpolating user-supplied paths into
SQL. Escape SQL string literals with doubled apostrophes when adapting examples.

## Profile before reading

```sql
SELECT event_type, count(*) AS records
FROM claude_events GROUP BY event_type ORDER BY records DESC;

SELECT role, json_type(content) AS content_shape,
       is_meta, is_compact_summary, count(*) AS records
FROM claude_messages GROUP BY ALL ORDER BY records DESC;

SELECT role, content_type, count(*) AS blocks
FROM claude_content GROUP BY ALL ORDER BY blocks DESC;

SELECT count(*) AS text_events,
       count(*) FILTER (WHERE is_meta) AS meta_events,
       count(*) FILTER (WHERE is_compact_summary) AS summary_events
FROM claude_conversation_full;
```

Investigate unexpected roles/types with bounded raw inspection. Full conversation
text omits tool, thinking, image, system, and attachment payloads by design.

## Conversation and fragment discovery

For a complete selected transcript, use the CSV helper or:

```sql
SELECT event_ordinal, event_timestamp, event_id, parent_uuid, role, text
FROM claude_conversation ORDER BY filename, event_ordinal;
```

For context-inclusive text, substitute `claude_conversation_full`.
Read every returned row before summarizing a selected conversation.

For cross-session discovery, aggregate matches before retrieving payloads:

```sql
SELECT filename, session_id, agent_id, count(*) AS matches
FROM claude_conversation
WHERE contains(lower(text), 'migration')
GROUP BY ALL ORDER BY matches DESC LIMIT 20;
```

Then narrow `CLAUDE_SESSION_GLOB` to selected files. A bounded preview:

```sql
SELECT filename, event_ordinal, role, left(text, 400) AS preview
FROM claude_conversation
WHERE contains(lower(text), 'migration')
ORDER BY filename, event_ordinal LIMIT 20;
```

Previews support discovery, not a claim to have read the complete conversation.

## Tool evidence

```sql
SELECT tool_name, count(*) AS calls,
       count(*) FILTER (WHERE is_error) AS recorded_errors,
       count(*) FILTER (WHERE result_ordinal IS NULL) AS missing_results
FROM claude_tool_executions GROUP BY tool_name ORDER BY calls DESC;

SELECT filename, event_ordinal, tool_call_id, tool_name,
       left(tool_arguments_text, 400) AS arguments_preview,
       is_error, left(result_text, 600) AS result_preview
FROM claude_tool_executions
WHERE contains(lower(tool_arguments_text), 'migration')
ORDER BY filename, event_ordinal LIMIT 20;
```

Retrieve complete evidence only for chosen executions; select `result_content`
for structured/image output rather than treating null text as no result:

```sql
SELECT filename, event_ordinal, tool_name, tool_arguments,
       result_ordinal, is_error, result_content, result_text
FROM claude_tool_executions
WHERE tool_call_id = 'chosen-tool-id'
ORDER BY filename, event_ordinal;
```

## Subagents and compaction

Discover streams before reading child payloads:

```sql
SELECT filename, session_id, agent_id, is_sidechain, cwd, event_count
FROM claude_sessions ORDER BY session_id, filename;

SELECT count(DISTINCT session_id) AS parent_session_ids,
       count(DISTINCT filename) AS streams
FROM claude_sessions;
```

A child's session ID may equal its parent's. Find its source path from the
stream listing, then set the glob to that exact file and extract its transcript.
Parent Task/Agent calls and their summaries are not substitutes for child logs.

Inspect compaction metadata without loading whole system events:

```sql
SELECT filename, event_ordinal, event_id, parent_uuid,
       json_extract_string(event, '$.logicalParentUuid') AS logical_parent_uuid,
       json_extract(event, '$.compactMetadata') AS compact_metadata
FROM claude_events
WHERE event_type = 'system'
  AND json_extract_string(event, '$.subtype') = 'compact_boundary'
ORDER BY filename, event_ordinal;
```

For a chosen event, retrieve `event` by filename and event ID. Walk `parent_uuid`
only after checking these boundaries; the default transcript is append history,
not an active-leaf lineage (see [schema.md](schema.md)).

## Activity and usage

Filter event timestamps for a time range, rather than assuming the filename
encodes the date:

```sql
SELECT cwd, count(DISTINCT filename) AS streams,
       count(DISTINCT session_id) AS parent_session_ids
FROM claude_events
WHERE event_time >= TIMESTAMPTZ '2026-01-01 00:00:00+00'
  AND event_time < TIMESTAMPTZ '2026-02-01 00:00:00+00'
GROUP BY cwd ORDER BY streams DESC;

SELECT model, count(*) AS responses,
       sum(input_tokens) AS uncached_input,
       sum(cache_read_input_tokens) AS cache_read,
       sum(cache_creation_input_tokens) AS cache_write,
       sum(output_tokens) AS output
FROM claude_token_usage GROUP BY model ORDER BY responses DESC;
```

Use usage rows, not assistant event counts, for response-level usage. Keep cache
categories separate; nulls mean unrecorded fields. Choose top-level-only or
child-inclusive globs deliberately. Copied forks may contain duplicate history
across files; totals describe the selected logs, not authoritative billing.
