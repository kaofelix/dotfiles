# Claude Code log schema

- [Storage and identity](#storage-and-identity)
- [Events, messages, and content](#events-messages-and-content)
- [Ordering, resumes, and compaction](#ordering-resumes-and-compaction)
- [Tools and results](#tools-and-results)
- [Token accounting](#token-accounting)
- [Parsing contract](#parsing-contract)

## Storage and identity

The default root is `~/.claude/projects/`. Project directory names encode paths;
use logged `cwd` as evidence rather than reverse-decoding directory names.
`CLAUDE_SESSION_GLOB` overrides the root with one absolute path or DuckDB glob.
The transcript helper accepts exactly one absolute file and rejects glob
metacharacters in its path to prevent accidental multi-file inspection.

A main stream typically lives at `<project>/<session-id>.jsonl`. Child streams
live at `<project>/<session-id>/subagents/agent-<agent-id>.jsonl`. Older or other
versions may use different layouts; profile the selected files first.

- `filename` is the source stream identity and the boundary for tool joins and
  token deduplication. Never join by session ID and tool ID alone.
- `session_id` uses logged `sessionId`, falling back to the parent directory for
  subagents or the file stem otherwise. Children can share the parent's ID.
- `agent_id` uses logged `agentId`, falling back to a subagent filename. Main
  streams normally have no agent ID.
- `event_id` and `parent_uuid` expose `uuid` and `parentUuid`.
- `message_id` is `message.id`, not the event UUID. Assistant response blocks
  can share this ID while having distinct event UUIDs.
- `claude_sessions` groups by filename, session ID, and project directory; mixed
  IDs within a file produce multiple rows. It takes first non-null cwd/branch
  metadata and the observed timestamp range—not authoritative launch duration.

## Events, messages, and content

`claude_events.event` retains the entire event as JSON. Common event types include
`user`, `assistant`, `system`, `attachment`, queue operations, titles, file-history
records, and API request bookkeeping. Unknown event types remain queryable.
`event_timestamp` preserves the string; `event_time` is a nullable `TIMESTAMPTZ`.
Missing boolean flags default to false.

`claude_messages` selects only user/assistant event types and exposes `content`
and `usage` as JSON. `claude_content` converts scalar string content into one
`text` block and expands arrays in `content_index` order. Missing, null, and
unrecognized non-array/non-string content stays in messages/raw events but has
no content rows.

Typical array blocks:

| Block type | Typical role | Projection |
| --- | --- | --- |
| `text` | user or assistant | Conversation text |
| `thinking`, `redacted_thinking` | assistant | Raw blocks only |
| `tool_use` | assistant | Tool calls: `id`, `name`, `input` |
| `tool_result` | user | Tool results: `tool_use_id`, `content`, `is_error` |
| `image`, other nontext blocks | varies | Raw blocks only |

Conversation views aggregate text blocks within each event. They retain event
identity rather than merging separate assistant events by message ID. Full text
includes `isMeta` and `isCompactSummary`; compact text excludes those events.
Unflagged notifications, command output, and other synthetic text can remain.
The view is a text projection, not a classification of who actually authored it.
Attachments and system messages are not included even in the full view.

## Ordering, resumes, and compaction

`event_ordinal` comes from the JSON reader's `WITH ORDINALITY`. Sort by filename
and ordinal for append-log order, then by content index inside an event. An
ordinal is scan-local, not a durable event ID or timestamp: its absolute value
can change when the file glob changes. Equal or nonmonotonic timestamps do not
change this ordering.

These views do **not** reconstruct the active conversation tree, remove abandoned
branches, or deduplicate replayed history. A resumed session may append to an
existing file; a fork may copy history into a new one. Whole-file and cross-file
counts describe stored history, not necessarily unique interactions or billing.

For active-lineage questions, select an explicit leaf and inspect UUID parent
links. `system` events with subtype `compact_boundary` may reset `parentUuid`
and carry `logicalParentUuid` and `compactMetadata` (including preserved segment
IDs). Read those fields before interpreting a broken parent chain. Compaction
summaries are synthetic user messages, not new user requests. Missing ancestors,
external child streams, and version-specific boundary semantics require an
explicit confidence caveat rather than an invented continuous transcript.

## Tools and results

`claude_tool_calls.tool_arguments` is JSON; `tool_arguments_text` supports text
search. Results retain `result_content` as JSON. `result_text` projects a scalar
string or concatenated `text` array blocks; image-only output has null text, not
an empty successful result. `is_error` defaults false on recorded result blocks.

`claude_tool_executions` left-joins on filename and tool-call ID. A call without
a result has null result fields; that alone does not prove failure. Repeated
calls/results with the same ID within a file can multiply rows. Diagnose replay
or retries using event IDs/ordinals rather than silently choosing a result.
Children's tools stay in child files even when their parent session ID matches.

## Token accounting

Assistant content-block records can repeat the same `message.id` and complete
usage object. `claude_token_usage` chooses the latest **usage-bearing** record
per `(filename, message_id)`, with event UUID then ordinal as fallbacks for a
missing message ID. This avoids counting each text/thinking/tool block as a
separate response. It assumes later recorded usage supersedes earlier usage;
inspect raw records when producer versions differ or usage is incomplete.

The view exposes `input_tokens`, `cache_read_input_tokens`,
`cache_creation_input_tokens`, and `output_tokens`, plus raw `usage`. Keep the
input/cache categories separate; where recorded with Anthropic semantics,
input plus cache-read plus cache-creation gives total prompt tokens. Missing
categories remain null. Thinking detail is already part of output tokens;
adding it again double-counts. Treat server tools, nested `iterations`, pricing,
and `cost-state` as separate evidence, not additional token buckets to sum.

Usage deduplication is file-local. Copied forks or replayed history across files
can still double-count. These are logged usage estimates, not a billing ledger.

## Parsing contract

The wrapper uses an in-memory database, JSON object reads, and strict parsing.
Malformed/truncated JSON fails the query instead of silently losing evidence.
An actively written file may need a stable copy and retry. Unknown valid event
shapes are retained, although the text projection intentionally omits nontext
content. Require DuckDB with table-function `WITH ORDINALITY` support (validated
with DuckDB 2.0.0).
