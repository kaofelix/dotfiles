import assert from 'node:assert/strict';
import test from 'node:test';
import { Value } from 'typebox/value';
import { readFile, stat } from 'node:fs/promises';
import { visibleWidth } from '@earendil-works/pi-tui';
import { initTheme, ToolExecutionComponent, type ExtensionAPI, type ExtensionToolContext, type ToolDefinition } from '@earendil-works/pi-coding-agent';
initTheme('dark', false);
process.env.TAVILY_API_KEY = 'test-key';
import extension from '../index.ts';
import type { RequestRunner } from '../transport.ts';

export function tools(run: RequestRunner) {
  const registered: ToolDefinition<any, any>[] = [];
  extension({registerTool: (tool: ToolDefinition<any, any>) => registered.push(tool), on: () => {}} as unknown as ExtensionAPI, run);
  return registered;
}
export const ctx = {sessionManager: {getSessionId: () => 'pi-session'}} as ExtensionToolContext;

const searchResponse = {query: 'q', results: [], images: [], responseTime: 0.1, requestId: 'r'};

test('codemode receives schema-valid structured results including credits, request id and inferred settings', async () => {
  const response = {...searchResponse, usage: {credits: 2}, autoParameters: {searchDepth: 'advanced' as const}};
  const tool = tools(async () => response)[0];
  const result = await tool.execute('id', {query: 'q'}, undefined, undefined, ctx);
  assert.ok(tool.outputSchema);
  assert.ok(result.structuredContent);
  assert.equal(Value.Check(tool.outputSchema!, result.structuredContent), true);
  const data = result.structuredContent as Record<string, any>;
  assert.deepEqual(data.usage, {credits: 2});
  assert.equal(data.requestId, 'r');
  assert.deepEqual(data.autoParameters, {searchDepth: 'advanced'});
});

test('codemode retains complete data when only text and rendering previews exceed their budgets', async () => {
  const body = 'source line\n'.repeat(5000);
  const response = {...searchResponse, results: [{url: 'https://example.com', title: 'Guide', score: 1, id: 'source', publishedDate: '', content: 'snippet', rawContent: body}]};
  const tool = tools(async () => response)[0];
  const result = await tool.execute('id', {query: 'q'}, undefined, undefined, ctx);
  const data = result.structuredContent as Record<string, any>;
  assert.equal(data.results[0].rawContent, body);
  assert.equal(data.truncated, false);
  assert.ok(Buffer.byteLength(JSON.stringify(result.details)) <= 50 * 1024);
  assert.ok((result.content[0] as {text: string}).text.includes('Full output:'));
  assert.equal(JSON.parse(await readFile(data.fullResponsePath, 'utf8')).results[0].rawContent, body);
});

test('large output is bounded in both text and structured results with complete private artifacts', async () => {
  const body = 'Unicode 文 😀 documentation\n'.repeat(20000);
  const response = {...searchResponse, answer: body, results: [{url: 'https://example.com', title: 'Guide', score: 1, id: 'source', publishedDate: '', content: 'snippet', rawContent: body}]};
  const tool = tools(async () => response)[0];
  const result = await tool.execute('id', {query: 'q', includeRawContent: 'markdown'}, undefined, undefined, ctx);
  const text = (result.content[0] as {text: string}).text;
  const data = result.structuredContent as Record<string, any>;
  assert.ok(Buffer.byteLength(text) <= 50 * 1024);
  assert.ok(text.split('\n').length <= 2000);
  assert.ok(Buffer.byteLength(JSON.stringify(data)) <= 1024 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(result.details)) <= 50 * 1024);
  assert.equal(data.truncated, true);
  assert.equal(Value.Check(tool.outputSchema!, data), true);
  assert.match(text, /Full output/);
  const full = JSON.parse(await readFile(data.fullResponsePath, 'utf8'));
  assert.equal(full.results[0].rawContent, body);
  assert.equal(full.answer, body);
  assert.match(await readFile(data.fullOutputPath, 'utf8'), /Unicode 文 😀 documentation/);
  assert.equal((await stat(data.fullResponsePath)).mode & 0o777, 0o600);
});

test('invalid option combinations are rejected before a billable request', async () => {
  let calls = 0;
  const registered = tools(async () => { calls++; return searchResponse; });
  const cases = [
    [0, {query: 'q', days: 2}], [0, {query: 'q', country: 'brazil', topic: 'news'}],
    [0, {query: 'q', includeImageDescriptions: true}], [0, {query: 'q', filterByLanguage: true}],
    [0, {query: 'q', searchDepth: 'ultra-fast', chunksPerSource: 2}], [0, {query: 'q', startDate: '2026-02-30'}],
    [0, {query: 'q', startDate: '2026-03-01', endDate: '2026-02-01'}],
    [0, {query: 'q', maxResults: 1.5}], [0, {query: '   '}],
    [1, {urls: ['https://example.com'], chunksPerSource: 2}],
    [1, {urls: ['file:///etc/passwd']}], [1, {urls: ['https://']}],
  ] as const;
  for (const [index, params] of cases) {
    const result = await registered[index].execute('id', params, undefined, undefined, ctx);
    assert.equal(result.isError, true, JSON.stringify(params));
  }
  assert.equal(calls, 0);
});

test('tool failures remain visible through Pi’s interactive component in compact and expanded views', async () => {
  const registered = tools(async () => { throw new Error('Network unavailable'); });
  for (const [index, params] of [[0, {query: 'q'}], [1, {urls: ['https://example.com']}]] as const) {
    const tool = registered[index];
    const result = await tool.execute('id', params, undefined, undefined, ctx);
    const component = new ToolExecutionComponent(tool.name, 'id', params, {}, tool,
      {requestRender() {}} as any, process.cwd());
    component.updateResult({...result, isError: result.isError === true}, false);
    for (const expanded of [false, true]) {
      component.setExpanded(expanded);
      assert.match(component.render(100).join('\n'), /Network unavailable/);
    }
  }
});

test('extraction calls stay readable while URL arguments stream in', () => {
  const tool = tools(async () => searchResponse)[1];
  const theme = {fg: (_color: string, text: string) => text, bold: (text: string) => text};
  for (const [args, expected] of [
    [{}, /tavily_extract/],
    [{urls: []}, /tavily_extract/],
    [{urls: ['https://exa']}, /https:\/\/exa/],
    [{urls: ['https://example.com', 'https://example.org']}, /2 URLs/],
  ] as const) {
    const rendered = tool.renderCall!(args as any, theme as any, {argsComplete: false} as any).render(100);
    assert.match(rendered.join('\n'), expected);
  }
});

test('expanded search exposes every source up to the supported result count', async () => {
  const response = {...searchResponse, results: Array.from({length: 20}, (_, i) => ({id: `${i}`, title: `Source ${i + 1}`, url: `https://example.com/${i}`, score: 1, content: 'snippet', publishedDate: ''}))};
  const tool = tools(async () => response)[0];
  const result = await tool.execute('id', {query: 'q', maxResults: 20}, undefined, undefined, ctx);
  const theme = {fg: (_color: string, text: string) => text, bold: (text: string) => text};
  const expanded = tool.renderResult!(result, {expanded: true, isPartial: false}, theme as any, {} as any).render(100).join('\n');
  assert.match(expanded, /Source 20/);
  const compact = tool.renderResult!(result, {expanded: false, isPartial: false}, theme as any, {} as any).render(100).join('\n');
  assert.match(compact, /17 more results/);
});

test('rendered results show zero credits and expanded request attribution for both tools', async () => {
  const theme = {fg: (_color: string, text: string) => text, bold: (text: string) => text};
  const registered = tools(async request => request.operation === 'search'
    ? {...searchResponse, usage: {credits: 0}, autoParameters: {searchDepth: 'advanced'}}
    : {results: [{url: 'https://example.com', title: null, rawContent: 'body'}], failedResults: [], responseTime: 0.1, requestId: 'extract-id', usage: {credits: 0}});
  for (const [index, params] of [[0, {query: 'q'}], [1, {urls: ['https://example.com']}]] as const) {
    const tool = registered[index];
    const result = await tool.execute('id', params, undefined, undefined, ctx);
    const rendered = tool.renderResult!(result, {expanded: true, isPartial: false}, theme as any, {} as any).render(100).join('\n');
    assert.match(rendered, /0 credits/);
    assert.match(rendered, index === 0 ? /Request: r/ : /Request: extract-id/);
    if (index === 0) assert.match(rendered, /advanced/);
  }
});

test('extraction images and titles appear in model-facing content', async () => {
  const tool = tools(async () => ({results: [{url: 'https://example.com', title: 'Guide', rawContent: 'body', images: ['https://example.com/figure.png']}], failedResults: [], responseTime: 0.1, requestId: 'r'}))[1];
  const result = await tool.execute('id', {urls: ['https://example.com'], includeImages: true}, undefined, undefined, ctx);
  const text = (result.content[0] as {text: string}).text;
  assert.match(text, /Guide/);
  assert.match(text, /https:\/\/example.com\/figure.png/);
});

test('snippet budgets work for basic, advanced and fast search, including the basic default', async () => {
  const tool = tools(async () => searchResponse)[0];
  for (const searchDepth of [undefined, 'basic', 'advanced', 'fast']) {
    const result = await tool.execute('id', {query: 'q', chunksPerSource: 2, ...(searchDepth ? {searchDepth} : {})}, undefined, undefined, ctx);
    assert.notEqual(result.isError, true, String(searchDepth));
  }
});

test('oversized request errors retain complete evidence in private artifacts', async () => {
  const message = 'Service failure detail\n'.repeat(60000);
  const tool = tools(async () => {throw new Error(message);})[0];
  const result = await tool.execute('id', {query: 'q'}, undefined, undefined, ctx);
  const data = result.structuredContent as Record<string, any>;
  assert.equal(result.isError, true);
  assert.equal(data.truncated, true);
  assert.ok(data.fullResponsePath);
  assert.equal(JSON.parse(await readFile(data.fullResponsePath, 'utf8')).error, message);
  assert.equal(Value.Check(tool.outputSchema!, data), true);
});

test('array-heavy responses preserve complete data through bounded artifact-backed summaries', async () => {
  const response = {...searchResponse, results: Array.from({length: 20}, (_, i) => ({id: `${i}`, title: 'Guide', url: `https://example.com/${i}`, score: 1, content: 'snippet', publishedDate: '',
    images: Array.from({length: 500}, (_, j) => ({url: `https://example.com/${i}/${j}/${'a'.repeat(150)}.png`}))}))};
  const tool = tools(async () => response)[0];
  const result = await tool.execute('id', {query: 'q'}, undefined, undefined, ctx);
  const data = result.structuredContent as Record<string, any>;
  assert.equal(data.resultCount, 20);
  assert.equal(data.results.length, 0);
  assert.equal(data.truncated, true);
  assert.equal(Value.Check(tool.outputSchema!, data), true);
  assert.ok(Buffer.byteLength(JSON.stringify(data)) <= 1024 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(result.details)) <= 50 * 1024);
  assert.equal(JSON.parse(await readFile(data.fullResponsePath, 'utf8')).results.length, 20);
});

test('partial extraction preserves successful pages and reports individual failures without failing the batch', async () => {
  const response = {...failure, results: [{url: 'https://example.com/ok', title: 'Guide', rawContent: 'body'}]};
  const tool = tools(async () => response)[1];
  const result = await tool.execute('id', {urls: ['https://example.com/ok', 'https://example.com']}, undefined, undefined, ctx);
  const data = result.structuredContent as Record<string, any>;
  assert.equal(result.isError, false);
  assert.equal(data.status, 'partial');
  assert.equal(data.successCount, 1);
  assert.equal(data.failedCount, 1);
  assert.equal(data.results[0].rawContent, 'body');
  assert.deepEqual(data.failedResults, failure.failedResults);
  assert.equal(Value.Check(tool.outputSchema!, data), true);
});

test('missing credentials become actionable structured errors without an API request', async () => {
  const saved = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  let calls = 0;
  try {
    const tool = tools(async () => {calls++; return searchResponse;})[0];
    const result = await tool.execute('id', {query: 'q'}, undefined, undefined, ctx);
    assert.equal(result.isError, true);
    assert.equal(calls, 0);
    assert.match((result.content[0] as {text: string}).text, /TAVILY_API_KEY/);
    assert.equal(Value.Check(tool.outputSchema!, result.structuredContent), true);
  } finally {
    if (saved !== undefined) process.env.TAVILY_API_KEY = saved;
  }
});

test('session/project identifiers are forwarded without conversation content or model-token usage', async () => {
  const saved = process.env.TAVILY_PROJECT;
  process.env.TAVILY_PROJECT = 'project';
  try {
    const tool = tools(async (_request, config) => {
      assert.deepEqual(config, {apiKey: 'test-key', projectId: 'project', sessionId: 'pi-session', clientName: 'pi-tavily'});
      return searchResponse;
    })[0];
    const result = await tool.execute('id', {query: 'q'}, undefined, undefined, ctx);
    assert.equal(result.isError, false);
    assert.equal(result.usage, undefined);
  } finally {
    if (saved === undefined) delete process.env.TAVILY_PROJECT;
    else process.env.TAVILY_PROJECT = saved;
  }
});

test('compact and expanded rendering fit narrow terminals and expose truncation artifacts', async () => {
  const response = {...searchResponse, results: [{id: 's', title: 'Unicode 文 😀 source', url: 'https://example.com', score: 1, publishedDate: '', content: 'line\n'.repeat(5000)}]};
  const theme = {fg: (_color: string, text: string) => text, bold: (text: string) => text};
  const tool = tools(async () => response)[0];
  const result = await tool.execute('id', {query: 'q'}, undefined, undefined, ctx);
  for (const expanded of [false, true]) {
    const rendered = tool.renderResult!(result, {expanded, isPartial: false}, theme as any, {} as any).render(20);
    assert.ok(rendered.every(line => visibleWidth(line) <= 20));
    assert.match(rendered.join('\n'), /truncated/);
    assert.match(rendered.join('\n'), /Full output/);
  }
});

test('responses fitting both output budgets are not unnecessarily truncated', async () => {
  const tool = tools(async () => ({...searchResponse, answer: 'a'.repeat(50000)}))[0];
  const result = await tool.execute('id', {query: 'q'}, undefined, undefined, ctx);
  const data = result.structuredContent as Record<string, any>;
  assert.equal(data.truncated, false);
  assert.equal(data.answer.length, 50000);
  assert.ok(Buffer.byteLength((result.content[0] as {text: string}).text) <= 50 * 1024);
});

const failure = {results: [], failedResults: [{url: 'https://example.com', error: 'unavailable'}], responseTime: 0.1, requestId: 'r'};

test('all failed extractions produce a failed tool result with individual failure information', async () => {
  const tool = tools(async () => failure)[1];
  const result = await tool.execute('id', {urls: ['https://example.com']}, undefined, undefined, ctx);
  assert.equal(result.isError, true);
  assert.match((result.content[0] as {text: string}).text, /unavailable/);
});

test('search controls are validated and forwarded to the SDK with explicit cost-aware defaults', async () => {
  const params = {query: 'q', searchDepth: 'fast', includeAnswer: 'advanced', includeRawContent: 'markdown',
    timeRange: 'week', startDate: '2026-01-01', endDate: '2026-02-01', exactMatch: true,
    includeDomains: ['example.com'], includeDomainsMode: 'prefer', country: 'united states',
    language: 'en', filterByLanguage: true, autoParameters: true, timeout: 5};
  const tool = tools(async request => {
    assert.equal(request.operation, 'search');
    const {query, ...options} = params;
    assert.deepEqual(request.options, {...options, maxResults: 5, includeUsage: true});
    return searchResponse;
  })[0];
  assert.equal(Value.Check(tool.parameters, params), true);
  const result = await tool.execute('id', params, undefined, undefined, ctx);
  assert.notEqual(result.isError, true);
});

test('intent extraction forwards query, chunk budget, depth, format, images and timeout', async () => {
  const params = {urls: ['https://example.com'], query: 'cancellation', chunksPerSource: 2,
    extractDepth: 'advanced', format: 'text', includeImages: true, timeout: 10};
  const tool = tools(async request => {
    const {urls, ...options} = params;
    assert.deepEqual(request.input, urls);
    assert.deepEqual(request.options, {...options, includeUsage: true});
    return {...failure, results: [{url: urls[0], title: 'Guide', rawContent: 'body'}], failedResults: []};
  })[1];
  assert.equal(Value.Check(tool.parameters, params), true);
  const result = await tool.execute('id', params, undefined, undefined, ctx);
  assert.notEqual(result.isError, true);
});
