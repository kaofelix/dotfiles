import test from "node:test";
import assert from "node:assert/strict";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { formatUsageStatus, formatUsageWindowParts } from "../../../src/subscription-usage/bar/src/formatting.js";
import { getDefaultSettings, mergeSettings } from "../../../src/subscription-usage/bar/src/settings-types.js";
import type { UsageSnapshot } from "../../../src/subscription-usage/bar/src/types.js";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as unknown as Theme;

function buildUsage(): UsageSnapshot {
	return {
		provider: "codex",
		displayName: "Codex Plan",
		windows: [
			{
				label: "5h",
				usedPercent: 12,
				resetDescription: "4h",
				resetAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
			},
		],
	};
}

test("custom provider label is appended", () => {
	const settings = getDefaultSettings();
	settings.display.providerLabel = "Team";
	settings.display.providerLabelColon = true;

	const output = formatUsageStatus(theme, buildUsage(), undefined, settings);
	assert.ok(output);
	assert.ok(output.startsWith("Codex Team:"));
});

test("custom bar character is used", () => {
	const settings = getDefaultSettings();
	settings.display.barType = "horizontal-bar";
	settings.display.barStyle = "bar";
	settings.display.barWidth = 4;
	settings.display.barCharacter = "★";

	const usage = buildUsage();
	const parts = formatUsageWindowParts(theme, usage.windows[0], false, settings, usage);
	assert.ok(parts.bar.includes("★"));
});

test("mixed bar characters fill full width", () => {
	const settings = getDefaultSettings();
	settings.display.barType = "horizontal-bar";
	settings.display.barStyle = "bar";
	settings.display.barWidth = 22;
	settings.display.barCharacter = "🚀_";

	const usage = buildUsage();
	usage.windows[0].usedPercent = 57;

	const parts = formatUsageWindowParts(theme, usage.windows[0], false, settings, usage);
	assert.equal(visibleWidth(parts.bar), 22);
	assert.ok(parts.bar.includes("🚀"));
	assert.ok(parts.bar.includes("_"));
});

test("default widget placement stays belowEditor", () => {
	const settings = getDefaultSettings();
	assert.equal(settings.display.widgetPlacement, "belowEditor");
});

test("status placement normalizes alignment and overflow to line-mode defaults", () => {
	const settings = mergeSettings({
		display: {
			widgetPlacement: "status",
			alignment: "center",
			overflow: "wrap",
		} as any,
	} as any);
	assert.equal(settings.display.widgetPlacement, "status");
	assert.equal(settings.display.alignment, "left");
	assert.equal(settings.display.overflow, "truncate");
});

test("invalid widget placement falls back to belowEditor", () => {
	const settings = mergeSettings({
		display: {
			widgetPlacement: "invalid",
		} as any,
	} as any);
	assert.equal(settings.display.widgetPlacement, "belowEditor");
});
