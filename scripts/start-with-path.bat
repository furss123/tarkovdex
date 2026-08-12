@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0.."
npx next start --port 3001
