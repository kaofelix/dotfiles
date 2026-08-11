import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export interface MarkdownFileClipboard {
	copyFile(path: string): Promise<void>;
}

export async function copyMarkdownAsFile(
	markdown: string,
	clipboard: MarkdownFileClipboard,
	outputDirectory = join(tmpdir(), "pi-copied-messages"),
	requestedName = `assistant-message-${randomUUID()}`,
): Promise<string> {
	await mkdir(outputDirectory, { recursive: true });
	const safeName = basename(requestedName.trim().replaceAll("\\", "-")) || `assistant-message-${randomUUID()}`;
	const filename = safeName.toLowerCase().endsWith(".md") ? safeName : `${safeName}.md`;
	const path = join(outputDirectory, filename);
	await writeFile(path, markdown, "utf8");
	await clipboard.copyFile(path);
	return path;
}
