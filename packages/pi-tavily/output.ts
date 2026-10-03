import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JsonValue } from '@earendil-works/pi-ai';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from '@earendil-works/pi-coding-agent';
import type { Response } from './transport.ts';

const fits = (value: JsonValue) => Buffer.byteLength(JSON.stringify(value)) <= DEFAULT_MAX_BYTES;

/** Bound strings, including nested image descriptions, without mutating SDK data. */
function preview(value: JsonValue): JsonValue {
  if (typeof value === 'string') {
    const clipped = truncateHead(value, {maxBytes: 512, maxLines: 20});
    return clipped.content + (clipped.truncated ? '\n[truncated; see full response]' : '');
  }
  if (Array.isArray(value)) return value.map(preview);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, preview(field)]));
  return value;
}

async function boundedResult(data: object, fullText: string) {
  // Strip SDK optional undefined fields before codemode or persistence.
  let details = JSON.parse(JSON.stringify(data)) as Record<string, JsonValue>;
  const clipped = truncateHead(fullText, {maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES});
  let text = fullText;
  if (clipped.truncated || !fits(details)) {
    const directory = await mkdtemp(join(tmpdir(), 'pi-tavily-'));
    const fullOutputPath = join(directory, 'output.md');
    const fullResponsePath = join(directory, 'response.json');
    await Promise.all([
      writeFile(fullOutputPath, fullText, {mode: 0o600}),
      writeFile(fullResponsePath, JSON.stringify(details, null, 2), {mode: 0o600}),
    ]);
    details = preview(details) as Record<string, JsonValue>;
    Object.assign(details, {truncated: true, fullOutputPath, fullResponsePath});
    if (!fits(details)) {
      // Exceptionally large arrays retain totals and artifacts rather than invalid JSON slices.
      const {operation, status, resultCount, successCount, failedCount, responseTime, requestId, usage, error} = details;
      details = JSON.parse(JSON.stringify({operation, status, resultCount, successCount, failedCount,
        results: [], failedResults: [], truncated: true, fullOutputPath, fullResponsePath,
        responseTime, requestId, usage, error})) as Record<string, JsonValue>;
    }
    const notice = `\n\n[Output truncated. Full output: ${fullOutputPath}\nFull structured response: ${fullResponsePath}]`;
    const noticeBytes = Buffer.byteLength(notice);
    const noticeLines = notice.split('\n').length - 1;
    if (noticeBytes >= DEFAULT_MAX_BYTES) throw new Error('Full-output file paths exceed the tool output budget');
    const head = truncateHead(fullText, {maxBytes: DEFAULT_MAX_BYTES - noticeBytes, maxLines: DEFAULT_MAX_LINES - noticeLines});
    text = head.content + notice;
  }
  return {content: [{type: 'text' as const, text}], details, structuredContent: details, isError: details.status === 'error'};
}

export function toolResult(operation: 'search' | 'extract', response: Response, text: string) {
  const failedResults = 'failedResults' in response ? response.failedResults : [];
  const failedCount = failedResults.length;
  const successCount = response.results.length;
  const status = failedCount ? (successCount ? 'partial' : 'error') : 'success';
  const data = {...response, operation, status, resultCount: successCount, successCount, failedCount, failedResults, truncated: false};
  const noun = operation === 'search' ? (successCount === 1 ? 'result' : 'results') : (successCount === 1 ? 'page' : 'pages');
  const meta = [`${successCount} ${noun}`, `${response.responseTime.toFixed(2)}s`];
  if (response.usage) meta.push(`${response.usage.credits} credits`);
  if (response.requestId) meta.push(`request ${response.requestId}`);
  if ('autoParameters' in response && response.autoParameters) meta.push(`Applied auto parameters: ${JSON.stringify(response.autoParameters)}`);
  return boundedResult(data, `${meta.join(' | ')}\n\n${text}`);
}

export function errorResult(operation: 'search' | 'extract', error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return boundedResult({operation, status: 'error', error: message, results: [], failedResults: [],
    resultCount: 0, successCount: 0, failedCount: 0, truncated: false},
    `${operation === 'search' ? 'Search' : 'Extraction'} failed: ${message}`);
}
