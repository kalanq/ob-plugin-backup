export interface AddonSyncSettings {
	backupPath: string;
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
	historyRetentionCount: number;
}

export const DEFAULT_SETTINGS: AddonSyncSettings = {
	backupPath: "meta",
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
	historyRetentionCount: 10,
};

export interface BackupMeta {
	lastBackupTime: number;
	lastBackupTimeStr: string;
	fileHashes: Record<string, string>;
	version: string;
}

export type ChangeType = "added" | "modified" | "deleted";

export interface FileChange {
	path: string;
	relativePath: string;
	type: ChangeType;
}

export type SyncStatus = "synced" | "changed" | "syncing" | "error" | "no-backup";

export interface BackupCategory {
	key: keyof AddonSyncSettings;
	label: string;
	description: string;
}
