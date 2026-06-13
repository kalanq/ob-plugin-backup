import type { App } from "obsidian";
import type { AddonBackupSettings, BackupFile, BackupMeta, FileChange } from "./types";
import {
	BACKUP_DIR_NAME,
	LATEST_DIR_NAME,
	HISTORY_DIR_NAME,
	META_FILE_NAME,
	LOCAL_SNAPSHOT_DIR_NAME,
} from "./constants";
import { getConfigDirName, getConfigPath, getVaultPath, resolveVaultPath } from "./path_utils";
import { collectBackupFiles, getIncludedPluginIds, simpleHash } from "./file_utils";
import { ensureDeviceIdentity } from "./device_utils";

const fs = require("fs");
const path = require("path");

export class BackupManager {
	private app: App;
	private settings: AddonBackupSettings;

	constructor(app: App, settings: AddonBackupSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: AddonBackupSettings): void {
		this.settings = settings;
	}

	private getVaultPath(): string {
		return getVaultPath(this.app);
	}

	private getConfigPath(): string {
		return getConfigPath(this.app);
	}

	private getSyncBackupRoot(): string {
		return resolveVaultPath(this.getVaultPath(), this.settings.backupPath);
	}

	private getLocalSnapshotRoot(): string {
		return resolveVaultPath(this.getVaultPath(), this.settings.localSnapshotPath);
	}

	private getLocalSnapshotDir(): string {
		const root = this.getLocalSnapshotRoot();
		return root ? path.join(root, LOCAL_SNAPSHOT_DIR_NAME) : "";
	}

	async createBackup(): Promise<void> {
		const syncDir = this.getSyncBackupDir();
		if (!syncDir) {
			throw new Error("Backup path not configured");
		}

		const configPath = this.getConfigPath();
		const latestDir = path.join(syncDir, LATEST_DIR_NAME);
		const tempLatestDir = path.join(syncDir, `${LATEST_DIR_NAME}.tmp-${Date.now()}`);

		const previousMeta = await this.readMeta();
		const changes: string[] = [];

		if (fs.existsSync(tempLatestDir)) {
			fs.rmSync(tempLatestDir, { recursive: true, force: true });
		}
		fs.mkdirSync(tempLatestDir, { recursive: true });

		const backupFiles = collectBackupFiles(configPath, tempLatestDir, this.settings);

		for (const file of backupFiles) {
			fs.mkdirSync(path.dirname(file.dest), { recursive: true });
			fs.copyFileSync(file.source, file.dest);
		}

		const meta = this.buildMeta(backupFiles);

		if (previousMeta) {
			const detectedChanges = this.detectChanges(previousMeta.fileHashes, meta.fileHashes);
			for (const change of detectedChanges) {
				const prefix = change.type === "added" ? "+" : change.type === "deleted" ? "-" : "~";
				changes.push(`${prefix} ${change.relativePath}`);
			}
		} else {
			changes.push("+ Initial backup");
		}

		meta.changelog = changes;

		const now = new Date();
		const timestamp = now.toISOString().replace(/[:.]/g, "-");
		await this.createSyncHistorySnapshot(syncDir, tempLatestDir, timestamp, meta);
		await this.createLocalSnapshot(configPath, timestamp, meta);

		fs.mkdirSync(syncDir, { recursive: true });
		if (fs.existsSync(latestDir)) {
			fs.rmSync(latestDir, { recursive: true, force: true });
		}
		fs.renameSync(tempLatestDir, latestDir);
		fs.writeFileSync(path.join(syncDir, META_FILE_NAME), JSON.stringify(meta, null, 2));

		this.cleanHistory(
			path.join(syncDir, HISTORY_DIR_NAME),
			this.settings.syncHistoryRetentionCount,
		);
		this.cleanHistory(
			this.getLocalSnapshotDir(),
			this.settings.localSnapshotRetentionCount,
		);
	}

	private detectChanges(
		oldHashes: Record<string, string>,
		newHashes: Record<string, string>,
	): FileChange[] {
		const changes: FileChange[] = [];
		for (const [file, hash] of Object.entries(newHashes)) {
			if (!oldHashes[file]) {
				changes.push({ path: file, relativePath: file, type: "added" });
			} else if (oldHashes[file] !== hash) {
				changes.push({ path: file, relativePath: file, type: "modified" });
			}
		}
		for (const file of Object.keys(oldHashes)) {
			if (!newHashes[file]) {
				changes.push({ path: file, relativePath: file, type: "deleted" });
			}
		}
		return changes;
	}

	private buildMeta(backupFiles: BackupFile[]): BackupMeta {
		const now = new Date();
		const fileHashes: Record<string, string> = {};
		const pluginVersions: Record<string, string> = {};
		const device = ensureDeviceIdentity(this.settings);

		for (const file of backupFiles) {
			const content = fs.readFileSync(file.source);
			fileHashes[file.relativePath] = simpleHash(content.toString());

			const match = file.relativePath.match(/^plugins\/([^/]+)\/manifest\.json$/);
			if (match) {
				try {
					const manifest = JSON.parse(content.toString());
					pluginVersions[match[1]] = manifest.version || "unknown";
				} catch {}
			}
		}

		return {
			version: "1.0.0",
			lastBackupTime: now.getTime(),
			lastBackupTimeStr: now.toISOString(),
			fileHashes,
			changelog: [],
			pluginVersions,
			includedPluginIds: getIncludedPluginIds(backupFiles),
			configDir: getConfigDirName(this.app),
			deviceId: device.deviceId,
			deviceName: device.deviceName,
		};
	}

	private async createSyncHistorySnapshot(
		syncDir: string,
		latestDir: string,
		timestamp: string,
		meta: BackupMeta,
	): Promise<void> {
		const historyDir = path.join(syncDir, HISTORY_DIR_NAME, timestamp);
		if (!fs.existsSync(latestDir)) return;

		this.copyDirRecursive(latestDir, historyDir);
		fs.writeFileSync(
			path.join(historyDir, META_FILE_NAME),
			JSON.stringify(meta, null, 2),
		);
	}

	private async createLocalSnapshot(
		configPath: string,
		timestamp: string,
		meta: BackupMeta,
	): Promise<void> {
		const localDir = this.getLocalSnapshotDir();
		if (!localDir) return;

		const snapshotDir = path.join(localDir, timestamp);
		this.copyDirRecursive(configPath, snapshotDir);

		fs.writeFileSync(
			path.join(snapshotDir, META_FILE_NAME),
			JSON.stringify(meta, null, 2),
		);
	}

	private copyDirRecursive(src: string, dest: string): void {
		fs.mkdirSync(dest, { recursive: true });
		const entries = fs.readdirSync(src, { withFileTypes: true });
		for (const entry of entries) {
			const srcPath = path.join(src, entry.name);
			const destPath = path.join(dest, entry.name);
			if (entry.isDirectory()) {
				this.copyDirRecursive(srcPath, destPath);
			} else {
				fs.copyFileSync(srcPath, destPath);
			}
		}
	}

	private cleanHistory(historyDir: string, retentionCount: number): void {
		if (!fs.existsSync(historyDir)) return;
		const entries = fs.readdirSync(historyDir).sort();
		while (entries.length > retentionCount) {
			const oldest = entries.shift();
			if (oldest) {
				fs.rmSync(path.join(historyDir, oldest), { recursive: true, force: true });
			}
		}
	}

	async readMeta(): Promise<BackupMeta | null> {
		const syncDir = this.getSyncBackupDir();
		if (!syncDir) return null;
		const metaPath = path.join(syncDir, META_FILE_NAME);
		if (!fs.existsSync(metaPath)) return null;
		try {
			const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
			return {
				...meta,
				pluginVersions: meta.pluginVersions || {},
				includedPluginIds: meta.includedPluginIds || Object.keys(meta.pluginVersions || {}),
				configDir: meta.configDir || getConfigDirName(this.app),
				deviceId: meta.deviceId || this.settings.deviceId || "unknown-device",
				deviceName: meta.deviceName || this.settings.deviceName || "Unknown device",
			};
		} catch {
			return null;
		}
	}

	getSyncBackupDir(): string {
		const root = this.getSyncBackupRoot();
		return root ? path.join(root, BACKUP_DIR_NAME) : "";
	}

	getSyncHistoryDir(): string {
		return path.join(this.getSyncBackupDir(), HISTORY_DIR_NAME);
	}

	getSyncLatestDir(): string {
		return path.join(this.getSyncBackupDir(), LATEST_DIR_NAME);
	}

	getLocalSnapshotDirPublic(): string {
		return this.getLocalSnapshotDir();
	}

	getHistoryList(): Array<{ timestamp: string; displayName: string; meta: BackupMeta | null }> {
		const historyDir = this.getSyncHistoryDir();
		if (!fs.existsSync(historyDir)) return [];

		const entries = fs.readdirSync(historyDir).sort().reverse();
		return entries.map((timestamp: string) => {
			const metaPath = path.join(historyDir, timestamp, META_FILE_NAME);
			let meta: BackupMeta | null = null;
			try {
				if (fs.existsSync(metaPath)) {
					const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8"));
					meta = {
						...parsed,
						pluginVersions: parsed.pluginVersions || {},
						includedPluginIds: parsed.includedPluginIds || Object.keys(parsed.pluginVersions || {}),
						configDir: parsed.configDir || getConfigDirName(this.app),
						deviceId: parsed.deviceId || this.settings.deviceId || "unknown-device",
						deviceName: parsed.deviceName || this.settings.deviceName || "Unknown device",
					};
				}
			} catch {}

			const displayName = this.formatTimestamp(timestamp);
			return { timestamp, displayName, meta };
		});
	}

	getLocalSnapshotList(): Array<{ timestamp: string; displayName: string }> {
		const localDir = this.getLocalSnapshotDir();
		if (!fs.existsSync(localDir)) return [];

		const entries = fs.readdirSync(localDir).sort().reverse();
		return entries.map((timestamp: string) => ({
			timestamp,
			displayName: "Local: " + this.formatTimestamp(timestamp),
		}));
	}

	private formatTimestamp(ts: string): string {
		try {
			const normalized = ts.replace(/-/g, (m, offset) => {
				if (offset < 10) return "-";
				if (offset === 10) return "T";
				if (offset === 13 || offset === 16) return ":";
				return "-";
			});
			const date = new Date(normalized.endsWith("Z") ? normalized : normalized + "Z");
			if (isNaN(date.getTime())) return ts;
			return date.toLocaleString("zh-CN", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			});
		} catch {
			return ts;
		}
	}
}
