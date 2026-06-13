import { App } from "obsidian";
import type { AddonBackupSettings, FileChange } from "./types";
import { BackupManager } from "./backup";
import { getConfigPath } from "./path_utils";
import { collectBackupFiles, simpleHash } from "./file_utils";

const fs = require("fs");

export class DiffChecker {
	private app: App;
	private settings: AddonBackupSettings;
	private backupManager: BackupManager;

	constructor(app: App, settings: AddonBackupSettings, backupManager: BackupManager) {
		this.app = app;
		this.settings = settings;
		this.backupManager = backupManager;
	}

	updateSettings(settings: AddonBackupSettings): void {
		this.settings = settings;
	}

	private getConfigPath(): string {
		return getConfigPath(this.app);
	}

	async checkChanges(): Promise<FileChange[]> {
		const meta = await this.backupManager.readMeta();
		if (!meta) return [];

		const configPath = this.getConfigPath();
		const currentFiles = collectBackupFiles(configPath, "", this.settings);
		const changes: FileChange[] = [];

		for (const file of currentFiles) {
			const content = fs.readFileSync(file.source, "utf8");
			const hash = simpleHash(content);

			if (!meta.fileHashes[file.relativePath]) {
				changes.push({ path: file.source, relativePath: file.relativePath, type: "added" });
			} else if (meta.fileHashes[file.relativePath] !== hash) {
				changes.push({ path: file.source, relativePath: file.relativePath, type: "modified" });
			}
		}

		const currentPaths = new Set(currentFiles.map((file) => file.relativePath));
		for (const relativePath of Object.keys(meta.fileHashes)) {
			if (!currentPaths.has(relativePath)) {
				changes.push({ path: relativePath, relativePath, type: "deleted" });
			}
		}

		return changes;
	}

	async hasChanges(): Promise<boolean> {
		const changes = await this.checkChanges();
		return changes.length > 0;
	}

	async getChangeSummary(): Promise<string> {
		const changes = await this.checkChanges();
		if (changes.length === 0) return "No changes detected.";

		const lines = changes.map((c) => {
			const prefix = c.type === "added" ? "+" : c.type === "deleted" ? "-" : "~";
			return `${prefix} ${c.relativePath}`;
		});
		return lines.join("\n");
	}
}
