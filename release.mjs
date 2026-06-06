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

const files = ["main.js", "manifest.json", "styles.css"];
for (const f of files) {
    const src = join(ROOT, f);
    if (existsSync(src)) {
        copyFileSync(src, join(DIST, f));
        console.log(`  Copied: ${f}`);
    }
}

const readme = `# obsidian-addon-sync v${version}

## Installation
Copy ALL files from this folder to your vault's:
\`.obsidian/plugins/obsidian-addon-sync/\`

## Files
- \`main.js\` - Plugin code
- \`manifest.json\` - Plugin metadata (version: ${version})
${existsSync(join(ROOT, "styles.css")) ? "- `styles.css` - Plugin styles\n" : ""}
## Usage
1. Open Obsidian Settings → Community Plugins
2. Enable "Addon Sync"
3. Configure backup path (default: meta - synced via NAS)
4. Use commands: Create Backup, Restore, Check Changes
`;

writeFileSync(join(DIST, "README.md"), readme);

console.log(`\nRelease v${version} ready in release/`);
console.log("Copy the entire release/ folder to .obsidian/plugins/obsidian-addon-sync/");
