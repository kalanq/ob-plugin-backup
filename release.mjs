import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dirname;
const DIST = join(ROOT, "release");

if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

console.log("Building...");
execSync("node esbuild.config.mjs production", { cwd: ROOT, stdio: "inherit" });

const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const version = manifest.version;

const files = ["main.js", "manifest.json", "styles.css", "install-plugin.cmd", "install-plugin.ps1"];
for (const f of files) {
    const src = join(ROOT, f);
    if (existsSync(src)) {
        copyFileSync(src, join(DIST, f));
        console.log(`  Copied: ${f}`);
    }
}

const readme = `# ob-plugin-backup v${version}

> [!CAUTION]
> **警告**：本插件主要由 **vibe coding** 制作。在使用前，**请务必自行对您的 Obsidian 仓库配置进行手动备份**，以免发生意外情况。

## Installation
Copy ALL files from this folder to your vault's:
\`.obsidian/plugins/ob-plugin-backup/\`

## Windows-only installer
On Windows, you can double-click \`install-plugin.cmd\`.
The installer copies only \`main.js\` and \`manifest.json\`; it does not copy \`data.json\`.

## Files
- \`main.js\` - Plugin code
- \`manifest.json\` - Plugin metadata (version: ${version})
- \`install-plugin.cmd\` - Windows-only double-click installer
- \`install-plugin.ps1\` - Windows-only installer script
${existsSync(join(ROOT, "styles.css")) ? "- `styles.css` - Plugin styles\n" : ""}
## Usage
1. Open Obsidian Settings → Community Plugins
2. Enable "Plugin Backup"
3. Configure backup path (default: meta - synced via NAS)
4. Use commands: Create Backup, Restore, Check Changes
`;

writeFileSync(join(DIST, "README.md"), readme);

console.log(`\nRelease v${version} ready in release/`);
console.log("Copy the entire release/ folder to .obsidian/plugins/ob-plugin-backup/");
