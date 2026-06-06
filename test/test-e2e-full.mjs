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
		console.log(`  \u2705 PASS: ${message}`);
	} else {
		failedAssertions++;
		console.log(`  \u274c FAIL: ${message}`);
	}
}

function assertEqual(actual, expected, message) {
	totalAssertions++;
	if (actual === expected) {
		passedAssertions++;
		console.log(`  \u2705 PASS: ${message}`);
	} else {
		failedAssertions++;
		console.log(`  \u274c FAIL: ${message}`);
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
		console.log(`  \u2705 PASS: ${message}`);
	} else {
		failedAssertions++;
		console.log(`  \u274c FAIL: ${message}`);
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
					const files = fs.readdirSync(pluginPath);
					for (const file of files) {
						const filePath = `${pluginPath}/${file}`;
						if (fs.statSync(filePath).isFile()) {
							result.push({
								source: filePath,
								dest: `${latestDir}/plugins/${pluginId}/${file}`,
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
	console.log("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
	console.log("\u2551   OBSIDIAN ADDON-SYNC E2E TEST (FULL PLUGIN BACKUP/RESTORE)       \u2551");
	console.log("\u2551   Tests UPDATED logic: ALL plugin files backed up               \u2551");
	console.log("\u2551   main.js + manifest.json + data.json + styles.css + etc.       \u2551");
	console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");

	const configNames = ["appearance.json", "hotkeys.json", "core-plugins.json", "community-plugins.json", "app.json", "bookmarks.json", "graph.json"];

	const vaultBWorkspaceOriginal = readFileText(`${VAULT_B_OBSIDIAN}/workspace.json`);

	// ─── PHASE 1 ───
	phaseHeader(1, "Display Initial State - Differences Between Vaults");

	console.log("  \ud83d\udcc1 Vault A (.obsidian/) config files:");
	console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
	for (const name of configNames) {
		const data = readFileJson(`${VAULT_A_OBSIDIAN}/${name}`);
		console.log(`  ${name}: ${JSON.stringify(data)}`);
	}

	console.log();
	console.log("  \ud83d\udcc1 Vault B (.obsidian/) config files:");
	console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
	for (const name of configNames) {
		const data = readFileJson(`${VAULT_B_OBSIDIAN}/${name}`);
		console.log(`  ${name}: ${JSON.stringify(data)}`);
	}

	console.log();
	console.log("  \ud83d\udcca Plugin directories in Vault A:");
	const vaultAPlugins = fs.readdirSync(`${VAULT_A_OBSIDIAN}/plugins`);
	for (const p of vaultAPlugins) {
		const files = fs.readdirSync(`${VAULT_A_OBSIDIAN}/plugins/${p}`);
		console.log(`    ${p}/: ${files.join(", ")}`);
	}

	console.log();
	console.log("  \ud83d\udcca Plugin directories in Vault B:");
	const vaultBPlugins = fs.readdirSync(`${VAULT_B_OBSIDIAN}/plugins`);
	for (const p of vaultBPlugins) {
		const files = fs.readdirSync(`${VAULT_B_OBSIDIAN}/plugins/${p}`);
		console.log(`    ${p}/: ${files.join(", ")}`);
	}

	console.log();
	console.log("  \ud83d\udcca Comparison Table:");
	console.log("  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510");
	console.log("  \u2501 File                   \u2501 Vault A                  \u2501 Vault B                  \u2501");
	console.log("  \u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524");

	const compareFields = {
		"appearance.json": (d) => d ? `theme=${d.cssTheme || "(none)"}, font=${d.textFont || "(default)"}, size=${d.baseFontSize}` : "(missing)",
		"hotkeys.json": (d) => d ? `${Object.keys(d).length} custom hotkeys` : "(empty)",
		"core-plugins.json": (d) => d ? `${Object.values(d).filter(v => v === true).length} enabled` : "(missing)",
		"community-plugins.json": (d) => d ? `${d.length} plugins: ${d.join(",")}` : "(empty)",
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
		const diff = aStr !== bStr ? " \u26a0\ufe0f" : "  ";
		console.log(`  \u2501 ${name.padEnd(22)} \u2501 ${aStr.padEnd(24)} \u2501 ${bStr.padEnd(24)} \u2501${diff}`);
	}
	console.log("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");

	// ─── PHASE 2 ───
	phaseHeader(2, "Create Backup from Vault A (UPDATED: ALL Plugin Files)");

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
		console.log(`    ${srcRel} \u2192 ${destRel} ${exists ? "\u2713" : "\u2717 MISSING"}`);
	}

	assert(fs.existsSync(getLatestDir()), "Latest backup directory exists");
	assert(fs.existsSync(`${getBackupDir()}/${META_FILE_NAME}`), "meta.json was created");

	// ─── PHASE 3 ───
	phaseHeader(3, "Verify Backup Includes ALL Plugin Files");

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
	console.log("  Verifying each plugin has main.js, manifest.json, data.json in backup:");

	const allPlugins = fs.readdirSync(`${VAULT_A_OBSIDIAN}/plugins`);
	for (const pluginId of allPlugins) {
		const pluginFiles = fs.readdirSync(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}`);
		for (const file of pluginFiles) {
			const backupRelPath = `plugins/${pluginId}/${file}`;
			const backupFullPath = `${getLatestDir()}/${backupRelPath}`;
			const existsInBackup = fs.existsSync(backupFullPath);
			assert(existsInBackup, `${backupRelPath} exists in backup`);

			if (existsInBackup) {
				const origContent = fs.readFileSync(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/${file}`, "utf-8");
				const backupContent = fs.readFileSync(backupFullPath, "utf-8");
				assert(origContent === backupContent, `${backupRelPath} content matches original`);
			}
		}
	}

	console.log();
	console.log("  Verifying meta.json file hashes include all plugin files:");
	for (const pluginId of allPlugins) {
		const pluginFiles = fs.readdirSync(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}`);
		for (const file of pluginFiles) {
			const backupRelPath = `plugins/${pluginId}/${file}`;
			assert(backupRelPath in savedMeta.fileHashes, `meta.json hash includes ${backupRelPath}`);
		}
	}

	console.log();
	console.log("  Byte-for-byte comparison of ALL backed up files vs originals:");
	let byteMatchCount = 0;
	let byteTotalCount = 0;
	for (const { source, dest } of filesToBackup) {
		if (!fs.existsSync(source) || !fs.existsSync(dest)) continue;
		byteTotalCount++;
		const orig = fs.readFileSync(source);
		const backup = fs.readFileSync(dest);
		const match = orig.equals(backup);
		if (match) byteMatchCount++;
		const srcRel = path.relative(VAULT_A, source).replace(/\\/g, "/");
		console.log(`    ${srcRel}: ${match ? "\u2705 MATCH" : "\u274c MISMATCH"}`);
	}
	assert(byteMatchCount === byteTotalCount, `All ${byteMatchCount} backed up files match originals byte-for-byte`);

	// ─── PHASE 4 ───
	phaseHeader(4, "Restore to Vault B");

	const restoreSource = getLatestDir();
	console.log(`  Restore source: ${restoreSource}`);
	console.log(`  Restore target: ${VAULT_B_OBSIDIAN}`);
	console.log();

	restoreFromPath(restoreSource, VAULT_B_OBSIDIAN);
	console.log("  Restore completed.");

	// ─── PHASE 5 ───
	phaseHeader(5, "Verify Vault B Now Has Complete Plugins");

	console.log("  --- New plugins that were ADDED to Vault B ---\n");

	const newPlugins = ["copilot", "floating-toc", "obsidian-linter", "obsidian-style-settings", "obsidian-tasks-plugin"];
	for (const pluginId of newPlugins) {
		const mainJsPath = `${VAULT_B_OBSIDIAN}/plugins/${pluginId}/main.js`;
		const manifestPath = `${VAULT_B_OBSIDIAN}/plugins/${pluginId}/manifest.json`;
		const dataPath = `${VAULT_B_OBSIDIAN}/plugins/${pluginId}/data.json`;

		assert(fs.existsSync(mainJsPath), `plugins/${pluginId}/main.js NOW EXISTS in Vault B`);
		assert(fs.existsSync(manifestPath), `plugins/${pluginId}/manifest.json NOW EXISTS in Vault B`);
		assert(fs.existsSync(dataPath), `plugins/${pluginId}/data.json NOW EXISTS in Vault B`);

		const aMainJs = readFileText(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/main.js`);
		const bMainJs = readFileText(mainJsPath);
		assertEqual(bMainJs, aMainJs, `plugins/${pluginId}/main.js matches Vault A`);

		const aManifest = readFileJson(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/manifest.json`);
		const bManifest = readFileJson(manifestPath);
		assertDeepEqual(bManifest, aManifest, `plugins/${pluginId}/manifest.json matches Vault A`);

		const aData = readFileText(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/data.json`);
		const bData = readFileText(dataPath);
		assertEqual(bData, aData, `plugins/${pluginId}/data.json matches Vault A`);
	}

	console.log();
	console.log("  --- Existing plugins that were OVERWRITTEN in Vault B ---\n");

	const existingPlugins = ["calendar", "dataview", "templater-obsidian"];
	for (const pluginId of existingPlugins) {
		const aMainJs = readFileText(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/main.js`);
		const bMainJs = readFileText(`${VAULT_B_OBSIDIAN}/plugins/${pluginId}/main.js`);
		assertEqual(bMainJs, aMainJs, `plugins/${pluginId}/main.js was OVERWRITTEN with Vault A version`);

		const aManifest = readFileJson(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/manifest.json`);
		const bManifest = readFileJson(`${VAULT_B_OBSIDIAN}/plugins/${pluginId}/manifest.json`);
		assertDeepEqual(bManifest, aManifest, `plugins/${pluginId}/manifest.json was OVERWRITTEN with Vault A version`);

		const aData = readFileText(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/data.json`);
		const bData = readFileText(`${VAULT_B_OBSIDIAN}/plugins/${pluginId}/data.json`);
		assertEqual(bData, aData, `plugins/${pluginId}/data.json was OVERWRITTEN with Vault A version`);
	}

	console.log();
	console.log("  --- Specific version checks for overwritten plugins ---\n");

	const calendarManifest = readFileJson(`${VAULT_B_OBSIDIAN}/plugins/calendar/manifest.json`);
	assertEqual(calendarManifest.version, "1.5.10", "calendar manifest.json shows version 1.5.10 (was 1.0.0)");

	const dataviewManifest = readFileJson(`${VAULT_B_OBSIDIAN}/plugins/dataview/manifest.json`);
	assertEqual(dataviewManifest.version, "0.5.68", "dataview manifest.json shows version 0.5.68 (was 0.4.0)");

	const templaterManifest = readFileJson(`${VAULT_B_OBSIDIAN}/plugins/templater-obsidian/manifest.json`);
	assertEqual(templaterManifest.version, "2.18.1", "templater manifest.json shows version 2.18.1 (was 1.0.0)");

	console.log();
	console.log("  --- Vault B workspace.json should be UNCHANGED ---\n");

	const vaultBWorkspaceAfter = readFileText(`${VAULT_B_OBSIDIAN}/workspace.json`);
	assertEqual(vaultBWorkspaceAfter, vaultBWorkspaceOriginal, "workspace.json was NOT changed (not in backup scope)");

	// ─── PHASE 6 ───
	phaseHeader(6, "Verify ALL Config Files Match Between Vaults");

	const vaultAAppearance = readFileJson(`${VAULT_A_OBSIDIAN}/appearance.json`);
	const vaultBAppearance = readFileJson(`${VAULT_B_OBSIDIAN}/appearance.json`);
	assertDeepEqual(vaultBAppearance, vaultAAppearance, "appearance.json matches Vault A exactly");

	const vaultAHotkeys = readFileJson(`${VAULT_A_OBSIDIAN}/hotkeys.json`);
	const vaultBHotkeys = readFileJson(`${VAULT_B_OBSIDIAN}/hotkeys.json`);
	assertDeepEqual(vaultBHotkeys, vaultAHotkeys, "hotkeys.json matches Vault A exactly");

	const vaultACorePlugins = readFileJson(`${VAULT_A_OBSIDIAN}/core-plugins.json`);
	const vaultBCorePlugins = readFileJson(`${VAULT_B_OBSIDIAN}/core-plugins.json`);
	assertDeepEqual(vaultBCorePlugins, vaultACorePlugins, "core-plugins.json matches Vault A exactly");

	const vaultACommunity = readFileJson(`${VAULT_A_OBSIDIAN}/community-plugins.json`);
	const vaultBCommunity = readFileJson(`${VAULT_B_OBSIDIAN}/community-plugins.json`);
	assertDeepEqual(vaultBCommunity, vaultACommunity, "community-plugins.json matches Vault A exactly");

	const vaultAApp = readFileJson(`${VAULT_A_OBSIDIAN}/app.json`);
	const vaultBApp = readFileJson(`${VAULT_B_OBSIDIAN}/app.json`);
	assertDeepEqual(vaultBApp, vaultAApp, "app.json matches Vault A exactly");

	const vaultABookmarks = readFileJson(`${VAULT_A_OBSIDIAN}/bookmarks.json`);
	const vaultBBookmarks = readFileJson(`${VAULT_B_OBSIDIAN}/bookmarks.json`);
	assertDeepEqual(vaultBBookmarks, vaultABookmarks, "bookmarks.json matches Vault A exactly");

	const vaultAGraph = readFileJson(`${VAULT_A_OBSIDIAN}/graph.json`);
	const vaultBGraph = readFileJson(`${VAULT_B_OBSIDIAN}/graph.json`);
	assertDeepEqual(vaultBGraph, vaultAGraph, "graph.json matches Vault A exactly");

	console.log();
	console.log("  Full byte-for-byte verification of ALL plugin files between Vault A and Vault B:");
	const allPluginsA = fs.readdirSync(`${VAULT_A_OBSIDIAN}/plugins`);
	const allPluginsB = fs.readdirSync(`${VAULT_B_OBSIDIAN}/plugins`);
	for (const pluginId of allPluginsA) {
		assert(allPluginsB.includes(pluginId), `Plugin ${pluginId} exists in Vault B`);
	}
	for (const pluginId of allPluginsA) {
		const aFiles = fs.readdirSync(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}`);
		for (const file of aFiles) {
			const aContent = readFileText(`${VAULT_A_OBSIDIAN}/plugins/${pluginId}/${file}`);
			const bContent = readFileText(`${VAULT_B_OBSIDIAN}/plugins/${pluginId}/${file}`);
			assertEqual(bContent, aContent, `plugins/${pluginId}/${file} Vault B matches Vault A`);
		}
	}

	// ─── SUMMARY ───
	console.log(`\n${"=".repeat(70)}`);
	console.log(`  TEST SUMMARY`);
	console.log(`${"=".repeat(70)}\n`);
	console.log(`  Total assertions:  ${totalAssertions}`);
	console.log(`  Passed:            ${passedAssertions} \u2705`);
	console.log(`  Failed:            ${failedAssertions} \u274c`);
	console.log();

	if (failedAssertions === 0) {
		console.log("  \ud83c\udf89 ALL TESTS PASSED! \ud83c\udf89");
	} else {
		console.log("  \u26a0\ufe0f  SOME TESTS FAILED - review output above");
	}

	console.log(`\n${"=".repeat(70)}\n`);

	process.exit(failedAssertions > 0 ? 1 : 0);
}

main();
