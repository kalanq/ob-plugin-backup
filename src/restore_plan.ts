import type {
	BackupMeta,
	PluginVersionDiff,
	RestoreCategory,
	RestoreCategoryGroup,
	RestoreFileInfo,
	RestoreDeviceGroup,
	RestorePathWarning,
	RestorePreview,
} from "./types";
import { getIncludedPluginIds, readJsonFile, simpleHash, toVaultRelative } from "./file_utils";
import { CONFIG_FILES, META_FILE_NAME } from "./constants";
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

function readBackupFileText(backupPath: string, relativePath: string): string | null {
	const normalized = normalizeConfigRelativePath(relativePath);
	if (!normalized) return null;
	if (isArchiveBackupPath(backupPath)) return readArchiveText(backupPath, normalized);
	const filePath = path.join(backupPath, normalized);
	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
}

function readLocalFileText(configPath: string, relativePath: string): string | null {
	const localPath = resolveConfigRelativePath(configPath, relativePath);
	if (!localPath || !fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) return null;
	try {
		return fs.readFileSync(localPath, "utf8");
	} catch {
		return null;
	}
}

function getRestoreFileStatus(backupPath: string, configPath: string, relativePath: string): RestoreFileInfo["status"] {
	const backupText = readBackupFileText(backupPath, relativePath);
	const localText = readLocalFileText(configPath, relativePath);
	if (localText === null) return "missing-local";
	if (backupText !== null && simpleHash(backupText) === simpleHash(localText)) return "same";
	return "different";
}

function classifyAbsolutePath(value: string): RestorePathWarning["kind"] | null {
	if (/^file:\/\//i.test(value)) return "file-url";
	if (/^\\\\/.test(value)) return "unc";
	if (/^[A-Za-z]:[\\/]/.test(value)) return "windows";
	if (/^\//.test(value)) return "posix";
	return null;
}

function pointerEscape(segment: string): string {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function collectAbsolutePathWarningsFromJson(value: unknown, jsonPath = ""): RestorePathWarning[] {
	const warnings: RestorePathWarning[] = [];
	if (typeof value === "string") {
		const kind = classifyAbsolutePath(value);
		if (kind) {
			let existsOnThisDevice = false;
			try {
				const filePath = kind === "file-url" ? new URL(value) : value;
				existsOnThisDevice = fs.existsSync(filePath as any);
			} catch {
				existsOnThisDevice = false;
			}
			warnings.push({
				jsonPath: jsonPath || "/",
				value,
				kind,
				existsOnThisDevice,
			});
		}
		return warnings;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			warnings.push(...collectAbsolutePathWarningsFromJson(item, `${jsonPath}/${index}`));
		});
		return warnings;
	}
	if (value && typeof value === "object") {
		for (const [key, item] of Object.entries(value)) {
			warnings.push(...collectAbsolutePathWarningsFromJson(item, `${jsonPath}/${pointerEscape(key)}`));
		}
	}
	return warnings;
}

function getPathWarnings(backupPath: string, relativePath: string): RestorePathWarning[] {
	if (!relativePath.endsWith(".json")) return [];
	const text = readBackupFileText(backupPath, relativePath);
	if (!text) return [];
	try {
		return collectAbsolutePathWarningsFromJson(JSON.parse(text));
	} catch {
		return [];
	}
}

function buildFileInfos(backupPath: string, configPath: string, files: string[]): Record<string, RestoreFileInfo> {
	const result: Record<string, RestoreFileInfo> = {};
	for (const file of files) {
		result[file] = {
			path: file,
			status: getRestoreFileStatus(backupPath, configPath, file),
			pathWarnings: getPathWarnings(backupPath, file),
		};
	}
	return result;
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
	if (CONFIG_FILES.corePlugins.includes(relativePath)) return "corePlugins";
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
	const allFiles = collectRelativeFiles(backupPath);
	const fileInfos = buildFileInfos(backupPath, configPath, allFiles);
	const files = allFiles.filter((file) => fileInfos[file]?.status !== "same");
	const unchangedFiles = allFiles.filter((file) => fileInfos[file]?.status === "same");
	const meta = readBackupMeta(backupPath, fallbackMeta);
	const pluginIds = (meta?.includedPluginIds?.length ? meta.includedPluginIds : getIncludedPluginIds(allFiles))
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
	const allGroups: RestoreDeviceGroup[] = [{
		deviceId,
		deviceName,
		isCurrentDevice: currentDeviceId ? deviceId === currentDeviceId : false,
		files: allFiles,
		categories: buildCategoryGroups(allFiles, pluginVersionDiffs),
	}];

	return {
		backupPath,
		configDirName,
		files,
		allFiles,
		unchangedFiles,
		fileInfos,
		pluginIds,
		pluginVersionDiffs,
		meta,
		deviceId,
		deviceName: deviceName || currentDeviceName || "Unknown device",
		groups,
		allGroups,
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
