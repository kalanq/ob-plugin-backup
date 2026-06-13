const os = require("os");

export function normalizeDeviceName(name: string): string {
	const trimmed = (name || "").trim();
	return trimmed || "This device";
}

export function createDeviceId(name: string): string {
	const normalized = normalizeDeviceName(name)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "this-device";
}

export function getDefaultDeviceName(): string {
	try {
		return normalizeDeviceName(os.hostname());
	} catch {
		return "This device";
	}
}

export function ensureDeviceIdentity(settings: {
	deviceId?: string;
	deviceName?: string;
}): { deviceId: string; deviceName: string } {
	const deviceName = normalizeDeviceName(settings.deviceName || getDefaultDeviceName());
	const deviceId = settings.deviceId || createDeviceId(deviceName);
	return { deviceId, deviceName };
}
