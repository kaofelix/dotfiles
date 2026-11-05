# Claude Code query recipes

- [Discovery first](#discovery-first)
- [Profile selected files](#profile-selected-files)
- [Complete bounded episodes](#complete-bounded-episodes)
- [Selected tool evidence](#selected-tool-evidence)
- [Child completion reports](#child-completion-reports)
- [Subagents and compaction](#subagents-and-compaction)
- [Usage](#usage)

Run from the project directory, preserving its working directory. Scope queries
with an absolute file or glob:

```bash
skill_dir="$HOME/.agents/skills/session-history-duckdb"
CLAUDE_SESSION_GLOB="$HOME/.claude/projects/<discovered-project>/**/*.jsonl" \
  bash "$skill_dir/adapters/claude/scripts/query.sh" -box <<'SQL'
SELECT filename, session_id, agent_id, started_at, last_event_at, event_count
FROM claude_sessions ORDER BY started_at;
SQL
```

`*.jsonl` selects top-level files; `**/*.jsonl` includes children. Set an explicit
glob for nonstandard storage. Use the environment variable for paths, and double
apostrophes in SQL string literals when adapting search terms.

## Discovery first

Start with the inventory above. Search signals next return **aggregate hits per
file**, not full conversation/tool payloads. Adapt the terms to the question:

```sql
SELECT filename, session_id, agent_id, count(*) AS matches,
       min(event_time) AS first_match, max(event_time) AS last_match
FROM claude_conversation
WHERE regexp_matches(lower(text), 'refactor|slow|timing')
GROUP BY ALL ORDER BY matches DESC LIMIT 20;

SELECT filename, tool_name, count(*) AS matches,
       min(event_timestamp) AS first_match, max(event_timestamp) AS last_match
FROM claude_tool_calls
WHERE contains(lower(tool_arguments_text), 'zig build test')
GROUP BY filename, tool_name ORDER BY matches DESC LIMIT 20;
```

Select filenames, narrow `CLAUDE_SESSION_GLOB`, then preview positions and text:

```sql
SELECT event_ordinal, event_timestamp, event_id, role,
       left(text, 400) AS preview
FROM claude_conversation
WHERE regexp_matches(lower(text), 'refactor|slow|timing')
ORDER BY event_ordinal LIMIT 20;
```

For a time-bounded activity inventory, filter `claude_events.event_time` and
aggregate by filename/cwd; do not assume the filename encodes a date. Export
metadata/counts if useful. Full-text exports belong to selected evidence below.

## Profile selected files

```sql
SELECT event_type, count(*) AS records
FROM claude_events GROUP BY event_type ORDER BY records DESC;

SELECT role, json_type(content) AS content_shape,
       is_meta, is_compact_summary, count(*) AS records
FROM claude_messages GROUP BY ALL ORDER BY records DESC;

SELECT role, content_type, count(*) AS blocks
FROM claude_content GROUP BY ALL ORDER BY blocks DESC;
```

Investigate unexpected types with bounded raw inspection. Context-inclusive text
still excludes tool, thinking, image, system, and attachment payloads.

## Complete bounded episodes

After selecting a single file, use positions to include the initiating request
and subsequent exchange. The numbers below are examples, not a default window:

```sql
SELECT count(*) AS rows, sum(length(text)) AS text_characters
FROM claude_conversation WHERE event_ordinal BETWEEN 100 AND 200;

SELECT event_ordinal, event_timestamp, event_id, parent_uuid, role, text
FROM claude_conversation
WHERE event_ordinal BETWEEN 100 AND 200
ORDER BY event_ordinal;
```

Or use a contiguous `event_time >= ... AND event_time < ...` interval. Record
boundaries/counts and read every row; paginate by position without gaps. For an
entire selected file, use `adapters/claude/scripts/conversation-text.sh`.

Substitute `claude_conversation_full` or helper `--include-context` only when a
particular omitted context message is needed. A whole-file export followed by
keyword filtering is discovery, not a complete conversation read.

## Selected tool evidence

For a selected file and episode, preview executions before retrieving full output:

```sql
SELECT event_ordinal, tool_call_id, tool_name,
       left(tool_arguments_text, 300) AS arguments_preview,
       result_ordinal, is_error, left(result_text, 400) AS result_preview
FROM claude_tool_executions
WHERE event_ordinal BETWEEN 100 AND 200
ORDER BY event_ordinal LIMIT 20;

SELECT event_ordinal, tool_name, tool_arguments,
       result_ordinal, is_error, result_content, result_text
FROM claude_tool_executions
WHERE tool_call_id = 'chosen-tool-id'
ORDER BY event_ordinal;
```

Tool IDs are file-local. `result_content` preserves structured/image output;
null `result_text` alone does not mean no result or failure. If full output points
to an artifact, read that selected artifact rather than every neighboring result.

## Child completion reports

Some Claude producers put a child's final report in a `SubagentHandback` tool
call's `input.message`, not assistant text. A completely read compact transcript
can therefore lack the child's conclusion. For a selected child file, discover
handback-like tool names without loading their reports:

```sql
SELECT filename, tool_name, count(*) AS calls
FROM claude_tool_calls
WHERE contains(lower(tool_name), 'handback')
GROUP BY filename, tool_name ORDER BY calls DESC;
```

Then preview calls in that selected file and choose an exact call ID:

```sql
SELECT event_ordinal, event_timestamp, event_id, tool_call_id, tool_name,
       left(json_extract_string(tool_arguments, '$.message'), 400) AS report_preview
FROM claude_tool_calls
WHERE contains(lower(tool_name), 'handback')
ORDER BY event_ordinal LIMIT 20;

SELECT filename, event_ordinal, event_timestamp, event_id, tool_call_id, tool_name,
       json_extract_string(tool_arguments, '$.message') AS report_text
FROM claude_tool_calls
WHERE tool_call_id = 'chosen-handback-id';
```

Read the complete selected report as tool evidence; leave the compact transcript
unchanged. Tool names/input shapes vary by producer. Inspect the selected call's
`tool_arguments` if `message` is absent; add a filename predicate when querying
more than one file because call IDs are file-local.

## Subagents and compaction

`claude_sessions` lists child filenames and agent IDs; children may share the
parent's session ID. Select a child source file and profile/extract its own
evidence unit. Parent Task/Agent summaries are not complete child conversations.

```sql
SELECT filename, event_ordinal, event_id, parent_uuid,
       json_extract_string(event, '$.logicalParentUuid') AS logical_parent_uuid,
       json_extract(event, '$.compactMetadata') AS compact_metadata
FROM claude_events
WHERE event_type = 'system'
  AND json_extract_string(event, '$.subtype') = 'compact_boundary'
ORDER BY filename, event_ordinal;
```

For active-lineage questions inspect these boundaries and parent links first;
see [claude-schema.md](claude-schema.md). The default is append history.

## Usage

```sql
SELECT model, count(*) AS responses,
       sum(input_tokens) AS uncached_input,
       sum(cache_read_input_tokens) AS cache_read,
       sum(cache_creation_input_tokens) AS cache_write,
       sum(output_tokens) AS output
FROM claude_token_usage GROUP BY model ORDER BY responses DESC;
```

This view deduplicates usage repeated across assistant content blocks. Keep
cache categories separate; null means unrecorded. Choose child inclusion
explicitly; copied forks can duplicate history across files. These are logged
usage estimates, not authoritative billing.
