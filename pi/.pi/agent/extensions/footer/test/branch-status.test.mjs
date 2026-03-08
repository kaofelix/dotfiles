import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRTY_BRANCH_MARKER, formatBranchSuffix, renderDimmedFooterPath } from '../src/branch-status.ts';

const theme = {
  fg(color, text) {
    return `<${color}>${text}</${color}>`;
  },
  bold(text) {
    return `<b>${text}</b>`;
  },
};

test('clean branches render without a dirty marker placeholder', () => {
  assert.equal(formatBranchSuffix('main', false), ' (main)');
});

test('dirty branches keep marker directly touching branch name before styling', () => {
  assert.equal(formatBranchSuffix('main', true), ` (main${DIRTY_BRANCH_MARKER})`);
});

test('dirty branches render warning star and keep following text dimmed', () => {
  const line = `~/code${formatBranchSuffix('main', true)} • named-session`;
  assert.equal(
    renderDimmedFooterPath(theme, line),
    '<dim>~/code (main</dim><warning><b>✦</b></warning><dim>) • named-session</dim>',
  );
});
