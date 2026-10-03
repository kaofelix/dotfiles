import assert from 'node:assert/strict';
import { createServer, type RequestListener, type Server } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { requestTavily } from '../transport.ts';

async function serve(handler: RequestListener, run: (base: string, server: Server) => Promise<void>) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try { await run(`http://127.0.0.1:${address.port}`, server); }
  finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function within(promise: Promise<void>) {
  const controller = new AbortController();
  try {
    await Promise.race([promise, delay(1500, undefined, {signal: controller.signal}).then(() => { throw new Error('socket remains open'); })]);
  } finally { controller.abort(); }
}

test('cancellation closes an in-flight SDK request rather than only abandoning its promise', async () => {
  const controller = new AbortController();
  let markClosed!: () => void;
  const closed = new Promise<void>(resolve => { markClosed = resolve; });
  await serve((_req, res) => {
    res.on('close', markClosed);
    controller.abort();
    // Never finish the response: only closing the worker's socket can settle closed.
  }, async base => {
    await assert.rejects(requestTavily({operation: 'search', input: 'q', options: {}}, {
      apiKey: 'test', apiBaseURL: base,
    }, controller.signal), /cancel|abort/i);
    await within(closed);
  });
});

test('total deadline closes a stalled SDK connection', async () => {
  let markClosed!: () => void;
  const closed = new Promise<void>(resolve => { markClosed = resolve; });
  await serve((_req, res) => res.on('close', markClosed), async base => {
    await assert.rejects(requestTavily({operation: 'extract', input: ['https://example.com'], options: {timeout: 1}}, {
      apiKey: 'test', apiBaseURL: base,
    }), /timed out/i);
    await within(closed);
  });
});

test('pre-aborted operations make no API request', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await serve((_req, res) => { calls++; res.end('{}'); }, async base => {
    await assert.rejects(requestTavily({operation: 'search', input: 'q', options: {}}, {apiKey: 'test', apiBaseURL: base}, controller.signal), /abort/i);
    assert.equal(calls, 0);
  });
});

test('official SDK maps search/extraction options, response data and attribution headers', async () => {
  const requests: Array<{path?: string; body: Record<string, unknown>; headers: Record<string, unknown>}> = [];
  await serve(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({path: req.url, body: JSON.parse(Buffer.concat(chunks).toString()), headers: req.headers});
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/search'
      ? {images: ['https://example.com/image.png'], results: [{id: 's', title: 'Guide', url: 'https://example.com', content: 'snippet', raw_content: 'full body', score: 0.9, published_date: null}], response_time: 0.1, request_id: 'search-id', usage: {credits: 2}, auto_parameters: {search_depth: 'advanced'}}
      : {results: [{url: 'https://example.com', title: 'Guide', raw_content: 'extracted body', images: ['https://example.com/figure.png']}], failed_results: [], response_time: 0.2, request_id: 'extract-id', usage: {credits: 0}}));
  }, async base => {
    const config = {apiKey: 'test', apiBaseURL: base, projectId: 'project', sessionId: 'pi-session', clientName: 'pi-tavily'};
    const search = await requestTavily({operation: 'search', input: 'q', options: {includeRawContent: 'markdown', searchDepth: 'fast', includeUsage: true, includeDomainsMode: 'prefer', includeDomains: ['example.com'], language: 'en', filterByLanguage: true}}, config);
    assert.equal(search.requestId, 'search-id');
    assert.equal(search.results[0].rawContent, 'full body');
    assert.deepEqual(search.usage, {credits: 2});
    assert.ok('autoParameters' in search);
    assert.deepEqual(search.autoParameters, {includeDomains: undefined, excludeDomains: undefined, topic: undefined, timeRange: undefined, searchDepth: 'advanced'});
    const extracted = await requestTavily({operation: 'extract', input: ['https://example.com'], options: {query: 'intent', chunksPerSource: 2, extractDepth: 'advanced', format: 'text', includeImages: true, includeUsage: true, timeout: 10}}, config);
    assert.equal(extracted.results[0].rawContent, 'extracted body');
    assert.equal(extracted.requestId, 'extract-id');
    assert.deepEqual(extracted.usage, {credits: 0});
    assert.deepEqual(requests[0].body, {query: 'q', search_depth: 'fast', include_raw_content: 'markdown', include_domains: ['example.com'], include_domains_mode: 'prefer', language: 'en', filter_by_language: true, include_usage: true});
    assert.deepEqual(requests[1].body, {urls: ['https://example.com'], query: 'intent', chunks_per_source: 2, extract_depth: 'advanced', format: 'text', include_images: true, include_usage: true, timeout: 10});
    for (const request of requests) {
      assert.equal(request.headers['x-session-id'], 'pi-session');
      assert.equal(request.headers['x-project-id'], 'project');
      assert.equal(request.headers['x-client-name'], 'pi-tavily');
      assert.equal(request.headers.authorization, 'Bearer test');
    }
  });
});

test('SDK authentication failures retain an actionable message and settle the worker', async () => {
  await serve((_req, res) => {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({detail: {error: 'Unauthorized'}}));
  }, async base => {
    await assert.rejects(requestTavily({operation: 'search', input: 'q', options: {}}, {apiKey: 'invalid', apiBaseURL: base}), /key|unauthorized/i);
  });
});
