import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const VAULT_DIR = path.join(ROOT, "test-vault");
const CONFIG_DIR_NAME = ".obsidian";
const CONFIG_DIR = path.join(VAULT_DIR, CONFIG_DIR_NAME);
const BACKUP_ROOT = path.join(ROOT, "addon-sync-backup");
const BACKUP_DIR = path.join(BACKUP_ROOT, "addon-sync-backup");
const LATEST_DIR = path.join(BACKUP_DIR, "latest");
const HISTORY_DIR = path.join(BACKUP_DIR, "history");

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

const DEFAULT_SETTINGS = {
	backupPath: "../addon-sync-backup",
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

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (condition) {
		passed++;
		console.log(`  ✅ PASS: ${message}`);
	} else {
		failed++;
		console.log(`  ❌ FAIL: ${message}`);
	}
}

function assertEqual(actual, expected, message) {
	if (actual === expected) {
		passed++;
		console.log(`  ✅ PASS: ${message}`);
	} else {
		failed++;
		console.log(`  ❌ FAIL: ${message}`);
		console.log(`       Expected: ${JSON.stringify(expected)}`);
		console.log(`       Actual:   ${JSON.stringify(actual)}`);
	}
}

function assertIncludes(arr, item, message) {
	if (arr.includes(item)) {
		passed++;
		console.log(`  ✅ PASS: ${message}`);
	} else {
		failed++;
		console.log(`  ❌ FAIL: ${message}`);
		console.log(`       Array does not include: ${JSON.stringify(item)}`);
		console.log(`       Contents: ${JSON.stringify(arr)}`);
	}
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

function removeDirRecursive(dir) {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function createMockApp() {
	return {
		vault: {
			adapter: {
				getBasePath: () => VAULT_DIR,
			},
			configDir: CONFIG_DIR_NAME,
		},
	};
}

class BackupManager {
	constructor(app, settings) {
		this.app = app;
		this.settings = settings;
		this.configDir = app.vault.configDir || ".obsidian";
	}

	getBackupRoot() {
		const vaultPath = this.app.vault.adapter.getBasePath();
		const backupPath = this.settings.backupPath;
		if (!backupPath) return "";
		if (backupPath.includes(":") || backupPath.startsWith("/")) {
			return backupPath;
		}
		return `${vaultPath}/${backupPath}`;
	}

	getBackupDir() {
		const root = this.getBackupRoot();
		return root ? `${root}/${BACKUP_DIR_NAME}` : "";
	}

	getLatestDir() {
		const dir = this.getBackupDir();
		return dir ? `${dir}/${LATEST_DIR_NAME}` : "";
	}

	getHistoryDir() {
		const dir = this.getBackupDir();
		return dir ? `${dir}/${HISTORY_DIR_NAME}` : "";
	}

	collectBackupFiles() {
		const vaultPath = this.app.vault.adapter.getBasePath();
		const configPath = `${vaultPath}/${this.configDir}`;
		const latestDir = this.getLatestDir();
		const result = [];

		const addConfigFile = (filename) => {
			result.push({
				source: `${configPath}/${filename}`,
				dest: `${latestDir}/${filename}`,
			});
		};

		if (this.settings.backupAppearance) {
			for (const f of CONFIG_FILES.appearance) {
				addConfigFile(f);
			}
			const themesDir = `${configPath}/themes`;
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
			const snippetsDir = `${configPath}/snippets`;
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

		if (this.settings.backupHotkeys) {
			for (const f of CONFIG_FILES.hotkeys) {
				addConfigFile(f);
			}
		}

		if (this.settings.backupCorePlugins) {
			for (const f of CONFIG_FILES.corePlugins) {
				addConfigFile(f);
			}
		}

		if (this.settings.backupCommunityPlugins) {
			for (const f of CONFIG_FILES.communityPlugins) {
				addConfigFile(f);
			}
			const pluginsDir = `${configPath}/plugins`;
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
						if (this.settings.backupPluginManifest) {
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

		if (this.settings.backupAppSettings) {
			for (const f of CONFIG_FILES.appSettings) {
				addConfigFile(f);
			}
		}

		if (this.settings.backupBookmarks) {
			for (const f of CONFIG_FILES.bookmarks) {
				addConfigFile(f);
			}
		}

		if (this.settings.backupGraph) {
			for (const f of CONFIG_FILES.graph) {
				addConfigFile(f);
			}
		}

		return result;
	}

	createBackup() {
		const backupDir = this.getBackupDir();
		if (!backupDir) {
			throw new Error("Backup path not configured");
		}

		const latestDir = this.getLatestDir();
		fs.mkdirSync(latestDir, { recursive: true });

		const filesToBackup = this.collectBackupFiles();

		for (const { source, dest } of filesToBackup) {
			const destDir = path.dirname(dest);
			fs.mkdirSync(destDir, { recursive: true });
			if (fs.existsSync(source)) {
				fs.copyFileSync(source, dest);
			}
		}

		this.updateMeta();
	}

	createHistorySnapshot() {
		const latestDir = this.getLatestDir();
		const historyDir = this.getHistoryDir();

		if (!fs.existsSync(latestDir)) {
			return null;
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const snapshotDir = `${historyDir}/${timestamp}`;
		fs.mkdirSync(snapshotDir, { recursive: true });

		copyDirRecursive(latestDir, snapshotDir);

		this.cleanHistory();

		return timestamp;
	}

	cleanHistory() {
		const historyDir = this.getHistoryDir();
		if (!fs.existsSync(historyDir)) return;

		const entries = fs.readdirSync(historyDir)
			.filter((e) => fs.statSync(`${historyDir}/${e}`).isDirectory())
			.sort()
			.reverse();

		const maxCount = this.settings.historyRetentionCount;
		if (entries.length > maxCount) {
			for (let i = maxCount; i < entries.length; i++) {
				fs.rmSync(`${historyDir}/${entries[i]}`, { recursive: true, force: true });
			}
		}
	}

	updateMeta() {
		const backupDir = this.getBackupDir();
		const latestDir = this.getLatestDir();

		const now = Date.now();
		const fileHashes = {};

		if (fs.existsSync(latestDir)) {
			this.computeHashes(latestDir, latestDir, fileHashes);
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
	}

	computeHashes(baseDir, currentDir, hashes) {
		const entries = fs.readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = `${currentDir}/${entry.name}`;
			if (entry.isDirectory()) {
				this.computeHashes(baseDir, fullPath, hashes);
			} else {
				const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
				const content = fs.readFileSync(fullPath, "utf-8");
				hashes[relativePath] = simpleHash(content);
			}
		}
	}

	readMeta() {
		const backupDir = this.getBackupDir();
		const metaPath = `${backupDir}/${META_FILE_NAME}`;
		if (!fs.existsSync(metaPath)) {
			return null;
		}
		const content = fs.readFileSync(metaPath, "utf-8");
		return JSON.parse(content);
	}

	getHistoryList() {
		const historyDir = this.getHistoryDir();
		if (!fs.existsSync(historyDir)) {
			return [];
		}
		return fs.readdirSync(historyDir)
			.filter((e) => fs.statSync(`${historyDir}/${e}`).isDirectory())
			.sort()
			.reverse();
	}
}

class RestoreManager {
	constructor(app, settings, backupManager) {
		this.app = app;
		this.settings = settings;
		this.backupManager = backupManager;
		this.configDir = app.vault.configDir || ".obsidian";
		this.isRestoring = false;
	}

	restoreFromPath(backupPath) {
		const vaultPath = this.app.vault.adapter.getBasePath();
		const configPath = `${vaultPath}/${this.configDir}`;

		if (!fs.existsSync(backupPath)) {
			throw new Error(`Backup path not found: ${backupPath}`);
		}

		this.isRestoring = true;
		try {
			this.backupManager.createHistorySnapshot();
			this.restoreDirRecursive(backupPath, configPath, backupPath);
		} finally {
			this.isRestoring = false;
		}
	}

	restoreDirRecursive(srcDir, destDir, backupRoot) {
		if (!fs.existsSync(srcDir)) return;

		const entries = fs.readdirSync(srcDir, { withFileTypes: true });
		for (const entry of entries) {
			const srcPath = `${srcDir}/${entry.name}`;
			const destPath = `${destDir}/${entry.name}`;

			if (entry.isDirectory()) {
				this.restoreDirRecursive(srcPath, destPath, backupRoot);
			} else {
				fs.mkdirSync(path.dirname(destPath), { recursive: true });
				fs.copyFileSync(srcPath, destPath);
			}
		}
	}

	restoreLatest() {
		const latestDir = this.backupManager.getLatestDir();
		if (!latestDir) {
			throw new Error("Backup path not configured");
		}
		this.restoreFromPath(latestDir);
	}
}

class DiffChecker {
	constructor(app, settings, backupManager) {
		this.app = app;
		this.settings = settings;
		this.backupManager = backupManager;
		this.configDir = app.vault.configDir || ".obsidian";
	}

	checkChanges() {
		const meta = this.backupManager.readMeta();
		if (!meta) {
			return [];
		}

		const latestDir = this.backupManager.getLatestDir();
		const vaultPath = this.app.vault.adapter.getBasePath();
		const configPath = `${vaultPath}/${this.configDir}`;
		const changes = [];

		for (const [relativePath, backupHash] of Object.entries(meta.fileHashes)) {
			const currentPath = `${configPath}/${relativePath}`;

			if (!fs.existsSync(currentPath)) {
				changes.push({
					path: currentPath,
					relativePath,
					type: "deleted",
				});
				continue;
			}

			const currentContent = fs.readFileSync(currentPath, "utf-8");
			const currentHash = simpleHash(currentContent);

			if (currentHash !== backupHash) {
				changes.push({
					path: currentPath,
					relativePath,
					type: "modified",
				});
			}
		}

		const currentFiles = this.collectCurrentConfigFiles(configPath);
		for (const relPath of currentFiles) {
			if (!(relPath in meta.fileHashes)) {
				changes.push({
					path: `${configPath}/${relPath}`,
					relativePath: relPath,
					type: "added",
				});
			}
		}

		return changes;
	}

	collectCurrentConfigFiles(configPath) {
		const result = [];

		const addIfExists = (relativePath) => {
			if (fs.existsSync(`${configPath}/${relativePath}`)) {
				result.push(relativePath);
			}
		};

		if (this.settings.backupAppearance) {
			for (const f of CONFIG_FILES.appearance) {
				addIfExists(f);
			}
			const themesDir = `${configPath}/themes`;
			if (fs.existsSync(themesDir)) {
				const themes = fs.readdirSync(themesDir);
				for (const theme of themes) {
					const themePath = `${themesDir}/${theme}`;
					if (fs.statSync(themePath).isDirectory()) {
						const files = fs.readdirSync(themePath);
						for (const f of files) {
							const rel = `themes/${theme}/${f}`;
							if (fs.statSync(`${themePath}/${f}`).isFile()) {
								result.push(rel);
							}
						}
					}
				}
			}
			const snippetsDir = `${configPath}/snippets`;
			if (fs.existsSync(snippetsDir)) {
				const files = fs.readdirSync(snippetsDir);
				for (const f of files) {
					if (f.endsWith(".css")) {
						result.push(`snippets/${f}`);
					}
				}
			}
		}

		if (this.settings.backupHotkeys) {
			for (const f of CONFIG_FILES.hotkeys) {
				addIfExists(f);
			}
		}

		if (this.settings.backupCorePlugins) {
			for (const f of CONFIG_FILES.corePlugins) {
				addIfExists(f);
			}
		}

		if (this.settings.backupCommunityPlugins) {
			for (const f of CONFIG_FILES.communityPlugins) {
				addIfExists(f);
			}
			const pluginsDir = `${configPath}/plugins`;
			if (fs.existsSync(pluginsDir)) {
				const plugins = fs.readdirSync(pluginsDir);
				for (const pluginId of plugins) {
					const pluginPath = `${pluginsDir}/${pluginId}`;
					if (fs.statSync(pluginPath).isDirectory()) {
						const dataFile = `plugins/${pluginId}/data.json`;
						if (fs.existsSync(`${configPath}/${dataFile}`)) {
							result.push(dataFile);
						}
						if (this.settings.backupPluginManifest) {
							const manifestFile = `plugins/${pluginId}/manifest.json`;
							if (fs.existsSync(`${configPath}/${manifestFile}`)) {
								result.push(manifestFile);
							}
						}
					}
				}
			}
		}

		if (this.settings.backupAppSettings) {
			for (const f of CONFIG_FILES.appSettings) {
				addIfExists(f);
			}
		}

		if (this.settings.backupBookmarks) {
			for (const f of CONFIG_FILES.bookmarks) {
				addIfExists(f);
			}
		}

		if (this.settings.backupGraph) {
			for (const f of CONFIG_FILES.graph) {
				addIfExists(f);
			}
		}

		return result;
	}
}

function setupVault() {
	removeDirRecursive(VAULT_DIR);
	removeDirRecursive(BACKUP_ROOT);

	fs.mkdirSync(CONFIG_DIR, { recursive: true });

	fs.writeFileSync(
		path.join(CONFIG_DIR, "appearance.json"),
		JSON.stringify({ cssTheme: "Minimal", enabledCssSnippets: ["test"] }, null, 2),
		"utf-8"
	);
	fs.writeFileSync(
		path.join(CONFIG_DIR, "hotkeys.json"),
		JSON.stringify({ "editor:save": [{ key: "Mod-s" }] }, null, 2),
		"utf-8"
	);
	fs.writeFileSync(
		path.join(CONFIG_DIR, "core-plugins.json"),
		JSON.stringify({ "file-explorer": true, search: true }, null, 2),
		"utf-8"
	);
	fs.writeFileSync(
		path.join(CONFIG_DIR, "community-plugins.json"),
		JSON.stringify(["dataview", "templater-obsidian"], null, 2),
		"utf-8"
	);
	fs.writeFileSync(
		path.join(CONFIG_DIR, "app.json"),
		JSON.stringify({ legacyEditor: false, readableLineLength: true }, null, 2),
		"utf-8"
	);
	fs.writeFileSync(
		path.join(CONFIG_DIR, "bookmarks.json"),
		JSON.stringify({ items: [] }, null, 2),
		"utf-8"
	);
	fs.writeFileSync(
		path.join(CONFIG_DIR, "graph.json"),
		JSON.stringify({ color: {} }, null, 2),
		"utf-8"
	);

	const dataviewDir = path.join(CONFIG_DIR, "plugins", "dataview");
	fs.mkdirSync(dataviewDir, { recursive: true });
	fs.writeFileSync(
		path.join(dataviewDir, "data.json"),
		JSON.stringify({ enableInlineQueries: true }, null, 2),
		"utf-8"
	);

	const templaterDir = path.join(CONFIG_DIR, "plugins", "templater-obsidian");
	fs.mkdirSync(templaterDir, { recursive: true });
	fs.writeFileSync(
		path.join(templaterDir, "data.json"),
		JSON.stringify({ template_folder: "Templates" }, null, 2),
		"utf-8"
	);

	const addonSyncDir = path.join(CONFIG_DIR, "plugins", "obsidian-addon-sync");
	fs.mkdirSync(addonSyncDir, { recursive: true });
	fs.writeFileSync(
		path.join(addonSyncDir, "data.json"),
		JSON.stringify({ backupPath: "../addon-sync-backup" }, null, 2),
		"utf-8"
	);
}

function cleanup() {
	removeDirRecursive(VAULT_DIR);
	removeDirRecursive(BACKUP_ROOT);
}

function testBackup() {
	console.log("\n📦 TEST: Backup Functionality");
	console.log("─".repeat(50));

	const app = createMockApp();
	const settings = { ...DEFAULT_SETTINGS };
	const bm = new BackupManager(app, settings);

	bm.createBackup();

	assert(
		fs.existsSync(LATEST_DIR),
		"Backup latest directory was created"
	);

	assert(
		fs.existsSync(path.join(LATEST_DIR, "appearance.json")),
		"appearance.json was backed up"
	);
	assert(
		fs.existsSync(path.join(LATEST_DIR, "hotkeys.json")),
		"hotkeys.json was backed up"
	);
	assert(
		fs.existsSync(path.join(LATEST_DIR, "core-plugins.json")),
		"core-plugins.json was backed up"
	);
	assert(
		fs.existsSync(path.join(LATEST_DIR, "community-plugins.json")),
		"community-plugins.json was backed up"
	);
	assert(
		fs.existsSync(path.join(LATEST_DIR, "app.json")),
		"app.json was backed up"
	);
	assert(
		fs.existsSync(path.join(LATEST_DIR, "bookmarks.json")),
		"bookmarks.json was backed up"
	);
	assert(
		fs.existsSync(path.join(LATEST_DIR, "graph.json")),
		"graph.json was backed up"
	);
	assert(
		fs.existsSync(path.join(LATEST_DIR, "plugins", "dataview", "data.json")),
		"plugins/dataview/data.json was backed up"
	);
	assert(
		fs.existsSync(path.join(LATEST_DIR, "plugins", "templater-obsidian", "data.json")),
		"plugins/templater-obsidian/data.json was backed up"
	);
	assert(
		fs.existsSync(path.join(LATEST_DIR, "plugins", "obsidian-addon-sync", "data.json")),
		"plugins/obsidian-addon-sync/data.json was backed up"
	);

	const metaPath = path.join(BACKUP_DIR, META_FILE_NAME);
	assert(fs.existsSync(metaPath), "meta.json was created");

	const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
	assert(meta.lastBackupTime > 0, "meta.json has lastBackupTime");
	assert(typeof meta.lastBackupTimeStr === "string", "meta.json has lastBackupTimeStr");
	assertEqual(meta.version, "1.0.0", "meta.json has version 1.0.0");
	assert(
		Object.keys(meta.fileHashes).length > 0,
		"meta.json has file hashes"
	);

	assertIncludes(
		Object.keys(meta.fileHashes),
		"appearance.json",
		"meta.json contains hash for appearance.json"
	);
	assertIncludes(
		Object.keys(meta.fileHashes),
		"plugins/dataview/data.json",
		"meta.json contains hash for plugins/dataview/data.json"
	);

	const originalAppearance = fs.readFileSync(path.join(CONFIG_DIR, "appearance.json"), "utf-8");
	const backedUpAppearance = fs.readFileSync(path.join(LATEST_DIR, "appearance.json"), "utf-8");
	assertEqual(originalAppearance, backedUpAppearance, "Backed up appearance.json matches original");

	const originalDataview = fs.readFileSync(
		path.join(CONFIG_DIR, "plugins", "dataview", "data.json"), "utf-8"
	);
	const backedUpDataview = fs.readFileSync(
		path.join(LATEST_DIR, "plugins", "dataview", "data.json"), "utf-8"
	);
	assertEqual(originalDataview, backedUpDataview, "Backed up plugins/dataview/data.json matches original");
}

function testDiffDetection() {
	console.log("\n🔍 TEST: Diff Detection");
	console.log("─".repeat(50));

	const app = createMockApp();
	const settings = { ...DEFAULT_SETTINGS };
	const bm = new BackupManager(app, settings);
	const dc = new DiffChecker(app, settings, bm);

	const changesAfterBackup = dc.checkChanges();
	assertEqual(changesAfterBackup.length, 0, "No changes detected right after backup");

	const appearancePath = path.join(CONFIG_DIR, "appearance.json");
	fs.writeFileSync(
		appearancePath,
		JSON.stringify({ cssTheme: "Blue Topaz", enabledCssSnippets: ["test"] }, null, 2),
		"utf-8"
	);

	const changesAfterModify = dc.checkChanges();
	assertEqual(changesAfterModify.length, 1, "1 change detected after modifying appearance.json");
	assertEqual(changesAfterModify[0].type, "modified", "Change type is 'modified'");
	assertEqual(changesAfterModify[0].relativePath, "appearance.json", "Changed file is appearance.json");

	const newPluginDir = path.join(CONFIG_DIR, "plugins", "new-plugin");
	fs.mkdirSync(newPluginDir, { recursive: true });
	fs.writeFileSync(
		path.join(newPluginDir, "data.json"),
		JSON.stringify({ enabled: true }, null, 2),
		"utf-8"
	);

	const changesAfterAdd = dc.checkChanges();
	const addedChanges = changesAfterAdd.filter((c) => c.type === "added");
	assertEqual(addedChanges.length, 1, "1 added file detected after creating new-plugin/data.json");
	assertEqual(addedChanges[0].relativePath, "plugins/new-plugin/data.json", "Added file is plugins/new-plugin/data.json");

	const modifiedChanges = changesAfterAdd.filter((c) => c.type === "modified");
	assertEqual(modifiedChanges.length, 1, "Modified change still present (appearance.json)");

	const bookmarksPath = path.join(CONFIG_DIR, "bookmarks.json");
	fs.unlinkSync(bookmarksPath);

	const changesAfterDelete = dc.checkChanges();
	const deletedChanges = changesAfterDelete.filter((c) => c.type === "deleted");
	assertEqual(deletedChanges.length, 1, "1 deleted file detected after removing bookmarks.json");
	assertEqual(deletedChanges[0].relativePath, "bookmarks.json", "Deleted file is bookmarks.json");

	fs.writeFileSync(
		appearancePath,
		JSON.stringify({ cssTheme: "Minimal", enabledCssSnippets: ["test"] }, null, 2),
		"utf-8"
	);
	fs.writeFileSync(
		bookmarksPath,
		JSON.stringify({ items: [] }, null, 2),
		"utf-8"
	);
	removeDirRecursive(newPluginDir);
}

function testHistorySnapshots() {
	console.log("\n📚 TEST: History Snapshots");
	console.log("─".repeat(50));

	const app = createMockApp();
	const settings = { ...DEFAULT_SETTINGS, historyRetentionCount: 10 };
	const bm = new BackupManager(app, settings);

	const timestamp = bm.createHistorySnapshot();
	assert(timestamp !== null, "History snapshot returned a timestamp");
	assert(fs.existsSync(HISTORY_DIR), "History directory was created");

	const historyList = bm.getHistoryList();
	assertEqual(historyList.length, 1, "1 history snapshot exists");

	const snapshotDir = path.join(HISTORY_DIR, historyList[0]);
	assert(fs.existsSync(snapshotDir), "Snapshot directory exists");

	assert(
		fs.existsSync(path.join(snapshotDir, "appearance.json")),
		"Snapshot contains appearance.json"
	);
	assert(
		fs.existsSync(path.join(snapshotDir, "plugins", "dataview", "data.json")),
		"Snapshot contains plugins/dataview/data.json"
	);

	const latestAppearance = fs.readFileSync(path.join(LATEST_DIR, "appearance.json"), "utf-8");
	const snapshotAppearance = fs.readFileSync(path.join(snapshotDir, "appearance.json"), "utf-8");
	assertEqual(latestAppearance, snapshotAppearance, "Snapshot files match latest backup");

	const metaPath = path.join(BACKUP_DIR, META_FILE_NAME);
	const latestMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
	const expectedHash = latestMeta.fileHashes["appearance.json"];
	assertEqual(expectedHash, simpleHash(snapshotAppearance), "Snapshot file hash matches meta hash");
}

function testRestore() {
	console.log("\n♻️  TEST: Restore Functionality");
	console.log("─".repeat(50));

	const app = createMockApp();
	const settings = { ...DEFAULT_SETTINGS };
	const bm = new BackupManager(app, settings);
	const rm = new RestoreManager(app, settings, bm);

	const originalAppearance = fs.readFileSync(
		path.join(CONFIG_DIR, "appearance.json"), "utf-8"
	);

	fs.writeFileSync(
		path.join(CONFIG_DIR, "appearance.json"),
		JSON.stringify({ cssTheme: "CHANGED", enabledCssSnippets: [] }, null, 2),
		"utf-8"
	);

	const modifiedAppearance = fs.readFileSync(
		path.join(CONFIG_DIR, "appearance.json"), "utf-8"
	);
	assert(
		modifiedAppearance !== originalAppearance,
		"appearance.json was actually modified before restore"
	);

	rm.restoreLatest();

	const restoredAppearance = fs.readFileSync(
		path.join(CONFIG_DIR, "appearance.json"), "utf-8"
	);
	assertEqual(restoredAppearance, originalAppearance, "appearance.json restored to original content");

	const originalHotkeys = fs.readFileSync(
		path.join(LATEST_DIR, "hotkeys.json"), "utf-8"
	);
	const currentHotkeys = fs.readFileSync(
		path.join(CONFIG_DIR, "hotkeys.json"), "utf-8"
	);
	assertEqual(currentHotkeys, originalHotkeys, "hotkeys.json unaffected by restore (still matches backup)");

	const originalApp = fs.readFileSync(
		path.join(LATEST_DIR, "app.json"), "utf-8"
	);
	const currentApp = fs.readFileSync(
		path.join(CONFIG_DIR, "app.json"), "utf-8"
	);
	assertEqual(currentApp, originalApp, "app.json unaffected by restore (still matches backup)");
}

function testRestoreNoDelete() {
	console.log("\n🛡️  TEST: Restore Does Not Delete Non-Backed-Up Files");
	console.log("─".repeat(50));

	const app = createMockApp();
	const settings = { ...DEFAULT_SETTINGS };
	const bm = new BackupManager(app, settings);
	const rm = new RestoreManager(app, settings, bm);

	const mainJsPath = path.join(CONFIG_DIR, "plugins", "dataview", "main.js");
	const mainJsContent = "// dataview plugin main.js - not backed up";
	fs.mkdirSync(path.dirname(mainJsPath), { recursive: true });
	fs.writeFileSync(mainJsPath, mainJsContent, "utf-8");

	assert(fs.existsSync(mainJsPath), "main.js was created in vault before restore");

	rm.restoreLatest();

	assert(fs.existsSync(mainJsPath), "main.js still exists after restore");
	assertEqual(
		fs.readFileSync(mainJsPath, "utf-8"),
		mainJsContent,
		"main.js content unchanged after restore"
	);
}

function main() {
	console.log("╔══════════════════════════════════════════════════╗");
	console.log("║  obsidian-addon-sync Core Logic Tests           ║");
	console.log("╚══════════════════════════════════════════════════╝");

	try {
		setupVault();

		testBackup();
		testDiffDetection();
		testHistorySnapshots();
		testRestore();
		testRestoreNoDelete();
	} finally {
		cleanup();
	}

	console.log("\n" + "═".repeat(50));
	console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
	console.log("═".repeat(50));

	if (failed > 0) {
		console.log("\n💥 SOME TESTS FAILED!");
		process.exit(1);
	} else {
		console.log("\n🎉 ALL TESTS PASSED!");
		process.exit(0);
	}
}

main();
