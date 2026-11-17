# Pi session log schema (JSONL)

## Raw events and identity

Pi logs are newline-delimited event streams under
`~/.pi/agent/sessions/**/*.jsonl`. Set `PI_SESSION_GLOB` to an absolute file or
glob to restrict the reader before any projection is loaded.

`pi_events` reads each envelope as JSON without inferring nested message types.
It retains the complete envelope in `event` and exposes these convenience fields:

- `filename`: source stream identity and the boundary for tool joins.
- `event_ordinal`: scan-local position from `WITH ORDINALITY`; its value can
  change when the glob changes. Use filename/event ID for durable citations.
- `type`, `id`, `parentId`: recorded event identity and parent link.
- `timestamp`: parsed `TIMESTAMPTZ`, null for absent/invalid timestamps. The
  original timestamp remains in `event`.
- `cwd`, `name`: logged project/session metadata when present.
- `message`: raw message JSON when present.
- `session_id`: UUID extracted from the filename, not necessarily the header ID.
- `session_group`: parent directory under `sessions/`, often encoding a project.

All other fields remain accessible through `event` JSON, including unknown event
types. A `session` header commonly records `version`, `id`, `timestamp`, and `cwd`.
A `session_info` event can record a human-readable `name`. Use the logged header
ID/cwd when authoritative metadata is needed; derived filename fields are hints.

Parsing is strict: malformed or actively truncated JSON fails the query rather
than silently dropping records. For an incomplete active file, use a stable copy
and retry. Unknown valid shapes do not require a reader/schema change.

## Messages and content

A `message` event wraps `message` JSON. Common roles are `user`, `assistant`,
`toolResult`, `system`, and `bashExecution`; new roles remain available.
`message.content` is normally an array, but some system messages use a string;
other shapes are retained as JSON rather than forced into an inferred list.

`pi_messages` exposes `event_id`, `event_timestamp`, `role`, raw `message`, and
raw `content`, with the source identity/ordinal. `message_timestamp` is the raw
JSON value of `message.timestamp` (often epoch milliseconds); it is separate
from the envelope timestamp used to order these projections.

`pi_content` expands arrays into zero-based `content_index` and raw `block` JSON.
It normalizes scalar string content to one `text` block. Null, missing, and other
non-array/non-string content stays in messages/raw events without content rows.
Common block types are:

| Type | Fields / use |
| --- | --- |
| `text` | `text`: user/assistant narrative or tool-result text |
| `thinking` | `thinking`, optional signature; outside the compact narrative |
| `toolCall` | `id`, `name`, `arguments`: embedded assistant tool call |
| `image`, other types | Raw blocks; outside text projections |

Profile `json_type(content)` and `content_type` for selected files before
interpreting missing text. Use JSON accessors on `message`, `content`, `block`,
and `event`; their nested values are not inferred DuckDB structs.

## Conversation projection and ordering

`pi_conversation_full` selects text from user/assistant events, aggregating blocks
in content-position order. Distinct stored events remain distinct even when
timestamps or event IDs repeat. System messages, tools, and thinking are outside
both conversation views.

`pi_conversation` replaces an embedded invocation such as
`<skill name="example">…</skill>` with `[skill example omitted]`, retaining the
skill identity and subsequent user request. `--include-skills` selects the full
view when the definition itself is required evidence.

Order by `event_timestamp NULLS LAST, event_ordinal`, then block position inside
an event. These are stored-history projections; they do not reconstruct the
active leaf, remove abandoned branches, or deduplicate copied history. Inspect
`parentId` links and compaction records in raw events when lineage matters.

## Tool execution projection

`pi_tool_calls` selects assistant `toolCall` blocks. `tool_arguments` preserves
`arguments` as JSON regardless of its shape; `tool_arguments_text` is its
JSON serialization for broad searches: embedded quotes, newlines, and backslashes
are escaped. For exact field text, search the decoded value with
`json_extract_string(tool_arguments, '$.command')` (or the relevant field path).
Use `json_extract` for structured fields.

Tool results are separate `toolResult` messages linked by `message.toolCallId`.
`pi_tool_results` preserves the result ordinal/timestamp, tool name, nullable
`is_error`, complete `result_content` JSON, and text aggregated in block order.
Image-only and empty results still have result rows with null text.

`pi_tool_executions` left-joins calls to results by filename and tool-call ID.
Missing result fields alone do not establish failure; distinguish no recorded
result from a recorded nontext result. Repeated IDs within one file can multiply
join rows; inspect ordinals and raw events when retries/replay are relevant.
Child streams stay separate even when they repeat a parent's call IDs.
