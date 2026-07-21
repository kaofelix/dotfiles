import { fileReferenceFromPath, type FileReference, type FileReferenceSource } from "./paths.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function getLastAssistantText(entries: readonly unknown[]): string | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) continue;
		if (entry.message.role !== "assistant" || !Array.isArray(entry.message.content)) continue;

		const text = entry.message.content
			.filter((block): block is Record<string, unknown> => isRecord(block) && block.type === "text")
			.map((block) => block.text)
			.filter((value): value is string => typeof value === "string")
			.join("\n");
		return text || undefined;
	}

	return undefined;
}

export function getRecentFileReferences(
	entries: readonly unknown[],
	cwd: string,
	limitPerSection = 5,
): FileReference[] {
	const successfulToolCalls = new Set<string>();
	for (const entry of entries) {
		if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) continue;
		const message = entry.message;
		if (message.role === "toolResult" && message.isError === false && typeof message.toolCallId === "string") {
			successfulToolCalls.add(message.toolCallId);
		}
	}

	const bySource: Record<"edited" | "read", FileReference[]> = { edited: [], read: [] };
	for (let entryIndex = entries.length - 1; entryIndex >= 0; entryIndex--) {
		const entry = entries[entryIndex];
		if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) continue;
		const message = entry.message;
		if (message.role !== "assistant" || !Array.isArray(message.content)) continue;

		for (let blockIndex = message.content.length - 1; blockIndex >= 0; blockIndex--) {
			const block = message.content[blockIndex];
			if (!isRecord(block) || block.type !== "toolCall" || typeof block.id !== "string") continue;
			if (!successfulToolCalls.has(block.id) || !isRecord(block.arguments)) continue;
			const path = block.arguments.path;
			if (typeof path !== "string") continue;

			let source: FileReferenceSource | undefined;
			if (block.name === "edit" || block.name === "write") source = "edited";
			else if (block.name === "read") source = "read";
			if (source !== "edited" && source !== "read") continue;

			const reference = fileReferenceFromPath(path, cwd, source);
			if (reference) bySource[source].push(reference);
		}
	}

	const seen = new Set<string>();
	const unique = (references: FileReference[]): FileReference[] => {
		const result: FileReference[] = [];
		for (const reference of references) {
			if (seen.has(reference.path)) continue;
			seen.add(reference.path);
			result.push(reference);
			if (result.length === limitPerSection) break;
		}
		return result;
	};

	return [...unique(bySource.edited), ...unique(bySource.read)];
}
