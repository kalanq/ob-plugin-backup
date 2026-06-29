import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { unzipSync } from "fflate";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ob-plugin-backup-large-"));
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

function writeText(filePath, text) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, text, "utf8");
}

await esbuild.build({
	entryPoints: [path.join(ROOT, "src/backup.ts")],
	bundle: true,
	format: "cjs",
	platform: "node",
	outfile: path.join(OUT_DIR, "backup.cjs"),
	external: ["obsidian"],
	logLevel: "silent",
});

const { BackupManager } = require(path.join(OUT_DIR, "backup.cjs"));

const vault = path.join(OUT_DIR, "vault");
const config = path.join(vault, ".obsidian");
writeText(path.join(config, "app.json"), JSON.stringify({ theme: "obsidian", large: "x".repeat(512 * 1024) }));
writeText(path.join(config, "hotkeys.json"), "{}");
writeText(path.join(config, "community-plugins.json"), JSON.stringify(["plugin-a"]));
writeText(path.join(config, "plugins", "plugin-a", "manifest.json"), JSON.stringify({ id: "plugin-a", name: "Plugin A", version: "1.0.0" }));
for (let index = 0; index < 160; index++) {
	writeText(path.join(config, "plugins", "plugin-a", `data-${index}.json`), JSON.stringify({ index, value: "v".repeat(2048) }));
}

const progressEvents = [];
const manager = new BackupManager({
	vault: {
		configDir: ".obsidian",
		adapter: {
			getBasePath: () => vault,
		},
	},
}, {
	language: "en",
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
	syncOwnPluginSettings: false,
	backupOwnPluginData: false,
	backupAppSettings: true,
	backupBookmarks: false,
	backupGraph: false,
	autoBackupEnabled: false,
	autoBackupIntervalMinutes: 30,
	autoBackupOnStartup: false,
	checkChangesOnStartup: true,
	syncHistoryRetentionCount: 5,
	localSnapshotRetentionCount: 5,
	initialSetupCompleted: true,
	firstBackupCompleted: true,
	deviceId: "device-a",
	deviceName: "Device A",
});

console.log("=== Large archive backup ===");
await manager.createBackup({
	comment: "large config performance smoke",
	onProgress: (progress) => progressEvents.push(progress),
});

const latestZip = path.join(vault, "meta", "ob-plugin-backup", "latest.zip");
const latestDir = path.join(vault, "meta", "ob-plugin-backup", "latest");
assert(fs.existsSync(latestZip), "archive latest.zip is created");
assert(!fs.existsSync(latestDir), "archive backup does not leave loose latest directory");
assert(progressEvents.some((event) => event.totalBytes > 0), "progress reports total bytes");
assert(progressEvents.some((event) => event.outputBytes > 0), "progress reports compressed output bytes");

const entries = unzipSync(new Uint8Array(fs.readFileSync(latestZip)));
assert(!!entries["meta.json"], "archive contains meta.json");
const looseHistory = fs.existsSync(path.join(vault, "meta", "ob-plugin-backup", "history"))
	? fs.readdirSync(path.join(vault, "meta", "ob-plugin-backup", "history")).filter((name) => !name.endsWith(".zip"))
	: [];
assert(looseHistory.length === 0, "history remains archive-only");

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
