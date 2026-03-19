import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFooterRightSide, composeFooterLine } from '../src/footer-line.ts';

test('buildFooterRightSide preserves the old model/provider/thinking format', () => {
  assert.deepEqual(
    buildFooterRightSide(
      { id: 'claude-sonnet-4', provider: 'anthropic', reasoning: true },
      2,
      'high',
    ),
    {
      preferred: '(anthropic) claude-sonnet-4 • high',
      fallback: 'claude-sonnet-4 • high',
    },
  );

  assert.deepEqual(
    buildFooterRightSide(undefined, 1, 'off'),
    {
      preferred: 'no-model',
      fallback: 'no-model',
    },
  );
});

test('composeFooterLine prefers the provider-prefixed right side when it fits', () => {
  const line = composeFooterLine('ctx 125k/200k 62.5%', '(anthropic) claude-sonnet-4 • high', 'claude-sonnet-4 • high', 80);
  assert.equal(line, 'ctx 125k/200k 62.5%                           (anthropic) claude-sonnet-4 • high');
});

test('composeFooterLine falls back to the shorter right side before truncating', () => {
  const line = composeFooterLine('ctx 125k/200k 62.5%', '(anthropic) claude-sonnet-4 • high', 'claude-sonnet-4 • high', 50);
  assert.equal(line, 'ctx 125k/200k 62.5%         claude-sonnet-4 • high');
});

test('composeFooterLine can style the right side without affecting layout calculations', () => {
  const line = composeFooterLine(
    'ctx 125k/200k 62.5%',
    '(anthropic) claude-sonnet-4 • high',
    'claude-sonnet-4 • high',
    50,
    (text) => `<dim>${text}</dim>`,
  );
  assert.equal(line, 'ctx 125k/200k 62.5%         <dim>claude-sonnet-4 • high</dim>');
});
