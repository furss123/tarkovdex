@echo off
REM Production server launcher, mirroring dev-with-path.bat. Node lives at
REM C:\Program Files\nodejs but isn't on this machine's default PATH.
REM Used for layout/visual verification: `next dev` streams Suspense
REM placeholders and keeps hidden copies of the previous route in the DOM,
REM which makes getBoundingClientRect-based checks read the wrong tree.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0.."
REM Port 3001 so it can run alongside the dev server on 3000.
call npm run start -- --port 3001
