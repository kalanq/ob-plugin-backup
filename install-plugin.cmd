@echo off
chcp 65001 >nul
setlocal

echo Plugin Backup Windows-only installer
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-plugin.ps1"

echo.
pause
