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

const fs = require("fs");
const path = require("path");

function collectRelativeFiles(rootDir: string): string[] {
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
			} else if (entry.isFile()) {
				result.push(relativePath);
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
	const manifestPath = path.join(backupPath, "plugins", pluginId, "manifest.json");
	const manifest = readJsonFile<any>(manifestPath, null);
	return manifest?.version || "missing";
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
	const metaPath = path.join(backupPath, META_FILE_NAME);
	if (!fs.existsSync(metaPath)) return fallbackMeta;
	try {
		const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8"));
		return {
			...parsed,
			pluginVersions: parsed.pluginVersions || {},
			includedPluginIds: parsed.includedPluginIds || Object.keys(parsed.pluginVersions || {}),
			configDir: parsed.configDir || ".obsidian",
			deviceId: parsed.deviceId || "unknown-device",
			deviceName: parsed.deviceName || "Unknown device",
		};
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
	const selected = Array.from(new Set(selectedRelativePaths)).sort();
	for (const relativePath of selected) {
		if (relativePath === META_FILE_NAME) continue;
		const srcPath = path.join(backupPath, relativePath);
		const destPath = path.join(configPath, relativePath);
		if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) continue;
		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		fs.copyFileSync(srcPath, destPath);
	}
}
