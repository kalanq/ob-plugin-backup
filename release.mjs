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

function makeCrc32Table() {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(value) {
	const buffer = Buffer.alloc(2);
	buffer.writeUInt16LE(value);
	return buffer;
}

function writeUInt32(value) {
	const buffer = Buffer.alloc(4);
	buffer.writeUInt32LE(value >>> 0);
	return buffer;
}

function createZip(entries, outputPath) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
		const data = entry.data;
		const crc = crc32(data);
		const flags = 0x0800; // UTF-8 file names

		const localHeader = Buffer.concat([
			writeUInt32(0x04034b50),
			writeUInt16(20),
			writeUInt16(flags),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt32(crc),
			writeUInt32(data.length),
			writeUInt32(data.length),
			writeUInt16(name.length),
			writeUInt16(0),
			name,
		]);

		localParts.push(localHeader, data);

		const centralHeader = Buffer.concat([
			writeUInt32(0x02014b50),
			writeUInt16(20),
			writeUInt16(20),
			writeUInt16(flags),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt32(crc),
			writeUInt32(data.length),
			writeUInt32(data.length),
			writeUInt16(name.length),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt32(0),
			writeUInt32(offset),
			name,
		]);

		centralParts.push(centralHeader);
		offset += localHeader.length + data.length;
	}

	const centralDirectory = Buffer.concat(centralParts);
	const endOfCentralDirectory = Buffer.concat([
		writeUInt32(0x06054b50),
		writeUInt16(0),
		writeUInt16(0),
		writeUInt16(entries.length),
		writeUInt16(entries.length),
		writeUInt32(centralDirectory.length),
		writeUInt32(offset),
		writeUInt16(0),
	]);

	writeFileSync(outputPath, Buffer.concat([
		...localParts,
		centralDirectory,
		endOfCentralDirectory,
	]));
}

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

Copy all plugin files from this folder to:
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
## Usage

1. Open Obsidian Settings > Community Plugins.
2. Enable "Plugin Backup".
3. Configure the backup path, usually \`meta\`.
4. Create the first backup manually.
`;

writeFileSync(join(DIST, "README.md"), readme, "utf8");

const copiedFiles = [];
for (const file of RELEASE_FILES) {
	const src = file === "README.md" ? join(DIST, "README.md") : join(ROOT, file);
	const dest = join(DIST, basename(file));
	if (existsSync(src)) {
		if (src !== dest) copyFileSync(src, dest);
		copiedFiles.push(basename(file));
		console.log(`  Copied: ${basename(file)}`);
	}
}

const zipName = `ob-plugin-backup-v${version}.zip`;
const zipPath = join(DIST, zipName);
createZip(
	copiedFiles.map((file) => ({
		name: file,
		data: readFileSync(join(DIST, file)),
	})),
	zipPath,
);

console.log(`  Created: ${zipName}`);
console.log(`\nRelease v${version} ready in release/`);
