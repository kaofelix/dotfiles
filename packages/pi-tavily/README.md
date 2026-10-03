# Tavily Extension for Pi

Web search and page extraction using `@tavily/core` 0.7.13 or a compatible update.
Only `tavily_search` and `tavily_extract` are registered; no map, crawl, research,
feedback, or keyless tools are enabled.

## Installation

1. Obtain an API key at <https://app.tavily.com> and set `TAVILY_API_KEY` in your
   shell environment. Keep the key out of tracked files.
2. Run `make pi-extension-deps` from the dotfiles checkout.
3. Preview `make diff`, apply the intended dotfiles state with `make apply`, and
   run `make verify`. Pi loads this local package directly from the checkout;
   package files themselves are outside chezmoi's `home/` source state.
4. Reload Pi with `/reload` or restart it. Do not load a legacy copied Tavily
   extension alongside this package: both register the same tool names.

The package uses the host's `@earendil-works/pi-*` and `typebox` peer packages.
Development and tests require Node.js 22 or newer. Tools also work in Pi's
non-interactive modes; they do not require a terminal UI.

## Search

`tavily_search` accepts the following camelCase parameters:

| Parameter | Values / behavior |
| --- | --- |
| `query` | Required, nonblank string, up to 400 characters |
| `searchDepth` | `basic` (default), `advanced`, `fast`, `ultra-fast` |
| `topic` | `general` (default), `news`, `finance` |
| `maxResults` | Integer 1–20; extension default 5, regardless of the API default |
| `days` | Positive integer lookback; requires `topic: "news"` |
| `timeRange` | `day`, `week`, `month`, `year`, or `d`, `w`, `m`, `y` |
| `startDate`, `endDate` | Real calendar dates in `YYYY-MM-DD` format; start must not follow end |
| `includeAnswer` | Boolean or `basic` / `advanced`; default false |
| `includeRawContent` | `false`, `markdown`, or `text`; default false; cleaned content, not unprocessed HTML |
| `includeDomains` | Up to 300 domains to restrict to or prefer |
| `excludeDomains` | Up to 150 domains to exclude |
| `includeDomainsMode` | `restrict` (API default) or `prefer`; requires nonempty `includeDomains` |
| `includeImages` | Include query-related and source-associated image URLs; default false |
| `includeImageDescriptions` | Include descriptions; requires `includeImages: true` |
| `chunksPerSource` | Integer 1–3; supported for basic, advanced and fast, not ultra-fast |
| `exactMatch` | Match quoted phrases exactly; default false |
| `country` | Lowercase country name, e.g. `united states`; boosts rather than restricts; general topic only |
| `language` | Language code or English language name; boosts matching-language sources |
| `filterByLanguage` | Strict language filtering; requires `language`; default false |
| `autoParameters` | Opt-in parameter inference; default false; explicit values override inferred settings |
| `timeout` | Total request deadline in seconds, 1–120; default 60 |

**Migration:** `includeRawContent: true` is no longer accepted by this tool's
schema. Use `includeRawContent: "markdown"`, matching the current SDK's typed
options. `false` and omitted values retain their existing behavior.

Date windows apply to publish/update dates and can retain undated sources;
they are not a guarantee that every returned source has a known publication date.
`exactMatch` requires quotes around the target phrase in `query`; it can reduce
or eliminate results. Country/language values are validated by Tavily; the tool
checks required combinations locally before making a billable request.

Example:

```javascript
const result = await tools.tavily_search({
  query: '"AbortSignal" Tavily JavaScript SDK',
  exactMatch: true,
  includeDomains: ["docs.tavily.com", "github.com"],
  includeDomainsMode: "prefer",
  searchDepth: "fast",
  includeRawContent: "markdown",
});
text(result.results);
```

## Extraction

`tavily_extract` accepts:

| Parameter | Values / behavior |
| --- | --- |
| `urls` | Required, 1–20 HTTP(S) URLs with hosts and without embedded credentials |
| `query` | Nonblank intent string up to 400 characters; reranks extracted chunks; omit for full pages |
| `chunksPerSource` | Integer 1–5; requires `query`; API default 3 when query is supplied |
| `extractDepth` | `basic` (default) or `advanced`; advanced improves tables/embedded content |
| `format` | `markdown` (default) or `text`; text may add latency |
| `includeImages` | Include extracted image URLs; default false |
| `timeout` | Total request deadline in seconds, 1–60; SDK/worker default 30 |

The extraction API's own default processing timeout is 10 seconds for basic
extraction and 30 for advanced. An explicit `timeout` is passed to the SDK and
the extraction API as well as enforcing the local total deadline.
Intent extraction returns selected chunks, **not** the full page. Each chunk is
up to 500 characters. Use full-page extraction when omissions would matter.

```javascript
const result = await tools.tavily_extract({
  urls: ["https://docs.tavily.com/sdk/javascript/reference"],
  query: "Search options and cancellation",
  chunksPerSource: 3,
  extractDepth: "advanced",
  format: "markdown",
});
text(result.results);
text(result.failedResults);
```

Partial extraction failures produce `status: "partial"` and retain successful
pages. If every URL fails, the result has `isError: true` and `status: "error"`
while retaining individual failures in structured output. Request/authentication,
validation, cancellation and timeout errors also produce structured errors.
There are no automatic retries: retry only failed URLs to avoid repeating
successful, potentially billable work.

## Results, output limits and UI

Both tools remain directly callable and share the `tavily` namespace. Codemode
can discover them with `searchTools("web", {namespace: "tavily"})` and read shared
result, extraction and billing guidance with `describeNamespace("tavily")`.
Namespace grouping does not rename the tools or require codemode-only access.

Both tools declare an output schema. Codemode receives a JSON object instead of
Markdown. Direct model calls receive readable text. Results expose:

- `operation`, `status` (`success`, `partial`, `error`), `resultCount`,
  `successCount`, `failedCount`, `results`, and `failedResults`.
- SDK response fields such as `query`, `answer`, `images`, `responseTime`,
  `requestId`, `usage.credits`, and `autoParameters`, when returned.
- `error` for request-level failures.
- `truncated`, and `fullOutputPath` / `fullResponsePath` for oversized responses.

Requested raw content, image URLs and descriptions are included in model-facing
text, not only rendering metadata. Text is limited to 50 KiB / 2,000 lines,
including the truncation notice. Rendering details are independently limited to
50 KiB. Codemode's serialized structured output has a separate 1 MiB budget,
matching Pi's shell-tool policy, so scripts can filter more complete data before
printing a small result. A shortened text or UI preview does not shorten a
structured response that fits its own budget.

If any representation is too large, full Markdown and JSON are written into
a private `pi-tavily-*` temporary directory, with file permissions `0600`. JSON
previews clip strings to 512 bytes / 20 lines only when that representation
exceeds its budget; exceptionally large arrays return
totals and artifact paths rather than invalid JSON fragments. Preview strings,
including URLs, can be shortened: consult the full response before using them.
The full JSON artifact stores the complete result envelope before truncation.
In codemode, `truncated` describes the structured response itself; it may be false
while model text or UI previews are shortened. Artifact paths can therefore be
present even when structured `truncated` is false. Rendering details mark
truncation when text or UI data is shortened.
Artifacts are not auto-deleted, so follow normal temporary-file cleanup practices;
they can contain sensitive queries or retrieved content. A reload keeps existing
artifact paths usable until the OS or user removes the files.

The compact UI shows three search sources or two extraction page previews.
Expanded call headers show every supplied argument as formatted JSON, including
search depth, auto parameters, extraction intent and the complete requested URL
list. Compact headers retain the query or URL-count summary; headers tolerate
streaming, incomplete arguments. Expanded search shows every retained source,
not only the first ten. Both views
show returned credit usage (including zero), truncation and artifact paths;
expanded views additionally show request identifiers and applied auto parameters.
Tavily credits are **not** added to Pi's model-token usage accounting.

## Cancellation and attribution

The SDK does not expose transport-level AbortSignal support. Each request runs
in an isolated Node worker using the official SDK; cancellation or the total
deadline terminates that worker and closes its network sockets. Successful and
failed workers are also disposed. This adds worker startup overhead, but avoids
patching Axios or maintaining a duplicate REST client. Cancellation cannot undo
work already performed or credits already consumed by the remote service.

Every request includes Pi's session ID (`X-Session-Id`) and the client name
`pi-tavily`. Optionally set `TAVILY_PROJECT` for project attribution in Tavily's
logs/dashboard. Only opaque attribution identifiers are sent; the extension
does not submit conversation transcripts or user feedback. Standard SDK proxy
environment variables (`TAVILY_HTTP_PROXY`, `TAVILY_HTTPS_PROXY`) remain supported.

## Credit usage

| Operation | Credits |
| --- | --- |
| Search: basic, fast, ultra-fast | 1 per request |
| Search: advanced | 2 per request |
| Extract: basic | 1 per 5 successful extractions |
| Extract: advanced | 2 per 5 successful extractions |

`autoParameters: true` may select advanced search and cost 2 credits. Explicitly
set `searchDepth: "basic"` if you want to prevent that. Usage reporting is always
requested; it may be absent or report zero before extraction billing thresholds
are reached. Failed extractions do not incur extraction credits. The free tier
currently includes 1,000 monthly credits; consult the current
[pricing](https://docs.tavily.com/documentation/api-credits).

## Verification

```bash
npm ci --prefix packages/pi-tavily
npm test --prefix packages/pi-tavily
npm run typecheck --prefix packages/pi-tavily
make test
```

Tests use deterministic SDK-boundary fixtures and a local HTTP server, not a real
API key. They cover option validation/forwarding, structured data, content/image
visibility, truncation artifacts, failures, rendering and transport lifecycle.
No standalone build or lint pipeline exists; TypeScript checking and reviewed
source diffs accompany the tests.

For an opt-in live smoke check using Pi's real extension loader/session and
codemode, run:

```bash
npm run smoke --prefix packages/pi-tavily
```

This requires `TAVILY_API_KEY`, makes two searches and one extraction, and
consumes API credits. It verifies schema-valid responses and actual codemode
structured-result consumption, then prints an artifact directory containing
response data and compact/expanded rendering snapshots. Its session is in-memory;
it does not change normal Pi settings, auth files or conversation history.
