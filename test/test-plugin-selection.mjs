import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { unzipSync } from "fflate";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ob-plugin-backup-selection-"));
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (condition) {
		passed++;
		console.log(`  PASS: ${message}`);
	} else {
		failed++;
		console.log(`  FAIL: ${message}`);
	}
}

function writeJson(filePath, data) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function writeText(filePath, text) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, text, "utf8");
}

function copyFiles(files) {
	for (const file of files) {
		fs.mkdirSync(path.dirname(file.dest), { recursive: true });
		fs.copyFileSync(file.source, file.dest);
	}
}

function replaceLatest(latestDir, tempDir) {
	if (fs.existsSync(latestDir)) fs.rmSync(latestDir, { recursive: true, force: true });
	fs.renameSync(tempDir, latestDir);
}

function readZipEntries(zipPath) {
	const entries = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
	return new Set(Object.keys(entries).sort());
}

await esbuild.build({
	entryPoints: [
		path.join(ROOT, "src/file_utils.ts"),
		path.join(ROOT, "src/backup.ts"),
	],
	bundle: true,
	format: "cjs",
	platform: "node",
	outdir: OUT_DIR,
	outExtension: { ".js": ".cjs" },
	logLevel: "silent",
});

const {
	collectBackupFiles,
	getIncludedPluginIds,
	getInstalledCommunityPlugins,
} = require(path.join(OUT_DIR, "file_utils.cjs"));
const { BackupManager } = require(path.join(OUT_DIR, "backup.cjs"));

const vault = path.join(OUT_DIR, "vault");
const config = path.join(vault, ".obsidian");
const latest = path.join(vault, "meta", "ob-plugin-backup", "latest");
const latestZip = path.join(vault, "meta", "ob-plugin-backup", "latest.zip");

writeJson(path.join(config, "community-plugins.json"), ["plugin-a"]);
writeJson(path.join(config, "plugins", "plugin-a", "manifest.json"), {
	id: "plugin-a",
	name: "Plugin A",
	version: "1.0.0",
});
writeJson(path.join(config, "plugins", "plugin-a", "data.json"), { value: "a" });
writeJson(path.join(config, "plugins", "plugin-b", "manifest.json"), {
	id: "plugin-b",
	name: "Plugin B",
	version: "2.0.0",
});
writeJson(path.join(config, "plugins", "plugin-b", "data.json"), { value: "b" });
writeJson(path.join(config, "plugins", "ob-plugin-backup", "manifest.json"), {
	id: "ob-plugin-backup",
	name: "Plugin Backup",
	version: "0.1.6-beta",
});
writeJson(path.join(config, "plugins", "ob-plugin-backup", "data.json"), { deviceName: "local" });
writeJson(path.join(config, "core-plugins.json"), { "daily-notes": true, templates: true });
writeJson(path.join(config, "daily-notes.json"), {
	folder: "Daily record/Daily Record by Zihan",
	template: "Meta/Templates/Daily note",
});
writeJson(path.join(config, "templates.json"), { folder: "Meta/Templates" });
writeText(path.join(config, "hotkeys.json"), "{}");
writeText(path.join(config, "index.html"), "<html><body>runtime entry</body></html>");
writeText(path.join(config, "copilot-index-abc123.json"), "{\"cache\":true}");

const baseSettings = {
	backupPath: "meta",
	localSnapshotPath: ".ob-plugin-backup-local",
	backupFormat: "archive",
	backupAppearance: false,
	backupHotkeys: true,
	backupCorePlugins: false,
	backupCommunityPlugins: true,
	communityPluginSelectionMode: "all",
	selectedCommunityPluginIds: [],
	communityPluginDataMode: "all",
	selectedCommunityPluginDataIds: [],
	syncOwnPluginSettings: true,
	backupOwnPluginData: false,
	backupAppSettings: false,
	backupBookmarks: false,
	backupGraph: false,
	autoBackupEnabled: false,
	autoBackupIntervalMinutes: 30,
	autoBackupOnStartup: false,
	checkChangesOnStartup: true,
	syncHistoryRetentionCount: 10,
	localSnapshotRetentionCount: 5,
	initialSetupCompleted: true,
	firstBackupCompleted: true,
	deviceId: "device-a",
	deviceName: "Device A",
};

console.log("=== Community plugin selection ===");
const installed = getInstalledCommunityPlugins(config);
assert(installed.length === 3, "detects installed community plugins");
assert(installed.find((plugin) => plugin.id === "plugin-a")?.enabled === true, "marks enabled plugin");
assert(installed.find((plugin) => plugin.id === "plugin-b")?.enabled === false, "marks disabled plugin");

const allFiles = collectBackupFiles(config, latest, baseSettings).map((file) => file.relativePath);
assert(allFiles.includes("community-plugins.json"), "always includes community-plugins.json");
assert(allFiles.includes("plugins/plugin-a/data.json"), "all mode includes plugin A");
assert(allFiles.includes("plugins/plugin-b/data.json"), "all mode includes plugin B");
assert(allFiles.includes("plugins/ob-plugin-backup/manifest.json"), "all mode includes this plugin manifest");
assert(!allFiles.includes("plugins/ob-plugin-backup/data.json"), "all mode excludes this plugin data.json by default");
assert(allFiles.includes("plugins/ob-plugin-backup/synced-settings.json") === false, "collectBackupFiles does not read generated own settings file from config");
assert(getIncludedPluginIds(allFiles).join(",") === "ob-plugin-backup,plugin-a,plugin-b", "included plugin ids list all plugins");

const ownDataSettings = {
	...baseSettings,
	backupOwnPluginData: true,
};
const ownDataFiles = collectBackupFiles(config, latest, ownDataSettings).map((file) => file.relativePath);
assert(ownDataFiles.includes("plugins/ob-plugin-backup/data.json"), "own plugin data is included when explicitly enabled");

const noDataSettings = {
	...baseSettings,
	communityPluginDataMode: "none",
};
const noDataFiles = collectBackupFiles(config, latest, noDataSettings).map((file) => file.relativePath);
assert(noDataFiles.includes("plugins/plugin-a/manifest.json"), "no data mode keeps plugin A manifest");
assert(!noDataFiles.includes("plugins/plugin-a/data.json"), "no data mode excludes plugin A data");
assert(!noDataFiles.includes("plugins/plugin-b/data.json"), "no data mode excludes plugin B data");

const selectedDataSettings = {
	...baseSettings,
	communityPluginDataMode: "selected",
	selectedCommunityPluginDataIds: ["plugin-a"],
};
const selectedDataFiles = collectBackupFiles(config, latest, selectedDataSettings).map((file) => file.relativePath);
assert(selectedDataFiles.includes("plugins/plugin-a/data.json"), "selected data mode includes chosen plugin data");
assert(selectedDataFiles.includes("plugins/plugin-b/manifest.json"), "selected data mode keeps unchosen plugin manifest");
assert(!selectedDataFiles.includes("plugins/plugin-b/data.json"), "selected data mode excludes unchosen plugin data");

const selectedSettings = {
	...baseSettings,
	communityPluginSelectionMode: "selected",
	selectedCommunityPluginIds: ["plugin-a"],
};
const selectedFiles = collectBackupFiles(config, latest, selectedSettings).map((file) => file.relativePath);
assert(selectedFiles.includes("plugins/plugin-a/data.json"), "selected mode includes chosen plugin");
assert(!selectedFiles.includes("plugins/plugin-b/data.json"), "selected mode excludes unchosen plugin");
assert(selectedFiles.includes("community-plugins.json"), "selected mode keeps plugin enablement file");

const corePluginSettings = {
	...baseSettings,
	backupCorePlugins: true,
	backupHotkeys: false,
	backupCommunityPlugins: false,
};
const corePluginFiles = collectBackupFiles(config, latest, corePluginSettings).map((file) => file.relativePath);
assert(corePluginFiles.includes("core-plugins.json"), "core plugin backup includes enablement file");
assert(corePluginFiles.includes("daily-notes.json"), "core plugin backup includes Daily Notes settings");
assert(corePluginFiles.includes("templates.json"), "core plugin backup includes Templates settings");
assert(!corePluginFiles.includes("workspace.json"), "core plugin backup does not include generated workspace state");

console.log("\n=== Latest replacement removes stale plugin files ===");
fs.mkdirSync(path.join(latest, "plugins", "plugin-b"), { recursive: true });
writeText(path.join(latest, "plugins", "plugin-b", "stale.txt"), "stale");
const tempLatest = path.join(vault, "meta", "ob-plugin-backup", `latest.tmp-${Date.now()}`);
fs.mkdirSync(tempLatest, { recursive: true });
copyFiles(collectBackupFiles(config, tempLatest, selectedSettings));
replaceLatest(latest, tempLatest);
assert(fs.existsSync(path.join(latest, "plugins", "plugin-a", "data.json")), "latest contains selected plugin file");
assert(!fs.existsSync(path.join(latest, "plugins", "plugin-b", "stale.txt")), "latest no longer has stale unselected plugin file");

console.log("\n=== BackupManager writes selected plugin metadata ===");
const app = {
	vault: {
		configDir: ".obsidian",
		adapter: {
			getBasePath: () => vault,
		},
	},
};
const manager = new BackupManager(app, selectedSettings);
const staleTempDir = path.join(vault, "meta", "ob-plugin-backup", "latest.tmp-stale");
fs.mkdirSync(staleTempDir, { recursive: true });
writeText(path.join(staleTempDir, "stale.txt"), "stale");
const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
fs.utimesSync(staleTempDir, oldDate, oldDate);
await manager.createBackup({ comment: "before changing plugin selection" });
const meta = JSON.parse(fs.readFileSync(path.join(vault, "meta", "ob-plugin-backup", "meta.json"), "utf8"));
assert(meta.configDir === ".obsidian", "meta records config directory");
assert(meta.deviceId === "device-a", "meta records device id");
assert(meta.deviceName === "Device A", "meta records device name");
assert(meta.comment === "before changing plugin selection", "meta records backup comment");
assert(meta.includedPluginIds.join(",") === "plugin-a", "meta records selected plugin ids");
assert(!fs.existsSync(staleTempDir), "BackupManager removes stale latest temp folders");
assert(fs.existsSync(latestZip), "BackupManager writes archive latest.zip");
assert(!fs.existsSync(latest), "archive backup removes legacy latest directory");
const latestZipEntries = readZipEntries(latestZip);
assert(latestZipEntries.has("plugins/ob-plugin-backup/synced-settings.json"), "BackupManager writes safe own plugin settings snapshot into archive");
assert(latestZipEntries.has("plugins/plugin-a/manifest.json"), "BackupManager archive contains selected plugin");
assert(!latestZipEntries.has("plugins/plugin-b/manifest.json"), "BackupManager archive excludes unselected plugin");
assert(latestZipEntries.has("meta.json"), "BackupManager archive contains self-describing meta.json");
const localSnapshotRoot = path.join(vault, ".ob-plugin-backup-local", "ob-plugin-backup-local");
const localSnapshotDirs = fs.readdirSync(localSnapshotRoot).sort();
const createdLocalSnapshot = path.join(localSnapshotRoot, localSnapshotDirs[localSnapshotDirs.length - 1]);
assert(createdLocalSnapshot.endsWith(".zip"), "local safety snapshot is archived in archive mode");
const localSnapshotEntries = readZipEntries(createdLocalSnapshot);
assert(!localSnapshotEntries.has("index.html"), "local safety snapshot excludes root HTML runtime files");
assert(!localSnapshotEntries.has("copilot-index-abc123.json"), "local safety snapshot excludes generated root index cache files");

console.log("\n=== Local-only safety snapshot ===");
const syncHistoryDir = path.join(vault, "meta", "ob-plugin-backup", "history");
const syncHistoryBeforeLocalOnly = fs.readdirSync(syncHistoryDir).sort().join(",");
const syncMetaPath = path.join(vault, "meta", "ob-plugin-backup", "meta.json");
const syncMetaBeforeLocalOnly = fs.readFileSync(syncMetaPath, "utf8");
const localOnlySnapshotPath = await manager.createLocalSnapshotOnly({ comment: "local experiment checkpoint" });
assert(fs.existsSync(localOnlySnapshotPath), "local-only snapshot is created");
assert(localOnlySnapshotPath.includes(".ob-plugin-backup-local"), "local-only snapshot stays in local safety directory");
assert(fs.readdirSync(syncHistoryDir).sort().join(",") === syncHistoryBeforeLocalOnly, "local-only snapshot does not create sync history");
assert(fs.readFileSync(syncMetaPath, "utf8") === syncMetaBeforeLocalOnly, "local-only snapshot does not update sync meta.json");
const localOnlySnapshotEntries = readZipEntries(localOnlySnapshotPath);
assert(localOnlySnapshotEntries.has("plugins/plugin-a/manifest.json"), "local-only snapshot captures current config files");
assert(!localOnlySnapshotEntries.has("index.html"), "local-only snapshot excludes root HTML runtime files");
const localOnlySnapshotMap = unzipSync(new Uint8Array(fs.readFileSync(localOnlySnapshotPath)));
const localOnlyMeta = JSON.parse(Buffer.from(localOnlySnapshotMap["meta.json"]).toString("utf8"));
assert(localOnlyMeta.comment === "local experiment checkpoint", "local-only snapshot records comment");

console.log("\n=== BackupManager honors custom configDir ===");
const customVault = path.join(OUT_DIR, "custom-vault");
const customConfig = path.join(customVault, ".custom-obsidian");
writeText(path.join(customConfig, "hotkeys.json"), "{\"custom\":true}");
const customManager = new BackupManager({
	vault: {
		configDir: ".custom-obsidian",
		adapter: {
			getBasePath: () => customVault,
		},
	},
}, {
	...baseSettings,
	backupCommunityPlugins: false,
});
await customManager.createBackup();
const customLatest = path.join(customVault, "meta", "ob-plugin-backup", "latest");
const customLatestZip = path.join(customVault, "meta", "ob-plugin-backup", "latest.zip");
const customMeta = JSON.parse(fs.readFileSync(path.join(customVault, "meta", "ob-plugin-backup", "meta.json"), "utf8"));
assert(!fs.existsSync(customLatest), "custom configDir archive backup does not leave latest directory");
assert(readZipEntries(customLatestZip).has("hotkeys.json"), "custom configDir file is backed up into archive");
assert(customMeta.configDir === ".custom-obsidian", "custom configDir is recorded in meta");

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
