@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install it, then reopen this launcher.
  pause
  exit /b 1
)
node local-server.mjs --open
if errorlevel 1 pause
