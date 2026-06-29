import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ob-plugin-backup-scheduler-"));
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

await esbuild.build({
	entryPoints: [path.join(ROOT, "src/scheduler.ts")],
	bundle: true,
	format: "cjs",
	platform: "node",
	outfile: path.join(OUT_DIR, "scheduler.cjs"),
	external: ["obsidian"],
	logLevel: "silent",
});

fs.mkdirSync(path.join(OUT_DIR, "node_modules", "obsidian"), { recursive: true });
fs.writeFileSync(
	path.join(OUT_DIR, "node_modules", "obsidian", "index.js"),
	"exports.Notice = class Notice { constructor() {} };",
	"utf8",
);

const { BackupScheduler } = require(path.join(OUT_DIR, "scheduler.cjs"));

const calls = [];
const backupManager = {
	createBackup: async (options) => {
		calls.push(options);
	},
	readMeta: async () => ({ ok: true }),
};
const diffChecker = {
	hasChanges: async () => false,
	getChangeSummary: async () => "",
};
const restoreManager = { isRestoring: false };
const plugin = {
	registerInterval: () => {},
};

let intervalCallback = null;
global.window = {
	setInterval: (callback) => {
		intervalCallback = callback;
		return 1;
	},
	clearInterval: () => {},
};

const scheduler = new BackupScheduler(plugin, backupManager, diffChecker, restoreManager);

console.log("=== Scheduler comments ===");
await scheduler.runStartupBackup();
assert(calls[0]?.comment === "Auto backup on startup", "startup backup records default comment");

scheduler.startAutoBackup(30);
await intervalCallback();
assert(calls[1]?.comment === "Scheduled auto backup", "scheduled backup records default comment");

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
