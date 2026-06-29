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
import { BackupProgressModal, promptForBackupComment } from "./operation_ui";
import type { BackupRunOptions } from "./types";

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
	| "backupFormat"
	| "backupFormatDesc"
	| "archiveFormat"
	| "directoryFormat"
	| "backupScope"
	| "communityPluginSelection"
	| "communityPluginSyncMode"
	| "communityPluginSyncModeDesc"
	| "allCommunityPlugins"
	| "onlySelectedPlugins"
	| "communityPluginDataMode"
	| "communityPluginDataModeDesc"
	| "allPluginData"
	| "noPluginData"
	| "selectedPluginData"
	| "doNotSyncPlugin"
	| "syncPluginFilesOnly"
	| "syncPluginFilesAndData"
	| "detectedPlugins"
	| "detectedPluginsDesc"
	| "selectAllPlugins"
	| "selectAllPluginsDesc"
	| "enabled"
	| "disabled"
	| "version"
	| "advancedOptions"
	| "syncOwnSettings"
	| "syncOwnSettingsDesc"
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
	| "createLocalSnapshotNow"
	| "createLocalSnapshotNowDesc"
	| "localSnapshot"
	| "restoreFromBackup"
	| "restoreFromBackupDesc"
	| "browseVersions"
	| "restoreLatestBackup"
	| "restoreLatestBackupDesc"
	| "restoreLatest"
	| "compareVersions"
	| "compareVersionsDesc"
	| "compare"
	| "checkForChanges"
	| "checkForChangesDesc"
	| "check"
	| "windowsInstaller"
	| "windowsInstallerDesc"
	| "windowsOnly"
	| "backupSuccess"
	| "localSnapshotSuccess"
	| "backupFailed"
	| "localSnapshotFailed"
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
		backupFormat: "Backup file format",
		backupFormatDesc: "Archive mode stores each snapshot as a zip so Obsidian and other plugins see fewer files. Directory mode keeps the legacy loose-file layout.",
		archiveFormat: "Archive zip files",
		directoryFormat: "Legacy directory files",
		backupScope: "Backup Scope",
		communityPluginSelection: "Community Plugin Selection",
		communityPluginSyncMode: "Community plugin sync mode",
		communityPluginSyncModeDesc: "All plugins keeps the current behavior. Selected plugins limits plugin folders in the backup.",
		allCommunityPlugins: "All community plugins",
		onlySelectedPlugins: "Only selected plugins",
		communityPluginDataMode: "Plugin data sync mode",
		communityPluginDataModeDesc: "Controls data.json files separately from plugin code and manifest files.",
		allPluginData: "Sync all plugin data",
		noPluginData: "Do not sync plugin data",
		selectedPluginData: "Choose per plugin",
		doNotSyncPlugin: "Do not sync this plugin",
		syncPluginFilesOnly: "Sync plugin files only",
		syncPluginFilesAndData: "Sync plugin files and data",
		detectedPlugins: "Detected plugins",
		detectedPluginsDesc: "{count} community plugins will be included.",
		selectAllPlugins: "Select all plugins",
		selectAllPluginsDesc: "Use this after installing new plugins if you want them included.",
		enabled: "Enabled",
		disabled: "Disabled",
		version: "version",
		advancedOptions: "Advanced Options",
		syncOwnSettings: "Sync Plugin Backup settings",
		syncOwnSettingsDesc: "Default on. Syncs safe Plugin Backup options through synced-settings.json without overwriting device name, local paths, first-run state, history, or sync records.",
		includeOwnData: "Include raw Plugin Backup data.json",
		includeOwnDataDesc: "Advanced and off by default. When off, plugins/ob-plugin-backup/data.json is excluded so synced backups do not overwrite this device's local state.",
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
		syncHistoryRetentionDesc: "Number of versioned snapshots to keep in the sync folder. Each device prunes shared sync history after it writes a backup, so multi-device sync is effectively limited by the smallest value used on any device.",
		localSafetyRetention: "Local safety retention",
		localSafetyRetentionDesc: "Number of local snapshots to keep (not synced, for emergency recovery)",
		manualActions: "Manual Actions",
		createBackupNow: "Create backup now",
		createBackupNowDesc: "Write current config to the sync folder and also create a local safety snapshot.",
		backup: "Backup",
		createLocalSnapshotNow: "Create local snapshot now",
		createLocalSnapshotNowDesc: "Create a local safety snapshot only. This does not update latest backup, sync history, or NAS-visible files.",
		localSnapshot: "Local Snapshot",
		restoreFromBackup: "Restore from backup",
		restoreFromBackupDesc: "Choose a version from sync history or local snapshots to restore",
		browseVersions: "Browse Versions",
		restoreLatestBackup: "Restore latest backup",
		restoreLatestBackupDesc: "Quick restore from the latest sync backup",
		restoreLatest: "Restore Latest",
		compareVersions: "Compare backup versions",
		compareVersionsDesc: "Compare two backup or local snapshot versions by saved file hashes.",
		compare: "Compare",
		checkForChanges: "Check for changes",
		checkForChangesDesc: "Compare current config with latest backup",
		check: "Check",
		windowsInstaller: "Windows-only installer",
		windowsInstallerDesc: "The release package includes install-plugin.cmd and install-plugin.ps1 for Windows double-click installation on another computer.",
		windowsOnly: "Windows only",
		backupSuccess: "Plugin Backup: Backup created successfully.",
		localSnapshotSuccess: "Plugin Backup: Local snapshot created.",
		backupFailed: "Plugin Backup: Backup failed",
		localSnapshotFailed: "Plugin Backup: Local snapshot failed",
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
		backupFormat: "备份文件格式",
		backupFormatDesc: "压缩包模式会把每个快照保存为 zip，减少 Obsidian 和其他插件能看到的文件数量。目录模式保留旧版散文件结构。",
		archiveFormat: "压缩包 zip 文件",
		directoryFormat: "旧版目录散文件",
		backupScope: "备份范围",
		communityPluginSelection: "社区插件选择",
		communityPluginSyncMode: "社区插件同步模式",
		communityPluginSyncModeDesc: "全部插件保持现有行为；仅选中插件会限制备份中的插件文件夹。",
		allCommunityPlugins: "全部社区插件",
		onlySelectedPlugins: "仅选中的插件",
		communityPluginDataMode: "插件数据同步模式",
		communityPluginDataModeDesc: "将 data.json 插件数据与插件本体、manifest 文件分开控制。",
		allPluginData: "同步全部插件数据",
		noPluginData: "不同步插件数据",
		selectedPluginData: "按插件选择",
		doNotSyncPlugin: "不同步此插件",
		syncPluginFilesOnly: "只同步插件本体和版本",
		syncPluginFilesAndData: "同步插件本体和数据",
		detectedPlugins: "检测到的插件",
		detectedPluginsDesc: "将包含 {count} 个社区插件。",
		selectAllPlugins: "选择全部插件",
		selectAllPluginsDesc: "安装新插件后，如果希望纳入备份，可以点击此按钮。",
		enabled: "已启用",
		disabled: "未启用",
		version: "版本",
		advancedOptions: "高级选项",
		syncOwnSettings: "同步 Plugin Backup 设置",
		syncOwnSettingsDesc: "默认开启。通过 synced-settings.json 同步安全的插件设置项，不覆盖设备名、本地路径、首次设置状态、历史记录或同步记录。",
		includeOwnData: "包含原始 Plugin Backup data.json",
		includeOwnDataDesc: "高级选项，默认关闭。关闭时会排除 plugins/ob-plugin-backup/data.json，避免同步备份覆盖本机本地状态。",
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
		syncHistoryRetentionDesc: "同步目录中保留的历史快照数量。每台设备写入同步备份后都会清理共享同步历史；多端同步时，实际可保留数量会受到所有设备中最小设置值限制。",
		localSafetyRetention: "本地安全快照保留数量",
		localSafetyRetentionDesc: "本地快照保留数量（不会同步，用于紧急恢复）。",
		manualActions: "手动操作",
		createBackupNow: "立即创建备份",
		createBackupNowDesc: "将当前配置写入同步目录，并同时创建本地安全快照。",
		backup: "备份",
		createLocalSnapshotNow: "立即创建本地快照",
		createLocalSnapshotNowDesc: "只创建本地安全快照，不更新最新同步备份、同步历史或 NAS 可见文件。",
		localSnapshot: "本地快照",
		restoreFromBackup: "从备份恢复",
		restoreFromBackupDesc: "从同步历史或本地快照中选择一个版本恢复。",
		browseVersions: "浏览版本",
		restoreLatestBackup: "恢复最新备份",
		restoreLatestBackupDesc: "从最新同步备份快速恢复。",
		restoreLatest: "恢复最新",
		compareVersions: "比较备份版本",
		compareVersionsDesc: "通过保存的文件哈希比较两个同步备份或本地快照版本。",
		compare: "比较",
		checkForChanges: "检查变更",
		checkForChangesDesc: "比较当前配置和最新备份。",
		check: "检查",
		windowsInstaller: "仅 Windows 安装器",
		windowsInstallerDesc: "发布包包含 install-plugin.cmd 和 install-plugin.ps1，可在 Windows 上双击安装到另一台电脑。",
		windowsOnly: "仅 Windows",
		backupSuccess: "Plugin Backup：备份创建成功。",
		localSnapshotSuccess: "Plugin Backup：本地快照创建成功。",
		backupFailed: "Plugin Backup：备份失败",
		localSnapshotFailed: "Plugin Backup：本地快照创建失败",
		restoreFailed: "Plugin Backup：恢复失败",
		checkFailed: "Plugin Backup：检查失败",
	},
};

const CATEGORY_TRANSLATIONS: Record<SupportedLanguage, Record<string, { label: string; description: string }>> = {
	en: {
		backupAppearance: { label: "Appearance & Theme", description: "appearance.json, themes/, snippets/" },
		backupHotkeys: { label: "Custom Hotkeys", description: "hotkeys.json" },
		backupCorePlugins: { label: "Core Plugins", description: "core plugin enablement plus user settings such as daily-notes.json and templates.json" },
		backupCommunityPlugins: { label: "Community Plugins", description: "community-plugins.json, all plugin files" },
		backupAppSettings: { label: "App Settings", description: "app.json (editor, links, files)" },
		backupBookmarks: { label: "Bookmarks", description: "bookmarks.json" },
		backupGraph: { label: "Graph Settings", description: "graph.json" },
	},
	zh: {
		backupAppearance: { label: "外观与主题", description: "appearance.json、themes/、snippets/" },
		backupHotkeys: { label: "自定义快捷键", description: "hotkeys.json" },
		backupCorePlugins: { label: "核心插件", description: "核心插件启用状态，以及 daily-notes.json、templates.json 等用户设置" },
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
		createBackup: (options?: BackupRunOptions) => Promise<void>;
		createLocalSnapshot: (options?: BackupRunOptions) => Promise<string>;
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

		new Setting(containerEl)
			.setName(this.t("backupFormat"))
			.setDesc(this.t("backupFormatDesc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("archive", this.t("archiveFormat"))
					.addOption("directory", this.t("directoryFormat"))
					.setValue(this.settings.backupFormat || "archive")
					.onChange(async (value) => {
						this.settings.backupFormat = value as "archive" | "directory";
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
			.setName(this.t("syncOwnSettings"))
			.setDesc(this.t("syncOwnSettingsDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.syncOwnPluginSettings)
					.onChange(async (value) => {
						this.settings.syncOwnPluginSettings = value;
						await this.plugin.saveSettings();
					})
			);

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
						const comment = await promptForBackupComment(this.app, this.t("createBackupNow"), "What changed in this backup?");
						if (comment === null) return;
						const progress = new BackupProgressModal(this.app, this.t("createBackupNow"));
						try {
							progress.open();
							await this.plugin.createBackup({
								comment,
								onProgress: (value) => progress.update(value),
							});
							new Notice(this.t("backupSuccess"));
						} catch (err: any) {
							new Notice(`${this.t("backupFailed")} - ${err.message}`, 5000);
						} finally {
							progress.close();
						}
					})
			);

		new Setting(containerEl)
			.setName(this.t("createLocalSnapshotNow"))
			.setDesc(this.t("createLocalSnapshotNowDesc"))
			.addButton((btn) =>
				btn
					.setButtonText(this.t("localSnapshot"))
					.onClick(async () => {
						const comment = await promptForBackupComment(this.app, this.t("createLocalSnapshotNow"), "What local state should this snapshot remember?");
						if (comment === null) return;
						const progress = new BackupProgressModal(this.app, this.t("createLocalSnapshotNow"));
						try {
							progress.open();
							const snapshotPath = await this.plugin.createLocalSnapshot({
								comment,
								onProgress: (value) => progress.update(value),
							});
							new Notice(`${this.t("localSnapshotSuccess")}\n${snapshotPath}`, 8000);
						} catch (err: any) {
							new Notice(`${this.t("localSnapshotFailed")} - ${err.message}`, 5000);
						} finally {
							progress.close();
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
			.setName(this.t("compareVersions"))
			.setDesc(this.t("compareVersionsDesc"))
			.addButton((btn) =>
				btn
					.setButtonText(this.t("compare"))
					.onClick(async () => {
						try {
							await this.plugin.restoreManager.compareVersions();
						} catch (err: any) {
							new Notice(`${this.t("checkFailed")} - ${err.message}`, 5000);
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
		const selectedData = new Set(this.settings.selectedCommunityPluginDataIds || []);

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

		new Setting(containerEl)
			.setName(this.t("communityPluginDataMode"))
			.setDesc(this.t("communityPluginDataModeDesc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("all", this.t("allPluginData"))
					.addOption("none", this.t("noPluginData"))
					.addOption("selected", this.t("selectedPluginData"))
					.setValue(this.settings.communityPluginDataMode || "all")
					.onChange(async (value) => {
						const mode = value as "all" | "none" | "selected";
						this.settings.communityPluginDataMode = mode;
						if (mode === "selected" && this.settings.selectedCommunityPluginDataIds.length === 0) {
							this.settings.selectedCommunityPluginDataIds = installedPlugins.map((plugin) => plugin.id);
						}
						await this.plugin.saveSettings();
						this.display();
					});
			});

		const showPluginRows = this.settings.communityPluginSelectionMode === "selected"
			|| this.settings.communityPluginDataMode === "selected";

		if (!showPluginRows) {
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
						if (this.settings.communityPluginDataMode === "selected") {
							this.settings.selectedCommunityPluginDataIds = installedPlugins.map((plugin) => plugin.id);
						}
						await this.plugin.saveSettings();
						this.display();
					})
			);

		for (const plugin of installedPlugins) {
			const pluginSelected = this.settings.communityPluginSelectionMode === "selected"
				? selected.has(plugin.id)
				: true;
			const dataSelected = this.settings.communityPluginDataMode === "selected"
				? selectedData.has(plugin.id)
				: this.settings.communityPluginDataMode !== "none";
			const value = !pluginSelected ? "none" : dataSelected ? "full" : "files";

			new Setting(containerEl)
				.setName(`${plugin.name} (${plugin.id})`)
				.setDesc(`${plugin.enabled ? this.t("enabled") : this.t("disabled")} - ${this.t("version")} ${plugin.version}`)
				.addDropdown((dropdown) => {
					if (this.settings.communityPluginSelectionMode === "selected") {
						dropdown.addOption("none", this.t("doNotSyncPlugin"));
					}
					dropdown
						.addOption("files", this.t("syncPluginFilesOnly"))
						.addOption("full", this.t("syncPluginFilesAndData"))
						.setValue(value)
						.onChange(async (newValue) => {
							if (newValue !== "none" && this.settings.communityPluginDataMode !== "selected") {
								if (this.settings.communityPluginDataMode === "all") {
									for (const installedPlugin of installedPlugins) selectedData.add(installedPlugin.id);
								} else {
									selectedData.clear();
								}
								this.settings.communityPluginDataMode = "selected";
							}

							if (newValue === "none") {
								selected.delete(plugin.id);
								selectedData.delete(plugin.id);
							} else {
								selected.add(plugin.id);
								if (newValue === "full") selectedData.add(plugin.id);
								else selectedData.delete(plugin.id);
							}

							if (this.settings.communityPluginSelectionMode === "selected") {
								this.settings.selectedCommunityPluginIds = Array.from(selected).sort();
							}
							if (this.settings.communityPluginDataMode === "selected") {
								this.settings.selectedCommunityPluginDataIds = Array.from(selectedData).sort();
							}
							await this.plugin.saveSettings();
						});
				});
		}
	}
}
