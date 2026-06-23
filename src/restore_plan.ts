import type {
	BackupMeta,
	PluginVersionDiff,
	RestoreCategory,
	RestoreCategoryGroup,
	RestoreDeviceGroup,
	RestorePreview,
} from "./types";
import { getIncludedPluginIds, readJsonFile, toVaultRelative } from "./file_utils";
import { META_FILE_NAME } from "./constants";
import { applyOwnPluginSettingsSnapshot, OWN_PLUGIN_SETTINGS_SYNC_PATH } from "./own_plugin_settings";
import { isSafeConfigRelativePath, normalizeConfigRelativePath, resolveConfigRelativePath } from "./safe_paths";
import { copySelectedArchiveFiles, isArchiveBackupPath, listArchiveFiles, readArchiveText } from "./archive_utils";

const fs = require("fs");
const path = require("path");

function collectRelativeFiles(rootDir: string): string[] {
	if (isArchiveBackupPath(rootDir)) return listArchiveFiles(rootDir);
	if (!fs.existsSync(rootDir)) return [];
	const result: string[] = [];

	const walk = (dir: string, prefix: string) => {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (!prefix && entry.name === META_FILE_NAME) continue;
			const fullPath = path.join(dir, entry.name);
			const relativePath = toVaultRelative(path.join(prefix, entry.name));
			if (entry.isDirectory()) {
				walk(fullPath, relativePath);
			} else if (entry.isFile() && isSafeConfigRelativePath(relativePath)) {
				result.push(normalizeConfigRelativePath(relativePath) || relativePath);
			}
		}
	};

	walk(rootDir, "");
	return result.sort();
}

function readPluginVersionFromManifest(configPath: string, pluginId: string): string {
	const manifestPath = path.join(configPath, "plugins", pluginId, "manifest.json");
	const manifest = readJsonFile<any>(manifestPath, null);
	return manifest?.version || "missing";
}

function readBackupPluginVersion(backupPath: string, meta: BackupMeta | null, pluginId: string): string {
	if (meta?.pluginVersions?.[pluginId]) return meta.pluginVersions[pluginId];
	if (isArchiveBackupPath(backupPath)) {
		const manifestText = readArchiveText(backupPath, `plugins/${pluginId}/manifest.json`);
		if (!manifestText) return "missing";
		try {
			const manifest = JSON.parse(manifestText);
			return manifest?.version || "missing";
		} catch {
			return "missing";
		}
	}
	const manifestPath = path.join(backupPath, "plugins", pluginId, "manifest.json");
	const manifest = readJsonFile<any>(manifestPath, null);
	return manifest?.version || "missing";
}

function normalizeBackupMeta(parsed: any): BackupMeta {
	return {
		...parsed,
		pluginVersions: parsed.pluginVersions || {},
		includedPluginIds: parsed.includedPluginIds || Object.keys(parsed.pluginVersions || {}),
		configDir: parsed.configDir || ".obsidian",
		deviceId: parsed.deviceId || "unknown-device",
		deviceName: parsed.deviceName || "Unknown device",
	};
}

function buildPluginVersionDiff(
	backupPath: string,
	configPath: string,
	meta: BackupMeta | null,
	pluginId: string,
): PluginVersionDiff {
	const backupVersion = readBackupPluginVersion(backupPath, meta, pluginId);
	const currentVersion = readPluginVersionFromManifest(configPath, pluginId);
	let status: PluginVersionDiff["status"] = "same";
	if (backupVersion === "missing") status = "missing-backup";
	else if (currentVersion === "missing") status = "missing-local";
	else if (backupVersion !== currentVersion) status = "different";

	return { id: pluginId, backupVersion, currentVersion, status };
}

export function readBackupMeta(backupPath: string, fallbackMeta: BackupMeta | null = null): BackupMeta | null {
	if (isArchiveBackupPath(backupPath)) {
		const archiveMeta = readArchiveText(backupPath, META_FILE_NAME);
		if (!archiveMeta) return fallbackMeta;
		try {
			return normalizeBackupMeta(JSON.parse(archiveMeta));
		} catch {
			return fallbackMeta;
		}
	}

	const metaPath = path.join(backupPath, META_FILE_NAME);
	if (!fs.existsSync(metaPath)) return fallbackMeta;
	try {
		const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8"));
		return normalizeBackupMeta(parsed);
	} catch {
		return fallbackMeta;
	}
}

export function getRestoreCategory(relativePath: string): RestoreCategory {
	if (relativePath.startsWith("plugins/")) return "communityPlugins";
	if (relativePath === "community-plugins.json") return "communityPlugins";
	if (relativePath.startsWith("themes/") || relativePath.startsWith("snippets/") || relativePath === "appearance.json") {
		return "appearance";
	}
	if (relativePath === "hotkeys.json") return "hotkeys";
	if (relativePath === "core-plugins.json" || relativePath === "core-plugins-migration.json") return "corePlugins";
	if (relativePath === "app.json") return "appSettings";
	if (relativePath === "bookmarks.json") return "bookmarks";
	if (relativePath === "graph.json") return "graph";
	return "other";
}

function getCategoryLabel(category: RestoreCategory): string {
	const labels: Record<RestoreCategory, string> = {
		communityPlugins: "Community Plugins",
		corePlugins: "Core Plugins",
		appearance: "Appearance",
		hotkeys: "Hotkeys",
		appSettings: "App Settings",
		bookmarks: "Bookmarks",
		graph: "Graph",
		other: "Other",
	};
	return labels[category];
}

function buildCategoryGroups(
	files: string[],
	pluginVersionDiffs: PluginVersionDiff[],
): RestoreCategoryGroup[] {
	const order: RestoreCategory[] = [
		"communityPlugins",
		"corePlugins",
		"appearance",
		"hotkeys",
		"appSettings",
		"bookmarks",
		"graph",
		"other",
	];

	return order
		.map((category) => {
			const categoryFiles = files.filter((file) => getRestoreCategory(file) === category);
			const pluginIds = getIncludedPluginIds(categoryFiles);
			return {
				key: category,
				label: getCategoryLabel(category),
				files: categoryFiles,
				pluginIds,
				pluginVersionDiffs: pluginVersionDiffs.filter((diff) => pluginIds.includes(diff.id)),
			};
		})
		.filter((group) => group.files.length > 0);
}

export function createRestorePreview(
	backupPath: string,
	configPath: string,
	configDirName: string,
	fallbackMeta: BackupMeta | null = null,
	currentDeviceId = "",
	currentDeviceName = "",
): RestorePreview {
	const files = collectRelativeFiles(backupPath);
	const meta = readBackupMeta(backupPath, fallbackMeta);
	const pluginIds = (meta?.includedPluginIds?.length ? meta.includedPluginIds : getIncludedPluginIds(files))
		.slice()
		.sort();
	const deviceId = meta?.deviceId || "unknown-device";
	const deviceName = meta?.deviceName || "Unknown device";
	const pluginVersionDiffs = pluginIds.map((pluginId) =>
		buildPluginVersionDiff(backupPath, configPath, meta, pluginId)
	);
	const groups: RestoreDeviceGroup[] = [{
		deviceId,
		deviceName,
		isCurrentDevice: currentDeviceId ? deviceId === currentDeviceId : false,
		files,
		categories: buildCategoryGroups(files, pluginVersionDiffs),
	}];

	return {
		backupPath,
		configDirName,
		files,
		pluginIds,
		pluginVersionDiffs,
		meta,
		deviceId,
		deviceName: deviceName || currentDeviceName || "Unknown device",
		groups,
	};
}

export function copySelectedRestoreFiles(
	backupPath: string,
	configPath: string,
	selectedRelativePaths: string[],
): void {
	if (isArchiveBackupPath(backupPath)) {
		copySelectedArchiveFiles(backupPath, configPath, selectedRelativePaths);
		return;
	}

	const selected = Array.from(new Set(selectedRelativePaths)).sort();
	for (const relativePath of selected) {
		const safeRelativePath = normalizeConfigRelativePath(relativePath);
		if (!safeRelativePath || !isSafeConfigRelativePath(safeRelativePath)) continue;
		const destPath = resolveConfigRelativePath(configPath, safeRelativePath);
		if (!destPath) continue;
		const srcPath = path.join(backupPath, safeRelativePath);
		if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) continue;
		if (safeRelativePath === OWN_PLUGIN_SETTINGS_SYNC_PATH) {
			applyOwnPluginSettingsSnapshot(configPath, srcPath);
			continue;
		}
		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		fs.copyFileSync(srcPath, destPath);
	}
}
