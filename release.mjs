import { execSync } from "child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "fs";
import { dirname, basename, join } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "release");

const RELEASE_FILES = [
	"main.js",
	"manifest.json",
	"styles.css",
	"install-plugin.cmd",
	"install-plugin.ps1",
	"README.md",
];

if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

console.log("Building...");
execSync("node esbuild.config.mjs production", { cwd: ROOT, stdio: "inherit" });

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const version = manifest.version;

const readme = `# ob-plugin-backup v${version}

> [!CAUTION]
> This plugin can overwrite Obsidian configuration files. Before restoring, manually back up your vault config folder.

## Installation

### Install with BRAT

1. Install and enable the Obsidian BRAT plugin.
2. Run "BRAT: Add a beta plugin for testing" from the command palette.
3. Paste: \`https://github.com/kalanq/ob-plugin-backup\`
4. Enable "Plugin Backup" in Obsidian Settings > Community Plugins.

### Manual install

Copy \`main.js\` and \`manifest.json\` from this release to:
\`.obsidian/plugins/ob-plugin-backup/\`

## Windows-only installer

On Windows, double-click \`install-plugin.cmd\`.
The installer copies only \`main.js\` and \`manifest.json\`; it does not copy \`data.json\`.

## Files

- \`main.js\` - Plugin code
- \`manifest.json\` - Plugin metadata
- \`install-plugin.cmd\` - Windows-only double-click installer
- \`install-plugin.ps1\` - Windows-only installer script
${existsSync(join(ROOT, "styles.css")) ? "- `styles.css` - Plugin styles\n" : ""}
GitHub also provides automatic source code archives on each release. They are source snapshots, not the curated plugin install bundle.

## Usage

1. Open Obsidian Settings > Community Plugins.
2. Enable "Plugin Backup".
3. Configure the backup path, usually \`meta\`.
4. Keep the default archive zip format unless you need the legacy loose-file directory layout.
5. Create the first backup manually.
6. Add comments to manual backups so future restore decisions are easier.
7. Use "Create Local Safety Snapshot" when you only want a local rollback point and do not want to update the synced backup.
8. Restore dialogs show changed or missing files by default and mark JSON settings that contain absolute local paths.
9. Use "Restore Last Pre-Restore Snapshot" if a restore needs to be rolled back.
10. Use "Compare backup versions" to inspect file-hash changes and JSON key summaries.
11. Community plugin restore entries are grouped by plugin name and id, with plugin-level selection.

## Multi-device retention note

Each device prunes shared sync history after it writes a backup. If different devices use different sync history retention counts, the effective shared history limit is the smallest value used on any device.
`;

writeFileSync(join(DIST, "README.md"), readme, "utf8");

for (const file of RELEASE_FILES) {
	const src = file === "README.md" ? join(DIST, "README.md") : join(ROOT, file);
	const dest = join(DIST, basename(file));
	if (existsSync(src)) {
		if (src !== dest) copyFileSync(src, dest);
		console.log(`  Copied: ${basename(file)}`);
	}
}

console.log(`\nRelease v${version} ready in release/`);
