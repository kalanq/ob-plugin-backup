import type { AddonBackupSettings, BackupFile, InstalledCommunityPlugin } from "./types";
import { CONFIG_FILES } from "./constants";
import { OWN_PLUGIN_DATA_PATH, OWN_PLUGIN_ID, OWN_PLUGIN_SETTINGS_SYNC_PATH } from "./own_plugin_settings";

const fs = require("fs");
const path = require("path");

export function toVaultRelative(filePath: string): string {
	return filePath.replace(/\\/g, "/");
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
	try {
		if (!fs.existsSync(filePath)) return fallback;
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return fallback;
	}
}

export function getEnabledCommunityPluginIds(configPath: string): Set<string> {
	const enabled = readJsonFile<string[]>(path.join(configPath, "community-plugins.json"), []);
	return new Set(Array.isArray(enabled) ? enabled : []);
}

export function getInstalledCommunityPlugins(configPath: string): InstalledCommunityPlugin[] {
	const pluginsDir = path.join(configPath, "plugins");
	const enabledIds = getEnabledCommunityPluginIds(configPath);
	if (!fs.existsSync(pluginsDir)) return [];

	return fs.readdirSync(pluginsDir)
		.filter((pluginId: string) => fs.statSync(path.join(pluginsDir, pluginId)).isDirectory())
		.map((pluginId: string) => {
			const manifestPath = path.join(pluginsDir, pluginId, "manifest.json");
			const manifest = readJsonFile<any>(manifestPath, {});
			return {
				id: pluginId,
				name: manifest.name || pluginId,
				version: manifest.version || "unknown",
				enabled: enabledIds.has(pluginId),
			};
		})
		.sort((a: InstalledCommunityPlugin, b: InstalledCommunityPlugin) => a.name.localeCompare(b.name));
}

export function shouldIncludeCommunityPlugin(
	settings: AddonBackupSettings,
	pluginId: string,
): boolean {
	if (settings.communityPluginSelectionMode !== "selected") return true;
	return settings.selectedCommunityPluginIds.includes(pluginId);
}

export function shouldIncludeCommunityPluginData(
	settings: AddonBackupSettings,
	pluginId: string,
): boolean {
	const mode = settings.communityPluginDataMode || "all";
	if (mode === "none") return false;
	if (mode === "selected") return settings.selectedCommunityPluginDataIds.includes(pluginId);
	return true;
}

function shouldSkipPluginFile(
	settings: AddonBackupSettings,
	pluginId: string,
	relativePath: string,
): boolean {
	if (relativePath === OWN_PLUGIN_SETTINGS_SYNC_PATH) return true;
	if (pluginId === OWN_PLUGIN_ID && relativePath === OWN_PLUGIN_DATA_PATH) {
		return !settings.backupOwnPluginData;
	}
	return relativePath.endsWith("/data.json") && !shouldIncludeCommunityPluginData(settings, pluginId);
}

export function collectBackupFiles(
	configPath: string,
	destRoot: string,
	settings: AddonBackupSettings,
): BackupFile[] {
	const result: BackupFile[] = [];

	const addConfigFile = (file: string) => {
		const src = path.join(configPath, file);
		if (fs.existsSync(src)) {
			result.push({ source: src, dest: path.join(destRoot, file), relativePath: file });
		}
	};

	const addDirFiles = (srcDir: string, relativePrefix: string) => {
		if (!fs.existsSync(srcDir)) return;
		const entries = fs.readdirSync(srcDir).sort();
		for (const entry of entries) {
			const srcPath = path.join(srcDir, entry);
			const relativePath = toVaultRelative(path.join(relativePrefix, entry));
			const pluginMatch = relativePath.match(/^plugins\/([^/]+)\//);
			if (pluginMatch && shouldSkipPluginFile(settings, pluginMatch[1], relativePath)) {
				continue;
			}
			if (fs.statSync(srcPath).isDirectory()) {
				addDirFiles(srcPath, relativePath);
			} else if (fs.statSync(srcPath).isFile()) {
				result.push({
					source: srcPath,
					dest: path.join(destRoot, relativePath),
					relativePath,
				});
			}
		}
	};

	if (settings.backupAppearance) {
		for (const f of CONFIG_FILES.appearance) addConfigFile(f);
		addDirFiles(path.join(configPath, "themes"), "themes");
		addDirFiles(path.join(configPath, "snippets"), "snippets");
	}

	if (settings.backupHotkeys) {
		for (const f of CONFIG_FILES.hotkeys) addConfigFile(f);
	}

	if (settings.backupCorePlugins) {
		for (const f of CONFIG_FILES.corePlugins) addConfigFile(f);
	}

	if (settings.backupCommunityPlugins) {
		for (const f of CONFIG_FILES.communityPlugins) addConfigFile(f);
		const pluginsDir = path.join(configPath, "plugins");
		if (fs.existsSync(pluginsDir)) {
			const plugins = fs.readdirSync(pluginsDir).sort();
			for (const pluginId of plugins) {
				const pluginPath = path.join(pluginsDir, pluginId);
				if (
					fs.statSync(pluginPath).isDirectory()
					&& shouldIncludeCommunityPlugin(settings, pluginId)
				) {
					addDirFiles(pluginPath, toVaultRelative(path.join("plugins", pluginId)));
				}
			}
		}
	}

	if (settings.backupAppSettings) {
		for (const f of CONFIG_FILES.appSettings) addConfigFile(f);
	}

	if (settings.backupBookmarks) {
		for (const f of CONFIG_FILES.bookmarks) addConfigFile(f);
	}

	if (settings.backupGraph) {
		for (const f of CONFIG_FILES.graph) addConfigFile(f);
	}

	return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function getIncludedPluginIds(files: BackupFile[] | string[]): string[] {
	const ids = new Set<string>();
	for (const file of files) {
		const relativePath = typeof file === "string" ? file : file.relativePath;
		if (relativePath === OWN_PLUGIN_SETTINGS_SYNC_PATH) continue;
		const match = relativePath.match(/^plugins\/([^/]+)\//);
		if (match) ids.add(match[1]);
	}
	return Array.from(ids).sort();
}

export function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0;
	}
	return hash.toString(16);
}
