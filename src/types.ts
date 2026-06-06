export interface AddonBackupSettings {
	backupPath: string;
	localSnapshotPath: string;
	backupAppearance: boolean;
	backupHotkeys: boolean;
	backupCorePlugins: boolean;
	backupCommunityPlugins: boolean;
	backupAppSettings: boolean;
	backupBookmarks: boolean;
	backupGraph: boolean;
	autoBackupEnabled: boolean;
	autoBackupIntervalMinutes: number;
	autoBackupOnStartup: boolean;
	checkChangesOnStartup: boolean;
	syncHistoryRetentionCount: number;
	localSnapshotRetentionCount: number;
}

export const DEFAULT_SETTINGS: AddonBackupSettings = {
	backupPath: "meta",
	localSnapshotPath: ".ob-plugin-backup-local",
	backupAppearance: true,
	backupHotkeys: true,
	backupCorePlugins: true,
	backupCommunityPlugins: true,
	backupAppSettings: true,
	backupBookmarks: true,
	backupGraph: true,
	autoBackupEnabled: false,
	autoBackupIntervalMinutes: 30,
	autoBackupOnStartup: false,
	checkChangesOnStartup: true,
	syncHistoryRetentionCount: 10,
	localSnapshotRetentionCount: 5,
};

export interface BackupMeta {
	version: string;
	lastBackupTime: number;
	lastBackupTimeStr: string;
	fileHashes: Record<string, string>;
	changelog: string[];
	pluginVersions: Record<string, string>;
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