@echo off
rem Double-click to host HaftDast online (runs scripts\play-online.ps1). Ctrl+C to stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\play-online.ps1" %*
pause
