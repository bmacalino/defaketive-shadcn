@echo off
setlocal
cd /d "%~dp0"

rem For changing the code: starts server.py (port 5000) and the developer server (port 5173), which updates
rem the page as you type. It is slower on first load than start.cmd, which serves the finished build.
set "OLD=%~dp0..\Capstone-Version-Control-Version-1.1"
set "PY=%OLD%\.venv\Scripts\python.exe"

if not exist "%PY%" (
    echo The original app's virtual environment was not found in:
    echo   %OLD%
    echo Set it up first, see the README in that folder.
    pause
    exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js is not installed. Install the LTS version from https://nodejs.org and try again.
    pause
    exit /b 1
)
if not exist node_modules (
    echo Installing packages, first time only...
    call npm install
)

rem Flask's own error pages are useful while developing, so they are switched on here only.
set "DEFAKETIVE_DEBUG=1"

echo Starting DeFaketive (the original app plus the database routes) on http://127.0.0.1:5000 ...
start "DeFaketive server (keep open)" /d "%OLD%" "%PY%" "%~dp0server.py"

echo Starting the developer server on http://localhost:5173 ...
start "" /b node scripts\wait-and-open.mjs
call npm run dev -- --port 5173 --strictPort
