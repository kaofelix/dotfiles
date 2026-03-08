import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFooterDisplayDefaults, FOOTER_DISPLAY_DEFAULTS } from '../src/subbar-defaults.ts';

test('footer defaults use the baked-in current theme baseline', () => {
  assert.equal(FOOTER_DISPLAY_DEFAULTS.alignment, 'right');
  assert.equal(FOOTER_DISPLAY_DEFAULTS.barWidth, 8);
  assert.equal(FOOTER_DISPLAY_DEFAULTS.showProviderName, false);
  assert.equal(FOOTER_DISPLAY_DEFAULTS.showBottomDivider, false);
});

test('user display settings are applied on top of footer defaults', () => {
  const merged = applyFooterDisplayDefaults({
    barWidth: 'fill',
    showProviderName: true,
    usageColorTargets: {
      title: true,
      timer: false,
    },
  });

  assert.equal(merged.barWidth, 'fill');
  assert.equal(merged.showProviderName, true);
  assert.equal(merged.showBottomDivider, false);

  assert.equal(merged.usageColorTargets.title, true);
  assert.equal(merged.usageColorTargets.timer, false);
  assert.equal(merged.usageColorTargets.bar, true);
  assert.equal(merged.usageColorTargets.usageLabel, true);
  assert.equal(merged.usageColorTargets.status, true);
});
