import assert from "node:assert/strict";
import test from "node:test";

import { getLastAssistantText } from "./session.ts";

test("returns text blocks from the latest assistant message on the active branch", () => {
	const entries = [
		{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "old.ts" }] } },
		{ type: "message", message: { role: "user", content: "continue" } },
		{
			type: "message",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "secret.ts" },
					{ type: "text", text: "src/new.ts" },
					{ type: "toolCall", name: "read", arguments: { path: "tool.ts" } },
					{ type: "text", text: "README.md" },
				],
			},
		},
	];

	assert.equal(getLastAssistantText(entries), "src/new.ts\nREADME.md");
});
