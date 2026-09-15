import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { copyMarkdownAsFile, type MarkdownFileClipboard } from "./clipboard.ts";

test("creates a Markdown file and places that file on the clipboard", async () => {
	const outputDirectory = await mkdtemp(join(tmpdir(), "pi-copy-message-test-"));
	let clipboardPath: string | undefined;
	const clipboard: MarkdownFileClipboard = {
		async copyFile(path) {
			clipboardPath = path;
		},
	};

	const path = await copyMarkdownAsFile("# Ready\n", clipboard, outputDirectory, "release-notes");

	assert.equal(path, join(outputDirectory, "release-notes.md"));
	assert.equal(await readFile(path, "utf8"), "# Ready\n");
	assert.equal(clipboardPath, path);
});
