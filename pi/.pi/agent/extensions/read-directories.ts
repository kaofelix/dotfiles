/**
 * Read Directories Extension
 *
 * Wraps the built-in `read` tool to handle directories gracefully.
 * Instead of erroring when the path is a directory, it returns a
 * listing of the directory contents.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

function expandPath(filePath: string): string {
	const normalized = filePath.startsWith("@") ? filePath.slice(1) : filePath;
	if (normalized === "~") return homedir();
	if (normalized.startsWith("~/")) return homedir() + normalized.slice(1);
	return normalized;
}

function resolvePath(filePath: string, cwd: string): string {
	const expanded = expandPath(filePath);
	return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "read" || !event.isError) return;

		const path = event.input?.path;
		if (typeof path !== "string") return;

		const absolutePath = resolvePath(path, ctx.cwd);

		let stat;
		try {
			stat = statSync(absolutePath);
		} catch {
			return;
		}

		if (!stat.isDirectory()) return;

		const entries = readdirSync(absolutePath, { withFileTypes: true });
		const lines = entries
			.sort((a, b) => {
				// Directories first, then files
				if (a.isDirectory() && !b.isDirectory()) return -1;
				if (!a.isDirectory() && b.isDirectory()) return 1;
				return a.name.localeCompare(b.name);
			})
			.map((entry) => {
				if (entry.isDirectory()) return `${entry.name}/`;
				if (entry.isSymbolicLink()) return `${entry.name}@`;
				return entry.name;
			});

		const listing = lines.join("\n");

		return {
			content: [
				{
					type: "text" as const,
					text: `"${path}" is a directory with ${entries.length} entries:\n\n${listing}`,
				},
			],
			isError: false,
		};
	});
}
