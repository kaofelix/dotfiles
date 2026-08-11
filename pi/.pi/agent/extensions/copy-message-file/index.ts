import { DynamicBorder, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, Input, Text } from "@earendil-works/pi-tui";

import { copyMarkdownAsFile, type MarkdownFileClipboard } from "./clipboard.ts";
import { getLastAssistantMarkdown } from "./message.ts";

function macOSClipboard(pi: ExtensionAPI): MarkdownFileClipboard {
	return {
		async copyFile(path) {
			if (process.platform !== "darwin") {
				throw new Error("copy-message-file currently requires macOS");
			}

			const result = await pi.exec("osascript", [
				"-e",
				"on run argv",
				"-e",
				"set the clipboard to POSIX file (item 1 of argv)",
				"-e",
				"end run",
				path,
			]);
			if (result.code !== 0) {
				throw new Error(result.stderr.trim() || "osascript could not update the clipboard");
			}
		},
	};
}

async function promptForFilename(ctx: ExtensionContext, defaultName: string): Promise<string | undefined> {
	if (ctx.mode !== "tui") return ctx.ui.input("Markdown filename", defaultName);

	return ctx.ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
		const container = new Container();
		const input = new Input();
		input.onSubmit = (value) => done(value.trim() || defaultName);
		input.onEscape = () => done(undefined);

		container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
		container.addChild(new Text(theme.fg("accent", theme.bold("Markdown filename")), 1, 0));
		container.addChild(new Text(theme.fg("dim", `Default: ${defaultName}`), 1, 0));
		container.addChild(input);
		container.addChild(new Text(theme.fg("dim", "Enter to use name • Esc to cancel"), 1, 0));
		container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

		return {
			get focused() {
				return input.focused;
			},
			set focused(value: boolean) {
				input.focused = value;
			},
			render: (width: number) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				input.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

async function copyLastMessage(ctx: ExtensionContext, clipboard: MarkdownFileClipboard): Promise<void> {
	const markdown = getLastAssistantMarkdown(ctx.sessionManager.getBranch());
	if (!markdown) {
		ctx.ui.notify("No assistant message to copy", "warning");
		return;
	}
	if (!ctx.hasUI) {
		ctx.ui.notify("copy-message-file requires interactive mode", "error");
		return;
	}

	const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
	const defaultName = `assistant-message-${timestamp}.md`;
	const requestedName = await promptForFilename(ctx, defaultName);
	if (requestedName === undefined) {
		ctx.ui.notify("Cancelled", "info");
		return;
	}

	try {
		const path = await copyMarkdownAsFile(markdown, clipboard, undefined, requestedName.trim() || defaultName);
		ctx.ui.notify(`Copied as a Markdown file: ${path}`, "info");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Could not copy message as a file: ${message}`, "error");
	}
}

export default function (pi: ExtensionAPI) {
	const clipboard = macOSClipboard(pi);

	pi.registerCommand("copy-message-file", {
		description: "Copy the last assistant message as a pasteable Markdown file",
		handler: async (_args, ctx) => copyLastMessage(ctx, clipboard),
	});

	pi.registerShortcut("ctrl+shift+x", {
		description: "Copy the last assistant message as a Markdown file",
		handler: async (ctx) => copyLastMessage(ctx, clipboard),
	});
}
