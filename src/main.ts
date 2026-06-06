import { Plugin, Notice } from "obsidian";
import type { AddonSyncSettings, SyncStatus } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { COMMANDS } from "./constants";
import { BackupManager } from "./backup";
import { RestoreManager } from "./restore";
import { DiffChecker } from "./diff";
import { BackupScheduler } from "./scheduler";
import { AddonSyncSettingTab } from "./settings";

export default class AddonSyncPlugin extends Plugin {
	settings!: AddonSyncSettings;
	backupManager!: BackupManager;
	restoreManager!: RestoreManager;
	diffChecker!: DiffChecker;
	scheduler!: BackupScheduler;
	statusBarItem!: HTMLElement;
	currentStatus: SyncStatus = "no-backup";

	async onload() {
		await this.loadSettings();

		this.backupManager = new BackupManager(this.app, this.settings);
		this.restoreManager = new RestoreManager(this.app, this.settings, this.backupManager);
		this.diffChecker = new DiffChecker(this.app, this.settings, this.backupManager);
		this.scheduler = new BackupScheduler(this, this.backupManager, this.diffChecker, this.restoreManager);

		this.registerCommands();
		this.registerStatusBar();
		this.addSettingTab(new AddonSyncSettingTab(this.app, this));

		this.runStartupTasks();
	}

	onunload() {
		this.scheduler.stopAutoBackup();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (!this.settings.backupPath) {
			this.settings.backupPath = DEFAULT_SETTINGS.backupPath;
			await this.saveData(this.settings);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.backupManager.updateSettings(this.settings);
		this.restoreManager.updateSettings(this.settings);
		this.diffChecker.updateSettings(this.settings);
	}

	private registerCommands() {
		this.addCommand({
			id: COMMANDS.CREATE_BACKUP,
			name: "Create Backup",
			callback: async () => {
				try {
					this.updateStatus("syncing");
					await this.backupManager.createBackup();
					this.updateStatus("synced");
					new Notice("Addon Sync: Backup created successfully.");
				} catch (err: any) {
					this.updateStatus("error");
					new Notice(`Addon Sync: Backup failed - ${err.message}`, 5000);
				}
			},
		});

		this.addCommand({
			id: COMMANDS.RESTORE_LATEST,
			name: "Restore Latest Backup",
			callback: async () => {
				try {
					await this.restoreManager.restoreLatest();
					await this.refreshStatus();
				} catch (err: any) {
					new Notice(`Addon Sync: Restore failed - ${err.message}`, 5000);
				}
			},
		});

		this.addCommand({
			id: COMMANDS.RESTORE_FROM_HISTORY,
			name: "Restore from History",
			callback: async () => {
				try {
					await this.restoreManager.restoreFromHistory();
					await this.refreshStatus();
				} catch (err: any) {
					new Notice(`Addon Sync: Restore failed - ${err.message}`, 5000);
				}
			},
		});

		this.addCommand({
			id: COMMANDS.CHECK_CHANGES,
			name: "Check for Changes",
			callback: async () => {
				try {
					const summary = await this.diffChecker.getChangeSummary();
					const hasChanges = await this.diffChecker.hasChanges();
					this.updateStatus(hasChanges ? "changed" : "synced");
					new Notice(`Addon Sync:\n${summary}`, 8000);
				} catch (err: any) {
					new Notice(`Addon Sync: Check failed - ${err.message}`, 5000);
				}
			},
		});
	}

	private registerStatusBar() {
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass("mod-clickable");
		this.statusBarItem.setAttribute("aria-label", "Addon Sync: Click to check changes");
		this.statusBarItem.onClickEvent(() => {
			(this.app as any).commands.executeCommandById(`obsidian-addon-sync:${COMMANDS.CHECK_CHANGES}`);
		});
		this.updateStatus("no-backup");
	}

	private updateStatus(status: SyncStatus) {
		this.currentStatus = status;
		const labels: Record<SyncStatus, string> = {
			synced: "✅ Synced",
			changed: "🔄 Changed",
			syncing: "⏳ Syncing...",
			error: "❌ Error",
			"no-backup": "📦 No Backup",
		};
		this.statusBarItem.setText(`Addon Sync: ${labels[status]}`);
	}

	private async refreshStatus() {
		try {
			const meta = await this.backupManager.readMeta();
			if (!meta) {
				this.updateStatus("no-backup");
				return;
			}
			const hasChanges = await this.diffChecker.hasChanges();
			this.updateStatus(hasChanges ? "changed" : "synced");
		} catch {
			this.updateStatus("error");
		}
	}

	private async runStartupTasks() {
		if (this.settings.autoBackupOnStartup) {
			await this.scheduler.runStartupBackup();
		}

		if (this.settings.checkChangesOnStartup) {
			await this.scheduler.runStartupChangeCheck();
		}

		if (this.settings.autoBackupEnabled) {
			this.scheduler.configure(this.settings);
		}

		await this.refreshStatus();
	}
}
