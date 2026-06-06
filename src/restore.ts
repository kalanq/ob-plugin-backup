import { App, Notice, FuzzySuggestModal } from "obsidian";
import type { AddonSyncSettings } from "./types";
import { BackupManager } from "./backup";

const fs = require("fs");
const path = require("path");

export class RestoreManager {
	private app: App;
	private settings: AddonSyncSettings;
	private backupManager: BackupManager;
	isRestoring = false;

	constructor(app: App, settings: AddonSyncSettings, backupManager: BackupManager) {
		this.app = app;
		this.settings = settings;
		this.backupManager = backupManager;
	}

	updateSettings(settings: AddonSyncSettings): void {
		this.settings = settings;
	}

	private getVaultPath(): string {
		return (this.app.vault.adapter as any).getBasePath();
	}

	private getConfigPath(): string {
		return path.join(this.getVaultPath(), ".obsidian");
	}

	async restoreLatest(): Promise<void> {
		const latestDir = this.backupManager.getSyncLatestDir();
		if (!fs.existsSync(latestDir)) {
			new Notice("Addon Sync: No backup found.");
			return;
		}
		await this.restoreFromPath(latestDir);
	}

	async restoreFromHistory(): Promise<void> {
		const syncHistory = this.backupManager.getHistoryList();
		const localSnapshots = this.backupManager.getLocalSnapshotList();

		if (syncHistory.length === 0 && localSnapshots.length === 0) {
			new Notice("Addon Sync: No history snapshots found.");
			return;
		}

		const allEntries: Array<{
			displayName: string;
			path: string;
			isLocal: boolean;
			changelog: string[];
		}> = [];

		for (const entry of syncHistory) {
			allEntries.push({
				displayName: entry.displayName + (entry.meta?.changelog?.length ? ` (${entry.meta.changelog.length} changes)` : ""),
				path: path.join(this.backupManager.getSyncHistoryDir(), entry.timestamp),
				isLocal: false,
				changelog: entry.meta?.changelog || [],
			});
		}

		for (const entry of localSnapshots) {
			allEntries.push({
				displayName: entry.displayName,
				path: path.join(this.backupManager.getLocalSnapshotDirPublic(), entry.timestamp),
				isLocal: true,
				changelog: [],
			});
		}

		new HistorySelectModal(this.app, allEntries, (selected) => {
			this.restoreFromPath(selected.path);
		}).open();
	}

	async restoreFromPath(backupPath: string): Promise<void> {
		if (!fs.existsSync(backupPath)) {
			new Notice("Addon Sync: Backup path not found.");
			return;
		}

		this.isRestoring = true;
		try {
			const now = new Date();
			const timestamp = now.toISOString().replace(/[:.]/g, "-");
			const configPath = this.getConfigPath();

			this.createLocalSafetySnapshot(configPath, timestamp);

			this.restoreDirRecursive(backupPath, configPath);

			new Notice("Addon Sync: Restore completed. Please reload Obsidian.", 8000);
		} catch (err: any) {
			new Notice(`Addon Sync: Restore failed - ${err.message}`, 5000);
			throw err;
		} finally {
			this.isRestoring = false;
		}
	}

	private createLocalSafetySnapshot(configPath: string, timestamp: string): void {
		const localDir = this.backupManager.getLocalSnapshotDirPublic();
		if (!localDir) return;

		const snapshotDir = path.join(localDir, "pre-restore-" + timestamp);
		this.copyDirRecursive(configPath, snapshotDir);
	}

	private restoreDirRecursive(srcDir: string, destDir: string): void {
		const entries = fs.readdirSync(srcDir, { withFileTypes: true });
		for (const entry of entries) {
			const srcPath = path.join(srcDir, entry.name);
			const destPath = path.join(destDir, entry.name);

			if (entry.name === "meta.json") continue;

			if (entry.isDirectory()) {
				this.restoreDirRecursive(srcPath, destPath);
			} else {
				fs.mkdirSync(path.dirname(destPath), { recursive: true });
				fs.copyFileSync(srcPath, destPath);
			}
		}
	}

	private copyDirRecursive(src: string, dest: string): void {
		fs.mkdirSync(dest, { recursive: true });
		const entries = fs.readdirSync(src, { withFileTypes: true });
		for (const entry of entries) {
			const srcPath = path.join(src, entry.name);
			const destPath = path.join(dest, entry.name);
			if (entry.isDirectory()) {
				this.copyDirRecursive(srcPath, destPath);
			} else {
				fs.copyFileSync(srcPath, destPath);
			}
		}
	}
}

class HistorySelectModal extends FuzzySuggestModal<string> {
	private entries: Array<{
		displayName: string;
		path: string;
		isLocal: boolean;
		changelog: string[];
	}>;
	private onSelect: (entry: { path: string }) => void;

	constructor(
		app: App,
		entries: Array<{
			displayName: string;
			path: string;
			isLocal: boolean;
			changelog: string[];
		}>,
		onSelect: (entry: { path: string }) => void,
	) {
		super(app);
		this.entries = entries;
		this.onSelect = onSelect;
		this.setPlaceholder("Select a version to restore...");
	}

	getItems(): string[] {
		return this.entries.map((e) => e.displayName);
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		const entry = this.entries.find((e) => e.displayName === item);
		if (entry) {
			const changelogStr = entry.changelog.length > 0
				? "\n\nChanges:\n" + entry.changelog.join("\n")
				: "";
			new Notice(`Addon Sync: Restoring ${item}${changelogStr}`, 8000);
			this.onSelect(entry);
		}
	}
}
