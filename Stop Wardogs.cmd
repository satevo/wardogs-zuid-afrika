@echo off
setlocal
cd /d "%~dp0"
node stop-local.mjs
if errorlevel 1 pause
