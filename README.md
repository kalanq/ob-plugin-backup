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
*   **Version History**: Customize retention counts for versioned snapshots.
*   **Safe Incremental Restore**: Restoring will only overwrite configuration files included in the backup. It will **not** delete any new plugins you installed locally.
*   **Automation**: Supports auto-backup on startup and scheduled interval backups.
*   **Diff Checker**: Compare current local configurations with the latest backup in one click.
*   **Device-aware Restore**: Backups are labeled by device, and restore previews are grouped by device and category.
*   **Plugin Data Protection**: Excludes this plugin's own `data.json` by default to avoid overwriting per-device setup state.
*   **Windows-only Installer**: Release packages include `install-plugin.cmd` and `install-plugin.ps1` for Windows double-click installation.

### Installation

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
    *   Select categories you want to backup (Appearance, Hotkeys, Core Plugins, Community Plugins, etc.).
2.  **Manual Backup**:
    *   Run command `Plugin Backup: Create Backup` or click **Backup** in the settings panel.
3.  **Check for Changes**:
    *   Click the status bar item or run `Plugin Backup: Check for Changes` to check configuration differences.
4.  **Restore**:
    *   Run `Plugin Backup: Restore Latest Backup` to restore the latest backup.
    *   Run `Plugin Backup: Restore from History` to choose a historical snapshot to restore. **Please reload Obsidian after restoring.**

---

## 中文说明

用于通过 NAS 备份和同步 Obsidian 配置、插件、快捷键和主题的轻量级插件，避免同步冲突。

> [!CAUTION]
> **免责声明与警告**：本插件主要由 **vibe coding** 制作。在使用本插件前，**请务必自行对您的 Obsidian 仓库（.obsidian 文件夹）进行手动备份**，以免发生意外情况导致配置丢失。

### 核心功能

*   **双目录安全备份**：
    *   `ob-plugin-backup/`：同步目录（NAS可见并进行多端同步）。
    *   `.ob-plugin-backup-local/`：以 `.` 开头的本地安全快照目录（NAS会自动跳过，用于发生意外时在本地还原历史）。
*   **版本历史与保留**：支持自定义历史版本保留数量，可从任意历史节点恢复。
*   **增量覆盖恢复**：恢复过程只会覆盖备份中存在的文件，不会删除您本地后来安装的新插件。
*   **自动与定时任务**：支持启动时自动备份、定时自动备份。
*   **配置变更检测**：支持一键检查当前本地配置与备份配置的差异并输出差异日志。

### 安装方法

1.  将本项目编译生成的 `release/` 文件夹中的所有文件（`main.js`、`manifest.json`）复制到您 Obsidian 库的插件目录下：
    `.obsidian/plugins/ob-plugin-backup/`
2.  打开 Obsidian 设置 → 社区插件，启用 **Plugin Backup** 插件。

### 使用方法说明

1.  **初次配置**：
    *   进入插件设置面板（`Plugin Backup Settings`）。
    *   配置 **Sync backup path**（同步备份路径，默认会在您 Vault 下创建 `meta` 目录，由您的 NAS 软件负责同步此目录）。
    *   配置 **Local safety snapshot path**（本地安全快照路径，默认是 `.ob-plugin-backup-local`，此目录应被同步软件忽略）。
    *   勾选您需要备份的范围（如外观设置、快捷键、核心/社区插件清单及插件配置等）。
2.  **手动备份**：
    *   在命令面板中运行 `Plugin Backup: Create Backup` 命令，或在设置面板中点击 **Backup** 按钮。
3.  **检查变更**：
    *   点击状态栏右下角的 `Plugin Backup` 图标，或运行 `Plugin Backup: Check for Changes`，即可查看当前配置与最新备份的差异文件列表。
4.  **从备份恢复**：
    *   在命令面板运行 `Plugin Backup: Restore Latest Backup` 可恢复至最新同步的版本。
    *   运行 `Plugin Backup: Restore from History`，在弹出的模糊搜索窗口中选择任意历史版本（包括本地安全快照和 NAS 同步历史）进行恢复。**恢复完成后，请重新加载 Obsidian。**
