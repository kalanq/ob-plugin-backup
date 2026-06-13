$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ob-plugin-backup-installer-" + [System.Guid]::NewGuid().ToString("N"))
$vault = Join-Path $tempRoot "FakeVault"
$pluginDir = Join-Path $vault ".obsidian\plugins\ob-plugin-backup"

New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $pluginDir "data.json") -Value '{"keep":true}' -Encoding UTF8

try {
    & (Join-Path $root "install-plugin.ps1") -VaultPath $vault

    $manifestPath = Join-Path $pluginDir "manifest.json"
    $mainPath = Join-Path $pluginDir "main.js"
    $dataPath = Join-Path $pluginDir "data.json"

    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "manifest.json was not installed"
    }
    if (-not (Test-Path -LiteralPath $mainPath -PathType Leaf)) {
        throw "main.js was not installed"
    }
    if ((Get-Content -LiteralPath $dataPath -Raw) -notmatch '"keep":true') {
        throw "data.json was overwritten"
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.version -ne "0.1.2") {
        throw "Expected manifest version 0.1.2, got $($manifest.version)"
    }

    Write-Host "PASS: Windows-only installer installed main.js and manifest.json without overwriting data.json"
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
