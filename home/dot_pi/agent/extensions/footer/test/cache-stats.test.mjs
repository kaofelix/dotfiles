import test from 'node:test';
import assert from 'node:assert/strict';
import * as footerLine from '../src/footer-line.ts';

const usage = (input, cacheRead, cacheWrite) => ({
  input,
  output: 0,
  cacheRead,
  cacheWrite,
  cost: { total: 0 },
});

test('cache stats mirror pi by totaling session cache tokens and showing the latest hit rate', () => {
  assert.equal(typeof footerLine.buildCacheStats, 'function');

  const entries = [
    { type: 'message', message: { role: 'assistant', usage: usage(100, 800, 100) } },
    { type: 'message', message: { role: 'assistant', usage: usage(200, 800, 0) } },
    { type: 'message', message: { role: 'toolResult', usage: usage(0, 50, 0) } },
    { type: 'compaction', usage: usage(0, 0, 30) },
  ];

  assert.equal(footerLine.buildCacheStats(entries), 'R1.6k W130 CH80.0%');
});
