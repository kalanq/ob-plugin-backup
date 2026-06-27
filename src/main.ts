import { Modal, Notice, Plugin, Setting } from "obsidian";
import type { AddonBackupSettings, SyncStatus } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { COMMANDS } from "./constants";
import { BackupManager } from "./backup";
import { RestoreManager } from "./restore";
import { DiffChecker } from "./diff";
import { BackupScheduler } from "./scheduler";
import { AddonBackupSettingTab } from "./settings";
import { ensureDeviceIdentity } from "./device_utils";

export default class AddonBackupPlugin extends Plugin {
	settings!: AddonBackupSettings;
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
		this.addSettingTab(new AddonBackupSettingTab(this.app, this));

		if (await this.prepareInitialSetup()) {
			this.runStartupTasks();
		}
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
		const device = ensureDeviceIdentity(this.settings);
		if (!this.settings.deviceId || !this.settings.deviceName) {
			this.settings.deviceId = device.deviceId;
			this.settings.deviceName = device.deviceName;
			await this.saveData(this.settings);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.backupManager.updateSettings(this.settings);
		this.restoreManager.updateSettings(this.settings);
		this.diffChecker.updateSettings(this.settings);
	}

	async createBackup() {
		await this.backupManager.createBackup();
		if (!this.settings.firstBackupCompleted || !this.settings.initialSetupCompleted) {
			this.settings.firstBackupCompleted = true;
			this.settings.initialSetupCompleted = true;
			await this.saveSettings();
			if (this.settings.autoBackupEnabled) {
				this.scheduler.configure(this.settings);
			}
		}
	}

	async createLocalSnapshot() {
		return this.backupManager.createLocalSnapshotOnly();
	}

	private registerCommands() {
		this.addCommand({
			id: COMMANDS.CREATE_BACKUP,
			name: "Create Backup",
			callback: async () => {
				try {
					this.updateStatus("syncing");
					await this.createBackup();
					this.updateStatus("synced");
					new Notice("Plugin Backup: Backup created successfully.");
				} catch (err: any) {
					this.updateStatus("error");
					new Notice(`Plugin Backup: Backup failed - ${err.message}`, 5000);
				}
			},
		});

		this.addCommand({
			id: COMMANDS.CREATE_LOCAL_SNAPSHOT,
			name: "Create Local Safety Snapshot",
			callback: async () => {
				try {
					const snapshotPath = await this.createLocalSnapshot();
					new Notice(`Plugin Backup: Local snapshot created.\n${snapshotPath}`, 8000);
				} catch (err: any) {
					new Notice(`Plugin Backup: Local snapshot failed - ${err.message}`, 5000);
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
					new Notice(`Plugin Backup: Restore failed - ${err.message}`, 5000);
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
					new Notice(`Plugin Backup: Restore failed - ${err.message}`, 5000);
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
					new Notice(`Plugin Backup:\n${summary}`, 8000);
				} catch (err: any) {
					new Notice(`Plugin Backup: Check failed - ${err.message}`, 5000);
				}
			},
		});
	}

	private registerStatusBar() {
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass("mod-clickable");
		this.statusBarItem.setAttribute("aria-label", "Plugin Backup: Click to check changes");
		this.statusBarItem.onClickEvent(() => {
			(this.app as any).commands.executeCommandById(`ob-plugin-backup:${COMMANDS.CHECK_CHANGES}`);
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
		this.statusBarItem.setText(`Plugin Backup: ${labels[status]}`);
	}

	private async prepareInitialSetup(): Promise<boolean> {
		if (this.settings.initialSetupCompleted) return true;

		const meta = await this.backupManager.readMeta();
		if (meta) {
			this.settings.initialSetupCompleted = true;
			this.settings.firstBackupCompleted = true;
			await this.saveSettings();
			return true;
		}

		new InitialSetupModal(this.app, this).open();
		await this.refreshStatus();
		return false;
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
		if (this.settings.autoBackupOnStartup && this.settings.firstBackupCompleted) {
			await this.scheduler.runStartupBackup();
		}

		if (this.settings.checkChangesOnStartup) {
			await this.scheduler.runStartupChangeCheck();
		}

		if (this.settings.autoBackupEnabled && this.settings.firstBackupCompleted) {
			this.scheduler.configure(this.settings);
		}

		await this.refreshStatus();
	}
}

class InitialSetupModal extends Modal {
	private plugin: AddonBackupPlugin;
	private backupPath: string;
	private localSnapshotPath: string;

	constructor(app: any, plugin: AddonBackupPlugin) {
		super(app);
		this.plugin = plugin;
		this.backupPath = plugin.settings.backupPath;
		this.localSnapshotPath = plugin.settings.localSnapshotPath;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText("Plugin Backup Setup");

		contentEl.createEl("p", {
			text: "Choose where backups should be stored before creating the first backup. The first backup must be started manually.",
		});

		new Setting(contentEl)
			.setName("Sync backup path")
			.setDesc("Relative to the vault root. Keep this in a NAS-synced folder, for example: meta.")
			.addText((text) =>
				text
					.setPlaceholder("meta")
					.setValue(this.backupPath)
					.onChange((value) => {
						this.backupPath = value.trim();
					})
			);

		new Setting(contentEl)
			.setName("Local safety snapshot path")
			.setDesc("Relative to the vault root. Use a hidden local-only folder, for example: .ob-plugin-backup-local.")
			.addText((text) =>
				text
					.setPlaceholder(".ob-plugin-backup-local")
					.setValue(this.localSnapshotPath)
					.onChange((value) => {
						this.localSnapshotPath = value.trim();
					})
			);

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText("Save settings")
					.onClick(async () => {
						await this.saveSetup(false);
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Save and backup now")
					.setCta()
					.onClick(async () => {
						await this.saveSetup(true);
					})
			);
	}

	private async saveSetup(runBackup: boolean): Promise<void> {
		this.plugin.settings.backupPath = this.backupPath || DEFAULT_SETTINGS.backupPath;
		this.plugin.settings.localSnapshotPath = this.localSnapshotPath || DEFAULT_SETTINGS.localSnapshotPath;
		this.plugin.settings.initialSetupCompleted = true;
		await this.plugin.saveSettings();

		if (runBackup) {
			try {
				await this.plugin.createBackup();
				new Notice("Plugin Backup: First backup created successfully.");
			} catch (err: any) {
				new Notice(`Plugin Backup: Backup failed - ${err.message}`, 5000);
				return;
			}
		} else {
			new Notice("Plugin Backup: Settings saved. Run Create Backup when ready.");
		}

		this.close();
	}
}
