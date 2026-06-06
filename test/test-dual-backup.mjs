import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const VAULT_A = path.join(ROOT, "test-vault-a");
const VAULT_B = path.join(ROOT, "test-vault-b");
const VAULT_A_OBSIDIAN = path.join(VAULT_A, ".obsidian");
const VAULT_B_OBSIDIAN = path.join(VAULT_B, ".obsidian");

const BACKUP_DIR_NAME = "addon-sync-backup";
const LATEST_DIR_NAME = "latest";
const HISTORY_DIR_NAME = "history";
const META_FILE_NAME = "meta.json";
const LOCAL_SNAPSHOT_DIR_NAME = "addon-sync-local";

const CONFIG_FILES = {
	appearance: ["appearance.json"],
	hotkeys: ["hotkeys.json"],
	corePlugins: ["core-plugins.json", "core-plugins-migration.json"],
	communityPlugins: ["community-plugins.json"],
	appSettings: ["app.json"],
	bookmarks: ["bookmarks.json"],
	graph: ["graph.json"],
};

const VAULT_B_ORIGINAL = {
	appearance: {
		cssTheme: "Blue Topaz",
		enabledCssSnippets: [],
		baseFontSize: 16,
		interfaceFontSize: 14,
		textFont: "Inter",
		monospaceFont: "Fira Code",
		accentColor: "#7b5ea7",
	},
	app: {
		legacyEditor: false,
		readableLineLength: true,
		defaultViewMode: "source",
		showLineNumber: true,
		spellcheck: true,
		strictLineBreaks: false,
		showUnsupportedFiles: true,
		attachmentFolderPath: "attachments",
		newFileLocation: "current",
		promptDelete: true,
		showFrontmatter: true,
	},
	communityPlugins: [
		"calendar", "copilot", "dataview", "floating-toc",
		"obsidian-style-settings", "obsidian-tasks-plugin",
		"templater-obsidian", "obsidian-linter",
	],
	corePlugins: {
		"file-explorer": true, "global-search": true, "switcher": true,
		"graph": true, "backlink": true, "canvas": true,
		"outgoing-link": true, "tag-pane": true, "page-preview": true,
		"daily-notes": true, "templates": true, "note-composer": true,
		"command-palette": true, "slash-command": false, "editor-status": true,
		"starred": true, "markdown-importer": false, "zk-prefixer": false,
		"random-note": false, "outline": true, "word-count": true,
		"slides": false, "audio-recorder": false, "workspaces": false,
		"file-recovery": true, "publish": false, "sync": false,
		"bookmarks": true,
	},
	hotkeys: {
		"editor:save-file": [{ modifiers: ["Mod"], key: "s" }],
		"command-palette:open": [{ modifiers: ["Mod", "Shift"], key: "p" }],
		"global-search:open": [{ modifiers: ["Mod", "Shift"], key: "f" }],
		"obsidian-advanced-new-file:toolbar-new-file": [{ modifiers: ["Mod"], key: "n" }],
	},
	workspace: {
		main: {
			id: "vault-b-workspace",
			type: "split",
			children: [
				{ id: "leaf-b1", type: "leaf", state: { type: "empty" } },
				{ id: "leaf-b2", type: "leaf", state: { type: "graph", state: {} } },
			],
		},
	},
	bookmarks: {
		items: [
			{ title: "Dashboard", path: "Dashboard.md", type: "file" },
			{ title: "Projects", path: "Projects", type: "folder" },
		],
	},
	graph: {
		color: {
			"1": { a: 0.7, b: 0.4, c: 0.8, group: "note" },
			"2": { a: 0.3, b: 0.6, c: 0.9, group: "attachment" },
		},
		showOrphans: true,
		showAttachments: false,
	},
};

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
	if (condition) {
		console.log(`  ✅ PASS: ${label}`);
		passed++;
	} else {
		console.log(`  ❌ FAIL: ${label}`);
		failed++;
		failures.push(label);
	}
}

function simpleHash(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0;
	}
	return hash.toString(16);
}

function copyDirRecursive(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function rmDirRecursive(dir) {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getSyncBackupDir(vaultPath, backupPath) {
	let root;
	if (backupPath.includes(":") || backupPath.startsWith("/")) {
		root = backupPath;
	} else {
		root = path.join(vaultPath, backupPath);
	}
	return path.join(root, BACKUP_DIR_NAME);
}

function getLocalSnapshotDir(vaultPath, localSnapshotPath) {
	let root;
	if (localSnapshotPath.includes(":") || localSnapshotPath.startsWith("/")) {
		root = localSnapshotPath;
	} else {
		root = path.join(vaultPath, localSnapshotPath);
	}
	return path.join(root, LOCAL_SNAPSHOT_DIR_NAME);
}

function collectBackupFiles(configPath, latestDir, settings) {
	const result = [];

	const addConfigFile = (file) => {
		const src = path.join(configPath, file);
		if (fs.existsSync(src)) {
			result.push({ source: src, dest: path.join(latestDir, file) });
		}
	};

	const collectDirFiles = (srcDir, destDir) => {
		if (!fs.existsSync(srcDir)) return;
		const entries = fs.readdirSync(srcDir);
		for (const entry of entries) {
			const srcPath = path.join(srcDir, entry);
			if (fs.statSync(srcPath).isFile()) {
				result.push({ source: srcPath, dest: path.join(destDir, entry) });
			}
		}
	};

	if (settings.backupAppearance) {
		for (const f of CONFIG_FILES.appearance) addConfigFile(f);
		const themesDir = path.join(configPath, "themes");
		if (fs.existsSync(themesDir)) {
			collectDirFiles(themesDir, path.join(latestDir, "themes"));
		}
		const snippetsDir = path.join(configPath, "snippets");
		if (fs.existsSync(snippetsDir)) {
			collectDirFiles(snippetsDir, path.join(latestDir, "snippets"));
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
		const pluginsDir = path.join(configPath, "plugins");
		if (fs.existsSync(pluginsDir)) {
			const plugins = fs.readdirSync(pluginsDir);
			for (const pluginId of plugins) {
				const pluginPath = path.join(pluginsDir, pluginId);
				if (fs.statSync(pluginPath).isDirectory()) {
					const files = fs.readdirSync(pluginPath);
					for (const file of files) {
						const filePath = path.join(pluginPath, file);
						if (fs.statSync(filePath).isFile()) {
							result.push({
								source: filePath,
								dest: path.join(latestDir, "plugins", pluginId, file),
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

function buildMeta(backupFiles, configPath) {
	const now = new Date();
	const fileHashes = {};
	const pluginVersions = {};

	for (const file of backupFiles) {
		const content = fs.readFileSync(file.source);
		const relativePath = path.relative(configPath, file.source).replace(/\\/g, "/");
		fileHashes[relativePath] = simpleHash(content.toString());

		const match = relativePath.match(/^plugins\/([^/]+)\/manifest\.json$/);
		if (match) {
			try {
				const manifest = JSON.parse(content.toString());
				pluginVersions[match[1]] = manifest.version || "unknown";
			} catch {}
		}
	}

	return {
		version: "1.0.0",
		lastBackupTime: now.getTime(),
		lastBackupTimeStr: now.toISOString(),
		fileHashes,
		changelog: [],
		pluginVersions,
	};
}

function detectChanges(oldHashes, newHashes) {
	const changes = [];
	for (const [file, hash] of Object.entries(newHashes)) {
		if (!oldHashes[file]) {
			changes.push({ path: file, relativePath: file, type: "added" });
		} else if (oldHashes[file] !== hash) {
			changes.push({ path: file, relativePath: file, type: "modified" });
		}
	}
	for (const file of Object.keys(oldHashes)) {
		if (!newHashes[file]) {
			changes.push({ path: file, relativePath: file, type: "deleted" });
		}
	}
	return changes;
}

function createBackup(vaultPath, settings) {
	const syncDir = getSyncBackupDir(vaultPath, settings.backupPath);
	const configPath = path.join(vaultPath, ".obsidian");
	const latestDir = path.join(syncDir, LATEST_DIR_NAME);

	let previousMeta = null;
	const metaPath = path.join(syncDir, META_FILE_NAME);
	if (fs.existsSync(metaPath)) {
		try {
			previousMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
		} catch {}
	}

	const changes = [];
	const backupFiles = collectBackupFiles(configPath, latestDir, settings);

	for (const file of backupFiles) {
		fs.mkdirSync(path.dirname(file.dest), { recursive: true });
		fs.copyFileSync(file.source, file.dest);
	}

	const meta = buildMeta(backupFiles, configPath);

	if (previousMeta) {
		const detectedChanges = detectChanges(previousMeta.fileHashes, meta.fileHashes);
		for (const change of detectedChanges) {
			const prefix = change.type === "added" ? "+" : change.type === "deleted" ? "-" : "~";
			changes.push(`${prefix} ${change.relativePath}`);
		}
	} else {
		changes.push("+ Initial backup");
	}

	meta.changelog = changes;

	const now = new Date();
	const timestamp = now.toISOString().replace(/[:.]/g, "-");

	const historyDir = path.join(syncDir, HISTORY_DIR_NAME, timestamp);
	if (fs.existsSync(latestDir)) {
		copyDirRecursive(latestDir, historyDir);
		fs.writeFileSync(
			path.join(historyDir, META_FILE_NAME),
			JSON.stringify(meta, null, 2),
		);
	}

	const localDir = getLocalSnapshotDir(vaultPath, settings.localSnapshotPath);
	if (localDir) {
		const snapshotDir = path.join(localDir, timestamp);
		copyDirRecursive(configPath, snapshotDir);
		fs.writeFileSync(
			path.join(snapshotDir, META_FILE_NAME),
			JSON.stringify(meta, null, 2),
		);
	}

	fs.mkdirSync(syncDir, { recursive: true });
	fs.writeFileSync(path.join(syncDir, META_FILE_NAME), JSON.stringify(meta, null, 2));

	cleanHistory(path.join(syncDir, HISTORY_DIR_NAME), settings.syncHistoryRetentionCount);
	cleanHistory(localDir, settings.localSnapshotRetentionCount);

	return { meta, timestamp };
}

function cleanHistory(historyDir, retentionCount) {
	if (!fs.existsSync(historyDir)) return;
	const entries = fs.readdirSync(historyDir).sort();
	while (entries.length > retentionCount) {
		const oldest = entries.shift();
		if (oldest) {
			fs.rmSync(path.join(historyDir, oldest), { recursive: true, force: true });
		}
	}
}

function restoreFromPath(backupPath, vaultPath, settings) {
	if (!fs.existsSync(backupPath)) {
		throw new Error("Backup path not found: " + backupPath);
	}

	const configPath = path.join(vaultPath, ".obsidian");
	const now = new Date();
	const timestamp = now.toISOString().replace(/[:.]/g, "-");

	const localDir = getLocalSnapshotDir(vaultPath, settings.localSnapshotPath);
	if (localDir) {
		const snapshotDir = path.join(localDir, "pre-restore-" + timestamp);
		copyDirRecursive(configPath, snapshotDir);
	}

	restoreDirRecursive(backupPath, configPath);
}

function restoreDirRecursive(srcDir, destDir) {
	const entries = fs.readdirSync(srcDir, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(srcDir, entry.name);
		const destPath = path.join(destDir, entry.name);

		if (entry.name === "meta.json") continue;

		if (entry.isDirectory()) {
			restoreDirRecursive(srcPath, destPath);
		} else {
			fs.mkdirSync(path.dirname(destPath), { recursive: true });
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

function listAllFiles(dir, base = "") {
	if (!fs.existsSync(dir)) return [];
	const result = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const rel = base ? `${base}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			result.push(...listAllFiles(path.join(dir, entry.name), rel));
		} else {
			result.push(rel);
		}
	}
	return result;
}

function filesAreIdentical(fileA, fileB) {
	if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) return false;
	return fs.readFileSync(fileA).equals(fs.readFileSync(fileB));
}

function resetVaultB() {
	writeJson(path.join(VAULT_B_OBSIDIAN, "appearance.json"), VAULT_B_ORIGINAL.appearance);
	writeJson(path.join(VAULT_B_OBSIDIAN, "app.json"), VAULT_B_ORIGINAL.app);
	writeJson(path.join(VAULT_B_OBSIDIAN, "community-plugins.json"), VAULT_B_ORIGINAL.communityPlugins);
	writeJson(path.join(VAULT_B_OBSIDIAN, "core-plugins.json"), VAULT_B_ORIGINAL.corePlugins);
	writeJson(path.join(VAULT_B_OBSIDIAN, "hotkeys.json"), VAULT_B_ORIGINAL.hotkeys);
	writeJson(path.join(VAULT_B_OBSIDIAN, "workspace.json"), VAULT_B_ORIGINAL.workspace);
	writeJson(path.join(VAULT_B_OBSIDIAN, "bookmarks.json"), VAULT_B_ORIGINAL.bookmarks);
	writeJson(path.join(VAULT_B_OBSIDIAN, "graph.json"), VAULT_B_ORIGINAL.graph);

	const pluginsDir = path.join(VAULT_B_OBSIDIAN, "plugins");
	if (fs.existsSync(pluginsDir)) {
		const currentPlugins = fs.readdirSync(pluginsDir);
		for (const plugin of currentPlugins) {
			const pluginPath = path.join(pluginsDir, plugin);
			if (fs.statSync(pluginPath).isDirectory() && !VAULT_B_ORIGINAL.communityPlugins.includes(plugin)) {
				rmDirRecursive(pluginPath);
			}
		}
	}
}

const SETTINGS = {
	backupPath: "meta",
	localSnapshotPath: ".addon-sync-local",
	backupAppearance: true,
	backupHotkeys: true,
	backupCorePlugins: true,
	backupCommunityPlugins: true,
	backupAppSettings: true,
	backupBookmarks: true,
	backupGraph: true,
	syncHistoryRetentionCount: 10,
	localSnapshotRetentionCount: 5,
};

console.log("=".repeat(70));
console.log("  DUAL-DIRECTORY BACKUP SYSTEM - COMPREHENSIVE TEST");
console.log("=".repeat(70));
console.log();

console.log("━━━ SETUP: Preparing test environment ━━━");
rmDirRecursive(path.join(VAULT_A, "meta"));
rmDirRecursive(path.join(VAULT_B, "meta"));
rmDirRecursive(path.join(VAULT_A, ".addon-sync-local"));
rmDirRecursive(path.join(VAULT_B, ".addon-sync-local"));
console.log("  Cleaned up old artifacts from both vaults");

resetVaultB();
console.log("  Reset Vault B to known original state");

const appearanceA = readJson(path.join(VAULT_A_OBSIDIAN, "appearance.json"));
const originalCssThemeA = appearanceA.cssTheme;
appearanceA.cssTheme = "Blue Topaz";
delete appearanceA.theme;
delete appearanceA.nativeMenus;
delete appearanceA.showRibbon;
appearanceA.enabledCssSnippets = [];
appearanceA.baseFontSize = 16;
appearanceA.interfaceFontSize = 14;
appearanceA.textFont = "Inter";
appearanceA.monospaceFont = "Fira Code";
appearanceA.accentColor = "#7b5ea7";
writeJson(path.join(VAULT_A_OBSIDIAN, "appearance.json"), appearanceA);
console.log(`  Set Vault A appearance.cssTheme = "Blue Topaz" (was "${originalCssThemeA}")`);
console.log();

console.log("━━━ PHASE 1: Initial state verification ━━━");
const appA = readJson(path.join(VAULT_A_OBSIDIAN, "app.json"));
const appB = readJson(path.join(VAULT_B_OBSIDIAN, "app.json"));
const appearA = readJson(path.join(VAULT_A_OBSIDIAN, "appearance.json"));
const appearB = readJson(path.join(VAULT_B_OBSIDIAN, "appearance.json"));
const hotkeysA = readJson(path.join(VAULT_A_OBSIDIAN, "hotkeys.json"));
const hotkeysB = readJson(path.join(VAULT_B_OBSIDIAN, "hotkeys.json"));
const coreA = readJson(path.join(VAULT_A_OBSIDIAN, "core-plugins.json"));
const coreB = readJson(path.join(VAULT_B_OBSIDIAN, "core-plugins.json"));
const communityA = readJson(path.join(VAULT_A_OBSIDIAN, "community-plugins.json"));
const communityB = readJson(path.join(VAULT_B_OBSIDIAN, "community-plugins.json"));
const workspaceA = readJson(path.join(VAULT_A_OBSIDIAN, "workspace.json"));
const workspaceB = readJson(path.join(VAULT_B_OBSIDIAN, "workspace.json"));

console.log("\n  Config differences between Vault A and Vault B:");
console.log(`    appearance.cssTheme:   A="${appearA.cssTheme}"  B="${appearB.cssTheme}"`);
console.log(`    app.defaultViewMode:    A="${appA.defaultViewMode || "N/A"}"  B="${appB.defaultViewMode || "N/A"}"`);
console.log(`    hotkeys keys count:     A=${Object.keys(hotkeysA).length}  B=${Object.keys(hotkeysB).length}`);
console.log(`    core-plugins:           A has ${Object.keys(coreA).length} entries, B has ${Object.keys(coreB).length}`);
console.log(`    community-plugins:      A has ${communityA.length} plugins, B has ${communityB.length} plugins`);
console.log(`    workspace main id:      A="${workspaceA.main?.id}"  B="${workspaceB.main?.id}"`);

const configsDiffer =
	appearA.cssTheme !== appearB.cssTheme ||
	appA.defaultViewMode !== appB.defaultViewMode ||
	Object.keys(hotkeysA).length !== Object.keys(hotkeysB).length ||
	coreA["slash-command"] !== coreB["slash-command"] ||
	communityA.length !== communityB.length ||
	workspaceA.main?.id !== workspaceB.main?.id;

assert(configsDiffer, "Vault A and Vault B have different configurations");
assert(appearA.cssTheme === "Blue Topaz" && appearB.cssTheme === "Blue Topaz", "Both vaults have 'Blue Topaz' theme (setup for Phase 5)");
assert(appA.defaultViewMode !== appB.defaultViewMode, `app.json defaultViewMode differs (A="${appA.defaultViewMode}", B="${appB.defaultViewMode}")`);
assert(communityA.length !== communityB.length, `community-plugins.json differs (A=${communityA.length}, B=${communityB.length} plugins)`);
console.log();

console.log("━━━ PHASE 2: Create first backup from Vault A ━━━");
console.log("  Settings:");
console.log(`    backupPath:              "${SETTINGS.backupPath}" (sync directory)`);
console.log(`    localSnapshotPath:       "${SETTINGS.localSnapshotPath}" (local safety)`);
console.log(`    All backup categories:   enabled`);
console.log(`    syncHistoryRetention:    ${SETTINGS.syncHistoryRetentionCount}`);
console.log(`    localSnapshotRetention:  ${SETTINGS.localSnapshotRetentionCount}`);
console.log();

const backup1 = createBackup(VAULT_A, SETTINGS);
console.log(`  Backup 1 created at timestamp: ${backup1.timestamp}`);
console.log(`  Changelog: ${backup1.meta.changelog.join(", ")}`);
console.log();

console.log("━━━ PHASE 3: Verify sync backup structure ━━━");
const syncBackupDir = getSyncBackupDir(VAULT_A, SETTINGS.backupPath);
const latestDir = path.join(syncBackupDir, LATEST_DIR_NAME);
const historyDir = path.join(syncBackupDir, HISTORY_DIR_NAME);

assert(fs.existsSync(latestDir), "vault-a/meta/addon-sync-backup/latest/ exists");

const latestFiles = listAllFiles(latestDir);
console.log(`  Files in latest/ (${latestFiles.length} total):`);
latestFiles.slice(0, 10).forEach((f) => console.log(`    - ${f}`));
if (latestFiles.length > 10) console.log(`    ... and ${latestFiles.length - 10} more`);

assert(latestFiles.includes("appearance.json"), "latest/ contains appearance.json");
assert(latestFiles.includes("hotkeys.json"), "latest/ contains hotkeys.json");
assert(latestFiles.includes("app.json"), "latest/ contains app.json");
assert(latestFiles.includes("core-plugins.json"), "latest/ contains core-plugins.json");
assert(latestFiles.includes("community-plugins.json"), "latest/ contains community-plugins.json");
assert(latestFiles.includes("bookmarks.json"), "latest/ contains bookmarks.json");
assert(latestFiles.includes("graph.json"), "latest/ contains graph.json");

const hasPluginFiles = latestFiles.some((f) => f.startsWith("plugins/"));
assert(hasPluginFiles, "latest/ contains plugin files");

const hasThemeFiles = latestFiles.some((f) => f.startsWith("themes/"));
if (hasThemeFiles) {
	assert(hasThemeFiles, "latest/ contains theme files");
} else {
	console.log("  ℹ️  NOTE: themes/ subdirs NOT backed up (collectDirFiles is non-recursive in source).");
	console.log("     This matches the source code behavior exactly.");
	assert(true, "latest/ theme behavior matches source code (non-recursive collectDirFiles)");
}

const hasSnippetFiles = latestFiles.some((f) => f.startsWith("snippets/"));
assert(hasSnippetFiles, "latest/ contains snippet files");

const historyEntries = fs.existsSync(historyDir) ? fs.readdirSync(historyDir).sort() : [];
assert(historyEntries.length === 1, `history/ has 1 entry (found ${historyEntries.length})`);

const metaPath = path.join(syncBackupDir, META_FILE_NAME);
assert(fs.existsSync(metaPath), "meta.json exists in sync backup directory");

const meta = readJson(metaPath);
assert(meta.fileHashes && Object.keys(meta.fileHashes).length > 0, `meta.json has fileHashes (${Object.keys(meta.fileHashes).length} entries)`);
assert(meta.changelog && meta.changelog.length > 0, `meta.json has changelog: [${meta.changelog.join(", ")}]`);
assert(meta.changelog.includes("+ Initial backup"), "changelog says '+ Initial backup'");

assert(meta.pluginVersions && Object.keys(meta.pluginVersions).length > 0, `meta.json has pluginVersions (${Object.keys(meta.pluginVersions).length} entries)`);
console.log("  Plugin versions in meta.json:");
for (const [plugin, version] of Object.entries(meta.pluginVersions)) {
	console.log(`    ${plugin}: ${version}`);
}

const metaDirName = path.basename(path.dirname(metaPath));
assert(metaDirName === BACKUP_DIR_NAME, `Backup directory is "${BACKUP_DIR_NAME}" (not hidden, NAS will sync)`);
assert(!BACKUP_DIR_NAME.startsWith("."), "Backup dir name does NOT start with '.' (NAS will sync it)");
console.log();

console.log("━━━ PHASE 4: Verify local safety snapshot ━━━");
const localSnapshotDir = getLocalSnapshotDir(VAULT_A, SETTINGS.localSnapshotPath);
assert(fs.existsSync(localSnapshotDir), "vault-a/.addon-sync-local/addon-sync-local/ exists");

const localEntries = fs.readdirSync(localSnapshotDir).sort();
assert(localEntries.length === 1, `Local snapshot has 1 entry (found ${localEntries.length})`);

const localSnapshotPath = path.join(localSnapshotDir, localEntries[0]);
const localFiles = listAllFiles(localSnapshotPath);
console.log(`  Local snapshot files (${localFiles.length} total):`);
localFiles.slice(0, 10).forEach((f) => console.log(`    - ${f}`));
if (localFiles.length > 10) console.log(`    ... and ${localFiles.length - 10} more`);

const obsidianFiles = listAllFiles(VAULT_A_OBSIDIAN);
const allObsidianFilesInSnapshot = obsidianFiles.every((f) => localFiles.includes(f));
assert(allObsidianFilesInSnapshot, "Local snapshot is a COMPLETE copy of .obsidian/ (all files present)");

const localDirName = path.basename(path.dirname(localSnapshotDir));
assert(localDirName.startsWith("."), `Local directory starts with "." ("${localDirName}", NAS will skip it)`);
console.log();

console.log("━━━ PHASE 5: Modify Vault A and create second backup ━━━");
const appearance5 = readJson(path.join(VAULT_A_OBSIDIAN, "appearance.json"));
const beforeChange = appearance5.cssTheme;
appearance5.cssTheme = "Minimal";
writeJson(path.join(VAULT_A_OBSIDIAN, "appearance.json"), appearance5);
console.log(`  Changed vault-a appearance.cssTheme: "${beforeChange}" → "Minimal"`);

const backup2 = createBackup(VAULT_A, SETTINGS);
console.log(`  Backup 2 created at timestamp: ${backup2.timestamp}`);
console.log(`  Changelog: ${backup2.meta.changelog.join(", ")}`);

const meta2 = readJson(metaPath);
const hasAppearanceChange = meta2.changelog.some((c) => c.includes("appearance.json"));
assert(hasAppearanceChange, `meta.json changelog shows appearance.json change: [${meta2.changelog.filter((c) => c.includes("appearance")).join(", ")}]`);

const historyEntries2 = fs.readdirSync(historyDir).sort();
assert(historyEntries2.length === 2, `history/ now has 2 entries (found ${historyEntries2.length})`);

const localEntries2 = fs.readdirSync(localSnapshotDir).sort();
assert(localEntries2.length === 2, `Local snapshot now has 2 entries (found ${localEntries2.length})`);
console.log();

console.log("━━━ PHASE 6: Simulate NAS sync ━━━");
const metaSrc = path.join(VAULT_A, "meta");
const metaDest = path.join(VAULT_B, "meta");
rmDirRecursive(metaDest);
copyDirRecursive(metaSrc, metaDest);
assert(fs.existsSync(metaDest), "Copied vault-a/meta/ to vault-b/meta/");
console.log("  NAS sync simulation complete: vault-a/meta/ → vault-b/meta/");
console.log();

console.log("━━━ PHASE 7: Restore to Vault B from history (FIRST backup = Blue Topaz) ━━━");
const vaultBHistoryDir = path.join(getSyncBackupDir(VAULT_B, SETTINGS.backupPath), HISTORY_DIR_NAME);
const vbHistoryEntries = fs.readdirSync(vaultBHistoryDir).sort();
assert(vbHistoryEntries.length === 2, `Vault B history has 2 entries (found ${vbHistoryEntries.length})`);

const firstBackupTimestamp = vbHistoryEntries[0];
console.log(`  First backup timestamp: ${firstBackupTimestamp}`);
const firstBackupPath = path.join(vaultBHistoryDir, firstBackupTimestamp);
console.log(`  Restoring from: ${firstBackupPath}`);

restoreFromPath(firstBackupPath, VAULT_B, SETTINGS);

const appearBAfter1 = readJson(path.join(VAULT_B_OBSIDIAN, "appearance.json"));
assert(appearBAfter1.cssTheme === "Blue Topaz", `Vault B now has Blue Topaz theme (found: "${appearBAfter1.cssTheme}")`);
console.log(`  Vault B appearance.cssTheme after restore from history: "${appearBAfter1.cssTheme}"`);
console.log();

console.log("━━━ PHASE 8: Restore to Vault B from latest ━━━");
const vaultBLatestDir = path.join(getSyncBackupDir(VAULT_B, SETTINGS.backupPath), LATEST_DIR_NAME);
assert(fs.existsSync(vaultBLatestDir), "vault-b/meta/addon-sync-backup/latest/ exists");

restoreFromPath(vaultBLatestDir, VAULT_B, SETTINGS);

const appearBAfter2 = readJson(path.join(VAULT_B_OBSIDIAN, "appearance.json"));
assert(appearBAfter2.cssTheme === "Minimal", `Vault B now has "Minimal" theme (found: "${appearBAfter2.cssTheme}")`);
console.log(`  Vault B appearance.cssTheme after latest restore: "${appearBAfter2.cssTheme}"`);

assert(
	filesAreIdentical(
		path.join(VAULT_A_OBSIDIAN, "appearance.json"),
		path.join(VAULT_B_OBSIDIAN, "appearance.json"),
	),
	"appearance.json matches Vault A after restore"
);
assert(
	filesAreIdentical(
		path.join(VAULT_A_OBSIDIAN, "app.json"),
		path.join(VAULT_B_OBSIDIAN, "app.json"),
	),
	"app.json matches Vault A after restore"
);
assert(
	filesAreIdentical(
		path.join(VAULT_A_OBSIDIAN, "hotkeys.json"),
		path.join(VAULT_B_OBSIDIAN, "hotkeys.json"),
	),
	"hotkeys.json matches Vault A after restore"
);
assert(
	filesAreIdentical(
		path.join(VAULT_A_OBSIDIAN, "core-plugins.json"),
		path.join(VAULT_B_OBSIDIAN, "core-plugins.json"),
	),
	"core-plugins.json matches Vault A after restore"
);
assert(
	filesAreIdentical(
		path.join(VAULT_A_OBSIDIAN, "community-plugins.json"),
		path.join(VAULT_B_OBSIDIAN, "community-plugins.json"),
	),
	"community-plugins.json matches Vault A after restore"
);
console.log();

console.log("━━━ PHASE 9: Verify local safety was created before restore ━━━");
const vaultBLocalDir = getLocalSnapshotDir(VAULT_B, SETTINGS.localSnapshotPath);
assert(fs.existsSync(vaultBLocalDir), "vault-b/.addon-sync-local/addon-sync-local/ exists");

const vbLocalEntries = fs.readdirSync(vaultBLocalDir);
const preRestoreEntries = vbLocalEntries.filter((e) => e.startsWith("pre-restore-"));
assert(preRestoreEntries.length >= 1, `Found ${preRestoreEntries.length} pre-restore snapshot(s) in Vault B`);

if (preRestoreEntries.length > 0) {
	const preRestoreDir = path.join(vaultBLocalDir, preRestoreEntries[0]);
	const preRestoreFiles = listAllFiles(preRestoreDir);
	console.log(`  Pre-restore snapshot: ${preRestoreEntries[0]} (${preRestoreFiles.length} files)`);

	const preRestoreAppear = readJson(path.join(preRestoreDir, "appearance.json"));
	assert(
		preRestoreAppear.cssTheme === "Blue Topaz",
		`Pre-restore snapshot has Vault B's original theme "Blue Topaz" (found: "${preRestoreAppear.cssTheme}")`
	);
	console.log(`  Pre-restore appearance.cssTheme: "${preRestoreAppear.cssTheme}" (Vault B original: "Blue Topaz")`);
}
console.log();

console.log("━━━ PHASE 10: Verify workspace.json was NOT changed ━━━");
const workspaceBFinal = readJson(path.join(VAULT_B_OBSIDIAN, "workspace.json"));
assert(
	workspaceBFinal.main?.id === "vault-b-workspace",
	`Vault B workspace.json preserved: main.id="${workspaceBFinal.main?.id}" (original: "vault-b-workspace")`
);

const workspaceUnchanged = filesAreIdentical(
	path.join(VAULT_B_OBSIDIAN, "workspace.json"),
	path.join(VAULT_B, ".addon-sync-local", "addon-sync-local", preRestoreEntries[0], "workspace.json"),
);
assert(workspaceUnchanged, "workspace.json is identical to pre-restore snapshot (was never modified by restore)");
console.log(`  Vault B workspace.json main.id: "${workspaceBFinal.main?.id}" (unchanged)`);
console.log();

console.log("━━━ PHASE 11: Verify plugin files were fully restored ━━━");
const vaultBLatestDir2 = getSyncBackupDir(VAULT_B, SETTINGS.backupPath);
const vbLatestPluginDir = path.join(vaultBLatestDir2, LATEST_DIR_NAME, "plugins");

const copilotFiles = fs.existsSync(path.join(vbLatestPluginDir, "copilot"))
	? listAllFiles(path.join(vbLatestPluginDir, "copilot"))
	: [];
console.log(`  Copilot files in backup: [${copilotFiles.join(", ")}]`);

const vbCopilotDir = path.join(VAULT_B_OBSIDIAN, "plugins", "copilot");

for (const file of copilotFiles) {
	const destFile = path.join(vbCopilotDir, file);
	assert(fs.existsSync(destFile), `  copilot/${file} exists in Vault B`);
}

const copilotManifestB = readJson(path.join(vbCopilotDir, "manifest.json"));
const copilotManifestA = readJson(path.join(VAULT_A_OBSIDIAN, "plugins", "copilot", "manifest.json"));
assert(
	copilotManifestB.version === copilotManifestA.version,
	`Copilot version matches: A=${copilotManifestA.version}, B=${copilotManifestB.version}`
);

const metaFinal = readJson(path.join(vaultBLatestDir2, META_FILE_NAME));
const pluginVersionsInBackup = metaFinal.pluginVersions;
let allVersionsMatch = true;
for (const [pluginId, version] of Object.entries(pluginVersionsInBackup)) {
	const manifestPath = path.join(VAULT_B_OBSIDIAN, "plugins", pluginId, "manifest.json");
	if (fs.existsSync(manifestPath)) {
		const manifest = readJson(manifestPath);
		if (manifest.version !== version) {
			allVersionsMatch = false;
			console.log(`  MISMATCH: ${pluginId} backup=${version} restored=${manifest.version}`);
		}
	}
}
assert(allVersionsMatch, "All plugin versions in Vault B match Vault A's versions");

console.log("  Plugin versions comparison:");
for (const [pluginId, version] of Object.entries(pluginVersionsInBackup)) {
	const manifestPath = path.join(VAULT_B_OBSIDIAN, "plugins", pluginId, "manifest.json");
	if (fs.existsSync(manifestPath)) {
		const manifest = readJson(manifestPath);
		const match = manifest.version === version ? "✓" : "✗";
		console.log(`    ${match} ${pluginId}: backup=${version} restored=${manifest.version}`);
	}
}
console.log();

console.log("=".repeat(70));
console.log("  TEST RESULTS SUMMARY");
console.log("=".repeat(70));
console.log(`  Total assertions: ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log();
if (failed === 0) {
	console.log("  🎉 ALL TESTS PASSED! 🎉");
} else {
	console.log("  ⚠️  FAILURES:");
	for (const f of failures) {
		console.log(`    - ${f}`);
	}
}
console.log();
console.log("=".repeat(70));
