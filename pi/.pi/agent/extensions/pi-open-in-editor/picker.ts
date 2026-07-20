import { DynamicBorder, type KeybindingsManager, type Theme } from "@earendil-works/pi-coding-agent";
import {
	Container,
	type Focusable,
	fuzzyFilter,
	Input,
	Spacer,
	Text,
	TruncatedText,
	type TUI,
} from "@earendil-works/pi-tui";

import type { FileReference } from "./paths.ts";

export class FilePicker extends Container implements Focusable {
	private readonly input = new Input();
	private readonly list = new Container();
	private filtered: FileReference[];
	private selectedIndex = 0;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	constructor(
		private readonly references: FileReference[],
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly onSelect: (reference: FileReference) => void,
		private readonly onCancel: () => void,
	) {
		super();
		this.filtered = references;

		this.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
		this.addChild(new Text(theme.fg("accent", theme.bold("Open in Emacs")), 1, 0));
		this.addChild(new Text(theme.fg("muted", "Type to filter files from the last agent message"), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(this.input);
		this.addChild(new Spacer(1));
		this.addChild(this.list);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter open • esc cancel"), 1, 0));
		this.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

		this.input.onSubmit = () => this.selectCurrent();
		this.updateList();
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.up")) {
			if (this.filtered.length > 0) {
				this.selectedIndex = this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
				this.updateList();
			}
		} else if (this.keybindings.matches(data, "tui.select.down")) {
			if (this.filtered.length > 0) {
				this.selectedIndex = this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
				this.updateList();
			}
		} else if (this.keybindings.matches(data, "tui.select.confirm")) {
			this.selectCurrent();
		} else if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.onCancel();
		} else {
			this.input.handleInput(data);
			this.filter(this.input.getValue());
		}
		this.tui.requestRender();
	}

	override invalidate(): void {
		super.invalidate();
		this.updateList();
	}

	private filter(query: string): void {
		this.filtered = query
			? fuzzyFilter(this.references, query, (reference) => `${reference.displayPath} ${reference.path}`)
			: this.references;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
		this.updateList();
	}

	private selectCurrent(): void {
		const reference = this.filtered[this.selectedIndex];
		if (reference) this.onSelect(reference);
	}

	private updateList(): void {
		this.list.clear();
		if (this.filtered.length === 0) {
			this.list.addChild(new Text(this.theme.fg("warning", "  No matching files"), 1, 0));
			return;
		}

		const maxVisible = 10;
		const start = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filtered.length - maxVisible),
		);
		const end = Math.min(start + maxVisible, this.filtered.length);

		for (let index = start; index < end; index++) {
			const reference = this.filtered[index]!;
			const selected = index === this.selectedIndex;
			const location = reference.line
				? this.theme.fg("muted", `:${reference.line}${reference.column ? `:${reference.column}` : ""}`)
				: "";
			const prefix = selected ? this.theme.fg("accent", "→ ") : "  ";
			const path = selected
				? this.theme.fg("accent", reference.displayPath)
				: this.theme.fg("text", reference.displayPath);
			this.list.addChild(new TruncatedText(`${prefix}${path}${location}`, 1, 0));
		}

		if (start > 0 || end < this.filtered.length) {
			this.list.addChild(
				new Text(this.theme.fg("dim", `  (${this.selectedIndex + 1}/${this.filtered.length})`), 1, 0),
			);
		}

		const selected = this.filtered[this.selectedIndex]!;
		if (selected.path !== selected.displayPath) {
			this.list.addChild(new Spacer(1));
			this.list.addChild(new TruncatedText(this.theme.fg("muted", `  ${selected.path}`), 1, 0));
		}
	}
}
