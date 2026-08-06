import assert from "node:assert/strict";
import test from "node:test";

import { BranchCursor } from "./branch-cursor.ts";

test("uses the leaf reported by tree navigation instead of a stale default branch", () => {
	const cursor = new BranchCursor();
	cursor.setLeaf("new-leaf");
	const manager = {
		getBranch(fromId?: string): string[] {
			return fromId === "new-leaf" ? ["new-branch"] : ["branch-left-behind"];
		},
	};

	assert.deepEqual(cursor.getBranch(manager), ["new-branch"]);
});
