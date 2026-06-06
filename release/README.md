# obsidian-addon-sync v0.1.0-beta

Beta release for testing.

## Installation
Copy ALL files from this folder to your vault's:
`.obsidian/plugins/obsidian-addon-sync/`

## Files
- `main.js` - Plugin code
- `manifest.json` - Plugin metadata (version: 0.1.0)

## Usage
1. Open Obsidian Settings → Community Plugins
2. Enable "Addon Sync"
3. Configure backup path (default: meta - synced via NAS)
4. Use commands: Create Backup, Restore, Check Changes

## Features
- Dual-directory backup: `meta/` (NAS synced) + `.addon-sync-local/` (local safety)
- Version history with changelog
- Restore from any historical snapshot
- Full plugin file backup (main.js, manifest.json, data.json, styles.css)
