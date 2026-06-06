import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const VAULT_A = path.join(ROOT, "test-vault-a");
const VAULT_B = path.join(ROOT, "test-vault-b");
const VAULT_A_OBSIDIAN = path.join(VAULT_A, ".obsidian");
const VAULT_B_OBSIDIAN = path.join(VAULT_B, ".obsidian");
const BACKUP_ROOT = path.join(ROOT, "sync-backup");

const BACKUP_DIR_NAME = "addon-sync-backup";
const LATEST_DIR_NAME = "latest";
const HISTORY_DIR_NAME = "history";
const META_FILE_NAME = "meta.json";

const CONFIG_FILES = {
	appearance: ["appearance.json"],
	hotkeys: ["hotkeys.json"],
	corePlugins: ["core-plugins.json", "core-plugins-migration.json"],
	communityPlugins: ["community-plugins.json"],
	appSettings: ["app.json"],
	bookmarks: ["bookmarks.json"],
	graph: ["graph.json"],
};

const settings = {
	backupPath: "../sync-backup",
	backupAppearance: true,
	backupHotkeys: true,
	backupCorePlugins: true,
	backupCommunityPlugins: true,
	backupAppSettings: true,
	backupBookmarks: true,
	backupGraph: true,
	backupPluginManifest: false,
	autoBackupEnabled: false,
	autoBackupIntervalMinutes: 30,
	autoBackupOnStartup: false,
	checkChangesOnStartup: true,
	historyRetentionCount: 10,
};

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, message) {
	totalAssertions++;
	if (condition) {
		passedAssertions++;
		console.log(`  ✅ PASS: ${message}`);
	} else {
		failedAssertions++;
		console.log(`  ❌ FAIL: ${message}`);
	}
}

function assertEqual(actual, expected, message) {
	totalAssertions++;
	if (actual === expected) {
		passedAssertions++;
		console.log(`  ✅ PASS: ${message}`);
	} else {
		failedAssertions++;
		console.log(`  ❌ FAIL: ${message}`);
		console.log(`       Expected: ${JSON.stringify(expected)}`);
		console.log(`       Actual:   ${JSON.stringify(actual)}`);
	}
}

function assertDeepEqual(actual, expected, message) {
	totalAssertions++;
	const actualStr = JSON.stringify(actual);
	const expectedStr = JSON.stringify(expected);
	if (actualStr === expectedStr) {
		passedAssertions++;
		console.log(`  ✅ PASS: ${message}`);
	} else {
		failedAssertions++;
		console.log(`  ❌ FAIL: ${message}`);
		console.log(`       Expected: ${expectedStr}`);
		console.log(`       Actual:   ${actualStr}`);
	}
}

function phaseHeader(phaseNum, title) {
	console.log(`\n${"=".repeat(70)}`);
	console.log(`  PHASE ${phaseNum}: ${title}`);
	console.log(`${"=".repeat(70)}\n`);
}

function readFileJson(filePath) {
	if (!fs.existsSync(filePath)) return null;
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readFileText(filePath) {
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath, "utf-8");
}

function simpleHash(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0;
	}
	return hash.toString(36);
}

function getBackupRoot() {
	const backupPath = settings.backupPath;
	if (!backupPath) return "";
	if (backupPath.includes(":") || backupPath.startsWith("/")) return backupPath;
	return `${VAULT_A}/${backupPath}`;
}

function getBackupDir() {
	const root = getBackupRoot();
	return root ? `${root}/${BACKUP_DIR_NAME}` : "";
}

function getLatestDir() {
	const dir = getBackupDir();
	return dir ? `${dir}/${LATEST_DIR_NAME}` : "";
}

function getHistoryDir() {
	const dir = getBackupDir();
	return dir ? `${dir}/${HISTORY_DIR_NAME}` : "";
}

function collectBackupFiles(vaultObsidianDir, latestDir) {
	const result = [];

	const addConfigFile = (filename) => {
		result.push({
			source: `${vaultObsidianDir}/${filename}`,
			dest: `${latestDir}/${filename}`,
		});
	};

	if (settings.backupAppearance) {
		for (const f of CONFIG_FILES.appearance) addConfigFile(f);
		const themesDir = `${vaultObsidianDir}/themes`;
		if (fs.existsSync(themesDir)) {
			const themes = fs.readdirSync(themesDir);
			for (const theme of themes) {
				const themePath = `${themesDir}/${theme}`;
				if (fs.statSync(themePath).isDirectory()) {
					const files = fs.readdirSync(themePath);
					for (const f of files) {
						result.push({
							source: `${themePath}/${f}`,
							dest: `${latestDir}/themes/${theme}/${f}`,
						});
					}
				}
			}
		}
		const snippetsDir = `${vaultObsidianDir}/snippets`;
		if (fs.existsSync(snippetsDir)) {
			const files = fs.readdirSync(snippetsDir);
			for (const f of files) {
				if (f.endsWith(".css")) {
					result.push({
						source: `${snippetsDir}/${f}`,
						dest: `${latestDir}/snippets/${f}`,
					});
				}
			}
		}
	}

	if (settings.backupHotkeys) {
		for (const f of CONFIG_FILES.hotkeys) addConfigFile(f);
	}

	if (settings.backupCorePlugins) {
		for (const f of CONFIG_FILES.corePlugins) addConfigFile(f);
	}

	if (settings.backupCommunityPlugins) {
		for (const f of CONFIG_FILES.communityPlugins) addConfigFile(f);
		const pluginsDir = `${vaultObsidianDir}/plugins`;
		if (fs.existsSync(pluginsDir)) {
			const plugins = fs.readdirSync(pluginsDir);
			for (const pluginId of plugins) {
				const pluginPath = `${pluginsDir}/${pluginId}`;
				if (fs.statSync(pluginPath).isDirectory()) {
					const dataFile = `${pluginPath}/data.json`;
					if (fs.existsSync(dataFile)) {
						result.push({
							source: dataFile,
							dest: `${latestDir}/plugins/${pluginId}/data.json`,
						});
					}
					if (settings.backupPluginManifest) {
						const manifestFile = `${pluginPath}/manifest.json`;
						if (fs.existsSync(manifestFile)) {
							result.push({
								source: manifestFile,
								dest: `${latestDir}/plugins/${pluginId}/manifest.json`,
							});
						}
					}
				}
			}
		}
	}

	if (settings.backupAppSettings) {
		for (const f of CONFIG_FILES.appSettings) addConfigFile(f);
	}

	if (settings.backupBookmarks) {
		for (const f of CONFIG_FILES.bookmarks) addConfigFile(f);
	}

	if (settings.backupGraph) {
		for (const f of CONFIG_FILES.graph) addConfigFile(f);
	}

	return result;
}

function computeHashes(baseDir, currentDir, hashes) {
	const entries = fs.readdirSync(currentDir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = `${currentDir}/${entry.name}`;
		if (entry.isDirectory()) {
			computeHashes(baseDir, fullPath, hashes);
		} else {
			const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
			const content = fs.readFileSync(fullPath, "utf-8");
			hashes[relativePath] = simpleHash(content);
		}
	}
}

function updateMeta() {
	const backupDir = getBackupDir();
	const latestDir = getLatestDir();
	const now = Date.now();
	const fileHashes = {};

	if (fs.existsSync(latestDir)) {
		computeHashes(latestDir, latestDir, fileHashes);
	}

	const meta = {
		lastBackupTime: now,
		lastBackupTimeStr: new Date(now).toISOString(),
		fileHashes,
		version: "1.0.0",
	};

	fs.writeFileSync(
		`${backupDir}/${META_FILE_NAME}`,
		JSON.stringify(meta, null, 2),
		"utf-8"
	);

	return meta;
}

function readMeta() {
	const backupDir = getBackupDir();
	const metaPath = `${backupDir}/${META_FILE_NAME}`;
	if (!fs.existsSync(metaPath)) return null;
	return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
}

function createBackup(vaultObsidianDir) {
	const latestDir = getLatestDir();
	fs.mkdirSync(latestDir, { recursive: true });

	const filesToBackup = collectBackupFiles(vaultObsidianDir, latestDir);

	for (const { source, dest } of filesToBackup) {
		const destDir = path.dirname(dest);
		fs.mkdirSync(destDir, { recursive: true });
		if (fs.existsSync(source)) {
			fs.copyFileSync(source, dest);
		}
	}

	const meta = updateMeta();
	return { filesToBackup, meta };
}

function copyDirRecursive(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = `${src}/${entry.name}`;
		const destPath = `${dest}/${entry.name}`;
		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function createHistorySnapshot() {
	const latestDir = getLatestDir();
	const historyDir = getHistoryDir();
	if (!fs.existsSync(latestDir)) return null;

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const snapshotDir = `${historyDir}/${timestamp}`;
	fs.mkdirSync(snapshotDir, { recursive: true });
	copyDirRecursive(latestDir, snapshotDir);
	return timestamp;
}

function restoreDirRecursive(srcDir, destDir) {
	if (!fs.existsSync(srcDir)) return;
	const entries = fs.readdirSync(srcDir, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = `${srcDir}/${entry.name}`;
		const destPath = `${destDir}/${entry.name}`;
		if (entry.isDirectory()) {
			restoreDirRecursive(srcPath, destPath);
		} else {
			fs.mkdirSync(path.dirname(destPath), { recursive: true });
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function restoreFromPath(backupPath, targetObsidianDir) {
	if (!fs.existsSync(backupPath)) {
		throw new Error(`Backup path not found: ${backupPath}`);
	}
	restoreDirRecursive(backupPath, targetObsidianDir);
}

function checkChanges(vaultObsidianDir) {
	const meta = readMeta();
	if (!meta) return [];

	const latestDir = getLatestDir();
	const changes = [];

	for (const [relativePath, backupHash] of Object.entries(meta.fileHashes)) {
		const currentPath = `${vaultObsidianDir}/${relativePath}`;
		if (!fs.existsSync(currentPath)) {
			changes.push({ path: currentPath, relativePath, type: "deleted" });
			continue;
		}
		const currentContent = fs.readFileSync(currentPath, "utf-8");
		const currentHash = simpleHash(currentContent);
		if (currentHash !== backupHash) {
			changes.push({ path: currentPath, relativePath, type: "modified" });
		}
	}

	const currentFiles = collectCurrentConfigFiles(vaultObsidianDir);
	for (const relPath of currentFiles) {
		if (!(relPath in meta.fileHashes)) {
			changes.push({ path: `${vaultObsidianDir}/${relPath}`, relativePath: relPath, type: "added" });
		}
	}

	return changes;
}

function collectCurrentConfigFiles(configPath) {
	const result = [];
	const addIfExists = (relativePath) => {
		if (fs.existsSync(`${configPath}/${relativePath}`)) result.push(relativePath);
	};

	if (settings.backupAppearance) {
		for (const f of CONFIG_FILES.appearance) addIfExists(f);
		const themesDir = `${configPath}/themes`;
		if (fs.existsSync(themesDir)) {
			const themes = fs.readdirSync(themesDir);
			for (const theme of themes) {
				const themePath = `${themesDir}/${theme}`;
				if (fs.statSync(themePath).isDirectory()) {
					const files = fs.readdirSync(themePath);
					for (const f of files) {
						if (fs.statSync(`${themePath}/${f}`).isFile()) result.push(`themes/${theme}/${f}`);
					}
				}
			}
		}
		const snippetsDir = `${configPath}/snippets`;
		if (fs.existsSync(snippetsDir)) {
			const files = fs.readdirSync(snippetsDir);
			for (const f of files) {
				if (f.endsWith(".css")) result.push(`snippets/${f}`);
			}
		}
	}

	if (settings.backupHotkeys) for (const f of CONFIG_FILES.hotkeys) addIfExists(f);
	if (settings.backupCorePlugins) for (const f of CONFIG_FILES.corePlugins) addIfExists(f);

	if (settings.backupCommunityPlugins) {
		for (const f of CONFIG_FILES.communityPlugins) addIfExists(f);
		const pluginsDir = `${configPath}/plugins`;
		if (fs.existsSync(pluginsDir)) {
			const plugins = fs.readdirSync(pluginsDir);
			for (const pluginId of plugins) {
				const pluginPath = `${pluginsDir}/${pluginId}`;
				if (fs.statSync(pluginPath).isDirectory()) {
					const dataFile = `plugins/${pluginId}/data.json`;
					if (fs.existsSync(`${configPath}/${dataFile}`)) result.push(dataFile);
					if (settings.backupPluginManifest) {
						const manifestFile = `plugins/${pluginId}/manifest.json`;
						if (fs.existsSync(`${configPath}/${manifestFile}`)) result.push(manifestFile);
					}
				}
			}
		}
	}

	if (settings.backupAppSettings) for (const f of CONFIG_FILES.appSettings) addIfExists(f);
	if (settings.backupBookmarks) for (const f of CONFIG_FILES.bookmarks) addIfExists(f);
	if (settings.backupGraph) for (const f of CONFIG_FILES.graph) addIfExists(f);

	return result;
}

function listAllFiles(dir, base = "") {
	const results = [];
	if (!fs.existsSync(dir)) return results;
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const rel = base ? `${base}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			results.push(...listAllFiles(`${dir}/${entry.name}`, rel));
		} else {
			results.push(rel);
		}
	}
	return results;
}

function main() {
	console.log("╔══════════════════════════════════════════════════════════════════════╗");
	console.log("║          OBSIDIAN ADDON-SYNC INTEGRATION TEST                       ║");
	console.log("║   Backup from test-vault-a → Restore to test-vault-b               ║");
	console.log("╚══════════════════════════════════════════════════════════════════════╝");

	const configNames = ["appearance.json", "hotkeys.json", "community-plugins.json", "app.json", "bookmarks.json", "graph.json"];

	// ─── PHASE 1 ───
	phaseHeader(1, "Read and Display Current State of Both Vaults");

	console.log("  📁 Vault A (.obsidian/) config files:");
	console.log("  ─────────────────────────────────────");
	for (const name of configNames) {
		const data = readFileJson(`${VAULT_A_OBSIDIAN}/${name}`);
		console.log(`  ${name}: ${JSON.stringify(data)}`);
	}

	console.log();
	console.log("  📁 Vault B (.obsidian/) config files:");
	console.log("  ─────────────────────────────────────");
	for (const name of configNames) {
		const data = readFileJson(`${VAULT_B_OBSIDIAN}/${name}`);
		console.log(`  ${name}: ${JSON.stringify(data)}`);
	}

	console.log();
	console.log("  📊 Comparison Table:");
	console.log("  ┌────────────────────────┬──────────────────────────┬──────────────────────────┐");
	console.log("  │ File                   │ Vault A                  │ Vault B                  │");
	console.log("  ├────────────────────────┼──────────────────────────┼──────────────────────────┤");

	const compareFields = {
		"appearance.json": (d) => d ? `theme=${d.cssTheme || "(none)"}, font=${d.textFont || "(default)"}, size=${d.baseFontSize}` : "(missing)",
		"hotkeys.json": (d) => d ? `${Object.keys(d).length} custom hotkeys` : "(empty)",
		"community-plugins.json": (d) => d ? `${d.length} plugins` : "(empty)",
		"app.json": (d) => d ? `mode=${d.defaultViewMode}, lines=${d.showLineNumber}` : "(missing)",
		"bookmarks.json": (d) => d ? `${d.items?.length || 0} bookmarks` : "(empty)",
		"graph.json": (d) => {
			if (!d || Object.keys(d).length === 0) return "(empty)";
			return `orphans=${d.showOrphans}, attach=${d.showAttachments}`;
		},
	};

	for (const name of configNames) {
		const a = readFileJson(`${VAULT_A_OBSIDIAN}/${name}`);
		const b = readFileJson(`${VAULT_B_OBSIDIAN}/${name}`);
		const fmt = compareFields[name];
		const aStr = fmt(a);
		const bStr = fmt(b);
		const diff = aStr !== bStr ? " ⚠️" : "  ";
		console.log(`  │ ${name.padEnd(22)} │ ${aStr.padEnd(24)} │ ${bStr.padEnd(24)} │${diff}`);
	}
	console.log("  └────────────────────────┴──────────────────────────┴──────────────────────────┘");

	// ─── PHASE 2 ───
	phaseHeader(2, "Create Backup from Vault A");

	console.log(`  Backup root:  ${getBackupRoot()}`);
	console.log(`  Backup dir:   ${getBackupDir()}`);
	console.log(`  Latest dir:   ${getLatestDir()}`);
	console.log();

	const { filesToBackup, meta } = createBackup(VAULT_A_OBSIDIAN);

	console.log(`  Files collected for backup: ${filesToBackup.length}`);
	console.log();
	console.log("  Backed up files:");
	for (const { source, dest } of filesToBackup) {
		const srcRel = path.relative(VAULT_A, source).replace(/\\/g, "/");
		const destRel = path.relative(getBackupRoot(), dest).replace(/\\/g, "/");
		const exists = fs.existsSync(dest);
		console.log(`    ${srcRel} → ${destRel} ${exists ? "✓" : "✗ MISSING"}`);
	}

	assert(fs.existsSync(getLatestDir()), "Latest backup directory exists");
	assert(fs.existsSync(`${getBackupDir()}/${META_FILE_NAME}`), "meta.json was created");

	// ─── PHASE 3 ───
	phaseHeader(3, "Verify Backup");

	const backedUpFiles = listAllFiles(getLatestDir());
	console.log(`  Total files in backup: ${backedUpFiles.length}`);
	for (const f of backedUpFiles) {
		console.log(`    ${f}`);
	}
	console.log();

	const metaPath = `${getBackupDir()}/${META_FILE_NAME}`;
	assert(fs.existsSync(metaPath), "meta.json exists in backup directory");

	const savedMeta = readMeta();
	assert(savedMeta !== null, "meta.json is readable");
	assert(savedMeta.version === "1.0.0", "meta.json has version 1.0.0");
	assert(typeof savedMeta.lastBackupTime === "number", "meta.json has lastBackupTime");
	assert(typeof savedMeta.lastBackupTimeStr === "string", "meta.json has lastBackupTimeStr");
	assert(typeof savedMeta.fileHashes === "object", "meta.json has fileHashes");

	console.log();
	console.log("  Byte-for-byte comparison of backed up files vs originals:");
	let byteMatchCount = 0;
	for (const { source, dest } of filesToBackup) {
		if (!fs.existsSync(source) || !fs.existsSync(dest)) continue;
		const orig = fs.readFileSync(source);
		const backup = fs.readFileSync(dest);
		const match = orig.equals(backup);
		if (match) byteMatchCount++;
		const srcRel = path.relative(VAULT_A, source).replace(/\\/g, "/");
		console.log(`    ${srcRel}: ${match ? "✅ MATCH" : "❌ MISMATCH"}`);
	}
	assert(byteMatchCount === filesToBackup.filter(f => fs.existsSync(f.source)).length, `All ${byteMatchCount} backed up files match originals byte-for-byte`);

	// ─── PHASE 4 ───
	phaseHeader(4, "Check for Changes (Should Be Zero After Fresh Backup)");

	const changesAfterBackup = checkChanges(VAULT_A_OBSIDIAN);
	console.log(`  Changes detected: ${changesAfterBackup.length}`);
	if (changesAfterBackup.length > 0) {
		for (const c of changesAfterBackup) {
			console.log(`    [${c.type}] ${c.relativePath}`);
		}
	}
	assertEqual(changesAfterBackup.length, 0, "Zero changes after fresh backup");

	// ─── PHASE 5 ───
	phaseHeader(5, "Simulate a Change in Vault A");

	const appearancePath = `${VAULT_A_OBSIDIAN}/appearance.json`;
	const originalAppearance = readFileText(appearancePath);
	const modifiedAppearance = originalAppearance.replace('"Blue Topaz"', '"Minimal"');
	fs.writeFileSync(appearancePath, modifiedAppearance, "utf-8");
	console.log(`  Modified: appearance.json cssTheme "Blue Topaz" → "Minimal"`);

	const changesAfterModify = checkChanges(VAULT_A_OBSIDIAN);
	console.log(`  Changes detected: ${changesAfterModify.length}`);
	for (const c of changesAfterModify) {
		console.log(`    [${c.type}] ${c.relativePath}`);
	}

	const modifiedChanges = changesAfterModify.filter(c => c.type === "modified");
	assertEqual(modifiedChanges.length, 1, "Exactly 1 modified file detected");
	assert(
		modifiedChanges.some(c => c.relativePath === "appearance.json"),
		"Modified file is appearance.json"
	);

	// Restore original appearance.json for clean state
	fs.writeFileSync(appearancePath, originalAppearance, "utf-8");
	console.log("  (Restored original appearance.json for subsequent phases)");

	// ─── PHASE 6 ───
	phaseHeader(6, "Create History Snapshot Before Restore");

	const snapshotTimestamp = createHistorySnapshot();
	assert(snapshotTimestamp !== null, "History snapshot was created");

	const historyDir = getHistoryDir();
	const snapshotDir = `${historyDir}/${snapshotTimestamp}`;
	assert(fs.existsSync(snapshotDir), `Snapshot directory exists: ${snapshotTimestamp}`);

	const snapshotFiles = listAllFiles(snapshotDir);
	const latestFiles = listAllFiles(getLatestDir());
	assertDeepEqual(snapshotFiles, latestFiles, "Snapshot contains same files as latest/");

	console.log(`  Snapshot: ${snapshotTimestamp}`);
	console.log(`  Files in snapshot: ${snapshotFiles.length}`);

	// ─── PHASE 7 ───
	phaseHeader(7, "Restore to Vault B");

	const restoreSource = getLatestDir();
	console.log(`  Restore source: ${restoreSource}`);
	console.log(`  Restore target: ${VAULT_B_OBSIDIAN}`);
	console.log();

	restoreFromPath(restoreSource, VAULT_B_OBSIDIAN);
	console.log("  Restore completed.");

	// ─── PHASE 8 ───
	phaseHeader(8, "Verify Restore Results");

	console.log("  Reading Vault B config files after restore...\n");

	const vaultAAppearance = readFileJson(`${VAULT_A_OBSIDIAN}/appearance.json`);
	const vaultBAppearance = readFileJson(`${VAULT_B_OBSIDIAN}/appearance.json`);
	assertEqual(vaultBAppearance.cssTheme, "Blue Topaz", "appearance.json: cssTheme is Blue Topaz");
	assertEqual(vaultBAppearance.textFont, "Inter", "appearance.json: textFont is Inter");
	assertEqual(vaultBAppearance.baseFontSize, 16, "appearance.json: baseFontSize is 16");
	assertDeepEqual(vaultBAppearance, vaultAAppearance, "appearance.json matches Vault A exactly");

	console.log();

	const vaultAHotkeys = readFileJson(`${VAULT_A_OBSIDIAN}/hotkeys.json`);
	const vaultBHotkeys = readFileJson(`${VAULT_B_OBSIDIAN}/hotkeys.json`);
	assertEqual(Object.keys(vaultBHotkeys).length, 4, "hotkeys.json has 4 custom hotkeys");
	assertDeepEqual(vaultBHotkeys, vaultAHotkeys, "hotkeys.json matches Vault A exactly");

	console.log();

	const vaultACommunity = readFileJson(`${VAULT_A_OBSIDIAN}/community-plugins.json`);
	const vaultBCommunity = readFileJson(`${VAULT_B_OBSIDIAN}/community-plugins.json`);
	assertEqual(vaultBCommunity.length, 8, "community-plugins.json has 8 plugins");
	assertDeepEqual(vaultBCommunity, vaultACommunity, "community-plugins.json matches Vault A exactly");

	console.log();

	const vaultAApp = readFileJson(`${VAULT_A_OBSIDIAN}/app.json`);
	const vaultBApp = readFileJson(`${VAULT_B_OBSIDIAN}/app.json`);
	assertEqual(vaultBApp.defaultViewMode, "source", "app.json: defaultViewMode is source");
	assertEqual(vaultBApp.showLineNumber, true, "app.json: showLineNumber is true");
	assertDeepEqual(vaultBApp, vaultAApp, "app.json matches Vault A exactly");

	console.log();

	const vaultABookmarks = readFileJson(`${VAULT_A_OBSIDIAN}/bookmarks.json`);
	const vaultBBookmarks = readFileJson(`${VAULT_B_OBSIDIAN}/bookmarks.json`);
	assertDeepEqual(vaultBBookmarks, vaultABookmarks, "bookmarks.json matches Vault A exactly");

	console.log();

	const vaultAGraph = readFileJson(`${VAULT_A_OBSIDIAN}/graph.json`);
	const vaultBGraph = readFileJson(`${VAULT_B_OBSIDIAN}/graph.json`);
	assertDeepEqual(vaultBGraph, vaultAGraph, "graph.json matches Vault A exactly");

	console.log();

	const vaultACorePlugins = readFileJson(`${VAULT_A_OBSIDIAN}/core-plugins.json`);
	const vaultBCorePlugins = readFileJson(`${VAULT_B_OBSIDIAN}/core-plugins.json`);
	assertDeepEqual(vaultBCorePlugins, vaultACorePlugins, "core-plugins.json matches Vault A exactly");

	console.log();

	console.log("  Plugin data.json files:");
	const pluginsThatExistInBoth = ["calendar", "dataview", "templater-obsidian"];
	for (const pluginId of pluginsThatExistInBoth) {
		const aData = readFileText(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/data.json`);
		const bData = readFileText(`${VAULT_B_OBSIDIAN}/plugins/${pluginId}/data.json`);
		assert(bData === aData, `plugins/${pluginId}/data.json overwritten with Vault A version`);
	}

	const newPlugins = ["copilot", "floating-toc", "obsidian-style-settings", "obsidian-tasks-plugin", "obsidian-linter"];
	for (const pluginId of newPlugins) {
		const aData = readFileText(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/data.json`);
		const bData = readFileText(`${VAULT_B_OBSIDIAN}/plugins/${pluginId}/data.json`);
		assert(fs.existsSync(`${VAULT_B_OBSIDIAN}/plugins/${pluginId}/data.json`), `plugins/${pluginId}/data.json was created in Vault B`);
		assert(bData === aData, `plugins/${pluginId}/data.json matches Vault A`);
	}

	console.log();

	const vaultBWorkspaceAfter = readFileJson(`${VAULT_B_OBSIDIAN}/workspace.json`);
	const vaultBWorkspaceBefore = JSON.parse('{"main":{"id":"vault-b-workspace","type":"split","children":[{"id":"leaf-b1","type":"leaf","state":{"type":"empty"}},{"id":"leaf-b2","type":"leaf","state":{"type":"graph","state":{}}}]}}');
	assertDeepEqual(vaultBWorkspaceAfter, vaultBWorkspaceBefore, "workspace.json was NOT changed (not in backup scope)");

	console.log();

	console.log("  Specific plugin data verification:");
	const vaultBCalendar = readFileJson(`${VAULT_B_OBSIDIAN}/plugins/calendar/data.json`);
	assertEqual(vaultBCalendar.weekStart, "monday", "calendar/data.json: weekStart is monday (Vault A value)");

	const vaultBDataview = readFileJson(`${VAULT_B_OBSIDIAN}/plugins/dataview/data.json`);
	assertEqual(vaultBDataview.enableInlineQueries, true, "dataview/data.json: enableInlineQueries is true (Vault A value)");
	assertEqual(vaultBDataview.enableJavaScriptQueries, true, "dataview/data.json: enableJavaScriptQueries is true (Vault A value)");

	// ─── PHASE 9 ───
	phaseHeader(9, "Verify Non-Backed-Up Files Are Preserved");

	assert(fs.existsSync(`${VAULT_B_OBSIDIAN}/plugins/calendar`), "plugins/calendar/ directory still exists in Vault B");
	assert(fs.existsSync(`${VAULT_B_OBSIDIAN}/plugins/dataview`), "plugins/dataview/ directory still exists in Vault B");
	assert(fs.existsSync(`${VAULT_B_OBSIDIAN}/plugins/templater-obsidian`), "plugins/templater-obsidian/ directory still exists in Vault B");

	console.log();

	assert(fs.existsSync(`${VAULT_B_OBSIDIAN}/workspace.json`), "workspace.json still exists (was not deleted)");

	// ─── SUMMARY ───
	console.log(`\n${"═".repeat(70)}`);
	console.log(`  TEST SUMMARY`);
	console.log(`${"═".repeat(70)}\n`);
	console.log(`  Total assertions:  ${totalAssertions}`);
	console.log(`  Passed:            ${passedAssertions} ✅`);
	console.log(`  Failed:            ${failedAssertions} ❌`);
	console.log();

	if (failedAssertions === 0) {
		console.log("  🎉 ALL TESTS PASSED! 🎉");
	} else {
		console.log("  ⚠️  SOME TESTS FAILED - review output above");
	}

	console.log(`\n${"═".repeat(70)}\n`);

	process.exit(failedAssertions > 0 ? 1 : 0);
}

main();
