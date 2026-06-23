import { META_FILE_NAME } from "./constants";

const path = require("path");

const ROOT_HTML_FILE = /^[^/]+\.html?$/i;
const ROOT_GENERATED_CACHE_FILES = [
	/^copilot-index-[^/]+\.json$/i,
];

export function normalizeConfigRelativePath(relativePath: string): string | null {
	if (!relativePath || relativePath.includes("\0")) return null;
	if (path.isAbsolute(relativePath)) return null;

	const unixPath = relativePath.replace(/\\/g, "/");
	if (/^[A-Za-z]:/.test(unixPath)) return null;

	const normalized = path.posix.normalize(unixPath);
	if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
		return null;
	}
	return normalized;
}

export function isSafeConfigRelativePath(relativePath: string): boolean {
	const normalized = normalizeConfigRelativePath(relativePath);
	if (!normalized) return false;
	if (normalized === META_FILE_NAME) return false;
	if (ROOT_HTML_FILE.test(normalized)) return false;
	if (ROOT_GENERATED_CACHE_FILES.some((pattern) => pattern.test(normalized))) return false;
	return true;
}

export function resolveConfigRelativePath(rootPath: string, relativePath: string): string | null {
	const normalized = normalizeConfigRelativePath(relativePath);
	if (!normalized || !isSafeConfigRelativePath(normalized)) return null;

	const root = path.resolve(rootPath);
	const resolved = path.resolve(root, normalized);
	if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
	return resolved;
}
