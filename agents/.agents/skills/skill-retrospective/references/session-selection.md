# Version-aware session selection

Use these recipes through the schema-loaded wrapper from `pi-sessions-duckdb`.

## Find sessions that loaded the intended version

Choose a distinctive sentence from the target `SKILL.md`. Prefer a stable behavioral rule over frontmatter or a generic heading.

```sql
SELECT
  filename,
  COUNT(*) AS loads,
  MIN(call_timestamp) AS first_load,
  MAX(call_timestamp) AS last_load
FROM pi_tool_executions
WHERE tool_name = 'read'
  AND tool_arguments_text ILIKE '%/skills/<skill-name>/SKILL.md%'
  AND result_text ILIKE '%<distinctive-version-fingerprint>%'
GROUP BY filename
ORDER BY last_load DESC;
```

Match `result_text`, not only the path or session timestamp. Historical versions commonly occupy the same path, and old sessions can be resumed after a skill changes.

If a skill moved between `~/.pi/agent/skills` and `~/.agents/skills`, broaden the path predicate while retaining the loaded-content fingerprint:

```sql
AND regexp_matches(
  tool_arguments_text,
  '/(\.pi/agent|\.agents)/skills/<skill-name>/SKILL\.md'
)
```

Exclude the current retrospective session before calculating historical counts.

## Preview user feedback before opening full transcripts

After selecting version-matched filenames, look for user feedback as a prioritization signal. The language below is illustrative, not an exhaustive sentiment classifier.

```sql
SELECT
  filename,
  event_timestamp,
  left(replace(text, chr(10), ' '), 500) AS feedback_preview
FROM pi_conversation
WHERE filename IN (<selected filenames>)
  AND role = 'user'
  AND (
    text ILIKE '%why%'
    OR text ILIKE '%instead%'
    OR text ILIKE '%shouldn%'
    OR text ILIKE '%too %'
    OR text ILIKE '%prefer%'
    OR text ILIKE '%doesn%make sense%'
  )
ORDER BY event_timestamp;
```

Read the complete compact transcript for every session ultimately selected. A fragment is only a funnel signal.

## Inspect the tool evidence around one episode

```sql
SELECT
  call_timestamp,
  tool_name,
  is_error,
  left(tool_arguments_text, 800) AS arguments_preview,
  left(replace(result_text, chr(10), ' '), 800) AS result_preview
FROM pi_tool_executions
WHERE filename = '/absolute/path/to/session.jsonl'
ORDER BY call_timestamp;
```

Narrow by timestamps or tool names after identifying the episode in the transcript.

## Search for likely missed invocations

Trigger recall requires a separate candidate set. Derive terms from the target skill description and observed user language; then compare candidate sessions with actual version-matched loads.

Do not claim a false negative from keyword matching alone. Read the candidate task and decide whether the skill genuinely owned it. Near-miss prompts are especially useful because they expose routing boundaries.

## Recover a historical or creation version

When the user asks where a skill originated or which revision was loaded:

1. Search `write` and `edit` tool arguments for the skill path.
2. Inspect the compact transcript around candidate writes.
3. Use git history when the skill is version-controlled.
4. Fingerprint the actual `read` result used in later execution sessions.

Creation intent, repository history, and loaded runtime content answer different questions; keep them distinct.
