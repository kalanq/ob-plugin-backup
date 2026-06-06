import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { AddonSyncSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { BACKUP_CATEGORIES } from "./constants";
import { BackupManager } from "./backup";
import { RestoreManager } from "./restore";
import { DiffChecker } from "./diff";
import { BackupScheduler } from "./scheduler";

export class AddonSyncSettingTab extends PluginSettingTab {
	private plugin: App & {
		settings: AddonSyncSettings;
		backupManager: BackupManager;
		restoreManager: RestoreManager;
		diffChecker: DiffChecker;
		scheduler: BackupScheduler;
		saveSettings: () => Promise<void>;
	};
	private settings: AddonSyncSettings;

	constructor(
		app: App,
		plugin: any,
	) {
		super(app, plugin);
		this.plugin = plugin as any;
		this.settings = this.plugin.settings;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Addon Sync Settings" });

		new Setting(containerEl)
			.setName("Backup directory path")
			.setDesc("Relative to vault root. Do NOT start with '.' as those are excluded from NAS sync. Default: meta")
			.addText((text) =>
				text
					.setPlaceholder("meta")
					.setValue(this.settings.backupPath)
					.onChange(async (value) => {
						this.settings.backupPath = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Backup Scope" });

		for (const cat of BACKUP_CATEGORIES) {
			new Setting(containerEl)
				.setName(cat.label)
				.setDesc(cat.description)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings[cat.key] as boolean)
						.onChange(async (value) => {
							(this.settings as any)[cat.key] = value;
							await this.plugin.saveSettings();
						})
				);
		}

		containerEl.createEl("h3", { text: "Automatic Backup" });

		new Setting(containerEl)
			.setName("Enable auto backup")
			.setDesc("Automatically create backups at regular intervals")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.autoBackupEnabled)
					.onChange(async (value) => {
						this.settings.autoBackupEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.scheduler.configure(this.settings);
						this.display();
					})
			);

		if (this.settings.autoBackupEnabled) {
			new Setting(containerEl)
				.setName("Backup interval (minutes)")
				.setDesc("How often to create automatic backups")
				.addSlider((slider) =>
					slider
						.setLimits(5, 240, 5)
						.setValue(this.settings.autoBackupIntervalMinutes)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.settings.autoBackupIntervalMinutes = value;
							await this.plugin.saveSettings();
							this.plugin.scheduler.configure(this.settings);
						})
				);
		}

		containerEl.createEl("h3", { text: "Startup Behavior" });

		new Setting(containerEl)
			.setName("Auto backup on startup")
			.setDesc("Create a backup when Obsidian starts")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.autoBackupOnStartup)
					.onChange(async (value) => {
						this.settings.autoBackupOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Check for changes on startup")
			.setDesc("Compare current config with backup and notify if there are differences")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.checkChangesOnStartup)
					.onChange(async (value) => {
						this.settings.checkChangesOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "History" });

		new Setting(containerEl)
			.setName("History retention count")
			.setDesc("Maximum number of history snapshots to keep")
			.addSlider((slider) =>
				slider
					.setLimits(1, 50, 1)
					.setValue(this.settings.historyRetentionCount)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.settings.historyRetentionCount = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Manual Actions" });

		new Setting(containerEl)
			.setName("Create backup now")
			.setDesc("Manually create a backup of current settings")
			.addButton((btn) =>
				btn
					.setButtonText("Backup")
					.setClass("mod-cta")
					.onClick(async () => {
						try {
							await this.plugin.backupManager.createBackup();
							new Notice("Addon Sync: Backup created successfully.");
						} catch (err: any) {
							new Notice(`Addon Sync: Backup failed - ${err.message}`, 5000);
						}
					})
			);

		new Setting(containerEl)
			.setName("Restore latest backup")
			.setDesc("Restore settings from the latest backup")
			.addButton((btn) =>
				btn
					.setButtonText("Restore")
					.setWarning()
					.onClick(async () => {
						try {
							await this.plugin.restoreManager.restoreLatest();
						} catch (err: any) {
							new Notice(`Addon Sync: Restore failed - ${err.message}`, 5000);
						}
					})
			);

		new Setting(containerEl)
			.setName("Restore from history")
			.setDesc("Choose a history snapshot to restore")
			.addButton((btn) =>
				btn
					.setButtonText("Browse History")
					.setWarning()
					.onClick(async () => {
						try {
							await this.plugin.restoreManager.restoreFromHistory();
						} catch (err: any) {
							new Notice(`Addon Sync: Restore failed - ${err.message}`, 5000);
						}
					})
			);

		new Setting(containerEl)
			.setName("Check for changes")
			.setDesc("Compare current config with latest backup")
			.addButton((btn) =>
				btn
					.setButtonText("Check")
					.onClick(async () => {
						try {
							const summary = await this.plugin.diffChecker.getChangeSummary();
							new Notice(`Addon Sync:\n${summary}`, 8000);
						} catch (err: any) {
							new Notice(`Addon Sync: Check failed - ${err.message}`, 5000);
						}
					})
			);
	}
}
