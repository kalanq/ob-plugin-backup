# Development and Release Workflow

This project is developed interactively. Keep changes deliberate and avoid repeated validation unless the risk justifies it.

## Decision Flow

1. Investigation requests: inspect code/configuration and return findings plus a short modification plan. Do not edit yet unless the user explicitly asks to execute.
2. After plan approval: implement the scoped change only.
3. Validation: run the smallest relevant checks for the modified behavior.
4. Release: ask for or infer the next beta version only when the user requests publishing. For quick beta releases, do not rerun the full test matrix if equivalent targeted checks already passed.

## Validation Levels

- Targeted feature change: run `npx.cmd tsc --noEmit` plus the specific test file that covers the changed behavior.
- Quick beta release: run `npm.cmd run build`, `node release.mjs`, and one relevant smoke/targeted test if the release includes fresh code changes.
- Full release or high-risk change: run the broader suite, including plugin selection, restore preview, dual backup, and installer tests.

Use `npm.cmd` and `npx.cmd` in PowerShell to avoid execution-policy issues with `npm.ps1` and `npx.ps1`.

## Release Notes

- Update `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` together.
- Use `node release.mjs` to regenerate release assets.
- GitHub Actions may create the release automatically after the tag is pushed. If that happens, use `gh release edit --notes-file ... --prerelease` instead of trying to create the release again.
- Keep release notes concise and include only validation actually run for that release.

## Restore UX Principles

- Default restore views should show changed or missing files only.
- Community plugin restore UI should group files by plugin name and plugin id, with a plugin-level select toggle.
- Keep file-level controls available for advanced partial restores.
- Mark JSON settings that contain absolute paths and include a post-restore checklist.
- Do not silently rewrite device-specific paths during restore.

## Vault Safety

- Treat user vaults outside this repo as read-only unless the user explicitly approves a write.
- Before restore-related changes, prefer tests with synthetic vaults over touching real vault data.
- Local safety snapshots and restore previews must avoid generated runtime files such as root HTML/cache files.
