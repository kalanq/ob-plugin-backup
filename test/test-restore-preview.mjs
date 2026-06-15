import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ob-plugin-backup-restore-"));
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

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

await esbuild.build({
	entryPoints: [path.join(ROOT, "src/restore_plan.ts")],
	bundle: true,
	format: "cjs",
	platform: "node",
	outfile: path.join(OUT_DIR, "restore_plan.cjs"),
	logLevel: "silent",
});

const {
	createRestorePreview,
	copySelectedRestoreFiles,
} = require(path.join(OUT_DIR, "restore_plan.cjs"));

const config = path.join(OUT_DIR, "vault", ".obsidian");
const backup = path.join(OUT_DIR, "backup");

writeJson(path.join(config, "app.json"), { value: "local-app" });
writeJson(path.join(config, "hotkeys.json"), { value: "local-hotkeys" });
writeJson(path.join(config, "plugins", "plugin-a", "manifest.json"), {
	id: "plugin-a",
	name: "Plugin A",
	version: "1.0.0",
});
writeJson(path.join(config, "plugins", "plugin-a", "data.json"), { value: "local-plugin" });
writeJson(path.join(config, "plugins", "ob-plugin-backup", "data.json"), {
	backupPath: "local-meta",
	localSnapshotPath: ".local-only",
	deviceName: "Local Device",
	backupAppearance: false,
	syncHistoryRetentionCount: 3,
	historyRecords: ["keep-me"],
	lastSyncTime: "local-only",
});

writeJson(path.join(backup, "app.json"), { value: "backup-app" });
writeJson(path.join(backup, "hotkeys.json"), { value: "backup-hotkeys" });
writeJson(path.join(backup, "plugins", "plugin-a", "manifest.json"), {
	id: "plugin-a",
	name: "Plugin A",
	version: "2.0.0",
});
writeJson(path.join(backup, "plugins", "plugin-a", "data.json"), { value: "backup-plugin" });
writeJson(path.join(backup, "plugins", "ob-plugin-backup", "synced-settings.json"), {
	version: 1,
	syncedAt: new Date().toISOString(),
	settings: {
		language: "zh",
		backupPath: "remote-meta",
		localSnapshotPath: ".remote-local",
		deviceName: "Remote Device",
		backupAppearance: true,
		syncHistoryRetentionCount: 20,
		historyRecords: ["do-not-merge"],
	},
});
writeJson(path.join(backup, "meta.json"), {
	version: "1.0.0",
	lastBackupTime: Date.now(),
	lastBackupTimeStr: new Date().toISOString(),
	fileHashes: {},
	changelog: ["~ app.json"],
	pluginVersions: { "plugin-a": "2.0.0" },
	includedPluginIds: ["plugin-a"],
	configDir: ".obsidian",
	deviceId: "device-a",
	deviceName: "Device A",
});

console.log("=== Restore preview ===");
const preview = createRestorePreview(backup, config, ".obsidian", null, "device-a", "Device A");
assert(preview.files.includes("app.json"), "preview includes app.json");
assert(preview.files.includes("plugins/plugin-a/data.json"), "preview includes plugin data");
assert(preview.pluginIds.join(",") === "plugin-a", "preview lists plugin id");
assert(preview.pluginVersionDiffs[0].status === "different", "preview detects version difference");
assert(preview.pluginVersionDiffs[0].backupVersion === "2.0.0", "preview reads backup plugin version");
assert(preview.pluginVersionDiffs[0].currentVersion === "1.0.0", "preview reads local plugin version");
assert(preview.deviceId === "device-a", "preview records backup device id");
assert(preview.groups.length === 1, "preview creates one device group");
assert(preview.groups[0].isCurrentDevice === true, "preview marks current device group");
assert(preview.groups[0].categories.some((group) => group.key === "communityPlugins"), "preview groups community plugin files");
assert(preview.groups[0].categories.some((group) => group.key === "appSettings"), "preview groups app settings files");
assert(preview.groups[0].categories.some((group) => group.key === "hotkeys"), "preview groups hotkey files");

console.log("\n=== Selective restore ===");
copySelectedRestoreFiles(backup, config, ["app.json", "plugins/plugin-a/data.json"]);
assert(readJson(path.join(config, "app.json")).value === "backup-app", "selected config file restored");
assert(readJson(path.join(config, "plugins", "plugin-a", "data.json")).value === "backup-plugin", "selected plugin data restored");
assert(readJson(path.join(config, "hotkeys.json")).value === "local-hotkeys", "unselected file remains local");
assert(readJson(path.join(config, "plugins", "plugin-a", "manifest.json")).version === "1.0.0", "unselected plugin manifest remains local");

console.log("\n=== Safe own plugin settings restore ===");
copySelectedRestoreFiles(backup, config, ["plugins/ob-plugin-backup/synced-settings.json"]);
const ownData = readJson(path.join(config, "plugins", "ob-plugin-backup", "data.json"));
assert(ownData.language === "zh", "safe own settings restore applies whitelisted setting");
assert(ownData.backupAppearance === true, "safe own settings restore updates backup options");
assert(ownData.syncHistoryRetentionCount === 20, "safe own settings restore updates retention options");
assert(ownData.backupPath === "local-meta", "safe own settings restore preserves local backup path");
assert(ownData.localSnapshotPath === ".local-only", "safe own settings restore preserves local snapshot path");
assert(ownData.deviceName === "Local Device", "safe own settings restore preserves device name");
assert(Array.isArray(ownData.historyRecords) && ownData.historyRecords[0] === "keep-me", "safe own settings restore preserves local history records");
assert(ownData.lastSyncTime === "local-only", "safe own settings restore preserves local sync records");

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
