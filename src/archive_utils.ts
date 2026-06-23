import type { BackupMeta } from "./types";
import { META_FILE_NAME } from "./constants";
import { applyOwnPluginSettingsSnapshotContent, OWN_PLUGIN_SETTINGS_SYNC_PATH } from "./own_plugin_settings";
import { isSafeConfigRelativePath, normalizeConfigRelativePath, resolveConfigRelativePath } from "./safe_paths";

const fs = require("fs");
const path = require("path");
const { strToU8, unzipSync, zipSync } = require("fflate") as {
	strToU8: (text: string) => Uint8Array;
	unzipSync: (data: Uint8Array) => ZipFileMap;
	zipSync: (data: ZipFileMap, options?: { level?: number }) => Uint8Array;
};

type ZipFileMap = Record<string, Uint8Array>;

export function isArchiveBackupPath(backupPath: string): boolean {
	return backupPath.toLowerCase().endsWith(".zip");
}

function readArchiveMap(archivePath: string): ZipFileMap {
	if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) return {};
	return unzipSync(new Uint8Array(fs.readFileSync(archivePath)));
}

export function listArchiveFiles(archivePath: string): string[] {
	const entries = readArchiveMap(archivePath);
	return Object.keys(entries)
		.map((entry) => normalizeConfigRelativePath(entry))
		.filter((entry): entry is string => !!entry && isSafeConfigRelativePath(entry))
		.sort();
}

export function readArchiveText(archivePath: string, relativePath: string): string | null {
	const normalized = normalizeConfigRelativePath(relativePath);
	if (!normalized) return null;
	const entry = readArchiveMap(archivePath)[normalized];
	if (!entry) return null;
	return Buffer.from(entry).toString("utf8");
}

export function writeArchiveFromDirectory(
	sourceDir: string,
	archivePath: string,
	meta: BackupMeta | null = null,
	shouldIncludeFile: (relativePath: string) => boolean = isSafeConfigRelativePath,
): void {
	const files: ZipFileMap = {};

	const walk = (dir: string, prefix: string) => {
		if (!fs.existsSync(dir)) return;
		const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a: any, b: any) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				walk(fullPath, relativePath);
			} else if (entry.isFile() && shouldIncludeFile(relativePath)) {
				const normalized = normalizeConfigRelativePath(relativePath);
				if (normalized) files[normalized] = new Uint8Array(fs.readFileSync(fullPath));
			}
		}
	};

	walk(sourceDir, "");
	if (meta) {
		files[META_FILE_NAME] = strToU8(JSON.stringify(meta, null, 2));
	}

	fs.mkdirSync(path.dirname(archivePath), { recursive: true });
	fs.writeFileSync(archivePath, zipSync(files, { level: 6 }));
}

export function copySelectedArchiveFiles(
	archivePath: string,
	configPath: string,
	selectedRelativePaths: string[],
): void {
	const entries = readArchiveMap(archivePath);
	const selected = Array.from(new Set(selectedRelativePaths)).sort();

	for (const relativePath of selected) {
		const safeRelativePath = normalizeConfigRelativePath(relativePath);
		if (!safeRelativePath || !isSafeConfigRelativePath(safeRelativePath)) continue;

		const entry = entries[safeRelativePath];
		if (!entry) continue;

		if (safeRelativePath === OWN_PLUGIN_SETTINGS_SYNC_PATH) {
			applyOwnPluginSettingsSnapshotContent(configPath, Buffer.from(entry).toString("utf8"));
			continue;
		}

		const destPath = resolveConfigRelativePath(configPath, safeRelativePath);
		if (!destPath) continue;
		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		fs.writeFileSync(destPath, entry);
	}
}
