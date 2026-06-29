import { App, Modal, Setting } from "obsidian";
import type { BackupOperationProgress } from "./types";

export function promptForBackupComment(
	app: App,
	title: string,
	placeholder: string,
): Promise<string | null> {
	return new Promise((resolve) => {
		new BackupCommentModal(app, title, placeholder, resolve).open();
	});
}

class BackupCommentModal extends Modal {
	private title: string;
	private placeholder: string;
	private resolve: (comment: string | null) => void;
	private comment = "";
	private resolved = false;

	constructor(
		app: App,
		title: string,
		placeholder: string,
		resolve: (comment: string | null) => void,
	) {
		super(app);
		this.title = title;
		this.placeholder = placeholder;
		this.resolve = resolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText(this.title);

		new Setting(contentEl)
			.setName("Comment")
			.setDesc("Optional note saved into this version's meta.json.")
			.addTextArea((text) => {
				text
					.setPlaceholder(this.placeholder)
					.setValue(this.comment)
					.onChange((value) => {
						this.comment = value;
					});
				text.inputEl.rows = 4;
			});

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText("Cancel")
					.onClick(() => this.finish(null))
			)
			.addButton((button) =>
				button
					.setButtonText("Start")
					.setCta()
					.onClick(() => this.finish(this.comment.trim()))
			);
	}

	onClose(): void {
		if (!this.resolved) {
			this.resolved = true;
			this.resolve(null);
		}
	}

	private finish(comment: string | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolve(comment);
		this.close();
	}
}

export class BackupProgressModal extends Modal {
	private title: string;
	private stageEl: HTMLElement | null = null;
	private detailEl: HTMLElement | null = null;

	constructor(app: App, title: string) {
		super(app);
		this.title = title;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText(this.title);
		this.stageEl = contentEl.createEl("p", { text: "Starting..." });
		this.detailEl = contentEl.createEl("p", { text: "" });
	}

	update(progress: BackupOperationProgress): void {
		const count = progress.total
			? ` (${progress.current || 0}/${progress.total})`
			: "";
		if (this.stageEl) this.stageEl.setText(`${progress.stage}${count}`);
		if (this.detailEl) this.detailEl.setText(progress.detail || "");
	}
}
