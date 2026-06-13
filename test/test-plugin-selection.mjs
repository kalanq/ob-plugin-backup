import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

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
	version: "0.1.3",
});
writeJson(path.join(config, "plugins", "ob-plugin-backup", "data.json"), { deviceName: "local" });
writeText(path.join(config, "hotkeys.json"), "{}");

const baseSettings = {
	backupPath: "meta",
	localSnapshotPath: ".ob-plugin-backup-local",
	backupAppearance: false,
	backupHotkeys: true,
	backupCorePlugins: false,
	backupCommunityPlugins: true,
	communityPluginSelectionMode: "all",
	selectedCommunityPluginIds: [],
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
assert(getIncludedPluginIds(allFiles).join(",") === "ob-plugin-backup,plugin-a,plugin-b", "included plugin ids list all plugins");

const ownDataSettings = {
	...baseSettings,
	backupOwnPluginData: true,
};
const ownDataFiles = collectBackupFiles(config, latest, ownDataSettings).map((file) => file.relativePath);
assert(ownDataFiles.includes("plugins/ob-plugin-backup/data.json"), "own plugin data is included when explicitly enabled");

const selectedSettings = {
	...baseSettings,
	communityPluginSelectionMode: "selected",
	selectedCommunityPluginIds: ["plugin-a"],
};
const selectedFiles = collectBackupFiles(config, latest, selectedSettings).map((file) => file.relativePath);
assert(selectedFiles.includes("plugins/plugin-a/data.json"), "selected mode includes chosen plugin");
assert(!selectedFiles.includes("plugins/plugin-b/data.json"), "selected mode excludes unchosen plugin");
assert(selectedFiles.includes("community-plugins.json"), "selected mode keeps plugin enablement file");

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
await manager.createBackup();
const meta = JSON.parse(fs.readFileSync(path.join(vault, "meta", "ob-plugin-backup", "meta.json"), "utf8"));
assert(meta.configDir === ".obsidian", "meta records config directory");
assert(meta.deviceId === "device-a", "meta records device id");
assert(meta.deviceName === "Device A", "meta records device name");
assert(meta.includedPluginIds.join(",") === "plugin-a", "meta records selected plugin ids");
assert(fs.existsSync(path.join(latest, "plugins", "plugin-a", "manifest.json")), "BackupManager latest contains selected plugin");
assert(!fs.existsSync(path.join(latest, "plugins", "plugin-b", "manifest.json")), "BackupManager latest excludes unselected plugin");

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
const customMeta = JSON.parse(fs.readFileSync(path.join(customVault, "meta", "ob-plugin-backup", "meta.json"), "utf8"));
assert(fs.existsSync(path.join(customLatest, "hotkeys.json")), "custom configDir file is backed up");
assert(customMeta.configDir === ".custom-obsidian", "custom configDir is recorded in meta");

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
