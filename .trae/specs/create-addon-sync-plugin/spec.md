# Obsidian Addon Sync 插件 Spec

## Why

用户使用 NAS 同步整个 Obsidian Vault（排除 `.obsidian` 目录），导致主题、快捷键、插件及插件配置无法跨设备同步。需要一个轻量级插件，将 `.obsidian` 中的关键配置备份到 NAS 可见的目录中，支持一键恢复、定时自动备份和版本差异检测。

## What Changes

- 新建 Obsidian 社区插件项目 `obsidian-addon-sync`
- 实现将 `.obsidian` 中选定配置文件备份到用户指定目录的功能
- 实现从备份目录恢复配置到 `.obsidian` 的功能
- 实现定时自动备份（可配置间隔）
- 实现备份版本管理（保留历史版本）
- 实现配置差异检测，提示用户是否需要同步
- 提供设置界面配置备份范围、备份路径、自动备份间隔等

## Impact

- Affected code: 全新插件项目，无已有代码影响
- 依赖: Obsidian API (>= 0.15.0), Node.js fs 模块（桌面端）

## ADDED Requirements

### Requirement: 配置备份

系统 SHALL 提供将 `.obsidian` 目录中的配置文件备份到用户指定目录的功能。

#### Scenario: 手动创建备份
- **WHEN** 用户执行 "Addon Sync: Create Backup" 命令
- **THEN** 系统将当前 `.obsidian` 中选定的配置文件复制到备份目录，生成带时间戳的备份版本
- **AND** 在状态栏/通知中显示备份成功信息

#### Scenario: 备份范围可选
- **GIVEN** 用户在设置中配置了备份范围
- **WHEN** 执行备份操作
- **THEN** 系统仅备份用户勾选的配置类别：
  - 外观设置（appearance.json + themes/ + snippets/）
  - 快捷键（hotkeys.json）
  - 核心插件设置（core-plugins.json）
  - 社区插件列表（community-plugins.json）
  - 社区插件配置（plugins/*/data.json）
  - 应用设置（app.json）
  - 书签（bookmarks.json）
  - 图谱设置（graph.json）

#### Scenario: 备份目录结构
- **GIVEN** 备份根目录由用户配置
- **WHEN** 创建备份
- **THEN** 备份文件按以下结构存储：
  ```
  <backup-root>/
    addon-sync-backup/
      latest/                    # 最新备份（始终是最新完整快照）
        appearance.json
        app.json
        hotkeys.json
        core-plugins.json
        community-plugins.json
        bookmarks.json
        graph.json
        plugins/
          <plugin-id>/
            data.json
            manifest.json
        themes/
          <theme-name>/
            manifest.json
            theme.css
        snippets/
          <snippet>.css
      history/
        2026-06-04T10-30-00/     # 历史备份快照
        2026-06-03T18-00-00/
      meta.json                  # 备份元数据
  ```

### Requirement: 配置恢复

系统 SHALL 提供从备份目录恢复配置到 `.obsidian` 的功能。

#### Scenario: 恢复最新备份
- **WHEN** 用户执行 "Addon Sync: Restore Latest" 命令
- **THEN** 系统将 `latest/` 目录中的配置文件复制回 `.obsidian` 对应位置
- **AND** 恢复前自动创建当前配置的快照到 `history/` 目录
- **AND** 提示用户需要重新加载 Obsidian 以使配置生效

#### Scenario: 恢复历史版本
- **WHEN** 用户执行 "Addon Sync: Restore from History" 命令
- **THEN** 系统显示历史备份列表供用户选择
- **AND** 用户选择后，系统将该历史版本的配置恢复到 `.obsidian`

#### Scenario: 恢复不影响已有数据
- **WHEN** 执行恢复操作
- **THEN** 系统仅覆盖备份中包含的配置文件
- **AND** 不删除备份中不存在的其他配置文件
- **AND** 不影响 Vault 中的笔记文件

### Requirement: 定时自动备份

系统 SHALL 支持定时自动备份配置。

#### Scenario: 启用自动备份
- **GIVEN** 用户在设置中启用了自动备份并设置了间隔时间
- **WHEN** Obsidian 运行中且达到定时触发条件
- **THEN** 系统自动执行备份操作（静默，仅通知栏提示）

#### Scenario: 启动时自动备份
- **GIVEN** 用户在设置中启用了 "启动时自动备份"
- **WHEN** Obsidian 启动完成
- **THEN** 系统在插件加载后自动执行一次备份

### Requirement: 配置差异检测

系统 SHALL 支持检测当前配置与备份之间的差异。

#### Scenario: 检测到配置变更
- **GIVEN** 存在最新备份
- **WHEN** 用户执行 "Addon Sync: Check for Changes" 命令或 Obsidian 启动时自动检查
- **THEN** 系统比较当前 `.obsidian` 配置与 `latest/` 备份
- **AND** 如果存在差异，显示变更摘要（哪些文件有变更）
- **AND** 提供选项：创建新备份 / 恢复备份 / 忽略

#### Scenario: 无差异
- **WHEN** 检测配置与备份完全一致
- **THEN** 状态栏显示同步状态图标（绿色对勾）

### Requirement: 设置界面

系统 SHALL 提供完整的设置界面。

#### Scenario: 设置项
- **GIVEN** 插件设置页面
- **THEN** 以下配置项可用：
  - 备份目录路径（支持相对路径和绝对路径）
  - 备份范围勾选（外观、快捷键、核心插件、社区插件、应用设置、书签、图谱）
  - 自动备份开关及间隔（分钟）
  - 启动时自动备份开关
  - 启动时自动检查变更开关
  - 历史备份保留数量
  - 是否备份插件 manifest.json（用于版本锁定）

### Requirement: 安全保护

系统 SHALL 在恢复操作前提供安全保护。

#### Scenario: 恢复前自动快照
- **WHEN** 执行任何恢复操作
- **THEN** 系统先将当前 `.obsidian` 配置自动保存到 `history/` 目录
- **AND** 如果恢复导致问题，用户可以从历史记录回退

#### Scenario: 防止循环同步
- **WHEN** 插件自身执行恢复操作时
- **THEN** 系统暂时禁用变更检测，避免触发自动备份
