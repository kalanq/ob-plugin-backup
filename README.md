# Plugin Backup

[English](#english) | [中文说明](#中文说明)

---

## English

A lightweight plugin for backing up and syncing Obsidian configurations, plugins, hotkeys, and themes across devices via NAS without synchronization conflicts.

> [!CAUTION]
> **Disclaimer & Warning**: This plugin code was primarily created with **vibe coding**. Before using this plugin, **please make sure to back up your Obsidian vault configuration manually (the `.obsidian` folder)** to prevent accidental configuration loss.

### Features

*   **Dual-Directory System**:
    *   `ob-plugin-backup/`: Sync directory (visible to NAS for multi-device syncing).
    *   `.ob-plugin-backup-local/`: Dot-prefixed local backup directory (ignored by NAS, used for local emergency recovery).
*   **Local-Only Safety Snapshot**: Create a local emergency snapshot without updating the NAS-visible latest backup or sync history.
*   **Backup Comments**: Manual backups and local snapshots can include comments, while automatic backups write clear default comments.
*   **Version History**: Customize retention counts for versioned snapshots.
    *   In multi-device sync, the shared sync history is pruned by whichever device writes a backup. The effective shared history limit is the smallest sync-retention setting used on any device.
*   **Failed Backup Cleanup**: Stale `latest.tmp-*` folders from interrupted backups are removed automatically on later backup runs.
*   **Safe Incremental Restore**: Restoring will only overwrite configuration files included in the backup. It will **not** delete any new plugins you installed locally.
*   **Difference-focused Restore Preview**: Restore dialogs show changed or missing files by default so staged restores are easier to track.
*   **Restore Rollback Path**: Before restore, the plugin creates a local `pre-restore-*` safety snapshot with metadata. Use **Restore last pre-restore snapshot** to open the newest rollback point in the restore preview.
*   **Plugin-Grouped Restore**: Community plugin files are grouped by plugin name and id, with a plugin-level select toggle for whole-plugin restores.
*   **Absolute Path Warnings**: JSON settings that contain absolute local paths are highlighted during restore so device-specific paths can be reviewed after restore.
*   **Automation**: Supports auto-backup on startup and scheduled interval backups.
*   **Diff Checker**: Compare current local configurations with the latest backup in one click.
*   **Version Compare**: Compare two backup versions by file hashes, with top-level JSON key summaries for changed JSON settings.
*   **Device-aware Restore**: Backups are labeled by device, and restore previews are grouped by device and category.
*   **Archive Backup Mode**: By default, snapshots are stored as `latest.zip` and `history/*.zip` so Obsidian, Dataview, search, and other plugins see fewer loose files inside the vault. Legacy directory mode remains available in settings.
*   **Progress and Size Reporting**: Backup progress shows file counts, copied bytes, and zip output size. The zip stage may still briefly pause Obsidian for very large configurations.
*   **Plugin Data Controls**: Community plugin files and plugin `data.json` files can be controlled separately.
*   **Plugin Data Protection**: Excludes this plugin's own raw `data.json` by default, while safely syncing selected Plugin Backup options through `synced-settings.json`.
*   **Bilingual Settings UI**: Switch the settings page between English and Chinese.
*   **Windows-only Installer**: Release assets include `install-plugin.cmd` and `install-plugin.ps1` for Windows double-click installation.
*   **Release Assets**: GitHub releases upload the plugin files directly. GitHub's automatic source code archives are kept as source snapshots, not duplicated plugin packages.

### Installation

#### Install with BRAT

1.  Install and enable the Obsidian **BRAT** plugin.
2.  Open the command palette and run **BRAT: Add a beta plugin for testing**.
3.  Paste this repository URL:
    `https://github.com/kalanq/ob-plugin-backup`
4.  After BRAT installs the plugin, enable **Plugin Backup** in Obsidian Settings → Community Plugins.

#### Manual Install

1.  Copy the compiled files (`main.js` and `manifest.json` from the `release/` folder) into your Obsidian vault's plugin directory:
    `.obsidian/plugins/ob-plugin-backup/`
2.  Open Obsidian Settings → Community Plugins, and enable **Plugin Backup**.

### Windows-only Installer

On Windows, double-click `install-plugin.cmd` from the release folder and choose your Obsidian vault folder. The installer copies only `main.js` and `manifest.json`; it does not copy `data.json`.

### Usage Instructions

1.  **Initial Setup**:
    *   Go to `Plugin Backup Settings`.
    *   Configure **Sync backup path** (relative to vault root, defaults to `meta` which is synced via NAS).
    *   Configure **Local safety snapshot path** (defaults to `.ob-plugin-backup-local`, which should be ignored by NAS).
    *   Keep **Backup file format** as archive zip files unless you need the legacy loose-file directory layout.
    *   Select categories you want to backup (Appearance, Hotkeys, Core Plugins, Community Plugins, etc.).
2.  **Manual Backup**:
    *   Run command `Plugin Backup: Create Backup` or click **Backup** in the settings panel.
    *   Add a comment when the dialog opens so future restore decisions are easier.
    *   Run command `Plugin Backup: Create Local Safety Snapshot` when you only want a local rollback point and do not want to update the synced backup.
3.  **Check for Changes**:
    *   Click the status bar item or run `Plugin Backup: Check for Changes` to check configuration differences.
4.  **Restore**:
    *   Run `Plugin Backup: Restore Latest Backup` to restore the latest backup.
    *   Run `Plugin Backup: Restore from History` to choose a historical snapshot to restore. **Please reload Obsidian after restoring.**
    *   If a restore causes trouble, run `Plugin Backup: Restore Last Pre-Restore Snapshot` and review the preview before restoring files back.
5.  **Compare Versions**:
    *   Use **Compare backup versions** in settings to compare latest, history, local, and pre-restore versions.
    *   JSON settings show changed top-level keys where possible; invalid JSON falls back to a parse-failed summary.

### Emergency Recovery

1.  Do not create another sync backup immediately after a bad restore.
2.  Open settings and run **Restore last pre-restore snapshot**.
3.  Review the restore preview and select only the files you want to roll back.
4.  Reload Obsidian after restoring.
5.  If Obsidian becomes slow after restore, check whether restored plugins such as Dataview are rebuilding over a large vault, and keep backup storage in archive zip mode to avoid vault-visible loose backup files.

---

## 中文说明

用于通过 NAS 备份和同步 Obsidian 配置、插件、快捷键和主题的轻量级插件，避免同步冲突。

> [!CAUTION]
> **免责声明与警告**：本插件主要由 **vibe coding** 制作。在使用本插件前，**请务必自行对您的 Obsidian 仓库（.obsidian 文件夹）进行手动备份**，以免发生意外情况导致配置丢失。

### 核心功能

*   **双目录安全备份**：
    *   `ob-plugin-backup/`：同步目录（NAS可见并进行多端同步）。
    *   `.ob-plugin-backup-local/`：以 `.` 开头的本地安全快照目录（NAS会自动跳过，用于发生意外时在本地还原历史）。
*   **仅本地安全快照**：可以只创建本地紧急恢复快照，不更新 NAS 可见的最新备份或同步历史。
*   **备份备注**：手动备份和本地快照可以填写备注；自动备份会写入清晰的默认备注。
*   **版本历史与保留**：支持自定义历史版本保留数量，可从任意历史节点恢复。
    *   多端同步时，共享同步历史会被“执行写入备份的那台设备”按本机设置清理；实际共享历史数量会受到所有设备中最小同步历史保留值限制。
*   **失败备份清理**：中断备份留下的旧 `latest.tmp-*` 临时目录会在后续备份时自动清理。
*   **增量覆盖恢复**：恢复过程只会覆盖备份中存在的文件，不会删除您本地后来安装的新插件。
*   **只显示差异的恢复预览**：恢复窗口默认只列出有差异或本地缺失的文件，方便分批恢复时判断哪些已经处理过。
*   **恢复回滚入口**：恢复前会创建带元数据的本地 `pre-restore-*` 安全快照。误恢复后可使用 **恢复最近一次恢复前快照**，在恢复预览中选择要回滚的文件。
*   **按插件分组恢复**：社区插件会按插件名称和 ID 分组，并提供插件级别的选择开关，方便整组恢复。
*   **绝对路径提醒**：恢复预览会标记 JSON 设置中的本机绝对路径，便于恢复后按设备重新设置。
*   **自动与定时任务**：支持启动时自动备份、定时自动备份。
*   **配置变更检测**：支持一键检查当前本地配置与备份配置的差异并输出差异日志。
*   **版本比较**：支持比较两个备份版本的文件哈希差异，并对 JSON 设置显示顶层 key 的变化摘要。
*   **设备感知恢复**：备份会记录设备名称，恢复预览可按设备和类别分组筛选。
*   **压缩包备份模式**：默认将快照保存为 `latest.zip` 和 `history/*.zip`，减少 Vault 内可被 Obsidian、Dataview、搜索和其他插件遍历到的散文件数量。设置中仍可切回旧版目录模式。
*   **进度与大小提示**：备份进度会显示文件数量、已复制大小和 zip 输出大小。超大配置在压缩阶段仍可能让 Obsidian 短暂停顿。
*   **插件数据控制**：社区插件本体和插件 `data.json` 可分开控制，支持只同步插件本体和版本。
*   **插件自身数据保护**：默认排除本插件原始 `data.json`，并通过 `synced-settings.json` 安全同步部分 Plugin Backup 设置。
*   **中英文设置界面**：可在插件设置页顶部切换 English / 中文。
*   **仅 Windows 安装器**：发布资产包含 `install-plugin.cmd` 和 `install-plugin.ps1`，方便 Windows 双击安装。
*   **发布资产规则**：GitHub Release 直接上传插件文件；GitHub 自动生成的源码压缩包仅作为源码快照，不再额外重复打包。

### 安装方法

#### 使用 BRAT 安装

1.  先在 Obsidian 中安装并启用 **BRAT** 插件。
2.  打开命令面板，运行 **BRAT: Add a beta plugin for testing**。
3.  粘贴本仓库地址：
    `https://github.com/kalanq/ob-plugin-backup`
4.  BRAT 安装完成后，在 Obsidian 设置 → 第三方插件中启用 **Plugin Backup**。

#### 手动安装

1.  将本项目编译生成的 `release/` 文件夹中的所有文件（`main.js`、`manifest.json`）复制到您 Obsidian 库的插件目录下：
    `.obsidian/plugins/ob-plugin-backup/`
2.  打开 Obsidian 设置 → 社区插件，启用 **Plugin Backup** 插件。

### 使用方法说明

1.  **初次配置**：
    *   进入插件设置面板（`Plugin Backup Settings`）。
    *   配置 **Sync backup path**（同步备份路径，默认会在您 Vault 下创建 `meta` 目录，由您的 NAS 软件负责同步此目录）。
    *   配置 **Local safety snapshot path**（本地安全快照路径，默认是 `.ob-plugin-backup-local`，此目录应被同步软件忽略）。
    *   **Backup file format** 建议保持压缩包模式；只有需要旧版散文件目录结构时再切换为目录模式。
    *   勾选您需要备份的范围（如外观设置、快捷键、核心/社区插件清单及插件配置等）。
2.  **手动备份**：
    *   在命令面板中运行 `Plugin Backup: Create Backup` 命令，或在设置面板中点击 **Backup** 按钮。
    *   备份前弹出的备注框可以记录这次备份的原因，方便以后恢复时判断。
    *   如果只想创建本机回滚点、不想更新同步备份，可运行 `Plugin Backup: Create Local Safety Snapshot`。
3.  **检查变更**：
    *   点击状态栏右下角的 `Plugin Backup` 图标，或运行 `Plugin Backup: Check for Changes`，即可查看当前配置与最新备份的差异文件列表。
4.  **从备份恢复**：
    *   在命令面板运行 `Plugin Backup: Restore Latest Backup` 可恢复至最新同步的版本。
    *   运行 `Plugin Backup: Restore from History`，在弹出的模糊搜索窗口中选择任意历史版本（包括本地安全快照和 NAS 同步历史）进行恢复。**恢复完成后，请重新加载 Obsidian。**
    *   如果恢复后出现问题，运行 `Plugin Backup: Restore Last Pre-Restore Snapshot`，先查看预览，再选择要回滚的文件。
5.  **比较版本**：
    *   在设置页使用 **比较备份版本**，可以比较 latest、历史、本地快照和恢复前快照。
    *   JSON 设置会尽量显示顶层 key 的变化；无法解析的 JSON 会退回到解析失败提示。

### 紧急恢复流程

1.  误恢复后，不要立刻再创建同步备份。
2.  打开设置页，点击 **恢复最近一次恢复前快照**。
3.  在恢复预览中只选择需要回滚的文件。
4.  恢复完成后重新加载 Obsidian。
5.  如果恢复后 Obsidian 变慢，检查是否恢复启用了 Dataview 等插件并触发大型仓库重建；备份路径在库内时请保持压缩包模式，避免散文件备份树被 Obsidian 扫描。
