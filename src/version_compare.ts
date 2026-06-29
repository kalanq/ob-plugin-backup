export interface FileHashComparison {
	added: string[];
	modified: string[];
	deleted: string[];
}

export interface JsonStructureDiff {
	addedKeys: string[];
	removedKeys: string[];
	changedKeys: string[];
	parseError: boolean;
}

export function compareFileHashes(
	fromHashes: Record<string, string>,
	toHashes: Record<string, string>,
): FileHashComparison {
	const added: string[] = [];
	const modified: string[] = [];
	const deleted: string[] = [];

	for (const [file, hash] of Object.entries(toHashes)) {
		if (!fromHashes[file]) added.push(file);
		else if (fromHashes[file] !== hash) modified.push(file);
	}
	for (const file of Object.keys(fromHashes)) {
		if (!toHashes[file]) deleted.push(file);
	}

	return {
		added: added.sort(),
		modified: modified.sort(),
		deleted: deleted.sort(),
	};
}

export function compareJsonStructure(fromText: string, toText: string): JsonStructureDiff {
	try {
		const fromValue = JSON.parse(fromText);
		const toValue = JSON.parse(toText);
		if (!isPlainObject(fromValue) || !isPlainObject(toValue)) {
			return {
				addedKeys: [],
				removedKeys: [],
				changedKeys: fromText === toText ? [] : ["<root>"],
				parseError: false,
			};
		}

		const fromObject = fromValue as Record<string, unknown>;
		const toObject = toValue as Record<string, unknown>;
		const addedKeys: string[] = [];
		const removedKeys: string[] = [];
		const changedKeys: string[] = [];

		for (const key of Object.keys(toObject)) {
			if (!(key in fromObject)) addedKeys.push(key);
			else if (JSON.stringify(fromObject[key]) !== JSON.stringify(toObject[key])) changedKeys.push(key);
		}
		for (const key of Object.keys(fromObject)) {
			if (!(key in toObject)) removedKeys.push(key);
		}

		return {
			addedKeys: addedKeys.sort(),
			removedKeys: removedKeys.sort(),
			changedKeys: changedKeys.sort(),
			parseError: false,
		};
	} catch {
		return {
			addedKeys: [],
			removedKeys: [],
			changedKeys: [],
			parseError: true,
		};
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
