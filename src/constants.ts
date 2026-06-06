import type { BackupCategory } from "./types";

export const BACKUP_DIR_NAME = "addon-sync-backup";
export const LATEST_DIR_NAME = "latest";
export const HISTORY_DIR_NAME = "history";
export const META_FILE_NAME = "meta.json";

export const CONFIG_FILES = {
	appearance: ["appearance.json"],
	hotkeys: ["hotkeys.json"],
	corePlugins: ["core-plugins.json", "core-plugins-migration.json"],
	communityPlugins: ["community-plugins.json"],
	appSettings: ["app.json"],
	bookmarks: ["bookmarks.json"],
	graph: ["graph.json"],
} as const;

export const CONFIG_DIRS = {
	appearance: {
		dirs: ["themes", "snippets"],
		filesInDirs: {
			themes: ["manifest.json", "theme.css"],
			snippets: ["*.css"],
		},
	},
	communityPlugins: {
		dir: "plugins",
		filesInPluginDir: ["data.json", "manifest.json"],
	},
} as const;

export const BACKUP_CATEGORIES: BackupCategory[] = [
	{
		key: "backupAppearance",
		label: "Appearance & Themes",
		description: "appearance.json, themes/, snippets/",
	},
	{
		key: "backupHotkeys",
		label: "Hotkeys",
		description: "hotkeys.json",
	},
	{
		key: "backupCorePlugins",
		label: "Core Plugins",
		description: "core-plugins.json",
	},
	{
		key: "backupCommunityPlugins",
		label: "Community Plugins",
		description: "community-plugins.json, plugins/*/data.json",
	},
	{
		key: "backupAppSettings",
		label: "App Settings",
		description: "app.json (editor, files & links)",
	},
	{
		key: "backupBookmarks",
		label: "Bookmarks",
		description: "bookmarks.json",
	},
	{
		key: "backupGraph",
		label: "Graph Settings",
		description: "graph.json",
	},
];

export const COMMANDS = {
	CREATE_BACKUP: "addon-sync-create-backup",
	RESTORE_LATEST: "addon-sync-restore-latest",
	RESTORE_FROM_HISTORY: "addon-sync-restore-from-history",
	CHECK_CHANGES: "addon-sync-check-changes",
} as const;
