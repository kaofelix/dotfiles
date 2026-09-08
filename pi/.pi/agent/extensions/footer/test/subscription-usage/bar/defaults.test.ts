import test from "node:test";
import assert from "node:assert/strict";
import { getSubscriptionUsageSettings } from "../../../src/subscription-usage-adapter.js";
import { FOOTER_DISPLAY_DEFAULTS } from "../../../src/subscription-usage-defaults.js";
import { clearSettingsCache, SETTINGS_PATH } from "../../../src/subscription-usage/bar/src/settings.js";
import { getStorage, setStorage } from "../../../src/subscription-usage/bar/src/storage.js";

test("fresh installations load the footer baseline without writing local settings", () => {
	const originalStorage = getStorage();
	setStorage({
		...originalStorage,
		exists: () => false,
		writeFile: () => assert.fail("loading defaults must not write settings"),
	});
	clearSettingsCache();
	try {
		const settings = getSubscriptionUsageSettings();
		for (const [key, value] of Object.entries(FOOTER_DISPLAY_DEFAULTS)) {
			assert.deepEqual(settings.display[key as keyof typeof settings.display], value, key);
		}
	} finally {
		setStorage(originalStorage);
		clearSettingsCache();
	}
});

test("saved overrides win while omitted settings inherit the footer baseline", () => {
	const originalStorage = getStorage();
	setStorage({
		...originalStorage,
		exists: (path) => path === SETTINGS_PATH,
		readFile: () => JSON.stringify({
			display: { barWidth: 16, usageColorTargets: { title: true } },
			providers: { codex: { invertUsage: true } },
		}),
		writeFile: () => assert.fail("loading settings must not rewrite them"),
	});
	clearSettingsCache();
	try {
		const settings = getSubscriptionUsageSettings();
		assert.equal(settings.display.barWidth, 16);
		assert.equal(settings.display.alignment, FOOTER_DISPLAY_DEFAULTS.alignment);
		assert.deepEqual(settings.display.usageColorTargets, {
			...FOOTER_DISPLAY_DEFAULTS.usageColorTargets,
			title: true,
		});
		assert.equal(settings.providers.codex.invertUsage, true);
	} finally {
		setStorage(originalStorage);
		clearSettingsCache();
	}
});
