import assert from "node:assert/strict";
import test from "node:test";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { getLastAssistantMarkdown } from "./message.ts";

function messageEntry(id: string, role: "user" | "assistant", content: unknown): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: new Date(0).toISOString(),
		message: {
			role,
			content,
			timestamp: 0,
			...(role === "assistant"
				? {
						api: "test",
						provider: "test",
						model: "test",
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "stop" as const,
					}
				: {}),
		},
	} as SessionEntry;
}

test("returns the latest assistant's visible markdown from the active branch", () => {
	const branch = [
		messageEntry("1", "assistant", [{ type: "text", text: "older" }]),
		messageEntry("2", "user", "continue"),
		messageEntry("3", "assistant", [
			{ type: "thinking", thinking: "private reasoning" },
			{ type: "text", text: "# Result" },
			{ type: "toolCall", id: "call-1", name: "read", arguments: {} },
			{ type: "text", text: "- one\n- two" },
		]),
	];

	assert.equal(getLastAssistantMarkdown(branch), "# Result\n\n- one\n- two\n");
});
