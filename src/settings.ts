import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { AddonBackupSettings, SupportedLanguage } from "./types";
import { BACKUP_CATEGORIES, INTERVAL_OPTIONS, RETENTION_OPTIONS } from "./constants";
import { BackupManager } from "./backup";
import { RestoreManager } from "./restore";
import { DiffChecker } from "./diff";
import { BackupScheduler } from "./scheduler";
import { getConfigPath } from "./path_utils";
import { getInstalledCommunityPlugins } from "./file_utils";
import { createDeviceId } from "./device_utils";

type TranslationKey =
	| "title"
	| "language"
	| "languageDesc"
	| "backupPaths"
	| "currentDeviceName"
	| "currentDeviceNameDesc"
	| "syncBackupPath"
	| "syncBackupPathDesc"
	| "localSnapshotPath"
	| "localSnapshotPathDesc"
	| "backupScope"
	| "communityPluginSelection"
	| "communityPluginSyncMode"
	| "communityPluginSyncModeDesc"
	| "allCommunityPlugins"
	| "onlySelectedPlugins"
	| "detectedPlugins"
	| "detectedPluginsDesc"
	| "selectAllPlugins"
	| "selectAllPluginsDesc"
	| "enabled"
	| "disabled"
	| "version"
	| "advancedOptions"
	| "includeOwnData"
	| "includeOwnDataDesc"
	| "automaticBackup"
	| "enableAutoBackup"
	| "enableAutoBackupDesc"
	| "backupInterval"
	| "backupIntervalDesc"
	| "startupBehavior"
	| "autoBackupOnStartup"
	| "autoBackupOnStartupDesc"
	| "checkChangesOnStartup"
	| "checkChangesOnStartupDesc"
	| "historyRetention"
	| "syncHistoryRetention"
	| "syncHistoryRetentionDesc"
	| "localSafetyRetention"
	| "localSafetyRetentionDesc"
	| "manualActions"
	| "createBackupNow"
	| "createBackupNowDesc"
	| "backup"
	| "restoreFromBackup"
	| "restoreFromBackupDesc"
	| "browseVersions"
	| "restoreLatestBackup"
	| "restoreLatestBackupDesc"
	| "restoreLatest"
	| "checkForChanges"
	| "checkForChangesDesc"
	| "check"
	| "windowsInstaller"
	| "windowsInstallerDesc"
	| "windowsOnly"
	| "backupSuccess"
	| "backupFailed"
	| "restoreFailed"
	| "checkFailed";

const TRANSLATIONS: Record<SupportedLanguage, Record<TranslationKey, string>> = {
	en: {
		title: "Plugin Backup Settings",
		language: "Language",
		languageDesc: "Switch the settings page between English and Chinese.",
		backupPaths: "Backup Paths",
		currentDeviceName: "Current device name",
		currentDeviceNameDesc: "Used to label backups from this computer. You can rename it for easier restore filtering.",
		syncBackupPath: "Sync backup path (relative to vault)",
		syncBackupPathDesc: "NAS will sync this folder. Do not start with '.'. Default: meta",
		localSnapshotPath: "Local safety snapshot path",
		localSnapshotPathDesc: "Starts with '.' so NAS skips it. For emergency local recovery only.",
		backupScope: "Backup Scope",
		communityPluginSelection: "Community Plugin Selection",
		communityPluginSyncMode: "Community plugin sync mode",
		communityPluginSyncModeDesc: "All plugins keeps the current behavior. Selected plugins limits plugin folders in the backup.",
		allCommunityPlugins: "All community plugins",
		onlySelectedPlugins: "Only selected plugins",
		detectedPlugins: "Detected plugins",
		detectedPluginsDesc: "{count} community plugins will be included.",
		selectAllPlugins: "Select all plugins",
		selectAllPluginsDesc: "Use this after installing new plugins if you want them included.",
		enabled: "Enabled",
		disabled: "Disabled",
		version: "version",
		advancedOptions: "Advanced Options",
		includeOwnData: "Include Plugin Backup settings data",
		includeOwnDataDesc: "Default off. When off, plugins/ob-plugin-backup/data.json is excluded so synced backups do not overwrite this device's paths, device name, and first-run state.",
		automaticBackup: "Automatic Backup",
		enableAutoBackup: "Enable auto backup",
		enableAutoBackupDesc: "Automatically create backups at regular intervals",
		backupInterval: "Backup interval",
		backupIntervalDesc: "How often to create automatic backups",
		startupBehavior: "Startup Behavior",
		autoBackupOnStartup: "Auto backup on startup",
		autoBackupOnStartupDesc: "Create a backup when Obsidian starts",
		checkChangesOnStartup: "Check for changes on startup",
		checkChangesOnStartupDesc: "Compare current config with backup and notify if there are differences",
		historyRetention: "History Retention",
		syncHistoryRetention: "Sync history retention",
		syncHistoryRetentionDesc: "Number of versioned snapshots to keep in the sync folder (NAS synced)",
		localSafetyRetention: "Local safety retention",
		localSafetyRetentionDesc: "Number of local snapshots to keep (not synced, for emergency recovery)",
		manualActions: "Manual Actions",
		createBackupNow: "Create backup now",
		createBackupNowDesc: "Backup current config to sync folder + local safety snapshot",
		backup: "Backup",
		restoreFromBackup: "Restore from backup",
		restoreFromBackupDesc: "Choose a version from sync history or local snapshots to restore",
		browseVersions: "Browse Versions",
		restoreLatestBackup: "Restore latest backup",
		restoreLatestBackupDesc: "Quick restore from the latest sync backup",
		restoreLatest: "Restore Latest",
		checkForChanges: "Check for changes",
		checkForChangesDesc: "Compare current config with latest backup",
		check: "Check",
		windowsInstaller: "Windows-only installer",
		windowsInstallerDesc: "The release package includes install-plugin.cmd and install-plugin.ps1 for Windows double-click installation on another computer.",
		windowsOnly: "Windows only",
		backupSuccess: "Plugin Backup: Backup created successfully.",
		backupFailed: "Plugin Backup: Backup failed",
		restoreFailed: "Plugin Backup: Restore failed",
		checkFailed: "Plugin Backup: Check failed",
	},
	zh: {
		title: "Plugin Backup 设置",
		language: "界面语言",
		languageDesc: "在英文和中文之间切换插件设置页面。",
		backupPaths: "备份路径",
		currentDeviceName: "当前设备名称",
		currentDeviceNameDesc: "用于标记这台电脑创建的备份。可以改成更容易识别的名字。",
		syncBackupPath: "同步备份路径（相对仓库根目录）",
		syncBackupPathDesc: "NAS 会同步这个文件夹。不要以 '.' 开头。默认：meta",
		localSnapshotPath: "本地安全快照路径",
		localSnapshotPathDesc: "建议以 '.' 开头，让 NAS 跳过，仅用于本地紧急恢复。",
		backupScope: "备份范围",
		communityPluginSelection: "社区插件选择",
		communityPluginSyncMode: "社区插件同步模式",
		communityPluginSyncModeDesc: "全部插件保持现有行为；仅选中插件会限制备份中的插件文件夹。",
		allCommunityPlugins: "全部社区插件",
		onlySelectedPlugins: "仅选中的插件",
		detectedPlugins: "检测到的插件",
		detectedPluginsDesc: "将包含 {count} 个社区插件。",
		selectAllPlugins: "选择全部插件",
		selectAllPluginsDesc: "安装新插件后，如果希望纳入备份，可以点击此按钮。",
		enabled: "已启用",
		disabled: "未启用",
		version: "版本",
		advancedOptions: "高级选项",
		includeOwnData: "包含 Plugin Backup 自身设置数据",
		includeOwnDataDesc: "默认关闭。关闭时会排除 plugins/ob-plugin-backup/data.json，避免同步备份覆盖本机路径、设备名和首次设置状态。",
		automaticBackup: "自动备份",
		enableAutoBackup: "启用自动备份",
		enableAutoBackupDesc: "按固定时间间隔自动创建备份。",
		backupInterval: "备份间隔",
		backupIntervalDesc: "自动备份的执行频率。",
		startupBehavior: "启动行为",
		autoBackupOnStartup: "启动时自动备份",
		autoBackupOnStartupDesc: "Obsidian 启动时创建一次备份。",
		checkChangesOnStartup: "启动时检查变更",
		checkChangesOnStartupDesc: "启动时比较当前配置和备份，如有差异则提示。",
		historyRetention: "历史保留",
		syncHistoryRetention: "同步历史保留数量",
		syncHistoryRetentionDesc: "同步目录中保留的历史快照数量（会被 NAS 同步）。",
		localSafetyRetention: "本地安全快照保留数量",
		localSafetyRetentionDesc: "本地快照保留数量（不会同步，用于紧急恢复）。",
		manualActions: "手动操作",
		createBackupNow: "立即创建备份",
		createBackupNowDesc: "将当前配置备份到同步目录，并创建本地安全快照。",
		backup: "备份",
		restoreFromBackup: "从备份恢复",
		restoreFromBackupDesc: "从同步历史或本地快照中选择一个版本恢复。",
		browseVersions: "浏览版本",
		restoreLatestBackup: "恢复最新备份",
		restoreLatestBackupDesc: "从最新同步备份快速恢复。",
		restoreLatest: "恢复最新",
		checkForChanges: "检查变更",
		checkForChangesDesc: "比较当前配置和最新备份。",
		check: "检查",
		windowsInstaller: "仅 Windows 安装器",
		windowsInstallerDesc: "发布包包含 install-plugin.cmd 和 install-plugin.ps1，可在 Windows 上双击安装到另一台电脑。",
		windowsOnly: "仅 Windows",
		backupSuccess: "Plugin Backup：备份创建成功。",
		backupFailed: "Plugin Backup：备份失败",
		restoreFailed: "Plugin Backup：恢复失败",
		checkFailed: "Plugin Backup：检查失败",
	},
};

const CATEGORY_TRANSLATIONS: Record<SupportedLanguage, Record<string, { label: string; description: string }>> = {
	en: {
		backupAppearance: { label: "Appearance & Theme", description: "appearance.json, themes/, snippets/" },
		backupHotkeys: { label: "Custom Hotkeys", description: "hotkeys.json" },
		backupCorePlugins: { label: "Core Plugins", description: "core-plugins.json" },
		backupCommunityPlugins: { label: "Community Plugins", description: "community-plugins.json, all plugin files" },
		backupAppSettings: { label: "App Settings", description: "app.json (editor, links, files)" },
		backupBookmarks: { label: "Bookmarks", description: "bookmarks.json" },
		backupGraph: { label: "Graph Settings", description: "graph.json" },
	},
	zh: {
		backupAppearance: { label: "外观与主题", description: "appearance.json、themes/、snippets/" },
		backupHotkeys: { label: "自定义快捷键", description: "hotkeys.json" },
		backupCorePlugins: { label: "核心插件", description: "core-plugins.json" },
		backupCommunityPlugins: { label: "社区插件", description: "community-plugins.json 和插件文件" },
		backupAppSettings: { label: "应用设置", description: "app.json（编辑器、链接、文件等）" },
		backupBookmarks: { label: "书签", description: "bookmarks.json" },
		backupGraph: { label: "图谱设置", description: "graph.json" },
	},
};

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

		containerEl.createEl("h2", { text: this.t("title") });
		this.renderLanguageSwitcher(containerEl);

		this.renderSection(containerEl, this.t("backupPaths"), (sectionEl) => {
			this.renderBackupPaths(sectionEl);
		}, true);

		this.renderSection(containerEl, this.t("backupScope"), (sectionEl) => {
			this.renderBackupScope(sectionEl);
		}, true);

		if (this.settings.backupCommunityPlugins) {
			this.renderSection(containerEl, this.t("communityPluginSelection"), (sectionEl) => {
				this.renderCommunityPluginSelection(sectionEl);
			}, false);
		}

		this.renderSection(containerEl, this.t("advancedOptions"), (sectionEl) => {
			this.renderAdvancedOptions(sectionEl);
		}, false);

		this.renderSection(containerEl, this.t("automaticBackup"), (sectionEl) => {
			this.renderAutomaticBackup(sectionEl);
		}, false);

		this.renderSection(containerEl, this.t("startupBehavior"), (sectionEl) => {
			this.renderStartupBehavior(sectionEl);
		}, false);

		this.renderSection(containerEl, this.t("historyRetention"), (sectionEl) => {
			this.renderHistoryRetention(sectionEl);
		}, false);

		this.renderSection(containerEl, this.t("manualActions"), (sectionEl) => {
			this.renderManualActions(sectionEl);
		}, true);
	}

	private get language(): SupportedLanguage {
		return this.settings.language || "en";
	}

	private t(key: TranslationKey): string {
		return TRANSLATIONS[this.language][key];
	}

	private renderLanguageSwitcher(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(this.t("language"))
			.setDesc(this.t("languageDesc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("en", "English")
					.addOption("zh", "中文")
					.setValue(this.language)
					.onChange(async (value) => {
						this.settings.language = value as SupportedLanguage;
						await this.plugin.saveSettings();
						this.display();
					});
			});
	}

	private renderSection(
		containerEl: HTMLElement,
		title: string,
		render: (sectionEl: HTMLElement) => void,
		open: boolean,
	): void {
		const details = containerEl.createEl("details");
		details.open = open;
		details.createEl("summary", { text: title });
		render(details);
	}

	private renderBackupPaths(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(this.t("currentDeviceName"))
			.setDesc(this.t("currentDeviceNameDesc"))
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
			.setName(this.t("syncBackupPath"))
			.setDesc(this.t("syncBackupPathDesc"))
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
			.setName(this.t("localSnapshotPath"))
			.setDesc(this.t("localSnapshotPathDesc"))
			.addText((text) =>
				text
					.setPlaceholder(".ob-plugin-backup-local")
					.setValue(this.settings.localSnapshotPath)
					.onChange(async (value) => {
						this.settings.localSnapshotPath = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private renderBackupScope(containerEl: HTMLElement): void {
		for (const cat of BACKUP_CATEGORIES) {
			const translated = CATEGORY_TRANSLATIONS[this.language][cat.key as string];
			new Setting(containerEl)
				.setName(translated?.label || cat.label)
				.setDesc(translated?.description || cat.description)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings[cat.key] as boolean)
						.onChange(async (value) => {
							(this.settings as any)[cat.key] = value;
							await this.plugin.saveSettings();
							if (cat.key === "backupCommunityPlugins") {
								this.display();
							}
						})
				);
		}
	}

	private renderAdvancedOptions(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(this.t("includeOwnData"))
			.setDesc(this.t("includeOwnDataDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.backupOwnPluginData)
					.onChange(async (value) => {
						this.settings.backupOwnPluginData = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private renderAutomaticBackup(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(this.t("enableAutoBackup"))
			.setDesc(this.t("enableAutoBackupDesc"))
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
				.setName(this.t("backupInterval"))
				.setDesc(this.t("backupIntervalDesc"))
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
	}

	private renderStartupBehavior(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(this.t("autoBackupOnStartup"))
			.setDesc(this.t("autoBackupOnStartupDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.autoBackupOnStartup)
					.onChange(async (value) => {
						this.settings.autoBackupOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(this.t("checkChangesOnStartup"))
			.setDesc(this.t("checkChangesOnStartupDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.checkChangesOnStartup)
					.onChange(async (value) => {
						this.settings.checkChangesOnStartup = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private renderHistoryRetention(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(this.t("syncHistoryRetention"))
			.setDesc(this.t("syncHistoryRetentionDesc"))
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
			.setName(this.t("localSafetyRetention"))
			.setDesc(this.t("localSafetyRetentionDesc"))
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
	}

	private renderManualActions(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(this.t("createBackupNow"))
			.setDesc(this.t("createBackupNowDesc"))
			.addButton((btn) =>
				btn
					.setButtonText(this.t("backup"))
					.setClass("mod-cta")
					.onClick(async () => {
						try {
							await this.plugin.createBackup();
							new Notice(this.t("backupSuccess"));
						} catch (err: any) {
							new Notice(`${this.t("backupFailed")} - ${err.message}`, 5000);
						}
					})
			);

		new Setting(containerEl)
			.setName(this.t("restoreFromBackup"))
			.setDesc(this.t("restoreFromBackupDesc"))
			.addButton((btn) =>
				btn
					.setButtonText(this.t("browseVersions"))
					.setWarning()
					.onClick(async () => {
						try {
							await this.plugin.restoreManager.restoreFromHistory();
						} catch (err: any) {
							new Notice(`${this.t("restoreFailed")} - ${err.message}`, 5000);
						}
					})
			);

		new Setting(containerEl)
			.setName(this.t("restoreLatestBackup"))
			.setDesc(this.t("restoreLatestBackupDesc"))
			.addButton((btn) =>
				btn
					.setButtonText(this.t("restoreLatest"))
					.setWarning()
					.onClick(async () => {
						try {
							await this.plugin.restoreManager.restoreLatest();
						} catch (err: any) {
							new Notice(`${this.t("restoreFailed")} - ${err.message}`, 5000);
						}
					})
			);

		new Setting(containerEl)
			.setName(this.t("checkForChanges"))
			.setDesc(this.t("checkForChangesDesc"))
			.addButton((btn) =>
				btn
					.setButtonText(this.t("check"))
					.onClick(async () => {
						try {
							const summary = await this.plugin.diffChecker.getChangeSummary();
							new Notice(`Plugin Backup:\n${summary}`, 8000);
						} catch (err: any) {
							new Notice(`${this.t("checkFailed")} - ${err.message}`, 5000);
						}
					})
			);

		new Setting(containerEl)
			.setName(this.t("windowsInstaller"))
			.setDesc(this.t("windowsInstallerDesc"))
			.addButton((btn) =>
				btn
					.setButtonText(this.t("windowsOnly"))
					.setDisabled(true)
			);
	}

	private renderCommunityPluginSelection(containerEl: HTMLElement): void {
		const installedPlugins = getInstalledCommunityPlugins(getConfigPath(this.app));
		const selected = new Set(this.settings.selectedCommunityPluginIds);

		new Setting(containerEl)
			.setName(this.t("communityPluginSyncMode"))
			.setDesc(this.t("communityPluginSyncModeDesc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("all", this.t("allCommunityPlugins"))
					.addOption("selected", this.t("onlySelectedPlugins"))
					.setValue(this.settings.communityPluginSelectionMode)
					.onChange(async (value) => {
						const mode = value as "all" | "selected";
						this.settings.communityPluginSelectionMode = mode;
						if (mode === "selected" && this.settings.selectedCommunityPluginIds.length === 0) {
							this.settings.selectedCommunityPluginIds = installedPlugins.map((plugin) => plugin.id);
						}
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.settings.communityPluginSelectionMode !== "selected") {
			new Setting(containerEl)
				.setName(this.t("detectedPlugins"))
				.setDesc(this.t("detectedPluginsDesc").replace("{count}", String(installedPlugins.length)));
			return;
		}

		new Setting(containerEl)
			.setName(this.t("selectAllPlugins"))
			.setDesc(this.t("selectAllPluginsDesc"))
			.addButton((button) =>
				button
					.setButtonText(this.t("selectAllPlugins"))
					.onClick(async () => {
						this.settings.selectedCommunityPluginIds = installedPlugins.map((plugin) => plugin.id);
						await this.plugin.saveSettings();
						this.display();
					})
			);

		for (const plugin of installedPlugins) {
			new Setting(containerEl)
				.setName(`${plugin.name} (${plugin.id})`)
				.setDesc(`${plugin.enabled ? this.t("enabled") : this.t("disabled")} - ${this.t("version")} ${plugin.version}`)
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
