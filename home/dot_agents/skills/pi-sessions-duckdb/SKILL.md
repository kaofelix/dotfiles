---
name: pi-sessions-duckdb
description: Inspect Pi session conversations and analyze session logs with DuckDB. Use when asked what happened in a session, to summarize or extract conversation fragments, to read user/assistant messages without tool traffic or thinking, to find debugging evidence, or to calculate session, message, and tool-use statistics from ~/.pi/agent/sessions/**.
---

# Pi Sessions + DuckDB

Pi sessions are JSONL event streams. Treat **conversation inspection** and **cross-session analytics** as separate branches; start with the narrowest data that answers the request.

## Inspect a conversation

Use this branch when given a session file or asked what happened in a session.

### 1. Resolve one session

Use the supplied `.jsonl` path. If none is supplied, locate likely files under `~/.pi/agent/sessions/**/*.jsonl` using the project, time, or session ID from the request, then identify the chosen file before querying it.

Completion criterion: exactly one session file is selected, unless the request explicitly compares sessions.

### 2. Profile its contents

Count events by role and content type before extracting text. This reveals the amount of conversation, thinking, tool calls, and tool results without loading their payloads.

Use the profiling query in [`references/queries.md`](references/queries.md).

Completion criterion: the session's message and content composition is known.

### 3. Extract the compact transcript

The default conversation projection is:

- roles: `user`, `assistant`
- content type: `text`
- invoked skill definitions replaced by `[skill <name> omitted]`
- order: event timestamp, then content position

This projection preserves the conversational narrative and invoked skill names while keeping thinking, tool traffic, and embedded skill bodies outside the transcript.

From the skill directory:

```bash
bash ./scripts/conversation-text.sh /absolute/path/to/session.jsonl \
  > /tmp/pi-conversation.csv
```

If an omitted skill definition is itself evidence needed for the question, opt into the full text:

```bash
bash ./scripts/conversation-text.sh --include-skills /absolute/path/to/session.jsonl \
  > /tmp/pi-conversation-full.csv
```

Read the complete output, in chunks when necessary. Preserve the transcript as evidence; summarize only after all extracted rows have been inspected.

Completion criterion: every text row in the selected projection has been inspected, and any full skill body was loaded because the question required it.

### 4. Broaden only for the question

If the transcript points to missing implementation or debugging evidence, query the relevant content explicitly—such as joined tool executions, a specific full result, or thinking blocks. Keep the compact transcript as the primary narrative.

See [`references/queries.md`](references/queries.md) for transcript variants, fragment search, and tool queries. See [`references/schema.md`](references/schema.md) when a content shape is unclear.

## Analyze sessions

Use this branch for counts, trends, project activity, time ranges, or comparisons across sessions.

Run queries through the in-memory wrapper, which loads the bundled views automatically:

```bash
bash ./scripts/query.sh -box <<'SQL'
SELECT role, COUNT(*)
FROM pi_messages
GROUP BY role;
SQL
```

The views are:

- `pi_events` — raw events with derived `session_id` and `session_group`
- `pi_messages` — message events
- `pi_conversation` — compact user/assistant conversation
- `pi_conversation_full` — conversation including invoked skill definitions
- `pi_tool_calls` — assistant tool calls with typed and searchable-text arguments
- `pi_tool_results` — tool result text and error state
- `pi_tool_executions` — calls joined to their results

### Funnel cross-session investigations

Keep discovery output bounded:

1. Aggregate matches by filename to identify candidate sessions.
2. Select the sessions relevant to the request.
3. Preview bounded fragments or execution counts.
4. Load complete conversation or tool-result text only for those sessions.

Completion criterion: the query covers the requested scope, candidate sessions were narrowed before loading payloads, and the result has been checked for unexpected roles or content types.

## DuckDB conventions

- Load JSONL with `format='newline_delimited'`.
- Use `filename=true` for grouping by source session.
- Use `ignore_errors=true` for heterogeneous event streams; use one file or an explicit schema when strict completeness matters.
- `~` is not expanded inside SQL. Use an absolute path or `getenv('HOME') || '...'`.
