import { App, Notice, FileSystemAdapter } from "obsidian";
import type { AddonSyncSettings, BackupMeta, FileChange, ChangeType } from "./types";
import { BackupManager } from "./backup";
import { CONFIG_FILES } from "./constants";

export class DiffChecker {
	private app: App;
	private settings: AddonSyncSettings;
	private backupManager: BackupManager;
	private configDir: string;

	constructor(app: App, settings: AddonSyncSettings, backupManager: BackupManager) {
		this.app = app;
		this.settings = settings;
		this.backupManager = backupManager;
		this.configDir = (app.vault as any).configDir || ".obsidian";
	}

	updateSettings(settings: AddonSyncSettings) {
		this.settings = settings;
	}

	async checkChanges(): Promise<FileChange[]> {
		const meta = await this.backupManager.readMeta();
		if (!meta) {
			return [];
		}

		const latestDir = this.backupManager.getLatestDir();
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		const vaultPath = adapter.getBasePath();
		const configPath = `${vaultPath}/${this.configDir}`;
		const fs = require("fs") as typeof import("fs");
		const path = require("path") as typeof import("path");
		const changes: FileChange[] = [];

		for (const [relativePath, backupHash] of Object.entries(meta.fileHashes)) {
			const currentPath = `${configPath}/${relativePath}`;

			if (!fs.existsSync(currentPath)) {
				changes.push({
					path: currentPath,
					relativePath,
					type: "deleted",
				});
				continue;
			}

			const currentContent = fs.readFileSync(currentPath, "utf-8");
			const currentHash = this.backupManager.simpleHash(currentContent);

			if (currentHash !== backupHash) {
				changes.push({
					path: currentPath,
					relativePath,
					type: "modified",
				});
			}
		}

		const currentFiles = this.collectCurrentConfigFiles(configPath);
		for (const relPath of currentFiles) {
			if (!(relPath in meta.fileHashes)) {
				changes.push({
					path: `${configPath}/${relPath}`,
					relativePath: relPath,
					type: "added",
				});
			}
		}

		return changes;
	}

	private collectCurrentConfigFiles(configPath: string): string[] {
		const fs = require("fs") as typeof import("fs");
		const result: string[] = [];

		const addIfExists = (relativePath: string) => {
			if (fs.existsSync(`${configPath}/${relativePath}`)) {
				result.push(relativePath);
			}
		};

		if (this.settings.backupAppearance) {
			for (const f of CONFIG_FILES.appearance) {
				addIfExists(f);
			}
			const themesDir = `${configPath}/themes`;
			if (fs.existsSync(themesDir)) {
				const themes = fs.readdirSync(themesDir);
				for (const theme of themes) {
					const themePath = `${themesDir}/${theme}`;
					if (fs.statSync(themePath).isDirectory()) {
						const files = fs.readdirSync(themePath);
						for (const f of files) {
							const rel = `themes/${theme}/${f}`;
							if (fs.statSync(`${themePath}/${f}`).isFile()) {
								result.push(rel);
							}
						}
					}
				}
			}
			const snippetsDir = `${configPath}/snippets`;
			if (fs.existsSync(snippetsDir)) {
				const files = fs.readdirSync(snippetsDir);
				for (const f of files) {
					if (f.endsWith(".css")) {
						result.push(`snippets/${f}`);
					}
				}
			}
		}

		if (this.settings.backupHotkeys) {
			for (const f of CONFIG_FILES.hotkeys) {
				addIfExists(f);
			}
		}

		if (this.settings.backupCorePlugins) {
			for (const f of CONFIG_FILES.corePlugins) {
				addIfExists(f);
			}
		}

		if (this.settings.backupCommunityPlugins) {
			for (const f of CONFIG_FILES.communityPlugins) {
				addIfExists(f);
			}
			const pluginsDir = `${configPath}/plugins`;
			if (fs.existsSync(pluginsDir)) {
				const plugins = fs.readdirSync(pluginsDir);
				for (const pluginId of plugins) {
					const pluginPath = `${pluginsDir}/${pluginId}`;
					if (fs.statSync(pluginPath).isDirectory()) {
						const files = fs.readdirSync(pluginPath);
						for (const file of files) {
							const fullPath = `${pluginPath}/${file}`;
							if (fs.statSync(fullPath).isFile()) {
								result.push(`plugins/${pluginId}/${file}`);
							}
						}
					}
				}
			}
		}

		if (this.settings.backupAppSettings) {
			for (const f of CONFIG_FILES.appSettings) {
				addIfExists(f);
			}
		}

		if (this.settings.backupBookmarks) {
			for (const f of CONFIG_FILES.bookmarks) {
				addIfExists(f);
			}
		}

		if (this.settings.backupGraph) {
			for (const f of CONFIG_FILES.graph) {
				addIfExists(f);
			}
		}

		return result;
	}

	async getChangeSummary(): Promise<string> {
		const changes = await this.checkChanges();

		if (changes.length === 0) {
			return "No changes detected. Config is in sync with backup.";
		}

		const lines: string[] = [`${changes.length} change(s) detected:\n`];

		for (const change of changes) {
			const typeLabel = change.type === "added" ? "[+]" : change.type === "modified" ? "[~]" : "[-]";
			lines.push(`${typeLabel} ${change.relativePath}`);
		}

		return lines.join("\n");
	}

	async hasChanges(): Promise<boolean> {
		const changes = await this.checkChanges();
		return changes.length > 0;
	}
}
