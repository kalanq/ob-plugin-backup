[CmdletBinding()]
param(
    [string]$VaultPath,
    [string]$ConfigDirName
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Read-RequiredPath {
    param([string]$Prompt)

    while ($true) {
        $value = Read-Host $Prompt
        $value = $value.Trim().Trim('"')
        if ($value -and (Test-Path -LiteralPath $value -PathType Container)) {
            return (Resolve-Path -LiteralPath $value).Path
        }
        Write-Host "Folder not found. Please enter a valid Obsidian vault folder." -ForegroundColor Yellow
    }
}

function Resolve-ConfigDir {
    param(
        [string]$Vault,
        [string]$ConfiguredName
    )

    if ($ConfiguredName) {
        $candidate = Join-Path $Vault $ConfiguredName
        if (-not (Test-Path -LiteralPath $candidate -PathType Container)) {
            New-Item -ItemType Directory -Path $candidate -Force | Out-Null
        }
        return $candidate
    }

    $defaultConfig = Join-Path $Vault ".obsidian"
    if (Test-Path -LiteralPath $defaultConfig -PathType Container) {
        return $defaultConfig
    }

    $name = Read-Host "Could not find .obsidian. Enter your Obsidian config folder name"
    $name = $name.Trim().Trim('"')
    if (-not $name) {
        $name = ".obsidian"
    }

    $config = Join-Path $Vault $name
    if (-not (Test-Path -LiteralPath $config -PathType Container)) {
        New-Item -ItemType Directory -Path $config -Force | Out-Null
    }
    return $config
}

Write-Host "Plugin Backup Windows-only installer" -ForegroundColor Cyan
Write-Host "This script installs main.js and manifest.json only. It will not copy data.json." -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mainJs = Join-Path $scriptDir "main.js"
$manifest = Join-Path $scriptDir "manifest.json"

if (-not (Test-Path -LiteralPath $mainJs -PathType Leaf)) {
    throw "main.js was not found next to this installer."
}
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw "manifest.json was not found next to this installer."
}

if (-not $VaultPath) {
    $VaultPath = Read-RequiredPath "Enter or drag your Obsidian vault folder here"
} else {
    $VaultPath = $VaultPath.Trim().Trim('"')
    if (-not (Test-Path -LiteralPath $VaultPath -PathType Container)) {
        throw "VaultPath does not exist: $VaultPath"
    }
    $VaultPath = (Resolve-Path -LiteralPath $VaultPath).Path
}

$configDir = Resolve-ConfigDir -Vault $VaultPath -ConfiguredName $ConfigDirName
$pluginDir = Join-Path $configDir "plugins\ob-plugin-backup"
New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null

Copy-Item -LiteralPath $mainJs -Destination (Join-Path $pluginDir "main.js") -Force
Copy-Item -LiteralPath $manifest -Destination (Join-Path $pluginDir "manifest.json") -Force

Write-Host ""
Write-Host "Installed Plugin Backup to:" -ForegroundColor Green
Write-Host $pluginDir
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open Obsidian."
Write-Host "2. Enable Community Plugins if needed."
Write-Host "3. Enable Plugin Backup."
Write-Host "4. Choose your sync backup path before the first backup."
