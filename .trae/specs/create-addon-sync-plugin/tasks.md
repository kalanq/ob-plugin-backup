# Tasks

- [x] Task 1: 初始化 Obsidian 插件项目结构
  - [x] SubTask 1.1: 创建 package.json，配置 Obsidian 插件元数据（id: `obsidian-addon-sync`，名称、版本号等）
  - [x] SubTask 1.2: 创建 manifest.json，声明兼容的 Obsidian 版本（>= 0.15.0）和平台（desktop）
  - [x] SubTask 1.3: 创建 tsconfig.json，配置 TypeScript 编译选项
  - [x] SubTask 1.4: 创建 esbuild.config.mjs，配置构建流程（main.ts -> main.js）
  - [x] SubTask 1.5: 创建 versions.json，声明 Obsidian API 版本兼容性
  - [x] SubTask 1.6: 创建 .gitignore
  - [x] SubTask 1.7: 安装依赖（obsidian, typescript, esbuild, @types/node, builtin-modules）

- [x] Task 2: 实现插件核心框架
  - [x] SubTask 2.1: 创建 src/main.ts，实现 AddonSyncPlugin 类（继承 Plugin），包含 onload/onunload 生命周期
  - [x] SubTask 2.2: 创建 src/types.ts，定义所有类型接口（AddonSyncSettings, BackupMeta, BackupContent 等）
  - [x] SubTask 2.3: 创建 src/constants.ts，定义备份文件列表、默认设置等常量

- [x] Task 3: 实现备份核心逻辑
  - [x] SubTask 3.1: 创建 src/backup.ts，实现 BackupManager 类
  - [x] SubTask 3.2: 实现 createBackup() 方法：读取 .obsidian 中选定配置文件，复制到备份目录的 latest/ 子目录
  - [x] SubTask 3.3: 实现 createHistorySnapshot() 方法：将当前 latest/ 复制到 history/<timestamp>/ 目录
  - [x] SubTask 3.4: 实现 backupConfigFiles() 方法：根据用户勾选的备份范围，收集需要备份的文件列表
  - [x] SubTask 3.5: 实现备份元数据（meta.json）的读写：记录最后备份时间、备份文件列表、内容哈希

- [x] Task 4: 实现恢复核心逻辑
  - [x] SubTask 4.1: 创建 src/restore.ts，实现 RestoreManager 类
  - [x] SubTask 4.2: 实现 restoreFromPath() 方法：从指定备份路径恢复配置文件到 .obsidian
  - [x] SubTask 4.3: 实现 restoreLatest() 方法：从 latest/ 恢复最新备份
  - [x] SubTask 4.4: 实现 restoreFromHistory() 方法：弹出历史版本选择列表，恢复指定版本
  - [x] SubTask 4.5: 实现恢复前自动快照：恢复前先调用 createHistorySnapshot()
  - [x] SubTask 4.6: 实现防循环同步标志：恢复期间设置 isRestoring 标志，禁用变更检测

- [x] Task 5: 实现差异检测逻辑
  - [x] SubTask 5.1: 创建 src/diff.ts，实现 DiffChecker 类
  - [x] SubTask 5.2: 实现 checkChanges() 方法：比较当前 .obsidian 配置与 latest/ 备份的内容差异
  - [x] SubTask 5.3: 实现内容哈希计算（使用简单字符串哈希）
  - [x] SubTask 5.4: 实现 getChangeSummary() 方法：返回变更文件列表和变更类型（新增/修改/删除）

- [x] Task 6: 实现定时自动备份
  - [x] SubTask 6.1: 创建 src/scheduler.ts，实现 BackupScheduler 类
  - [x] SubTask 6.2: 实现定时备份：使用 registerInterval() 注册定时器，按配置间隔自动备份
  - [x] SubTask 6.3: 实现启动时自动备份：在 onload() 中检查设置，如启用则延迟执行备份
  - [x] SubTask 6.4: 实现启动时自动检查变更：在 onload() 中检测差异并通知用户

- [x] Task 7: 实现设置界面
  - [x] SubTask 7.1: 创建 src/settings.ts，实现 AddonSyncSettingTab 类
  - [x] SubTask 7.2: 实现备份路径设置（文本输入，支持相对/绝对路径）
  - [x] SubTask 7.3: 实现备份范围勾选（外观、快捷键、核心插件、社区插件、应用设置、书签、图谱）
  - [x] SubTask 7.4: 实现自动备份设置（开关 + 间隔输入）
  - [x] SubTask 7.5: 实现启动时备份/检查变更开关
  - [x] SubTask 7.6: 实现历史备份保留数量设置
  - [x] SubTask 7.7: 实现手动备份/恢复/检查变更的快捷按钮

- [x] Task 8: 注册命令和状态栏
  - [x] SubTask 8.1: 注册命令：Create Backup、Restore Latest、Restore from History、Check for Changes
  - [x] SubTask 8.2: 实现状态栏图标：显示同步状态（已同步/有变更/同步中/错误）
  - [x] SubTask 8.3: 添加状态栏点击交互：点击打开差异检查结果

- [x] Task 9: 测试与验证
  - [x] SubTask 9.1: 构建插件，在测试 Vault 中安装
  - [x] SubTask 9.2: 安装几个社区插件并调整设置，测试备份功能
  - [x] SubTask 9.3: 修改插件设置后，测试恢复功能，验证恢复后设置正确
  - [x] SubTask 9.4: 测试自动备份定时器
  - [x] SubTask 9.5: 测试差异检测准确性
  - [x] SubTask 9.6: 测试历史版本恢复
  - [x] SubTask 9.7: 验证恢复操作不会破坏已有配置

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]（恢复前需要备份能力）
- [Task 5] depends on [Task 3]（差异检测依赖备份文件结构）
- [Task 6] depends on [Task 3]（定时备份依赖备份核心逻辑）
- [Task 7] depends on [Task 2]（设置界面依赖类型定义）
- [Task 8] depends on [Task 3, Task 4, Task 5]（命令依赖核心逻辑）
- [Task 9] depends on [Task 3, Task 4, Task 5, Task 6, Task 7, Task 8]
- [Task 3, Task 5, Task 6, Task 7] 可并行开发
