import test from 'node:test';
import assert from 'node:assert/strict';
import { getContextBlockLevels, renderContextUsageLine, renderContextSlot } from '../src/context-usage.ts';

const theme = {
  fg(color, text) {
    return `<${color}>${text}</${color}>`;
  },
  bg(color, text) {
    return `{${color}}${text}{/${color}}`;
  },
};

test('context usage splits the window into 100k blocks with partial fill levels', () => {
  assert.deepEqual(getContextBlockLevels(125_000, 200_000), [8, 2]);
});

test('context usage scales the last block to the remaining window capacity', () => {
  assert.deepEqual(getContextBlockLevels(114_000, 128_000), [8, 4]);
});

test('context usage line renders spaced frame around bars without extra gap after the frame', () => {
  assert.equal(
    renderContextUsageLine(theme, { tokens: 125_000, contextWindow: 200_000, percent: 62.5 }),
    '<dim>⟦</dim>{toolPendingBg}<accent>█</accent>{/toolPendingBg} {toolPendingBg}<accent>▂</accent>{/toolPendingBg}<dim>⟧</dim> <dim>125k/200k</dim> <accent>62.5%</accent>',
  );
});

test('context usage line switches to warning and error colors at high usage', () => {
  assert.equal(
    renderContextUsageLine(theme, { tokens: 170_000, contextWindow: 200_000, percent: 85 }),
    '<dim>⟦</dim>{toolPendingBg}<warning>█</warning>{/toolPendingBg} {toolPendingBg}<warning>▆</warning>{/toolPendingBg}<dim>⟧</dim> <dim>170k/200k</dim> <warning>85.0%</warning>',
  );

  assert.equal(
    renderContextUsageLine(theme, { tokens: 190_000, contextWindow: 200_000, percent: 95 }),
    '<dim>⟦</dim>{toolPendingBg}<error>█</error>{/toolPendingBg} {toolPendingBg}<error>▇</error>{/toolPendingBg}<dim>⟧</dim> <dim>190k/200k</dim> <error>95.0%</error>',
  );
});

test('context usage line derives the percentage when tokens and window are known', () => {
  assert.equal(
    renderContextUsageLine(theme, { tokens: 125_000, contextWindow: 200_000, percent: null }),
    '<dim>⟦</dim>{toolPendingBg}<accent>█</accent>{/toolPendingBg} {toolPendingBg}<accent>▂</accent>{/toolPendingBg}<dim>⟧</dim> <dim>125k/200k</dim> <accent>62.5%</accent>',
  );
});

test('context slots use an explicit neutral gray background when theme exposes color mode', () => {
  const ansiTheme = {
    fg(color, text) {
      return `<${color}>${text}</${color}>`;
    },
    bg(color, text) {
      return `{${color}}${text}{/${color}}`;
    },
    getColorMode() {
      return '256color';
    },
  };

  assert.equal(
    renderContextSlot(ansiTheme, '<accent>█</accent>'),
    '\x1b[48;5;238m<accent>█</accent>\x1b[49m',
  );
});
