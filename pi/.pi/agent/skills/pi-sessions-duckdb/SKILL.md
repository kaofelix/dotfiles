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

### 3. Extract the text-only transcript

The default conversation projection is:

- roles: `user`, `assistant`
- content type: `text`
- order: event timestamp, then content position

This projection selects conversational text while leaving tool calls, tool results, and thinking outside the transcript.

From the skill directory:

```bash
bash ./scripts/conversation-text.sh /absolute/path/to/session.jsonl \
  > /tmp/pi-conversation.csv
```

Read the complete output, in chunks when necessary. Preserve the transcript as evidence; summarize only after all extracted rows have been inspected.

Completion criterion: every text row in the selected conversation has been inspected, and the answer is grounded in those rows.

### 4. Broaden only for the question

If the transcript points to missing implementation or debugging evidence, query the relevant content explicitly—such as tool names, a specific tool result, or thinking blocks. Keep the text-only transcript as the primary narrative.

See [`references/queries.md`](references/queries.md) for transcript variants, fragment search, and tool queries. See [`references/schema.md`](references/schema.md) when a content shape is unclear.

## Analyze sessions

Use this branch for counts, trends, project activity, time ranges, or comparisons across sessions.

Create the bundled views in a DuckDB database:

```bash
duckdb pi_sessions.duckdb < ./scripts/create_views.sql
```

The views are:

- `pi_events` — raw events with derived `session_id` and `session_group`
- `pi_messages` — message events
- `pi_conversation` — user/assistant text grouped into chronological message rows
- `pi_tool_calls` — assistant tool calls

Run the relevant query from [`references/queries.md`](references/queries.md), narrowing by session, project, or time range as early as possible.

Completion criterion: the query covers the requested scope and the result has been checked for unexpected roles or content types.

## DuckDB conventions

- Load JSONL with `format='newline_delimited'`.
- Use `filename=true` for grouping by source session.
- Use `ignore_errors=true` for heterogeneous event streams; use one file or an explicit schema when strict completeness matters.
- `~` is not expanded inside SQL. Use an absolute path or `getenv('HOME') || '...'`.
