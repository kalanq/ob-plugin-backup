import { App, FuzzySuggestModal, Modal, Notice, Setting } from "obsidian";
import type { AddonBackupSettings, BackupMeta, PluginVersionDiff, RestoreCategoryGroup, RestorePluginGroup, RestorePreview } from "./types";
import { BackupManager } from "./backup";
import { getConfigDirName, getConfigPath } from "./path_utils";
import { copySelectedRestoreFiles, createRestorePreview } from "./restore_plan";
import { isArchiveBackupPath, readArchiveText } from "./archive_utils";
import { compareFileHashes, compareJsonStructure, type JsonStructureDiff } from "./version_compare";

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
		const latestPath = this.backupManager.getSyncLatestPath();
		if (!fs.existsSync(latestPath)) {
			new Notice("Plugin Backup: No backup found.");
			return;
		}
		await this.openRestoreConfirmation(latestPath, await this.backupManager.readMeta());
	}

	async restoreFromHistory(): Promise<void> {
		const allEntries = await this.getVersionEntries(false);

		if (allEntries.length === 0) {
			new Notice("Plugin Backup: No history snapshots found.");
			return;
		}

		new HistorySelectModal(this.app, allEntries, (selected) => {
			this.openRestoreConfirmation(selected.path, null);
		}).open();
	}

	async compareVersions(): Promise<void> {
		const entries = await this.getVersionEntries(true);
		const comparableEntries = entries.filter((entry) => entry.meta?.fileHashes);
		if (comparableEntries.length < 2) {
			new Notice("Plugin Backup: Need at least two versions to compare.");
			return;
		}
		new VersionCompareModal(this.app, comparableEntries).open();
	}

	async restoreLastPreRestoreSnapshot(): Promise<void> {
		const snapshotPath = this.backupManager.getLatestPreRestoreSnapshotPath();
		if (!snapshotPath || !fs.existsSync(snapshotPath)) {
			new Notice("Plugin Backup: No pre-restore snapshot found.");
			return;
		}
		await this.openRestoreConfirmation(snapshotPath, null);
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
			const configPath = this.getConfigPath();
			const preview = createRestorePreview(
				backupPath,
				configPath,
				getConfigDirName(this.app),
				null,
				this.settings.deviceId,
				this.settings.deviceName,
			);
			const restoredWarnings = selectedRelativePaths
				.flatMap((selectedPath) => preview.fileInfos[selectedPath]?.pathWarnings
					.map((warning) => `${selectedPath} ${warning.jsonPath}: ${warning.value}${warning.existsOnThisDevice ? "" : " (not found on this device)"}`)
					|| []);

			this.backupManager.createPreRestoreSnapshot(this.formatRestoreSourceLabel(backupPath, preview.meta));
			copySelectedRestoreFiles(backupPath, configPath, selectedRelativePaths);

			const warningGuide = restoredWarnings.length
				? `\nReview device-specific paths:\n${restoredWarnings.slice(0, 5).join("\n")}${restoredWarnings.length > 5 ? `\n...and ${restoredWarnings.length - 5} more` : ""}`
				: "";
			new Notice(`Plugin Backup: Restore completed. Please reload Obsidian.${warningGuide}`, 12000);
		} catch (err: any) {
			new Notice(`Plugin Backup: Restore failed - ${err.message}`, 5000);
			throw err;
		} finally {
			this.isRestoring = false;
		}
	}

	private async getVersionEntries(includeLatest: boolean): Promise<VersionEntry[]> {
		const entries: VersionEntry[] = [];

		if (includeLatest) {
			const latestPath = this.backupManager.getSyncLatestPath();
			const latestMeta = await this.backupManager.readMeta();
			if (fs.existsSync(latestPath) && latestMeta) {
				entries.push({
					displayName: this.formatVersionLabel("Latest", latestMeta, true),
					path: latestPath,
					isLocal: false,
					changelog: latestMeta.changelog || [],
					meta: latestMeta,
				});
			}
		}

		for (const entry of this.backupManager.getHistoryList()) {
			entries.push({
				displayName: this.formatVersionLabel(entry.displayName, entry.meta, false),
				path: path.join(this.backupManager.getSyncHistoryDir(), entry.timestamp),
				isLocal: false,
				changelog: entry.meta?.changelog || [],
				meta: entry.meta,
			});
		}

		for (const entry of this.backupManager.getLocalSnapshotList()) {
			entries.push({
				displayName: this.formatVersionLabel(entry.displayName, entry.meta, false),
				path: path.join(this.backupManager.getLocalSnapshotDirPublic(), entry.timestamp),
				isLocal: true,
				changelog: entry.meta?.changelog || [],
				meta: entry.meta,
			});
		}

		return entries;
	}

	private formatVersionLabel(prefix: string, meta: BackupMeta | null, latest: boolean): string {
		const parts = [prefix];
		if (meta?.deviceName) parts.push(`[${meta.deviceName}]`);
		if (meta?.comment) parts.push(`- ${this.truncateLabel(meta.comment)}`);
		if (latest) parts.push("(latest)");
		else if (meta?.changelog?.length) parts.push(`(${meta.changelog.length} changes)`);
		return parts.join(" ");
	}

	private formatRestoreSourceLabel(backupPath: string, meta: BackupMeta | null): string {
		if (meta?.comment) return this.truncateLabel(meta.comment);
		if (meta?.lastBackupTimeStr) return meta.lastBackupTimeStr;
		return path.basename(backupPath);
	}

	private truncateLabel(value: string, maxLength = 80): string {
		return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
	}
}

interface VersionEntry {
	displayName: string;
	path: string;
	isLocal: boolean;
	changelog: string[];
	meta: BackupMeta | null;
}

class RestoreConfirmModal extends Modal {
	private preview: RestorePreview;
	private selectedPaths: Set<string>;
	private onConfirm: (selectedPaths: string[]) => Promise<void>;
	private showUnchangedFiles = false;

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

		const warningCount = Object.values(this.preview.fileInfos)
			.reduce((count, info) => count + info.pathWarnings.length, 0);
		if (this.preview.unchangedFiles.length > 0 || warningCount > 0) {
			const summary = [
				this.preview.unchangedFiles.length > 0 ? `${this.preview.unchangedFiles.length} unchanged files hidden by default` : "",
				warningCount > 0 ? `${warningCount} absolute path warning(s)` : "",
			].filter(Boolean).join("; ");
			contentEl.createEl("p", { text: summary });
		}

		if (this.preview.unchangedFiles.length > 0) {
			new Setting(contentEl)
				.setName("Show unchanged files")
				.setDesc("Default view shows only files that differ from this vault or are missing locally.")
				.addToggle((toggle) => {
					toggle.setValue(this.showUnchangedFiles);
					toggle.onChange((value) => {
						this.showUnchangedFiles = value;
						this.onOpen();
					});
				});
		}

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
		const groups = this.showUnchangedFiles ? this.preview.allGroups : this.preview.groups;
		for (const deviceGroup of groups) {
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

		const pluginFileSet = new Set(category.pluginGroups.flatMap((group) => group.files));
		for (const file of category.files.filter((file) => !pluginFileSet.has(file))) {
			this.renderFileToggle(details, file);
		}

		if (category.key === "communityPlugins") {
			for (const pluginGroup of category.pluginGroups) {
				this.renderPluginGroup(details, pluginGroup);
			}
			return;
		}

		for (const file of category.files.filter((file) => pluginFileSet.has(file))) {
			this.renderFileToggle(details, file);
		}
	}

	private renderPluginGroup(containerEl: HTMLElement, pluginGroup: RestorePluginGroup): void {
		const details = containerEl.createEl("details");
		details.open = pluginGroup.pathWarningCount > 0
			|| !!pluginGroup.versionDiff && pluginGroup.versionDiff.status !== "same";
		const selectedCount = pluginGroup.files.filter((file) => this.selectedPaths.has(file)).length;
		const statusParts = [
			`${selectedCount}/${pluginGroup.files.length} files`,
			pluginGroup.versionDiff && pluginGroup.versionDiff.status !== "same"
				? `version ${pluginGroup.versionDiff.status}`
				: "",
			pluginGroup.pathWarningCount > 0 ? `${pluginGroup.pathWarningCount} absolute path warning(s)` : "",
		].filter(Boolean);
		details.createEl("summary", {
			text: `${pluginGroup.name} (${pluginGroup.id}) - ${statusParts.join(", ")}`,
		});

		new Setting(details)
			.setName(`Select ${pluginGroup.name}`)
			.setDesc(`Restore all selected-view files for ${pluginGroup.id}`)
			.addToggle((toggle) => {
				toggle.setValue(pluginGroup.files.every((file) => this.selectedPaths.has(file)));
				toggle.onChange((value) => {
					this.setFilesSelected(pluginGroup.files, value);
					this.onOpen();
				});
			});

		if (pluginGroup.versionDiff && pluginGroup.versionDiff.status !== "same") {
			details.createEl("div", {
				text: `${pluginGroup.id}: backup ${pluginGroup.versionDiff.backupVersion}, local ${pluginGroup.versionDiff.currentVersion}${this.formatStatus(pluginGroup.versionDiff)}`,
			});
		}

		for (const file of pluginGroup.files) {
			this.renderFileToggle(details, file);
		}
	}

	private renderFileToggle(containerEl: HTMLElement, file: string): void {
		const info = this.preview.fileInfos[file];
		const status = info?.status && info.status !== "same" ? ` (${info.status})` : "";
		const warningText = info?.pathWarnings?.length
			? `Absolute paths: ${info.pathWarnings.map((warning) =>
				`${warning.jsonPath} = ${warning.value}${warning.existsOnThisDevice ? "" : " (not found on this device)"}`
			).join("; ")}`
			: "";
		new Setting(containerEl)
			.setName(`${file}${status}${info?.pathWarnings?.length ? " [absolute path]" : ""}`)
			.setDesc(warningText)
			.addToggle((toggle) => {
				toggle.setValue(this.selectedPaths.has(file));
				toggle.onChange((value) => this.setFilesSelected([file], value));
			});
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
	private entries: VersionEntry[];
	private onSelect: (entry: { path: string }) => void;

	constructor(
		app: App,
		entries: VersionEntry[],
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
			const commentStr = entry.meta?.comment ? `\n\nComment:\n${entry.meta.comment}` : "";
			const changelogStr = entry.changelog.length > 0
				? "\n\nChanges:\n" + entry.changelog.slice(0, 12).join("\n") + (entry.changelog.length > 12 ? `\n...and ${entry.changelog.length - 12} more` : "")
				: "";
			new Notice(`Plugin Backup: Selected ${item}${commentStr}${changelogStr}`, 8000);
			this.onSelect(entry);
		}
	}
}

class VersionCompareModal extends Modal {
	private entries: VersionEntry[];
	private fromIndex = 0;
	private toIndex = 1;
	private resultEl: HTMLElement | null = null;

	constructor(app: App, entries: VersionEntry[]) {
		super(app);
		this.entries = entries;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText("Compare Plugin Backup Versions");

		new Setting(contentEl)
			.setName("Base version")
			.setDesc("Files removed here and present in target are shown as added.")
			.addDropdown((dropdown) => {
				this.entries.forEach((entry, index) => dropdown.addOption(String(index), entry.displayName));
				dropdown.setValue(String(this.fromIndex));
				dropdown.onChange((value) => {
					this.fromIndex = parseInt(value);
					this.renderResult();
				});
			});

		new Setting(contentEl)
			.setName("Target version")
			.setDesc("Compare this version against the base version.")
			.addDropdown((dropdown) => {
				this.entries.forEach((entry, index) => dropdown.addOption(String(index), entry.displayName));
				dropdown.setValue(String(this.toIndex));
				dropdown.onChange((value) => {
					this.toIndex = parseInt(value);
					this.renderResult();
				});
			});

		this.resultEl = contentEl.createDiv();
		this.renderResult();
	}

	private renderResult(): void {
		if (!this.resultEl) return;
		this.resultEl.empty();
		const from = this.entries[this.fromIndex];
		const to = this.entries[this.toIndex];
		if (!from || !to) return;
		if (from === to) {
			this.resultEl.createEl("p", { text: "Choose two different versions." });
			return;
		}

		const changes = compareFileHashes(from.meta?.fileHashes || {}, to.meta?.fileHashes || {});
		this.resultEl.createEl("p", {
			text: `${changes.added.length} added, ${changes.modified.length} modified, ${changes.deleted.length} deleted.`,
		});

		if (from.meta?.comment || to.meta?.comment) {
			this.resultEl.createEl("p", {
				text: `Comments: ${from.meta?.comment || "(none)"} -> ${to.meta?.comment || "(none)"}`,
			});
		}

		this.renderChangeGroup("Added", changes.added);
		this.renderChangeGroup("Modified", changes.modified);
		this.renderJsonDiffs(from.path, to.path, changes.modified);
		this.renderChangeGroup("Deleted", changes.deleted);
	}

	private renderChangeGroup(title: string, files: string[]): void {
		if (!this.resultEl || files.length === 0) return;
		const details = this.resultEl.createEl("details");
		details.open = title !== "Deleted";
		details.createEl("summary", { text: `${title} (${files.length})` });
		for (const file of files.slice(0, 200)) {
			details.createEl("div", { text: file });
		}
		if (files.length > 200) {
			details.createEl("div", { text: `...and ${files.length - 200} more` });
		}
	}

	private renderJsonDiffs(fromPath: string, toPath: string, files: string[]): void {
		if (!this.resultEl) return;
		const jsonFiles = files.filter((file) => file.toLowerCase().endsWith(".json"));
		if (jsonFiles.length === 0) return;

		const details = this.resultEl.createEl("details");
		details.open = false;
		details.createEl("summary", { text: `JSON structure changes (${jsonFiles.length})` });
		for (const file of jsonFiles.slice(0, 80)) {
			const fromText = readBackupFileText(fromPath, file);
			const toText = readBackupFileText(toPath, file);
			if (fromText === null || toText === null) {
				details.createEl("div", { text: `${file}: modified JSON file, content unavailable` });
				continue;
			}
			const diff = compareJsonStructure(fromText, toText);
			details.createEl("div", { text: `${file}: ${formatJsonDiff(diff)}` });
		}
		if (jsonFiles.length > 80) {
			details.createEl("div", { text: `...and ${jsonFiles.length - 80} more JSON files` });
		}
	}
}

function readBackupFileText(backupPath: string, relativePath: string): string | null {
	try {
		if (isArchiveBackupPath(backupPath)) return readArchiveText(backupPath, relativePath);
		const filePath = path.join(backupPath, relativePath);
		if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
}

function formatJsonDiff(diff: JsonStructureDiff): string {
	if (diff.parseError) return "modified JSON file, parse failed";
	const parts = [
		diff.addedKeys.length ? `+ keys ${diff.addedKeys.slice(0, 12).join(", ")}` : "",
		diff.removedKeys.length ? `- keys ${diff.removedKeys.slice(0, 12).join(", ")}` : "",
		diff.changedKeys.length ? `~ keys ${diff.changedKeys.slice(0, 12).join(", ")}` : "",
	].filter(Boolean);
	return parts.length ? parts.join("; ") : "JSON changed without top-level key changes";
}
