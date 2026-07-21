import assert from "node:assert/strict";
import test from "node:test";

import type { FileReference } from "./paths.ts";
import { groupFileReferences } from "./sections.ts";

const references: FileReference[] = [
	{ path: "/project/mentioned.ts", displayPath: "mentioned.ts", source: "mentioned" },
	{ path: "/project/edited.ts", displayPath: "edited.ts", source: "edited" },
	{ path: "/project/read.ts", displayPath: "read.ts", source: "read" },
];

test("groups filtered files under ordered non-selectable section metadata", () => {
	assert.deepEqual(groupFileReferences([references[0]!, references[2]!]), [
		{ source: "mentioned", title: "Mentioned in last response", references: [references[0]] },
		{ source: "read", title: "Recent reads", references: [references[2]] },
	]);
});
