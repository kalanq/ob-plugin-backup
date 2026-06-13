import type { App } from "obsidian";

const path = require("path");

export function getVaultPath(app: App): string {
	return (app.vault.adapter as any).getBasePath();
}

export function getConfigDirName(app: App): string {
	return (app.vault as any).configDir || ".obsidian";
}

export function getConfigPath(app: App): string {
	return path.join(getVaultPath(app), getConfigDirName(app));
}

export function resolveVaultPath(vaultPath: string, configuredPath: string): string {
	if (!configuredPath) return "";
	if (configuredPath.includes(":") || configuredPath.startsWith("/")) {
		return configuredPath;
	}
	return path.join(vaultPath, configuredPath);
}
