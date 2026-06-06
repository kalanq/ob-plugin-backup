import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { AddonBackupSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { BACKUP_CATEGORIES, INTERVAL_OPTIONS, RETENTION_OPTIONS } from "./constants";
import { BackupManager } from "./backup";
import { RestoreManager } from "./restore";
import { DiffChecker } from "./diff";
import { BackupScheduler } from "./scheduler";

export class AddonBackupSettingTab extends PluginSettingTab {
	private plugin: App & {
		settings: AddonBackupSettings;
		backupManager: BackupManager;
		restoreManager: RestoreManager;
		diffChecker: DiffChecker;
		scheduler: BackupScheduler;
		saveSettings: () => Promise<void>;
	};
	private settings: AddonBackupSettings;

	constructor(app: App, plugin: any) {
		super(app, plugin);
		this.plugin = plugin as any;
		this.settings = this.plugin.settings;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Plugin Backup Settings" });

		containerEl.createEl("h3", { text: "Backup Paths" });

		new Setting(containerEl)
			.setName("Sync backup path (relative to vault)")
			.setDesc("NAS will sync this folder. Do NOT start with '.'. Default: meta")
			.addText((text) =>
				text
					.setPlaceholder("meta")
					.setValue(this.settings.backupPath)
					.onChange(async (value) => {
						this.settings.backupPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Local safety snapshot path")
			.setDesc("Starts with '.' so NAS skips it. For emergency local recovery only.")
			.addText((text) =>
				text
					.setPlaceholder(".addon-backup-local")
					.setValue(this.settings.localSnapshotPath)
					.onChange(async (value) => {
						this.settings.localSnapshotPath = value;
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
				.setName("Backup interval")
				.setDesc("How often to create automatic backups")
				.addDropdown((dropdown) => {
					for (const opt of INTERVAL_OPTIONS) {
						dropdown.addOption(String(opt.value), opt.label);
					}
					dropdown.setValue(String(this.settings.autoBackupIntervalMinutes));
					dropdown.onChange(async (value) => {
						this.settings.autoBackupIntervalMinutes = parseInt(value);
						await this.plugin.saveSettings();
						this.plugin.scheduler.configure(this.settings);
					});
				});
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

		containerEl.createEl("h3", { text: "History Retention" });

		new Setting(containerEl)
			.setName("Sync history retention")
			.setDesc("Number of versioned snapshots to keep in the sync folder (NAS synced)")
			.addDropdown((dropdown) => {
				for (const opt of RETENTION_OPTIONS) {
					dropdown.addOption(String(opt.value), opt.label);
				}
				dropdown.setValue(String(this.settings.syncHistoryRetentionCount));
				dropdown.onChange(async (value) => {
					this.settings.syncHistoryRetentionCount = parseInt(value);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Local safety retention")
			.setDesc("Number of local snapshots to keep (not synced, for emergency recovery)")
			.addDropdown((dropdown) => {
				for (const opt of RETENTION_OPTIONS) {
					dropdown.addOption(String(opt.value), opt.label);
				}
				dropdown.setValue(String(this.settings.localSnapshotRetentionCount));
				dropdown.onChange(async (value) => {
					this.settings.localSnapshotRetentionCount = parseInt(value);
					await this.plugin.saveSettings();
				});
			});

		containerEl.createEl("h3", { text: "Manual Actions" });

		new Setting(containerEl)
			.setName("Create backup now")
			.setDesc("Backup current config to sync folder + local safety snapshot")
			.addButton((btn) =>
				btn
					.setButtonText("Backup")
					.setClass("mod-cta")
					.onClick(async () => {
						try {
							await this.plugin.backupManager.createBackup();
							new Notice("Plugin Backup: Backup created successfully.");
						} catch (err: any) {
							new Notice(`Plugin Backup: Backup failed - ${err.message}`, 5000);
						}
					})
			);

		new Setting(containerEl)
			.setName("Restore from backup")
			.setDesc("Choose a version from sync history or local snapshots to restore")
			.addButton((btn) =>
				btn
					.setButtonText("Browse Versions")
					.setWarning()
					.onClick(async () => {
						try {
							await this.plugin.restoreManager.restoreFromHistory();
						} catch (err: any) {
							new Notice(`Plugin Backup: Restore failed - ${err.message}`, 5000);
						}
					})
			);

		new Setting(containerEl)
			.setName("Restore latest backup")
			.setDesc("Quick restore from the latest sync backup")
			.addButton((btn) =>
				btn
					.setButtonText("Restore Latest")
					.setWarning()
					.onClick(async () => {
						try {
							await this.plugin.restoreManager.restoreLatest();
						} catch (err: any) {
							new Notice(`Plugin Backup: Restore failed - ${err.message}`, 5000);
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
							new Notice(`Plugin Backup:\n${summary}`, 8000);
						} catch (err: any) {
							new Notice(`Plugin Backup: Check failed - ${err.message}`, 5000);
						}
					})
			);
	}
}