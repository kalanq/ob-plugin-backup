import { App, FuzzySuggestModal, Modal, Notice, Setting } from "obsidian";
import type { AddonBackupSettings, PluginVersionDiff, RestoreCategoryGroup, RestorePreview } from "./types";
import { BackupManager } from "./backup";
import { getConfigDirName, getConfigPath } from "./path_utils";
import { copySelectedRestoreFiles, createRestorePreview } from "./restore_plan";

const fs = require("fs");
const path = require("path");

export class RestoreManager {
	private app: App;
	private settings: AddonBackupSettings;
	private backupManager: BackupManager;
	isRestoring = false;

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

	async restoreLatest(): Promise<void> {
		const latestDir = this.backupManager.getSyncLatestDir();
		if (!fs.existsSync(latestDir)) {
			new Notice("Plugin Backup: No backup found.");
			return;
		}
		await this.openRestoreConfirmation(latestDir, await this.backupManager.readMeta());
	}

	async restoreFromHistory(): Promise<void> {
		const syncHistory = this.backupManager.getHistoryList();
		const localSnapshots = this.backupManager.getLocalSnapshotList();

		if (syncHistory.length === 0 && localSnapshots.length === 0) {
			new Notice("Plugin Backup: No history snapshots found.");
			return;
		}

		const allEntries: Array<{
			displayName: string;
			path: string;
			isLocal: boolean;
			changelog: string[];
		}> = [];

		for (const entry of syncHistory) {
			const deviceLabel = entry.meta?.deviceName ? ` [${entry.meta.deviceName}]` : "";
			allEntries.push({
				displayName: entry.displayName + deviceLabel + (entry.meta?.changelog?.length ? ` (${entry.meta.changelog.length} changes)` : ""),
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
			this.openRestoreConfirmation(selected.path, null);
		}).open();
	}

	async openRestoreConfirmation(backupPath: string, fallbackMeta: any): Promise<void> {
		if (!fs.existsSync(backupPath)) {
			new Notice("Plugin Backup: Backup path not found.");
			return;
		}

		const preview = createRestorePreview(
			backupPath,
			this.getConfigPath(),
			getConfigDirName(this.app),
			fallbackMeta,
			this.settings.deviceId,
			this.settings.deviceName,
		);

		if (preview.files.length === 0) {
			new Notice("Plugin Backup: No restorable files found.");
			return;
		}

		new RestoreConfirmModal(this.app, preview, async (selectedPaths) => {
			await this.restoreSelectedFiles(backupPath, selectedPaths);
		}).open();
	}

	async restoreFromPath(backupPath: string, selectedRelativePaths?: string[]): Promise<void> {
		if (!selectedRelativePaths) {
			await this.openRestoreConfirmation(backupPath, null);
			return;
		}
		await this.restoreSelectedFiles(backupPath, selectedRelativePaths);
	}

	private async restoreSelectedFiles(backupPath: string, selectedRelativePaths: string[]): Promise<void> {
		if (!fs.existsSync(backupPath)) {
			new Notice("Plugin Backup: Backup path not found.");
			return;
		}

		if (selectedRelativePaths.length === 0) {
			new Notice("Plugin Backup: Restore cancelled because no files were selected.");
			return;
		}

		this.isRestoring = true;
		try {
			const now = new Date();
			const timestamp = now.toISOString().replace(/[:.]/g, "-");
			const configPath = this.getConfigPath();

			this.createLocalSafetySnapshot(configPath, timestamp);
			copySelectedRestoreFiles(backupPath, configPath, selectedRelativePaths);

			new Notice("Plugin Backup: Restore completed. Please reload Obsidian.", 8000);
		} catch (err: any) {
			new Notice(`Plugin Backup: Restore failed - ${err.message}`, 5000);
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

class RestoreConfirmModal extends Modal {
	private preview: RestorePreview;
	private selectedPaths: Set<string>;
	private onConfirm: (selectedPaths: string[]) => Promise<void>;

	constructor(
		app: App,
		preview: RestorePreview,
		onConfirm: (selectedPaths: string[]) => Promise<void>,
	) {
		super(app);
		this.preview = preview;
		const currentDeviceFiles = preview.groups
			.filter((group) => group.isCurrentDevice)
			.flatMap((group) => group.files);
		this.selectedPaths = new Set(currentDeviceFiles.length > 0 ? currentDeviceFiles : preview.files);
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText("Confirm Plugin Backup Restore");

		contentEl.createEl("p", {
			text: `Safety check: this will overwrite selected files in ${this.preview.configDirName}. Please manually back up your Obsidian config folder before continuing.`,
		});

		this.renderDeviceGroups(contentEl);
		this.renderActions(contentEl);
	}

	private formatStatus(diff: PluginVersionDiff): string {
		if (diff.status === "same") return "";
		if (diff.status === "missing-local") return " (not installed locally)";
		if (diff.status === "missing-backup") return " (missing from backup manifest)";
		return " (version differs)";
	}

	private renderDeviceGroups(containerEl: HTMLElement): void {
		for (const deviceGroup of this.preview.groups) {
			const details = containerEl.createEl("details");
			details.open = deviceGroup.isCurrentDevice || this.preview.groups.length === 1;
			const selectedCount = deviceGroup.files.filter((file) => this.selectedPaths.has(file)).length;
			details.createEl("summary", {
				text: `${deviceGroup.deviceName}${deviceGroup.isCurrentDevice ? " (current device)" : ""} - ${selectedCount}/${deviceGroup.files.length} selected`,
			});

			new Setting(details)
				.setName("Select this device")
				.setDesc(`${deviceGroup.files.length} files from ${deviceGroup.deviceName}`)
				.addToggle((toggle) => {
					toggle.setValue(deviceGroup.files.every((file) => this.selectedPaths.has(file)));
					toggle.onChange((value) => {
						this.setFilesSelected(deviceGroup.files, value);
						this.onOpen();
					});
				});

			for (const category of deviceGroup.categories) {
				this.renderCategory(details, category);
			}
		}
	}

	private renderCategory(containerEl: HTMLElement, category: RestoreCategoryGroup): void {
		const details = containerEl.createEl("details");
		details.open = category.key === "communityPlugins";
		const versionDiffs = category.pluginVersionDiffs.filter((diff) => diff.status !== "same");
		const selectedCount = category.files.filter((file) => this.selectedPaths.has(file)).length;
		details.createEl("summary", {
			text: `${category.label} - ${selectedCount}/${category.files.length} files${category.pluginIds.length ? `, ${category.pluginIds.length} plugins` : ""}${versionDiffs.length ? `, ${versionDiffs.length} version differences` : ""}`,
		});

		new Setting(details)
			.setName(`Select ${category.label}`)
			.setDesc(this.getCategoryDescription(category))
			.addToggle((toggle) => {
				toggle.setValue(category.files.every((file) => this.selectedPaths.has(file)));
				toggle.onChange((value) => {
					this.setFilesSelected(category.files, value);
					this.onOpen();
				});
			});

		if (category.pluginVersionDiffs.length > 0) {
			for (const diff of category.pluginVersionDiffs) {
				details.createEl("div", {
					text: `${diff.id}: backup ${diff.backupVersion}, local ${diff.currentVersion}${this.formatStatus(diff)}`,
				});
			}
		}

		for (const file of category.files) {
			new Setting(details)
				.setName(file)
				.addToggle((toggle) => {
					toggle.setValue(this.selectedPaths.has(file));
					toggle.onChange((value) => this.setFilesSelected([file], value));
				});
		}
	}

	private getCategoryDescription(category: RestoreCategoryGroup): string {
		const parts = [`${category.files.length} files`];
		if (category.pluginIds.length) parts.push(`${category.pluginIds.length} plugins`);
		const diffCount = category.pluginVersionDiffs.filter((diff) => diff.status !== "same").length;
		if (diffCount) parts.push(`${diffCount} version differences`);
		return parts.join(", ");
	}

	private setFilesSelected(files: string[], selected: boolean): void {
		for (const file of files) {
			if (selected) this.selectedPaths.add(file);
			else this.selectedPaths.delete(file);
		}
	}

	private renderActions(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.addButton((button) =>
				button
					.setButtonText("Cancel")
					.onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText("Restore selected")
					.setWarning()
					.onClick(async () => {
						const selected = Array.from(this.selectedPaths);
						this.close();
						await this.onConfirm(selected);
					})
			);
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
			new Notice(`Plugin Backup: Selected ${item}${changelogStr}`, 8000);
			this.onSelect(entry);
		}
	}
}
