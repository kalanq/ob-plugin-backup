var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => AddonSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/types.ts
var DEFAULT_SETTINGS = {
  backupPath: "meta",
  localSnapshotPath: ".addon-sync-local",
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
  syncHistoryRetentionCount: 10,
  localSnapshotRetentionCount: 5
};

// src/constants.ts
var BACKUP_DIR_NAME = "addon-sync-backup";
var LATEST_DIR_NAME = "latest";
var HISTORY_DIR_NAME = "history";
var META_FILE_NAME = "meta.json";
var LOCAL_SNAPSHOT_DIR_NAME = "addon-sync-local";
var CONFIG_FILES = {
  appearance: ["appearance.json"],
  hotkeys: ["hotkeys.json"],
  corePlugins: ["core-plugins.json", "core-plugins-migration.json"],
  communityPlugins: ["community-plugins.json"],
  appSettings: ["app.json"],
  bookmarks: ["bookmarks.json"],
  graph: ["graph.json"]
};
var BACKUP_CATEGORIES = [
  { key: "backupAppearance", label: "Appearance & Theme", description: "appearance.json, themes/, snippets/" },
  { key: "backupHotkeys", label: "Custom Hotkeys", description: "hotkeys.json" },
  { key: "backupCorePlugins", label: "Core Plugins", description: "core-plugins.json" },
  { key: "backupCommunityPlugins", label: "Community Plugins", description: "community-plugins.json, all plugin files (main.js, manifest.json, data.json)" },
  { key: "backupAppSettings", label: "App Settings", description: "app.json (editor, links, files)" },
  { key: "backupBookmarks", label: "Bookmarks", description: "bookmarks.json" },
  { key: "backupGraph", label: "Graph Settings", description: "graph.json" }
];
var COMMANDS = {
  CREATE_BACKUP: "addon-sync-create-backup",
  RESTORE_LATEST: "addon-sync-restore-latest",
  RESTORE_FROM_HISTORY: "addon-sync-restore-from-history",
  CHECK_CHANGES: "addon-sync-check-changes"
};
var INTERVAL_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" }
];
var RETENTION_OPTIONS = [
  { value: 3, label: "3 snapshots" },
  { value: 5, label: "5 snapshots" },
  { value: 10, label: "10 snapshots" },
  { value: 20, label: "20 snapshots" },
  { value: 30, label: "30 snapshots" },
  { value: 50, label: "50 snapshots" }
];

// src/backup.ts
var fs = require("fs");
var path = require("path");
var BackupManager = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
  }
  updateSettings(settings) {
    this.settings = settings;
  }
  getVaultPath() {
    return this.app.vault.adapter.getBasePath();
  }
  getConfigPath() {
    return path.join(this.getVaultPath(), ".obsidian");
  }
  getSyncBackupRoot() {
    const p = this.settings.backupPath;
    if (!p)
      return "";
    if (p.includes(":") || p.startsWith("/"))
      return p;
    return path.join(this.getVaultPath(), p);
  }
  getSyncBackupDir() {
    const root = this.getSyncBackupRoot();
    return root ? path.join(root, BACKUP_DIR_NAME) : "";
  }
  getLocalSnapshotRoot() {
    const p = this.settings.localSnapshotPath;
    if (!p)
      return "";
    if (p.includes(":") || p.startsWith("/"))
      return p;
    return path.join(this.getVaultPath(), p);
  }
  getLocalSnapshotDir() {
    const root = this.getLocalSnapshotRoot();
    return root ? path.join(root, LOCAL_SNAPSHOT_DIR_NAME) : "";
  }
  async createBackup() {
    const syncDir = this.getSyncBackupDir();
    if (!syncDir) {
      throw new Error("Backup path not configured");
    }
    const configPath = this.getConfigPath();
    const latestDir = path.join(syncDir, LATEST_DIR_NAME);
    const previousMeta = await this.readMeta();
    const changes = [];
    const backupFiles = this.collectBackupFiles(configPath, latestDir);
    for (const file of backupFiles) {
      fs.mkdirSync(path.dirname(file.dest), { recursive: true });
      fs.copyFileSync(file.source, file.dest);
    }
    const meta = this.buildMeta(backupFiles, configPath);
    if (previousMeta) {
      const detectedChanges = this.detectChanges(previousMeta.fileHashes, meta.fileHashes);
      for (const change of detectedChanges) {
        const prefix = change.type === "added" ? "+" : change.type === "deleted" ? "-" : "~";
        changes.push(`${prefix} ${change.relativePath}`);
      }
    } else {
      changes.push("+ Initial backup");
    }
    meta.changelog = changes;
    const now = /* @__PURE__ */ new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    await this.createSyncHistorySnapshot(syncDir, latestDir, timestamp, meta);
    await this.createLocalSnapshot(configPath, timestamp, meta);
    fs.mkdirSync(syncDir, { recursive: true });
    fs.writeFileSync(path.join(syncDir, META_FILE_NAME), JSON.stringify(meta, null, 2));
    this.cleanHistory(
      path.join(syncDir, HISTORY_DIR_NAME),
      this.settings.syncHistoryRetentionCount
    );
    this.cleanHistory(
      this.getLocalSnapshotDir(),
      this.settings.localSnapshotRetentionCount
    );
  }
  detectChanges(oldHashes, newHashes) {
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
  collectBackupFiles(configPath, latestDir) {
    const result = [];
    const addConfigFile = (file) => {
      const src = path.join(configPath, file);
      if (fs.existsSync(src)) {
        result.push({ source: src, dest: path.join(latestDir, file) });
      }
    };
    if (this.settings.backupAppearance) {
      for (const f of CONFIG_FILES.appearance)
        addConfigFile(f);
      const themesDir = path.join(configPath, "themes");
      if (fs.existsSync(themesDir)) {
        this.collectDirFiles(themesDir, path.join(latestDir, "themes"), result);
      }
      const snippetsDir = path.join(configPath, "snippets");
      if (fs.existsSync(snippetsDir)) {
        this.collectDirFiles(snippetsDir, path.join(latestDir, "snippets"), result);
      }
    }
    if (this.settings.backupHotkeys) {
      for (const f of CONFIG_FILES.hotkeys)
        addConfigFile(f);
    }
    if (this.settings.backupCorePlugins) {
      for (const f of CONFIG_FILES.corePlugins)
        addConfigFile(f);
    }
    if (this.settings.backupCommunityPlugins) {
      for (const f of CONFIG_FILES.communityPlugins)
        addConfigFile(f);
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
                  dest: path.join(latestDir, "plugins", pluginId, file)
                });
              }
            }
          }
        }
      }
    }
    if (this.settings.backupAppSettings) {
      for (const f of CONFIG_FILES.appSettings)
        addConfigFile(f);
    }
    if (this.settings.backupBookmarks) {
      for (const f of CONFIG_FILES.bookmarks)
        addConfigFile(f);
    }
    if (this.settings.backupGraph) {
      for (const f of CONFIG_FILES.graph)
        addConfigFile(f);
    }
    return result;
  }
  collectDirFiles(srcDir, destDir, result) {
    const entries = fs.readdirSync(srcDir);
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry);
      if (fs.statSync(srcPath).isDirectory()) {
        this.collectDirFiles(srcPath, path.join(destDir, entry), result);
      } else if (fs.statSync(srcPath).isFile()) {
        result.push({ source: srcPath, dest: path.join(destDir, entry) });
      }
    }
  }
  buildMeta(backupFiles, configPath) {
    const now = /* @__PURE__ */ new Date();
    const fileHashes = {};
    const pluginVersions = {};
    for (const file of backupFiles) {
      const content = fs.readFileSync(file.source);
      const relativePath = path.relative(configPath, file.source).replace(/\\/g, "/");
      fileHashes[relativePath] = this.simpleHash(content.toString());
      const match = relativePath.match(/^plugins\/([^/]+)\/manifest\.json$/);
      if (match) {
        try {
          const manifest = JSON.parse(content.toString());
          pluginVersions[match[1]] = manifest.version || "unknown";
        } catch (e) {
        }
      }
    }
    return {
      version: "1.0.0",
      lastBackupTime: now.getTime(),
      lastBackupTimeStr: now.toISOString(),
      fileHashes,
      changelog: [],
      pluginVersions
    };
  }
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(16);
  }
  async createSyncHistorySnapshot(syncDir, latestDir, timestamp, meta) {
    const historyDir = path.join(syncDir, HISTORY_DIR_NAME, timestamp);
    if (!fs.existsSync(latestDir))
      return;
    this.copyDirRecursive(latestDir, historyDir);
    fs.writeFileSync(
      path.join(historyDir, META_FILE_NAME),
      JSON.stringify(meta, null, 2)
    );
  }
  async createLocalSnapshot(configPath, timestamp, meta) {
    const localDir = this.getLocalSnapshotDir();
    if (!localDir)
      return;
    const snapshotDir = path.join(localDir, timestamp);
    this.copyDirRecursive(configPath, snapshotDir);
    fs.writeFileSync(
      path.join(snapshotDir, META_FILE_NAME),
      JSON.stringify(meta, null, 2)
    );
  }
  copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  cleanHistory(historyDir, retentionCount) {
    if (!fs.existsSync(historyDir))
      return;
    const entries = fs.readdirSync(historyDir).sort();
    while (entries.length > retentionCount) {
      const oldest = entries.shift();
      if (oldest) {
        fs.rmSync(path.join(historyDir, oldest), { recursive: true, force: true });
      }
    }
  }
  async readMeta() {
    const syncDir = this.getSyncBackupDir();
    if (!syncDir)
      return null;
    const metaPath = path.join(syncDir, META_FILE_NAME);
    if (!fs.existsSync(metaPath))
      return null;
    try {
      return JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch (e) {
      return null;
    }
  }
  getSyncBackupDir() {
    return this.getSyncBackupDirInternal();
  }
  getSyncBackupDirInternal() {
    return this.getSyncBackupDir();
  }
  getSyncHistoryDir() {
    return path.join(this.getSyncBackupDir(), HISTORY_DIR_NAME);
  }
  getSyncLatestDir() {
    return path.join(this.getSyncBackupDir(), LATEST_DIR_NAME);
  }
  getLocalSnapshotDirPublic() {
    return this.getLocalSnapshotDir();
  }
  getHistoryList() {
    const historyDir = this.getSyncHistoryDir();
    if (!fs.existsSync(historyDir))
      return [];
    const entries = fs.readdirSync(historyDir).sort().reverse();
    return entries.map((timestamp) => {
      const metaPath = path.join(historyDir, timestamp, META_FILE_NAME);
      let meta = null;
      try {
        if (fs.existsSync(metaPath)) {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        }
      } catch (e) {
      }
      const displayName = this.formatTimestamp(timestamp);
      return { timestamp, displayName, meta };
    });
  }
  getLocalSnapshotList() {
    const localDir = this.getLocalSnapshotDir();
    if (!fs.existsSync(localDir))
      return [];
    const entries = fs.readdirSync(localDir).sort().reverse();
    return entries.map((timestamp) => ({
      timestamp,
      displayName: "Local: " + this.formatTimestamp(timestamp)
    }));
  }
  formatTimestamp(ts) {
    try {
      const normalized = ts.replace(/-/g, (m, offset) => {
        if (offset < 10)
          return "-";
        if (offset === 10)
          return "T";
        if (offset === 13 || offset === 16)
          return ":";
        return "-";
      });
      const date = new Date(normalized.endsWith("Z") ? normalized : normalized + "Z");
      if (isNaN(date.getTime()))
        return ts;
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch (e) {
      return ts;
    }
  }
};

// src/restore.ts
var import_obsidian = require("obsidian");
var fs2 = require("fs");
var path2 = require("path");
var RestoreManager = class {
  constructor(app, settings, backupManager) {
    this.isRestoring = false;
    this.app = app;
    this.settings = settings;
    this.backupManager = backupManager;
  }
  updateSettings(settings) {
    this.settings = settings;
  }
  getVaultPath() {
    return this.app.vault.adapter.getBasePath();
  }
  getConfigPath() {
    return path2.join(this.getVaultPath(), ".obsidian");
  }
  async restoreLatest() {
    const latestDir = this.backupManager.getSyncLatestDir();
    if (!fs2.existsSync(latestDir)) {
      new import_obsidian.Notice("Addon Sync: No backup found.");
      return;
    }
    await this.restoreFromPath(latestDir);
  }
  async restoreFromHistory() {
    var _a, _b, _c;
    const syncHistory = this.backupManager.getHistoryList();
    const localSnapshots = this.backupManager.getLocalSnapshotList();
    if (syncHistory.length === 0 && localSnapshots.length === 0) {
      new import_obsidian.Notice("Addon Sync: No history snapshots found.");
      return;
    }
    const allEntries = [];
    for (const entry of syncHistory) {
      allEntries.push({
        displayName: entry.displayName + (((_b = (_a = entry.meta) == null ? void 0 : _a.changelog) == null ? void 0 : _b.length) ? ` (${entry.meta.changelog.length} changes)` : ""),
        path: path2.join(this.backupManager.getSyncHistoryDir(), entry.timestamp),
        isLocal: false,
        changelog: ((_c = entry.meta) == null ? void 0 : _c.changelog) || []
      });
    }
    for (const entry of localSnapshots) {
      allEntries.push({
        displayName: entry.displayName,
        path: path2.join(this.backupManager.getLocalSnapshotDirPublic(), entry.timestamp),
        isLocal: true,
        changelog: []
      });
    }
    new HistorySelectModal(this.app, allEntries, (selected) => {
      this.restoreFromPath(selected.path);
    }).open();
  }
  async restoreFromPath(backupPath) {
    if (!fs2.existsSync(backupPath)) {
      new import_obsidian.Notice("Addon Sync: Backup path not found.");
      return;
    }
    this.isRestoring = true;
    try {
      const now = /* @__PURE__ */ new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-");
      const configPath = this.getConfigPath();
      this.createLocalSafetySnapshot(configPath, timestamp);
      this.restoreDirRecursive(backupPath, configPath);
      new import_obsidian.Notice("Addon Sync: Restore completed. Please reload Obsidian.", 8e3);
    } catch (err) {
      new import_obsidian.Notice(`Addon Sync: Restore failed - ${err.message}`, 5e3);
      throw err;
    } finally {
      this.isRestoring = false;
    }
  }
  createLocalSafetySnapshot(configPath, timestamp) {
    const localDir = this.backupManager.getLocalSnapshotDirPublic();
    if (!localDir)
      return;
    const snapshotDir = path2.join(localDir, "pre-restore-" + timestamp);
    this.copyDirRecursive(configPath, snapshotDir);
  }
  restoreDirRecursive(srcDir, destDir) {
    const entries = fs2.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path2.join(srcDir, entry.name);
      const destPath = path2.join(destDir, entry.name);
      if (entry.name === "meta.json")
        continue;
      if (entry.isDirectory()) {
        this.restoreDirRecursive(srcPath, destPath);
      } else {
        fs2.mkdirSync(path2.dirname(destPath), { recursive: true });
        fs2.copyFileSync(srcPath, destPath);
      }
    }
  }
  copyDirRecursive(src, dest) {
    fs2.mkdirSync(dest, { recursive: true });
    const entries = fs2.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path2.join(src, entry.name);
      const destPath = path2.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs2.copyFileSync(srcPath, destPath);
      }
    }
  }
};
var HistorySelectModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, entries, onSelect) {
    super(app);
    this.entries = entries;
    this.onSelect = onSelect;
    this.setPlaceholder("Select a version to restore...");
  }
  getItems() {
    return this.entries.map((e) => e.displayName);
  }
  getItemText(item) {
    return item;
  }
  onChooseItem(item, evt) {
    const entry = this.entries.find((e) => e.displayName === item);
    if (entry) {
      const changelogStr = entry.changelog.length > 0 ? "\n\nChanges:\n" + entry.changelog.join("\n") : "";
      new import_obsidian.Notice(`Addon Sync: Restoring ${item}${changelogStr}`, 8e3);
      this.onSelect(entry);
    }
  }
};

// src/diff.ts
var fs3 = require("fs");
var path3 = require("path");
var DiffChecker = class {
  constructor(app, settings, backupManager) {
    this.app = app;
    this.settings = settings;
    this.backupManager = backupManager;
  }
  updateSettings(settings) {
    this.settings = settings;
  }
  getVaultPath() {
    return this.app.vault.adapter.getBasePath();
  }
  getConfigPath() {
    return path3.join(this.getVaultPath(), ".obsidian");
  }
  async checkChanges() {
    const meta = await this.backupManager.readMeta();
    if (!meta)
      return [];
    const configPath = this.getConfigPath();
    const currentFiles = this.collectCurrentConfigFiles(configPath);
    const changes = [];
    for (const relativePath of currentFiles) {
      const fullPath = path3.join(configPath, relativePath);
      const content = fs3.readFileSync(fullPath, "utf8");
      const hash = this.simpleHash(content);
      if (!meta.fileHashes[relativePath]) {
        changes.push({ path: fullPath, relativePath, type: "added" });
      } else if (meta.fileHashes[relativePath] !== hash) {
        changes.push({ path: fullPath, relativePath, type: "modified" });
      }
    }
    for (const relativePath of Object.keys(meta.fileHashes)) {
      const fullPath = path3.join(configPath, relativePath);
      if (!fs3.existsSync(fullPath)) {
        changes.push({ path: fullPath, relativePath, type: "deleted" });
      }
    }
    return changes;
  }
  async hasChanges() {
    const changes = await this.checkChanges();
    return changes.length > 0;
  }
  async getChangeSummary() {
    const changes = await this.checkChanges();
    if (changes.length === 0)
      return "No changes detected.";
    const lines = changes.map((c) => {
      const prefix = c.type === "added" ? "+" : c.type === "deleted" ? "-" : "~";
      return `${prefix} ${c.relativePath}`;
    });
    return lines.join("\n");
  }
  collectCurrentConfigFiles(configPath) {
    const result = [];
    const addIfExists = (file) => {
      if (fs3.existsSync(path3.join(configPath, file))) {
        result.push(file);
      }
    };
    if (this.settings.backupAppearance) {
      for (const f of CONFIG_FILES.appearance)
        addIfExists(f);
      const themesDir = path3.join(configPath, "themes");
      if (fs3.existsSync(themesDir)) {
        this.collectDirFilesRecursive(themesDir, "themes", result);
      }
      const snippetsDir = path3.join(configPath, "snippets");
      if (fs3.existsSync(snippetsDir)) {
        this.collectDirFilesRecursive(snippetsDir, "snippets", result);
      }
    }
    if (this.settings.backupHotkeys) {
      for (const f of CONFIG_FILES.hotkeys)
        addIfExists(f);
    }
    if (this.settings.backupCorePlugins) {
      for (const f of CONFIG_FILES.corePlugins)
        addIfExists(f);
    }
    if (this.settings.backupCommunityPlugins) {
      for (const f of CONFIG_FILES.communityPlugins)
        addIfExists(f);
      const pluginsDir = path3.join(configPath, "plugins");
      if (fs3.existsSync(pluginsDir)) {
        const plugins = fs3.readdirSync(pluginsDir);
        for (const pluginId of plugins) {
          const pluginPath = path3.join(pluginsDir, pluginId);
          if (fs3.statSync(pluginPath).isDirectory()) {
            const files = fs3.readdirSync(pluginPath);
            for (const file of files) {
              const fullPath = path3.join(pluginPath, file);
              if (fs3.statSync(fullPath).isFile()) {
                result.push(`plugins/${pluginId}/${file}`);
              }
            }
          }
        }
      }
    }
    if (this.settings.backupAppSettings) {
      for (const f of CONFIG_FILES.appSettings)
        addIfExists(f);
    }
    if (this.settings.backupBookmarks) {
      for (const f of CONFIG_FILES.bookmarks)
        addIfExists(f);
    }
    if (this.settings.backupGraph) {
      for (const f of CONFIG_FILES.graph)
        addIfExists(f);
    }
    return result;
  }
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(16);
  }
  collectDirFilesRecursive(dir, prefix, result) {
    for (const entry of fs3.readdirSync(dir)) {
      const fullPath = path3.join(dir, entry);
      if (fs3.statSync(fullPath).isDirectory()) {
        this.collectDirFilesRecursive(fullPath, `${prefix}/${entry}`, result);
      } else if (fs3.statSync(fullPath).isFile()) {
        result.push(`${prefix}/${entry}`);
      }
    }
  }
};

// src/scheduler.ts
var import_obsidian2 = require("obsidian");
var BackupScheduler = class {
  constructor(plugin, backupManager, diffChecker, restoreManager) {
    this.intervalId = null;
    this.plugin = plugin;
    this.backupManager = backupManager;
    this.diffChecker = diffChecker;
    this.restoreManager = restoreManager;
  }
  startAutoBackup(intervalMinutes) {
    this.stopAutoBackup();
    if (intervalMinutes <= 0)
      return;
    const intervalMs = intervalMinutes * 60 * 1e3;
    this.intervalId = window.setInterval(async () => {
      if (this.restoreManager.isRestoring)
        return;
      try {
        await this.backupManager.createBackup();
      } catch (err) {
        console.error("Addon Sync: Auto backup failed", err);
      }
    }, intervalMs);
    this.plugin.registerInterval(this.intervalId);
  }
  stopAutoBackup() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  configure(settings) {
    this.stopAutoBackup();
    if (settings.autoBackupEnabled && settings.autoBackupIntervalMinutes > 0) {
      this.startAutoBackup(settings.autoBackupIntervalMinutes);
    }
  }
  async runStartupBackup() {
    try {
      await this.backupManager.createBackup();
      new import_obsidian2.Notice("Addon Sync: Startup backup completed.");
    } catch (err) {
      console.error("Addon Sync: Startup backup failed", err);
    }
  }
  async runStartupChangeCheck() {
    try {
      const hasBackup = await this.backupManager.readMeta();
      if (!hasBackup)
        return;
      const hasChanges = await this.diffChecker.hasChanges();
      if (hasChanges) {
        const summary = await this.diffChecker.getChangeSummary();
        new import_obsidian2.Notice(`Addon Sync: Config changes detected.
${summary}`, 8e3);
      }
    } catch (err) {
      console.error("Addon Sync: Startup change check failed", err);
    }
  }
};

// src/settings.ts
var import_obsidian3 = require("obsidian");
var AddonSyncSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = this.plugin.settings;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Addon Sync Settings" });
    containerEl.createEl("h3", { text: "Backup Paths" });
    new import_obsidian3.Setting(containerEl).setName("Sync backup path (relative to vault)").setDesc("NAS will sync this folder. Do NOT start with '.'. Default: meta").addText(
      (text) => text.setPlaceholder("meta").setValue(this.settings.backupPath).onChange(async (value) => {
        this.settings.backupPath = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Local safety snapshot path").setDesc("Starts with '.' so NAS skips it. For emergency local recovery only.").addText(
      (text) => text.setPlaceholder(".addon-sync-local").setValue(this.settings.localSnapshotPath).onChange(async (value) => {
        this.settings.localSnapshotPath = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "Backup Scope" });
    for (const cat of BACKUP_CATEGORIES) {
      new import_obsidian3.Setting(containerEl).setName(cat.label).setDesc(cat.description).addToggle(
        (toggle) => toggle.setValue(this.settings[cat.key]).onChange(async (value) => {
          this.settings[cat.key] = value;
          await this.plugin.saveSettings();
        })
      );
    }
    containerEl.createEl("h3", { text: "Automatic Backup" });
    new import_obsidian3.Setting(containerEl).setName("Enable auto backup").setDesc("Automatically create backups at regular intervals").addToggle(
      (toggle) => toggle.setValue(this.settings.autoBackupEnabled).onChange(async (value) => {
        this.settings.autoBackupEnabled = value;
        await this.plugin.saveSettings();
        this.plugin.scheduler.configure(this.settings);
        this.display();
      })
    );
    if (this.settings.autoBackupEnabled) {
      new import_obsidian3.Setting(containerEl).setName("Backup interval").setDesc("How often to create automatic backups").addDropdown((dropdown) => {
        for (const opt of INTERVAL_OPTIONS) {
          dropdown.addOption(String(opt.value), opt.label);
        }
        dropdown.setValue(String(this.settings.autoBackupIntervalMinutes));
        dropdown.onChange(async (value) => {
          this.settings.autoBackupIntervalMinutes = parseInt(value);
          await this.plugin.saveSettings();
          this.plugin.scheduler.configure(this.settings);
        });
      });
    }
    containerEl.createEl("h3", { text: "Startup Behavior" });
    new import_obsidian3.Setting(containerEl).setName("Auto backup on startup").setDesc("Create a backup when Obsidian starts").addToggle(
      (toggle) => toggle.setValue(this.settings.autoBackupOnStartup).onChange(async (value) => {
        this.settings.autoBackupOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Check for changes on startup").setDesc("Compare current config with backup and notify if there are differences").addToggle(
      (toggle) => toggle.setValue(this.settings.checkChangesOnStartup).onChange(async (value) => {
        this.settings.checkChangesOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "History Retention" });
    new import_obsidian3.Setting(containerEl).setName("Sync history retention").setDesc("Number of versioned snapshots to keep in the sync folder (NAS synced)").addDropdown((dropdown) => {
      for (const opt of RETENTION_OPTIONS) {
        dropdown.addOption(String(opt.value), opt.label);
      }
      dropdown.setValue(String(this.settings.syncHistoryRetentionCount));
      dropdown.onChange(async (value) => {
        this.settings.syncHistoryRetentionCount = parseInt(value);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Local safety retention").setDesc("Number of local snapshots to keep (not synced, for emergency recovery)").addDropdown((dropdown) => {
      for (const opt of RETENTION_OPTIONS) {
        dropdown.addOption(String(opt.value), opt.label);
      }
      dropdown.setValue(String(this.settings.localSnapshotRetentionCount));
      dropdown.onChange(async (value) => {
        this.settings.localSnapshotRetentionCount = parseInt(value);
        await this.plugin.saveSettings();
      });
    });
    containerEl.createEl("h3", { text: "Manual Actions" });
    new import_obsidian3.Setting(containerEl).setName("Create backup now").setDesc("Backup current config to sync folder + local safety snapshot").addButton(
      (btn) => btn.setButtonText("Backup").setClass("mod-cta").onClick(async () => {
        try {
          await this.plugin.backupManager.createBackup();
          new import_obsidian3.Notice("Addon Sync: Backup created successfully.");
        } catch (err) {
          new import_obsidian3.Notice(`Addon Sync: Backup failed - ${err.message}`, 5e3);
        }
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Restore from backup").setDesc("Choose a version from sync history or local snapshots to restore").addButton(
      (btn) => btn.setButtonText("Browse Versions").setWarning().onClick(async () => {
        try {
          await this.plugin.restoreManager.restoreFromHistory();
        } catch (err) {
          new import_obsidian3.Notice(`Addon Sync: Restore failed - ${err.message}`, 5e3);
        }
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Restore latest backup").setDesc("Quick restore from the latest sync backup").addButton(
      (btn) => btn.setButtonText("Restore Latest").setWarning().onClick(async () => {
        try {
          await this.plugin.restoreManager.restoreLatest();
        } catch (err) {
          new import_obsidian3.Notice(`Addon Sync: Restore failed - ${err.message}`, 5e3);
        }
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Check for changes").setDesc("Compare current config with latest backup").addButton(
      (btn) => btn.setButtonText("Check").onClick(async () => {
        try {
          const summary = await this.plugin.diffChecker.getChangeSummary();
          new import_obsidian3.Notice(`Addon Sync:
${summary}`, 8e3);
        } catch (err) {
          new import_obsidian3.Notice(`Addon Sync: Check failed - ${err.message}`, 5e3);
        }
      })
    );
  }
};

// src/main.ts
var AddonSyncPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.currentStatus = "no-backup";
  }
  async onload() {
    await this.loadSettings();
    this.backupManager = new BackupManager(this.app, this.settings);
    this.restoreManager = new RestoreManager(this.app, this.settings, this.backupManager);
    this.diffChecker = new DiffChecker(this.app, this.settings, this.backupManager);
    this.scheduler = new BackupScheduler(this, this.backupManager, this.diffChecker, this.restoreManager);
    this.registerCommands();
    this.registerStatusBar();
    this.addSettingTab(new AddonSyncSettingTab(this.app, this));
    this.runStartupTasks();
  }
  onunload() {
    this.scheduler.stopAutoBackup();
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.backupPath) {
      this.settings.backupPath = DEFAULT_SETTINGS.backupPath;
      await this.saveData(this.settings);
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.backupManager.updateSettings(this.settings);
    this.restoreManager.updateSettings(this.settings);
    this.diffChecker.updateSettings(this.settings);
  }
  registerCommands() {
    this.addCommand({
      id: COMMANDS.CREATE_BACKUP,
      name: "Create Backup",
      callback: async () => {
        try {
          this.updateStatus("syncing");
          await this.backupManager.createBackup();
          this.updateStatus("synced");
          new import_obsidian4.Notice("Addon Sync: Backup created successfully.");
        } catch (err) {
          this.updateStatus("error");
          new import_obsidian4.Notice(`Addon Sync: Backup failed - ${err.message}`, 5e3);
        }
      }
    });
    this.addCommand({
      id: COMMANDS.RESTORE_LATEST,
      name: "Restore Latest Backup",
      callback: async () => {
        try {
          await this.restoreManager.restoreLatest();
          await this.refreshStatus();
        } catch (err) {
          new import_obsidian4.Notice(`Addon Sync: Restore failed - ${err.message}`, 5e3);
        }
      }
    });
    this.addCommand({
      id: COMMANDS.RESTORE_FROM_HISTORY,
      name: "Restore from History",
      callback: async () => {
        try {
          await this.restoreManager.restoreFromHistory();
          await this.refreshStatus();
        } catch (err) {
          new import_obsidian4.Notice(`Addon Sync: Restore failed - ${err.message}`, 5e3);
        }
      }
    });
    this.addCommand({
      id: COMMANDS.CHECK_CHANGES,
      name: "Check for Changes",
      callback: async () => {
        try {
          const summary = await this.diffChecker.getChangeSummary();
          const hasChanges = await this.diffChecker.hasChanges();
          this.updateStatus(hasChanges ? "changed" : "synced");
          new import_obsidian4.Notice(`Addon Sync:
${summary}`, 8e3);
        } catch (err) {
          new import_obsidian4.Notice(`Addon Sync: Check failed - ${err.message}`, 5e3);
        }
      }
    });
  }
  registerStatusBar() {
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass("mod-clickable");
    this.statusBarItem.setAttribute("aria-label", "Addon Sync: Click to check changes");
    this.statusBarItem.onClickEvent(() => {
      this.app.commands.executeCommandById(`obsidian-addon-sync:${COMMANDS.CHECK_CHANGES}`);
    });
    this.updateStatus("no-backup");
  }
  updateStatus(status) {
    this.currentStatus = status;
    const labels = {
      synced: "\u2705 Synced",
      changed: "\u{1F504} Changed",
      syncing: "\u23F3 Syncing...",
      error: "\u274C Error",
      "no-backup": "\u{1F4E6} No Backup"
    };
    this.statusBarItem.setText(`Addon Sync: ${labels[status]}`);
  }
  async refreshStatus() {
    try {
      const meta = await this.backupManager.readMeta();
      if (!meta) {
        this.updateStatus("no-backup");
        return;
      }
      const hasChanges = await this.diffChecker.hasChanges();
      this.updateStatus(hasChanges ? "changed" : "synced");
    } catch (e) {
      this.updateStatus("error");
    }
  }
  async runStartupTasks() {
    if (this.settings.autoBackupOnStartup) {
      await this.scheduler.runStartupBackup();
    }
    if (this.settings.checkChangesOnStartup) {
      await this.scheduler.runStartupChangeCheck();
    }
    if (this.settings.autoBackupEnabled) {
      this.scheduler.configure(this.settings);
    }
    await this.refreshStatus();
  }
};
