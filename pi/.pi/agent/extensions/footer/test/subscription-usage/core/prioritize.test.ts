import test from "node:test";
import assert from "node:assert/strict";
import type { RateWindow } from "../../../src/subscription-usage/core/src/types.js";
import { prioritizeWindowsForModel } from "../../../src/subscription-usage/core/src/utils.js";

function window(label: string, usedPercent = 0): RateWindow {
	return { label, usedPercent };
}

test("codex spark windows are moved before general windows", () => {
	const windows = [
		window("5h", 0),
		window("Week", 1),
		window("GPT-5.3-Codex-Spark 5h", 2),
		window("GPT-5.3-Codex-Spark Week", 3),
	];

	const result = prioritizeWindowsForModel(windows, { id: "gpt-5.3-codex-spark" });

	assert.deepEqual(
		result.map((w) => w.label),
		["GPT-5.3-Codex-Spark 5h", "GPT-5.3-Codex-Spark Week", "5h", "Week"],
	);
});

test("antigravity current model window is moved first", () => {
	const windows = [
		window("Gemini 2.5 Pro"),
		window("Gemini 3 Flash"),
		window("Gemini 3 Pro"),
		window("Gemini 3.5 Flash"),
	];

	const result = prioritizeWindowsForModel(windows, { id: "gemini-3-pro" });

	assert.deepEqual(
		result.map((w) => w.label),
		["Gemini 3 Pro", "Gemini 2.5 Pro", "Gemini 3 Flash", "Gemini 3.5 Flash"],
	);
});

test("returns original array when no windows match the model", () => {
	const windows = [window("5h"), window("Week")];

	const result = prioritizeWindowsForModel(windows, { id: "claude-3.5-sonnet" });

	assert.equal(result, windows);
});

test("returns original array when all windows match", () => {
	const windows = [
		window("GPT-5.3-Codex-Spark 5h"),
		window("GPT-5.3-Codex-Spark Week"),
	];

	const result = prioritizeWindowsForModel(windows, { id: "gpt-5.3-codex-spark" });

	assert.equal(result, windows);
});

test("non-spark codex model does not match spark windows", () => {
	const windows = [
		window("5h", 0),
		window("Week", 1),
		window("GPT-5.3-Codex-Spark 5h", 2),
		window("GPT-5.3-Codex-Spark Week", 3),
	];

	const result = prioritizeWindowsForModel(windows, { id: "gpt-5.3" });

	assert.equal(result, windows);
});

test("returns original array when model is absent", () => {
	const windows = [window("5h"), window("Week")];

	assert.equal(prioritizeWindowsForModel(windows, undefined), windows);
	assert.equal(prioritizeWindowsForModel(windows, null), windows);
	assert.equal(prioritizeWindowsForModel(windows, { id: undefined }), windows);
	assert.equal(prioritizeWindowsForModel(windows, { id: "" }), windows);
});
