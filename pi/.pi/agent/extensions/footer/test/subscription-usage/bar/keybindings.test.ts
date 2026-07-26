import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsKeybindings } from "../../../src/subscription-usage/bar/src/ui/keybindings.js";

test("settings keybindings prefer editor keybindings when available", () => {
	const kb = createSettingsKeybindings({
		getEditorKeybindings: () => ({
			matches: (data, action) => data === "X" && action === "selectDown",
		}),
		getKeybindings: () => ({
			matches: () => {
				throw new Error("legacy keybindings should not be used when editor keybindings exist");
			},
		}),
	});

	assert.equal(kb.matches("X", "selectDown"), true);
	assert.equal(kb.matches("X", "selectUp"), false);
});

test("settings keybindings map actions to legacy keybinding IDs", () => {
	const seen: string[] = [];
	const kb = createSettingsKeybindings({
		getKeybindings: () => ({
			matches: (_data, action) => {
				seen.push(action);
				return action === "tui.select.down";
			},
		}),
	});

	assert.equal(kb.matches("ignored", "selectDown"), true);
	assert.equal(kb.matches("ignored", "cursorLeft"), false);
	assert.deepEqual(seen, ["tui.select.down", "tui.editor.cursorLeft"]);
});

test("settings keybindings fallback uses matchesKey helper when no keybinding manager exists", () => {
	const kb = createSettingsKeybindings({
		matchesKey: (data, key) => data === `<<${key}>>`,
	});

	assert.equal(kb.matches("<<up>>", "selectUp"), true);
	assert.equal(kb.matches("<<down>>", "selectDown"), true);
	assert.equal(kb.matches("<<left>>", "cursorLeft"), true);
	assert.equal(kb.matches("<<enter>>", "selectConfirm"), true);
	assert.equal(kb.matches("<<escape>>", "selectCancel"), true);
	assert.equal(kb.matches("<<right>>", "cursorLeft"), false);
});

test("settings keybindings fallback handles raw escape sequences", () => {
	const kb = createSettingsKeybindings({});

	assert.equal(kb.matches("\u001b[A", "selectUp"), true);
	assert.equal(kb.matches("\u001b[B", "selectDown"), true);
	assert.equal(kb.matches("\u001b[D", "cursorLeft"), true);
	assert.equal(kb.matches("\u001b[C", "cursorRight"), true);
	assert.equal(kb.matches("\r", "selectConfirm"), true);
	assert.equal(kb.matches("\u001b", "selectCancel"), true);
});
