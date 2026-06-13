export interface AddonBackupSettings {
	backupPath: string;
	localSnapshotPath: string;
	backupAppearance: boolean;
	backupHotkeys: boolean;
	backupCorePlugins: boolean;
	backupCommunityPlugins: boolean;
	communityPluginSelectionMode: CommunityPluginSelectionMode;
	selectedCommunityPluginIds: string[];
	backupOwnPluginData: boolean;
	backupAppSettings: boolean;
	backupBookmarks: boolean;
	backupGraph: boolean;
	autoBackupEnabled: boolean;
	autoBackupIntervalMinutes: number;
	autoBackupOnStartup: boolean;
	checkChangesOnStartup: boolean;
	syncHistoryRetentionCount: number;
	localSnapshotRetentionCount: number;
	initialSetupCompleted: boolean;
	firstBackupCompleted: boolean;
	deviceId: string;
	deviceName: string;
}

export type CommunityPluginSelectionMode = "all" | "selected";

export const DEFAULT_SETTINGS: AddonBackupSettings = {
	backupPath: "meta",
	localSnapshotPath: ".ob-plugin-backup-local",
	backupAppearance: true,
	backupHotkeys: true,
	backupCorePlugins: true,
	backupCommunityPlugins: true,
	communityPluginSelectionMode: "all",
	selectedCommunityPluginIds: [],
	backupOwnPluginData: false,
	backupAppSettings: true,
	backupBookmarks: true,
	backupGraph: true,
	autoBackupEnabled: false,
	autoBackupIntervalMinutes: 30,
	autoBackupOnStartup: false,
	checkChangesOnStartup: true,
	syncHistoryRetentionCount: 10,
	localSnapshotRetentionCount: 5,
	initialSetupCompleted: false,
	firstBackupCompleted: false,
	deviceId: "",
	deviceName: "",
};

export interface BackupMeta {
	version: string;
	lastBackupTime: number;
	lastBackupTimeStr: string;
	fileHashes: Record<string, string>;
	changelog: string[];
	pluginVersions: Record<string, string>;
	includedPluginIds: string[];
	configDir: string;
	deviceId: string;
	deviceName: string;
}

export type ChangeType = "added" | "modified" | "deleted";

export interface FileChange {
	path: string;
	relativePath: string;
	type: ChangeType;
}

export type SyncStatus = "synced" | "changed" | "syncing" | "error" | "no-backup";

export interface BackupCategory {
	key: keyof AddonBackupSettings;
	label: string;
	description: string;
}

export interface HistoryEntry {
	timestamp: string;
	displayName: string;
	changelog: string[];
	pluginVersions: Record<string, string>;
}

export interface InstalledCommunityPlugin {
	id: string;
	name: string;
	version: string;
	enabled: boolean;
}

export interface BackupFile {
	source: string;
	dest: string;
	relativePath: string;
}

export interface PluginVersionDiff {
	id: string;
	backupVersion: string;
	currentVersion: string;
	status: "same" | "different" | "missing-local" | "missing-backup";
}

export interface RestorePreview {
	backupPath: string;
	configDirName: string;
	files: string[];
	pluginIds: string[];
	pluginVersionDiffs: PluginVersionDiff[];
	meta: BackupMeta | null;
	deviceId: string;
	deviceName: string;
	groups: RestoreDeviceGroup[];
}

export type RestoreCategory =
	| "communityPlugins"
	| "corePlugins"
	| "appearance"
	| "hotkeys"
	| "appSettings"
	| "bookmarks"
	| "graph"
	| "other";

export interface RestoreCategoryGroup {
	key: RestoreCategory;
	label: string;
	files: string[];
	pluginIds: string[];
	pluginVersionDiffs: PluginVersionDiff[];
}

export interface RestoreDeviceGroup {
	deviceId: string;
	deviceName: string;
	isCurrentDevice: boolean;
	files: string[];
	categories: RestoreCategoryGroup[];
}
