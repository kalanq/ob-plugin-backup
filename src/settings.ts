import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { AddonBackupSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { BACKUP_CATEGORIES, INTERVAL_OPTIONS, RETENTION_OPTIONS } from "./constants";
import { BackupManager } from "./backup";
import { RestoreManager } from "./restore";
import { DiffChecker } from "./diff";
import { BackupScheduler } from "./scheduler";
import { getConfigPath } from "./path_utils";
import { getInstalledCommunityPlugins } from "./file_utils";
import { createDeviceId } from "./device_utils";

export class AddonBackupSettingTab extends PluginSettingTab {
	private plugin: App & {
		settings: AddonBackupSettings;
		backupManager: BackupManager;
		restoreManager: RestoreManager;
		diffChecker: DiffChecker;
		scheduler: BackupScheduler;
		createBackup: () => Promise<void>;
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
			.setName("Current device name")
			.setDesc("Used to label backups from this computer. You can rename it for easier restore filtering.")
			.addText((text) =>
				text
					.setPlaceholder("This device")
					.setValue(this.settings.deviceName)
					.onChange(async (value) => {
						this.settings.deviceName = value.trim() || "This device";
						this.settings.deviceId = createDeviceId(this.settings.deviceName);
						await this.plugin.saveSettings();
					})
			);

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
					.setPlaceholder(".ob-plugin-backup-local")
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

		this.renderCommunityPluginSelection(containerEl);

		this.renderAdvancedOptions(containerEl);

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
							await this.plugin.createBackup();
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

		new Setting(containerEl)
			.setName("Windows-only installer")
			.setDesc("The release package includes install-plugin.cmd and install-plugin.ps1 for Windows double-click installation on another computer.")
			.addButton((btn) =>
				btn
					.setButtonText("Windows only")
					.setDisabled(true)
			);
	}

	private renderAdvancedOptions(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "Advanced Options" });

		new Setting(containerEl)
			.setName("Include Plugin Backup settings data")
			.setDesc("Default off. When off, plugins/ob-plugin-backup/data.json is excluded so synced backups do not overwrite this device's paths, device name, and first-run state.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.backupOwnPluginData)
					.onChange(async (value) => {
						this.settings.backupOwnPluginData = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private renderCommunityPluginSelection(containerEl: HTMLElement): void {
		if (!this.settings.backupCommunityPlugins) return;

		const installedPlugins = getInstalledCommunityPlugins(getConfigPath(this.app));
		const selected = new Set(this.settings.selectedCommunityPluginIds);

		containerEl.createEl("h3", { text: "Community Plugin Selection" });

		new Setting(containerEl)
			.setName("Community plugin sync mode")
			.setDesc("All plugins keeps the current behavior. Selected plugins limits plugin folders in the backup.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("all", "All community plugins")
					.addOption("selected", "Only selected plugins")
					.setValue(this.settings.communityPluginSelectionMode)
					.onChange(async (value: "all" | "selected") => {
						this.settings.communityPluginSelectionMode = value;
						if (value === "selected" && this.settings.selectedCommunityPluginIds.length === 0) {
							this.settings.selectedCommunityPluginIds = installedPlugins.map((plugin) => plugin.id);
						}
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.settings.communityPluginSelectionMode !== "selected") {
			new Setting(containerEl)
				.setName("Detected plugins")
				.setDesc(`${installedPlugins.length} community plugins will be included.`);
			return;
		}

		new Setting(containerEl)
			.setName("Select all plugins")
			.setDesc("Use this after installing new plugins if you want them included.")
			.addButton((button) =>
				button
					.setButtonText("Select All")
					.onClick(async () => {
						this.settings.selectedCommunityPluginIds = installedPlugins.map((plugin) => plugin.id);
						await this.plugin.saveSettings();
						this.display();
					})
			);

		for (const plugin of installedPlugins) {
			new Setting(containerEl)
				.setName(`${plugin.name} (${plugin.id})`)
				.setDesc(`${plugin.enabled ? "Enabled" : "Disabled"} · version ${plugin.version}`)
				.addToggle((toggle) =>
					toggle
						.setValue(selected.has(plugin.id))
						.onChange(async (value) => {
							if (value) selected.add(plugin.id);
							else selected.delete(plugin.id);
							this.settings.selectedCommunityPluginIds = Array.from(selected).sort();
							await this.plugin.saveSettings();
						})
				);
		}
	}
}
