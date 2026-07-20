import { spawn } from "node:child_process";

import type { FileReference } from "./paths.ts";

export function buildEmacsclientArgs(reference: FileReference): string[] {
	const args = ["--no-wait"];
	if (reference.line !== undefined) {
		args.push(`+${reference.line}${reference.column !== undefined ? `:${reference.column}` : ""}`);
	}
	args.push(reference.path);
	return args;
}

export async function openInEmacs(reference: FileReference): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("emacsclient", buildEmacsclientArgs(reference), { stdio: "ignore" });
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`emacsclient exited with status ${code ?? "unknown"}`));
		});
	});
}
