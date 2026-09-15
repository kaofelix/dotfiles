import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getRecentFileReferences, getRecentlyMentionedFileReferences } from "./session.ts";

test("returns unique mentioned files from recent assistant messages, newest message first", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-open-in-editor-session-"));
	for (const name of ["old.ts", "shared.ts", "latest.ts"]) {
		await writeFile(join(cwd, name), name);
	}
	const entries = [
		{
			type: "message",
			message: { role: "assistant", content: [{ type: "text", text: "old.ts then shared.ts" }] },
		},
		{ type: "message", message: { role: "user", content: "continue" } },
		{
			type: "message",
			message: { role: "assistant", content: [{ type: "text", text: "latest.ts then shared.ts" }] },
		},
	];

	assert.deepEqual(getRecentlyMentionedFileReferences(entries, cwd), [
		{ path: join(cwd, "latest.ts"), displayPath: "latest.ts", source: "mentioned" },
		{ path: join(cwd, "shared.ts"), displayPath: "shared.ts", source: "mentioned" },
		{ path: join(cwd, "old.ts"), displayPath: "old.ts", source: "mentioned" },
	]);
	assert.equal(getRecentlyMentionedFileReferences(entries, cwd, 2).length, 2);
});

test("excludes failed file tool calls from recent files", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-open-in-editor-session-"));
	await writeFile(join(cwd, "failed.ts"), "failed");
	const entries = [
		{
			type: "message",
			message: {
				role: "assistant",
				content: [{ type: "toolCall", id: "failed-read", name: "read", arguments: { path: "failed.ts" } }],
			},
		},
		{
			type: "message",
			message: {
				role: "toolResult",
				toolCallId: "failed-read",
				toolName: "read",
				content: [],
				isError: true,
			},
		},
	];

	assert.deepEqual(getRecentFileReferences(entries, cwd), []);
});

test("returns recent edits before recent reads, newest first in each section", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-open-in-editor-session-"));
	for (const name of ["read-first.ts", "edit-first.ts", "edit-latest.ts"]) {
		await writeFile(join(cwd, name), name);
	}
	const entries = [
		{
			type: "message",
			message: {
				role: "assistant",
				content: [
					{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "read-first.ts" } },
					{ type: "toolCall", id: "edit-1", name: "edit", arguments: { path: "edit-first.ts" } },
					{ type: "toolCall", id: "edit-2", name: "write", arguments: { path: "edit-latest.ts" } },
				],
			},
		},
		...[
			["read-1", "read"],
			["edit-1", "edit"],
			["edit-2", "write"],
		].map(([toolCallId, toolName]) => ({
			type: "message",
			message: { role: "toolResult", toolCallId, toolName, content: [], isError: false },
		})),
	];

	assert.deepEqual(getRecentFileReferences(entries, cwd), [
		{ path: join(cwd, "edit-latest.ts"), displayPath: "edit-latest.ts", source: "edited" },
		{ path: join(cwd, "edit-first.ts"), displayPath: "edit-first.ts", source: "edited" },
		{ path: join(cwd, "read-first.ts"), displayPath: "read-first.ts", source: "read" },
	]);
});
