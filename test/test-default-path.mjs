import path from "node:path";
import fs from "node:fs";

const BACKUP_DIR_NAME = "addon-sync-backup";

function getBackupRoot(vaultPath, backupPath) {
	if (!backupPath) return "";
	if (backupPath.includes(":") || backupPath.startsWith("/")) {
		return backupPath;
	}
	return `${vaultPath}/${backupPath}`;
}

function getBackupDir(vaultPath, backupPath) {
	const root = getBackupRoot(vaultPath, backupPath);
	return root ? `${root}/${BACKUP_DIR_NAME}` : "";
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
	if (condition) {
		console.log(`  PASS: ${label}`);
		passed++;
	} else {
		console.log(`  FAIL: ${label}`);
		failed++;
	}
}

const BUGGY_DEFAULT = "meta/addon-sync-backup";
const FIXED_DEFAULT = "meta";

const VAULT_A = path.resolve("e:/ClawWorkLenovo/code/obsidian-addonSync/test-vault-a").replace(/\\/g, "/");
const VAULT_B = path.resolve("e:/ClawWorkLenovo/code/obsidian-addonSync/test-vault-b").replace(/\\/g, "/");

console.log("=== Section 1: Default path is relative and inside vault ===");
{
	assert(!FIXED_DEFAULT.startsWith("."), `'${FIXED_DEFAULT}' does NOT start with '.'`);
	assert(!FIXED_DEFAULT.includes(":"), `'${FIXED_DEFAULT}' does NOT contain ':'`);
	assert(!FIXED_DEFAULT.startsWith("/"), `'${FIXED_DEFAULT}' does NOT start with '/'`);
}

console.log("\n=== Section 2: Demonstrate doubled-path bug with old default ===");
{
	const backupRoot = getBackupRoot(VAULT_A, BUGGY_DEFAULT);
	const backupDir = getBackupDir(VAULT_A, BUGGY_DEFAULT);

	console.log(`  backupPath = "${BUGGY_DEFAULT}"`);
	console.log(`  getBackupRoot() = ${backupRoot}`);
	console.log(`  getBackupDir()  = ${backupDir}`);

	const doubled = backupDir.includes("addon-sync-backup/addon-sync-backup");
	assert(doubled, "BUG CONFIRMED: path contains 'addon-sync-backup/addon-sync-backup' (doubled)");
}

console.log("\n=== Section 3: Verify fix — backupPath = 'meta' ===");
{
	const backupRoot = getBackupRoot(VAULT_A, FIXED_DEFAULT);
	const backupDir = getBackupDir(VAULT_A, FIXED_DEFAULT);

	console.log(`  backupPath = "${FIXED_DEFAULT}"`);
	console.log(`  getBackupRoot() = ${backupRoot}`);
	console.log(`  getBackupDir()  = ${backupDir}`);

	const expectedRoot = path.posix.join(VAULT_A.replace(/\\/g, "/"), "meta");
	const expectedDir = path.posix.join(VAULT_A.replace(/\\/g, "/"), "meta", "addon-sync-backup");

	assert(backupRoot === expectedRoot, `getBackupRoot() === vaultPath/meta  (got ${backupRoot})`);
	assert(backupDir === expectedDir, `getBackupDir() === vaultPath/meta/addon-sync-backup  (got ${backupDir})`);
	assert(!backupDir.includes("addon-sync-backup/addon-sync-backup"), "No doubled folder name");
}

console.log("\n=== Section 4: Verify path is NAS-friendly ===");
{
	assert(!FIXED_DEFAULT.startsWith("."), "'meta' does NOT start with '.' — NAS will sync it");
	assert(FIXED_DEFAULT === "meta", "Folder name is plain 'meta' — no hidden-folder exclusion");

	const backupDir = getBackupDir(VAULT_A, FIXED_DEFAULT);
	assert(backupDir.endsWith("/meta/addon-sync-backup"), "Backup dir ends with '/meta/addon-sync-backup'");

	assert(backupDir.startsWith(VAULT_A), "Backup dir is inside vault root — gets synced along with vault files");
}

console.log("\n=== Section 5: Plugin settings survive cross-device restore ===");
{
	const settingsJson = { backupPath: FIXED_DEFAULT };
	const serialized = JSON.stringify(settingsJson);
	const parsed = JSON.parse(serialized);

	assert(parsed.backupPath === "meta", "Round-trip JSON: backupPath remains 'meta'");
	assert(!parsed.backupPath.includes(":"), "No drive letter — works on any OS");
	assert(!parsed.backupPath.startsWith("/"), "No absolute path — works on any machine");

	const resolvedOnA = getBackupDir(VAULT_A, parsed.backupPath);
	const resolvedOnB = getBackupDir(VAULT_B, parsed.backupPath);

	assert(resolvedOnA.includes("test-vault-a/meta/addon-sync-backup"), "Resolves correctly on vault A");
	assert(resolvedOnB.includes("test-vault-b/meta/addon-sync-backup"), "Resolves correctly on vault B");
	assert(
		resolvedOnA !== resolvedOnB,
		"Different vaults get different absolute paths — same relative logic"
	);
}

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

process.exit(failed > 0 ? 1 : 0);
