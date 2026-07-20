import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { extractFileReferences } from "./paths.ts";

async function createProject(): Promise<string> {
	const cwd = await mkdtemp(join(tmpdir(), "pi-open-in-editor-"));
	await mkdir(join(cwd, "src"));
	await mkdir(join(cwd, "docs"));
	await writeFile(join(cwd, "src", "one.ts"), "one");
	await writeFile(join(cwd, "docs", "My Guide.md"), "guide");
	await writeFile(join(cwd, "README.md"), "readme");
	return cwd;
}

test("extracts line and column locations from file references", async () => {
	const cwd = await createProject();

	const references = extractFileReferences("See src/one.ts:42:7.", cwd);

	assert.deepEqual(references, [
		{ path: join(cwd, "src", "one.ts"), displayPath: "src/one.ts", line: 42, column: 7 },
	]);
});

test("extracts markdown file references with spaces and deduplicates paths", async () => {
	const cwd = await createProject();

	const references = extractFileReferences(
		"Read `docs/My Guide.md`, then [the readme](README.md). README.md is mentioned twice.",
		cwd,
	);

	assert.deepEqual(
		references.map(({ path, displayPath }) => ({ path, displayPath })),
		[
			{ path: join(cwd, "docs", "My Guide.md"), displayPath: "docs/My Guide.md" },
			{ path: join(cwd, "README.md"), displayPath: "README.md" },
		],
	);
});

test("supports absolute #L locations while excluding directories and missing files", async () => {
	const cwd = await createProject();
	const absolutePath = join(cwd, "src", "one.ts");

	const references = extractFileReferences(
		`Open ${absolutePath}#L9. Ignore src/ and missing.ts.`,
		cwd,
	);

	assert.deepEqual(references, [
		{ path: absolutePath, displayPath: absolutePath, line: 9 },
	]);
});

test("extracts existing relative file paths in mention order", async () => {
	const cwd = await createProject();

	const references = extractFileReferences("Changed src/one.ts and README.md.", cwd);

	assert.deepEqual(
		references.map(({ path, displayPath }) => ({ path, displayPath })),
		[
			{ path: join(cwd, "src", "one.ts"), displayPath: "src/one.ts" },
			{ path: join(cwd, "README.md"), displayPath: "README.md" },
		],
	);
});
