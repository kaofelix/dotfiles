import assert from "node:assert/strict";
import test from "node:test";

import { buildEmacsclientArgs } from "./emacsclient.ts";

test("builds a non-blocking emacsclient invocation at the referenced location", () => {
	assert.deepEqual(
		buildEmacsclientArgs({
			path: "/tmp/My Guide.md",
			displayPath: "My Guide.md",
			line: 42,
			column: 7,
		}),
		["--no-wait", "+42:7", "/tmp/My Guide.md"],
	);
});
