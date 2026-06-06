import { App, Notice } from "obsidian";
import type { AddonBackupSettings, BackupMeta, FileChange } from "./types";
import {
	BACKUP_DIR_NAME,
	LATEST_DIR_NAME,
	HISTORY_DIR_NAME,
	META_FILE_NAME,
	LOCAL_SNAPSHOT_DIR_NAME,
	CONFIG_FILES,
} from "./constants";

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
		return (this.app.vault.adapter as any).getBasePath();
	}

	private getConfigPath(): string {
		return path.join(this.getVaultPath(), ".obsidian");
	}

	private getSyncBackupRoot(): string {
		const p = this.settings.backupPath;
		if (!p) return "";
		if (p.includes(":") || p.startsWith("/")) return p;
		return path.join(this.getVaultPath(), p);
	}

	private getSyncBackupDir(): string {
		const root = this.getSyncBackupRoot();
		return root ? path.join(root, BACKUP_DIR_NAME) : "";
	}

	private getLocalSnapshotRoot(): string {
		const p = this.settings.localSnapshotPath;
		if (!p) return "";
		if (p.includes(":") || p.startsWith("/")) return p;
		return path.join(this.getVaultPath(), p);
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

		const previousMeta = await this.readMeta();
		const changes: string[] = [];

		const backupFiles = this.collectBackupFiles(configPath, latestDir);

		for (const file of backupFiles) {
			fs.mkdirSync(path.dirname(file.dest), { recursive: true });
			fs.copyFileSync(file.source, file.dest);
		}

		const meta = this.buildMeta(backupFiles, configPath);

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
		await this.createSyncHistorySnapshot(syncDir, latestDir, timestamp, meta);

		await this.createLocalSnapshot(configPath, timestamp, meta);

		fs.mkdirSync(syncDir, { recursive: true });
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

	private collectBackupFiles(configPath: string, latestDir: string): Array<{ source: string; dest: string }> {
		const result: Array<{ source: string; dest: string }> = [];

		const addConfigFile = (file: string) => {
			const src = path.join(configPath, file);
			if (fs.existsSync(src)) {
				result.push({ source: src, dest: path.join(latestDir, file) });
			}
		};

		if (this.settings.backupAppearance) {
			for (const f of CONFIG_FILES.appearance) addConfigFile(f);
			const themesDir = path.join(configPath, "themes");
			if (fs.existsSync(themesDir)) {
				this.collectDirFiles(themesDir, path.join(latestDir, "themes"), result);
			}
			const snippetsDir = path.join(configPath, "snippets");
			if (fs.existsSync(snippetsDir)) {
				this.collectDirFiles(snippetsDir, path.join(latestDir, "snippets"), result);
			}
		}

		if (this.settings.backupHotkeys) {
			for (const f of CONFIG_FILES.hotkeys) addConfigFile(f);
		}

		if (this.settings.backupCorePlugins) {
			for (const f of CONFIG_FILES.corePlugins) addConfigFile(f);
		}

		if (this.settings.backupCommunityPlugins) {
			for (const f of CONFIG_FILES.communityPlugins) addConfigFile(f);
			const pluginsDir = path.join(configPath, "plugins");
			if (fs.existsSync(pluginsDir)) {
				const plugins = fs.readdirSync(pluginsDir);
				for (const pluginId of plugins) {
					const pluginPath = path.join(pluginsDir, pluginId);
					if (fs.statSync(pluginPath).isDirectory()) {
						const files = fs.readdirSync(pluginPath);
						for (const file of files) {
							const filePath = path.join(pluginPath, file);
							if (fs.statSync(filePath).isFile()) {
								result.push({
									source: filePath,
									dest: path.join(latestDir, "plugins", pluginId, file),
								});
							}
						}
					}
				}
			}
		}

		if (this.settings.backupAppSettings) {
			for (const f of CONFIG_FILES.appSettings) addConfigFile(f);
		}

		if (this.settings.backupBookmarks) {
			for (const f of CONFIG_FILES.bookmarks) addConfigFile(f);
		}

		if (this.settings.backupGraph) {
			for (const f of CONFIG_FILES.graph) addConfigFile(f);
		}

		return result;
	}

	private collectDirFiles(srcDir: string, destDir: string, result: Array<{ source: string; dest: string }>): void {
		const entries = fs.readdirSync(srcDir);
		for (const entry of entries) {
			const srcPath = path.join(srcDir, entry);
			if (fs.statSync(srcPath).isDirectory()) {
				this.collectDirFiles(srcPath, path.join(destDir, entry), result);
			} else if (fs.statSync(srcPath).isFile()) {
				result.push({ source: srcPath, dest: path.join(destDir, entry) });
			}
		}
	}

	private buildMeta(backupFiles: Array<{ source: string; dest: string }>, configPath: string): BackupMeta {
		const now = new Date();
		const fileHashes: Record<string, string> = {};
		const pluginVersions: Record<string, string> = {};

		for (const file of backupFiles) {
			const content = fs.readFileSync(file.source);
			const relativePath = path.relative(configPath, file.source).replace(/\\/g, "/");
			fileHashes[relativePath] = this.simpleHash(content.toString());

			const match = relativePath.match(/^plugins\/([^/]+)\/manifest\.json$/);
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
		};
	}

	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash |= 0;
		}
		return hash.toString(16);
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
			return JSON.parse(fs.readFileSync(metaPath, "utf8"));
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
		return entries.map((timestamp) => {
			const metaPath = path.join(historyDir, timestamp, META_FILE_NAME);
			let meta: BackupMeta | null = null;
			try {
				if (fs.existsSync(metaPath)) {
					meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
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
		return entries.map((timestamp) => ({
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