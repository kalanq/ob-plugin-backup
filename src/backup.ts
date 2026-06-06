import { App, FileSystemAdapter } from "obsidian";
import type { AddonSyncSettings, BackupMeta } from "./types";
import {
	BACKUP_DIR_NAME,
	LATEST_DIR_NAME,
	HISTORY_DIR_NAME,
	META_FILE_NAME,
	CONFIG_FILES,
} from "./constants";

export class BackupManager {
	private app: App;
	private settings: AddonSyncSettings;
	private configDir: string;

	constructor(app: App, settings: AddonSyncSettings) {
		this.app = app;
		this.settings = settings;
		this.configDir = (app.vault as any).configDir || ".obsidian";
	}

	updateSettings(settings: AddonSyncSettings) {
		this.settings = settings;
	}

	getBackupRoot(): string {
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		const vaultPath = adapter.getBasePath();
		const backupPath = this.settings.backupPath;

		if (!backupPath) return "";

		if (backupPath.includes(":") || backupPath.startsWith("/")) {
			return backupPath;
		}

		return `${vaultPath}/${backupPath}`;
	}

	getBackupDir(): string {
		const root = this.getBackupRoot();
		return root ? `${root}/${BACKUP_DIR_NAME}` : "";
	}

	getLatestDir(): string {
		const dir = this.getBackupDir();
		return dir ? `${dir}/${LATEST_DIR_NAME}` : "";
	}

	getHistoryDir(): string {
		const dir = this.getBackupDir();
		return dir ? `${dir}/${HISTORY_DIR_NAME}` : "";
	}

	async createBackup(): Promise<void> {
		const backupDir = this.getBackupDir();
		if (!backupDir) {
			throw new Error("Backup path not configured");
		}

		const latestDir = this.getLatestDir();
		const fs = require("fs") as typeof import("fs");
		const path = require("path") as typeof import("path");

		fs.mkdirSync(latestDir, { recursive: true });

		const filesToBackup = await this.collectBackupFiles();

		for (const { source, dest } of filesToBackup) {
			const destDir = path.dirname(dest);
			fs.mkdirSync(destDir, { recursive: true });
			if (fs.existsSync(source)) {
				fs.copyFileSync(source, dest);
			}
		}

		await this.updateMeta();
	}

	private async collectBackupFiles(): Promise<Array<{ source: string; dest: string }>> {
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		const vaultPath = adapter.getBasePath();
		const configPath = `${vaultPath}/${this.configDir}`;
		const latestDir = this.getLatestDir();
		const fs = require("fs") as typeof import("fs");
		const result: Array<{ source: string; dest: string }> = [];

		const addConfigFile = (filename: string) => {
			result.push({
				source: `${configPath}/${filename}`,
				dest: `${latestDir}/${filename}`,
			});
		};

		if (this.settings.backupAppearance) {
			for (const f of CONFIG_FILES.appearance) {
				addConfigFile(f);
			}
			const themesDir = `${configPath}/themes`;
			if (fs.existsSync(themesDir)) {
				const themes = fs.readdirSync(themesDir);
				for (const theme of themes) {
					const themePath = `${themesDir}/${theme}`;
					if (fs.statSync(themePath).isDirectory()) {
						const files = fs.readdirSync(themePath);
						for (const f of files) {
							result.push({
								source: `${themePath}/${f}`,
								dest: `${latestDir}/themes/${theme}/${f}`,
							});
						}
					}
				}
			}
			const snippetsDir = `${configPath}/snippets`;
			if (fs.existsSync(snippetsDir)) {
				const files = fs.readdirSync(snippetsDir);
				for (const f of files) {
					if (f.endsWith(".css")) {
						result.push({
							source: `${snippetsDir}/${f}`,
							dest: `${latestDir}/snippets/${f}`,
						});
					}
				}
			}
		}

		if (this.settings.backupHotkeys) {
			for (const f of CONFIG_FILES.hotkeys) {
				addConfigFile(f);
			}
		}

		if (this.settings.backupCorePlugins) {
			for (const f of CONFIG_FILES.corePlugins) {
				addConfigFile(f);
			}
		}

		if (this.settings.backupCommunityPlugins) {
			for (const f of CONFIG_FILES.communityPlugins) {
				addConfigFile(f);
			}
			const pluginsDir = `${configPath}/plugins`;
			if (fs.existsSync(pluginsDir)) {
				const plugins = fs.readdirSync(pluginsDir);
				for (const pluginId of plugins) {
					const pluginPath = `${pluginsDir}/${pluginId}`;
					if (fs.statSync(pluginPath).isDirectory()) {
						const files = fs.readdirSync(pluginPath);
						for (const file of files) {
							const filePath = `${pluginPath}/${file}`;
							if (fs.statSync(filePath).isFile()) {
								result.push({
									source: filePath,
									dest: `${latestDir}/plugins/${pluginId}/${file}`,
								});
							}
						}
					}
				}
			}
		}

		if (this.settings.backupAppSettings) {
			for (const f of CONFIG_FILES.appSettings) {
				addConfigFile(f);
			}
		}

		if (this.settings.backupBookmarks) {
			for (const f of CONFIG_FILES.bookmarks) {
				addConfigFile(f);
			}
		}

		if (this.settings.backupGraph) {
			for (const f of CONFIG_FILES.graph) {
				addConfigFile(f);
			}
		}

		return result;
	}

	async createHistorySnapshot(): Promise<string | null> {
		const latestDir = this.getLatestDir();
		const historyDir = this.getHistoryDir();
		const fs = require("fs") as typeof import("fs");

		if (!fs.existsSync(latestDir)) {
			return null;
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const snapshotDir = `${historyDir}/${timestamp}`;
		fs.mkdirSync(snapshotDir, { recursive: true });

		this.copyDirRecursive(latestDir, snapshotDir);

		await this.cleanHistory();

		return timestamp;
	}

	private copyDirRecursive(src: string, dest: string): void {
		const fs = require("fs") as typeof import("fs");

		fs.mkdirSync(dest, { recursive: true });
		const entries = fs.readdirSync(src, { withFileTypes: true });

		for (const entry of entries) {
			const srcPath = `${src}/${entry.name}`;
			const destPath = `${dest}/${entry.name}`;

			if (entry.isDirectory()) {
				this.copyDirRecursive(srcPath, destPath);
			} else {
				fs.copyFileSync(srcPath, destPath);
			}
		}
	}

	private async cleanHistory(): Promise<void> {
		const historyDir = this.getHistoryDir();
		const fs = require("fs") as typeof import("fs");

		if (!fs.existsSync(historyDir)) return;

		const entries = fs.readdirSync(historyDir)
			.filter((e: string) => {
				return fs.statSync(`${historyDir}/${e}`).isDirectory();
			})
			.sort()
			.reverse();

		const maxCount = this.settings.historyRetentionCount;
		if (entries.length > maxCount) {
			for (let i = maxCount; i < entries.length; i++) {
				fs.rmSync(`${historyDir}/${entries[i]}`, { recursive: true, force: true });
			}
		}
	}

	private async updateMeta(): Promise<void> {
		const backupDir = this.getBackupDir();
		const latestDir = this.getLatestDir();
		const fs = require("fs") as typeof import("fs");

		const now = Date.now();
		const fileHashes: Record<string, string> = {};

		if (fs.existsSync(latestDir)) {
			this.computeHashes(latestDir, latestDir, fileHashes);
		}

		const meta: BackupMeta = {
			lastBackupTime: now,
			lastBackupTimeStr: new Date(now).toISOString(),
			fileHashes,
			version: "1.0.0",
		};

		fs.writeFileSync(
			`${backupDir}/${META_FILE_NAME}`,
			JSON.stringify(meta, null, 2),
			"utf-8"
		);
	}

	private computeHashes(baseDir: string, currentDir: string, hashes: Record<string, string>): void {
		const fs = require("fs") as typeof import("fs");
		const path = require("path") as typeof import("path");

		const entries = fs.readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = `${currentDir}/${entry.name}`;
			if (entry.isDirectory()) {
				this.computeHashes(baseDir, fullPath, hashes);
			} else {
				const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
				const content = fs.readFileSync(fullPath, "utf-8");
				hashes[relativePath] = this.simpleHash(content);
			}
		}
	}

	simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash |= 0;
		}
		return hash.toString(36);
	}

	async readMeta(): Promise<BackupMeta | null> {
		const backupDir = this.getBackupDir();
		const fs = require("fs") as typeof import("fs");

		const metaPath = `${backupDir}/${META_FILE_NAME}`;
		if (!fs.existsSync(metaPath)) {
			return null;
		}

		const content = fs.readFileSync(metaPath, "utf-8");
		return JSON.parse(content) as BackupMeta;
	}

	async getHistoryList(): Promise<string[]> {
		const historyDir = this.getHistoryDir();
		const fs = require("fs") as typeof import("fs");

		if (!fs.existsSync(historyDir)) {
			return [];
		}

		return fs.readdirSync(historyDir)
			.filter((e: string) => {
				return fs.statSync(`${historyDir}/${e}`).isDirectory();
			})
			.sort()
			.reverse();
	}
}
