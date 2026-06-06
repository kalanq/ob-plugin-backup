import { Notice, Plugin } from "obsidian";
import type { AddonSyncSettings } from "./types";
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
				await this.backupManager.createBackup();
			} catch (err: any) {
				console.error("Addon Sync: Auto backup failed", err);
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

	configure(settings: AddonSyncSettings): void {
		this.stopAutoBackup();
		if (settings.autoBackupEnabled && settings.autoBackupIntervalMinutes > 0) {
			this.startAutoBackup(settings.autoBackupIntervalMinutes);
		}
	}

	async runStartupBackup(): Promise<void> {
		try {
			await this.backupManager.createBackup();
			new Notice("Addon Sync: Auto backup completed on startup.");
		} catch (err: any) {
			console.error("Addon Sync: Startup backup failed", err);
		}
	}

	async runStartupChangeCheck(): Promise<void> {
		try {
			const hasBackup = await this.backupManager.readMeta();
			if (!hasBackup) return;

			const hasChanges = await this.diffChecker.hasChanges();
			if (hasChanges) {
				const summary = await this.diffChecker.getChangeSummary();
				new Notice(`Addon Sync: Config changes detected.\n${summary}`, 8000);
			}
		} catch (err: any) {
			console.error("Addon Sync: Startup change check failed", err);
		}
	}
}
