import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ob-plugin-backup-compare-"));
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (condition) {
		passed++;
		console.log(`  PASS: ${message}`);
	} else {
		failed++;
		console.log(`  FAIL: ${message}`);
	}
}

await esbuild.build({
	entryPoints: [path.join(ROOT, "src/version_compare.ts")],
	bundle: true,
	format: "cjs",
	platform: "node",
	outfile: path.join(OUT_DIR, "version_compare.cjs"),
	logLevel: "silent",
});

const { compareFileHashes, compareJsonStructure } = require(path.join(OUT_DIR, "version_compare.cjs"));

console.log("=== File hash comparison ===");
const fileDiff = compareFileHashes(
	{ "a.json": "1", "b.json": "2", "deleted.json": "3" },
	{ "a.json": "1", "b.json": "changed", "added.json": "4" },
);
assert(fileDiff.added.join(",") === "added.json", "detects added files");
assert(fileDiff.modified.join(",") === "b.json", "detects modified files");
assert(fileDiff.deleted.join(",") === "deleted.json", "detects deleted files");

console.log("\n=== JSON structure comparison ===");
const jsonDiff = compareJsonStructure(
	JSON.stringify({ keep: 1, change: { a: 1 }, remove: true }),
	JSON.stringify({ keep: 1, change: { a: 2 }, add: "new" }),
);
assert(jsonDiff.addedKeys.join(",") === "add", "detects added top-level keys");
assert(jsonDiff.removedKeys.join(",") === "remove", "detects removed top-level keys");
assert(jsonDiff.changedKeys.join(",") === "change", "detects changed top-level keys");
assert(jsonDiff.parseError === false, "valid JSON does not report parse error");

const invalidDiff = compareJsonStructure("{bad", "{}");
assert(invalidDiff.parseError === true, "invalid JSON reports parse error");

const arrayDiff = compareJsonStructure("[1]", "[2]");
assert(arrayDiff.changedKeys.join(",") === "<root>", "array root changes are summarized at root");

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
