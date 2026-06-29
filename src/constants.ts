import type { BackupCategory } from "./types";

export const BACKUP_DIR_NAME = "ob-plugin-backup";
export const LATEST_DIR_NAME = "latest";
export const LATEST_ARCHIVE_NAME = "latest.zip";
export const HISTORY_DIR_NAME = "history";
export const META_FILE_NAME = "meta.json";
export const LOCAL_SNAPSHOT_DIR_NAME = "ob-plugin-backup-local";

export const CONFIG_FILES: Record<string, string[]> = {
	appearance: ["appearance.json"],
	hotkeys: ["hotkeys.json"],
	corePlugins: [
		"core-plugins.json",
		"core-plugins-migration.json",
		"daily-notes.json",
		"templates.json",
		"backlink.json",
		"page-preview.json",
		"switcher.json",
		"command-palette.json",
		"slash-command.json",
		"tag-pane.json",
		"outline.json",
		"file-recovery.json",
		"note-composer.json",
		"canvas.json",
		"audio-recorder.json",
		"workspaces.json",
		"markdown-importer.json",
		"publish.json",
		"sync.json",
		"properties.json",
		"webviewer.json",
		"bases.json",
		"footnotes.json",
		"slides.json",
	],
	communityPlugins: ["community-plugins.json"],
	appSettings: ["app.json"],
	bookmarks: ["bookmarks.json"],
	graph: ["graph.json"],
};

export const BACKUP_CATEGORIES: BackupCategory[] = [
	{ key: "backupAppearance", label: "Appearance & Theme", description: "appearance.json, themes/, snippets/" },
	{ key: "backupHotkeys", label: "Custom Hotkeys", description: "hotkeys.json" },
	{ key: "backupCorePlugins", label: "Core Plugins", description: "core plugin enablement plus user settings such as daily-notes.json and templates.json" },
	{ key: "backupCommunityPlugins", label: "Community Plugins", description: "community-plugins.json and selected plugin files; data.json is controlled separately" },
	{ key: "backupAppSettings", label: "App Settings", description: "app.json (editor, links, files)" },
	{ key: "backupBookmarks", label: "Bookmarks", description: "bookmarks.json" },
	{ key: "backupGraph", label: "Graph Settings", description: "graph.json" },
];

export const COMMANDS = {
	CREATE_BACKUP: "ob-plugin-backup-create-backup",
	CREATE_LOCAL_SNAPSHOT: "ob-plugin-backup-create-local-snapshot",
	RESTORE_LATEST: "ob-plugin-backup-restore-latest",
	RESTORE_FROM_HISTORY: "ob-plugin-backup-restore-from-history",
	RESTORE_LAST_PRE_RESTORE: "ob-plugin-backup-restore-last-pre-restore",
	CHECK_CHANGES: "ob-plugin-backup-check-changes",
};

export const INTERVAL_OPTIONS = [
	{ value: 5, label: "5 minutes" },
	{ value: 10, label: "10 minutes" },
	{ value: 15, label: "15 minutes" },
	{ value: 30, label: "30 minutes" },
	{ value: 60, label: "1 hour" },
	{ value: 120, label: "2 hours" },
	{ value: 240, label: "4 hours" },
];

export const RETENTION_OPTIONS = [
	{ value: 3, label: "3 snapshots" },
	{ value: 5, label: "5 snapshots" },
	{ value: 10, label: "10 snapshots" },
	{ value: 20, label: "20 snapshots" },
	{ value: 30, label: "30 snapshots" },
	{ value: 50, label: "50 snapshots" },
];
