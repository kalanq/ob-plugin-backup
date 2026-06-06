import { App, Notice, FileSystemAdapter, FuzzySuggestModal } from "obsidian";
import type { AddonSyncSettings } from "./types";
import { BackupManager } from "./backup";
import { BACKUP_DIR_NAME, LATEST_DIR_NAME, HISTORY_DIR_NAME } from "./constants";

export class RestoreManager {
	private app: App;
	private settings: AddonSyncSettings;
	private backupManager: BackupManager;
	private configDir: string;
	public isRestoring: boolean = false;

	constructor(app: App, settings: AddonSyncSettings, backupManager: BackupManager) {
		this.app = app;
		this.settings = settings;
		this.backupManager = backupManager;
		this.configDir = (app.vault as any).configDir || ".obsidian";
	}

	updateSettings(settings: AddonSyncSettings) {
		this.settings = settings;
	}

	async restoreFromPath(backupPath: string): Promise<void> {
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		const vaultPath = adapter.getBasePath();
		const configPath = `${vaultPath}/${this.configDir}`;
		const fs = require("fs") as typeof import("fs");
		const path = require("path") as typeof import("path");

		if (!fs.existsSync(backupPath)) {
			throw new Error(`Backup path not found: ${backupPath}`);
		}

		this.isRestoring = true;
		try {
			await this.backupManager.createHistorySnapshot();

			this.restoreDirRecursive(backupPath, configPath, backupPath);

			new Notice("Addon Sync: Settings restored successfully. Please reload Obsidian.", 5000);
		} finally {
			this.isRestoring = false;
		}
	}

	private restoreDirRecursive(srcDir: string, destDir: string, backupRoot: string): void {
		const fs = require("fs") as typeof import("fs");
		const path = require("path") as typeof import("path");

		if (!fs.existsSync(srcDir)) return;

		const entries = fs.readdirSync(srcDir, { withFileTypes: true });
		for (const entry of entries) {
			const srcPath = `${srcDir}/${entry.name}`;
			const destPath = `${destDir}/${entry.name}`;

			if (entry.isDirectory()) {
				this.restoreDirRecursive(srcPath, destPath, backupRoot);
			} else {
				fs.mkdirSync(path.dirname(destPath), { recursive: true });
				fs.copyFileSync(srcPath, destPath);
			}
		}
	}

	async restoreLatest(): Promise<void> {
		const latestDir = this.backupManager.getLatestDir();
		if (!latestDir) {
			throw new Error("Backup path not configured");
		}
		await this.restoreFromPath(latestDir);
	}

	async restoreFromHistory(): Promise<void> {
		const historyList = await this.backupManager.getHistoryList();

		if (historyList.length === 0) {
			new Notice("Addon Sync: No history snapshots found.");
			return;
		}

		const modal = new HistorySelectModal(this.app, historyList, async (selected) => {
			const historyDir = this.backupManager.getHistoryDir();
			const snapshotPath = `${historyDir}/${selected}`;
			await this.restoreFromPath(snapshotPath);
		});
		modal.open();
	}
}

class HistorySelectModal extends FuzzySuggestModal<string> {
	private historyList: string[];
	private onSelect: (item: string) => void;

	constructor(app: App, historyList: string[], onSelect: (item: string) => void) {
		super(app);
		this.historyList = historyList;
		this.onSelect = onSelect;
		this.setPlaceholder("Select a history snapshot to restore...");
	}

	getItems(): string[] {
		return this.historyList;
	}

	getItemText(item: string): string {
		return item.replace(/-/g, (match, offset) => {
			if (offset === 4 || offset === 7) return "-";
			if (offset === 10) return " ";
			if (offset === 13 || offset === 16) return ":";
			return match;
		});
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(item);
	}
}
