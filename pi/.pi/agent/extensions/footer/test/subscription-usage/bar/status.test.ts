import test from "node:test";
import assert from "node:assert/strict";
import { getStatusLabel } from "../../../src/subscription-usage/bar/src/status.js";
import type { ProviderStatus } from "../../../src/subscription-usage/bar/src/types.js";

function buildStatus(indicator: ProviderStatus["indicator"], description?: string): ProviderStatus {
	return { indicator, description };
}

test("abbreviated status labels include Status prefix", () => {
	assert.equal(getStatusLabel(buildStatus("major"), true), "Status Crit.");
	assert.equal(getStatusLabel(buildStatus("critical"), true), "Status Crit.");
	assert.equal(getStatusLabel(buildStatus("maintenance"), true), "Status Maint.");
	assert.equal(getStatusLabel(buildStatus("unknown"), true), "Status Unk.");
	assert.equal(getStatusLabel(buildStatus("minor"), true), "Status Degr.");
	assert.equal(getStatusLabel(buildStatus("none"), true), "Status OK");
});


test("status label description is still preferred in full mode", () => {
	assert.equal(getStatusLabel(buildStatus("unknown", "Service is unavailable")), "Service is unavailable");
});


test("full status labels still include Status Unknown", () => {
	assert.equal(getStatusLabel(buildStatus("unknown")), "Status Unknown");
});
