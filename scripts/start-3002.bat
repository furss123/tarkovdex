@echo off
REM Secondary production server (port 3002) so two sessions can verify
REM builds side by side. Mirrors start-with-path.bat.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0.."
call npm run start -- --port 3002
