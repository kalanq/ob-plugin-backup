import { Notice, Plugin } from "obsidian";
import type { AddonBackupSettings } from "./types";
import { BackupManager } from "./backup";
import { DiffChecker } from "./diff";
import { RestoreManager } from "./restore";

export class BackupScheduler {
	private plugin: Plugin;
	private backupManager: BackupManager;
	private diffChecker: DiffChecker;
	private restoreManager: RestoreManager;
	private intervalId: number | null = null;

	constructor(
		plugin: Plugin,
		backupManager: BackupManager,
		diffChecker: DiffChecker,
		restoreManager: RestoreManager,
	) {
		this.plugin = plugin;
		this.backupManager = backupManager;
		this.diffChecker = diffChecker;
		this.restoreManager = restoreManager;
	}

	startAutoBackup(intervalMinutes: number): void {
		this.stopAutoBackup();
		if (intervalMinutes <= 0) return;

		const intervalMs = intervalMinutes * 60 * 1000;
		this.intervalId = window.setInterval(async () => {
			if (this.restoreManager.isRestoring) return;
			try {
				await this.backupManager.createBackup({ comment: "Scheduled auto backup" });
			} catch (err: any) {
				console.error("Plugin Backup: Auto backup failed", err);
			}
		}, intervalMs) as unknown as number;

		this.plugin.registerInterval(this.intervalId);
	}

	stopAutoBackup(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	configure(settings: AddonBackupSettings): void {
		this.stopAutoBackup();
		if (
			settings.firstBackupCompleted
			&& settings.autoBackupEnabled
			&& settings.autoBackupIntervalMinutes > 0
		) {
			this.startAutoBackup(settings.autoBackupIntervalMinutes);
		}
	}

	async runStartupBackup(): Promise<void> {
		try {
			await this.backupManager.createBackup({ comment: "Auto backup on startup" });
			new Notice("Plugin Backup: Startup backup completed.");
		} catch (err: any) {
			console.error("Plugin Backup: Startup backup failed", err);
		}
	}

	async runStartupChangeCheck(): Promise<void> {
		try {
			const hasBackup = await this.backupManager.readMeta();
			if (!hasBackup) return;

			const hasChanges = await this.diffChecker.hasChanges();
			if (hasChanges) {
				const summary = await this.diffChecker.getChangeSummary();
				new Notice(`Plugin Backup: Config changes detected.\n${summary}`, 8000);
			}
		} catch (err: any) {
			console.error("Plugin Backup: Startup change check failed", err);
		}
	}
}
