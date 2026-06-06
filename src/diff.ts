import { App } from "obsidian";
import type { AddonBackupSettings, FileChange, BackupMeta } from "./types";
import { BackupManager } from "./backup";
import { CONFIG_FILES } from "./constants";

const fs = require("fs");
const path = require("path");

export class DiffChecker {
	private app: App;
	private settings: AddonBackupSettings;
	private backupManager: BackupManager;

	constructor(app: App, settings: AddonBackupSettings, backupManager: BackupManager) {
		this.app = app;
		this.settings = settings;
		this.backupManager = backupManager;
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

	async checkChanges(): Promise<FileChange[]> {
		const meta = await this.backupManager.readMeta();
		if (!meta) return [];

		const configPath = this.getConfigPath();
		const currentFiles = this.collectCurrentConfigFiles(configPath);
		const changes: FileChange[] = [];

		for (const relativePath of currentFiles) {
			const fullPath = path.join(configPath, relativePath);
			const content = fs.readFileSync(fullPath, "utf8");
			const hash = this.simpleHash(content);

			if (!meta.fileHashes[relativePath]) {
				changes.push({ path: fullPath, relativePath, type: "added" });
			} else if (meta.fileHashes[relativePath] !== hash) {
				changes.push({ path: fullPath, relativePath, type: "modified" });
			}
		}

		for (const relativePath of Object.keys(meta.fileHashes)) {
			const fullPath = path.join(configPath, relativePath);
			if (!fs.existsSync(fullPath)) {
				changes.push({ path: fullPath, relativePath, type: "deleted" });
			}
		}

		return changes;
	}

	async hasChanges(): Promise<boolean> {
		const changes = await this.checkChanges();
		return changes.length > 0;
	}

	async getChangeSummary(): Promise<string> {
		const changes = await this.checkChanges();
		if (changes.length === 0) return "No changes detected.";

		const lines = changes.map((c) => {
			const prefix = c.type === "added" ? "+" : c.type === "deleted" ? "-" : "~";
			return `${prefix} ${c.relativePath}`;
		});
		return lines.join("\n");
	}

	private collectCurrentConfigFiles(configPath: string): string[] {
		const result: string[] = [];
		const addIfExists = (file: string) => {
			if (fs.existsSync(path.join(configPath, file))) {
				result.push(file);
			}
		};

		if (this.settings.backupAppearance) {
			for (const f of CONFIG_FILES.appearance) addIfExists(f);
			const themesDir = path.join(configPath, "themes");
			if (fs.existsSync(themesDir)) {
				this.collectDirFilesRecursive(themesDir, "themes", result);
			}
			const snippetsDir = path.join(configPath, "snippets");
			if (fs.existsSync(snippetsDir)) {
				this.collectDirFilesRecursive(snippetsDir, "snippets", result);
			}
		}

		if (this.settings.backupHotkeys) {
			for (const f of CONFIG_FILES.hotkeys) addIfExists(f);
		}

		if (this.settings.backupCorePlugins) {
			for (const f of CONFIG_FILES.corePlugins) addIfExists(f);
		}

		if (this.settings.backupCommunityPlugins) {
			for (const f of CONFIG_FILES.communityPlugins) addIfExists(f);
			const pluginsDir = path.join(configPath, "plugins");
			if (fs.existsSync(pluginsDir)) {
				const plugins = fs.readdirSync(pluginsDir);
				for (const pluginId of plugins) {
					const pluginPath = path.join(pluginsDir, pluginId);
					if (fs.statSync(pluginPath).isDirectory()) {
						const files = fs.readdirSync(pluginPath);
						for (const file of files) {
							const fullPath = path.join(pluginPath, file);
							if (fs.statSync(fullPath).isFile()) {
								result.push(`plugins/${pluginId}/${file}`);
							}
						}
					}
				}
			}
		}

		if (this.settings.backupAppSettings) {
			for (const f of CONFIG_FILES.appSettings) addIfExists(f);
		}

		if (this.settings.backupBookmarks) {
			for (const f of CONFIG_FILES.bookmarks) addIfExists(f);
		}

		if (this.settings.backupGraph) {
			for (const f of CONFIG_FILES.graph) addIfExists(f);
		}

		return result;
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

	private collectDirFilesRecursive(dir: string, prefix: string, result: string[]): void {
		for (const entry of fs.readdirSync(dir)) {
			const fullPath = path.join(dir, entry);
			if (fs.statSync(fullPath).isDirectory()) {
				this.collectDirFilesRecursive(fullPath, `${prefix}/${entry}`, result);
			} else if (fs.statSync(fullPath).isFile()) {
				result.push(`${prefix}/${entry}`);
			}
		}
	}
}