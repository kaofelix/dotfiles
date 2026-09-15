import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export function getLastAssistantMarkdown(branch: SessionEntry[]): string | undefined {
	for (let index = branch.length - 1; index >= 0; index--) {
		const entry = branch[index];
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;

		const markdown = entry.message.content
			.filter((block): block is { type: "text"; text: string } => block.type === "text")
			.map((block) => block.text)
			.filter((text) => text.length > 0)
			.join("\n\n");

		if (markdown.length > 0) return `${markdown.replace(/\n*$/, "")}\n`;
	}

	return undefined;
}
