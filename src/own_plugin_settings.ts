import type { AddonBackupSettings } from "./types";

const fs = require("fs");
const path = require("path");

export const OWN_PLUGIN_ID = "ob-plugin-backup";
export const OWN_PLUGIN_DATA_PATH = "plugins/ob-plugin-backup/data.json";
export const OWN_PLUGIN_SETTINGS_SYNC_PATH = "plugins/ob-plugin-backup/synced-settings.json";

const SAFE_SYNC_SETTING_KEYS: Array<keyof AddonBackupSettings> = [
	"language",
	"backupFormat",
	"backupAppearance",
	"backupHotkeys",
	"backupCorePlugins",
	"backupCommunityPlugins",
	"communityPluginSelectionMode",
	"selectedCommunityPluginIds",
	"communityPluginDataMode",
	"selectedCommunityPluginDataIds",
	"syncOwnPluginSettings",
	"backupAppSettings",
	"backupBookmarks",
	"backupGraph",
	"autoBackupEnabled",
	"autoBackupIntervalMinutes",
	"autoBackupOnStartup",
	"checkChangesOnStartup",
	"syncHistoryRetentionCount",
	"localSnapshotRetentionCount",
];

export interface OwnPluginSettingsSnapshot {
	version: 1;
	syncedAt: string;
	settings: Partial<AddonBackupSettings>;
}

export function buildOwnPluginSettingsSnapshot(settings: AddonBackupSettings): OwnPluginSettingsSnapshot {
	const safeSettings: Partial<AddonBackupSettings> = {};
	for (const key of SAFE_SYNC_SETTING_KEYS) {
		(safeSettings as any)[key] = (settings as any)[key];
	}

	return {
		version: 1,
		syncedAt: new Date().toISOString(),
		settings: safeSettings,
	};
}

export function applyOwnPluginSettingsSnapshot(configPath: string, snapshotPath: string): void {
	if (!fs.existsSync(snapshotPath)) return;

	applyOwnPluginSettingsSnapshotContent(configPath, fs.readFileSync(snapshotPath, "utf8"));
}

export function applyOwnPluginSettingsSnapshotContent(configPath: string, content: string): void {
	const snapshot = JSON.parse(content) as OwnPluginSettingsSnapshot;
	if (!snapshot || snapshot.version !== 1 || !snapshot.settings) return;

	const dataPath = path.join(configPath, OWN_PLUGIN_DATA_PATH);
	let currentData: Record<string, unknown> = {};
	if (fs.existsSync(dataPath)) {
		try {
			currentData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
		} catch {
			currentData = {};
		}
	}

	for (const key of SAFE_SYNC_SETTING_KEYS) {
		if (Object.prototype.hasOwnProperty.call(snapshot.settings, key)) {
			currentData[key] = (snapshot.settings as any)[key];
		}
	}

	fs.mkdirSync(path.dirname(dataPath), { recursive: true });
	fs.writeFileSync(dataPath, JSON.stringify(currentData, null, 2));
}
