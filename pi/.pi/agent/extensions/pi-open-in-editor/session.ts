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
