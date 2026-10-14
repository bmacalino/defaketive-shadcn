@echo off
setlocal
cd /d "%~dp0"

rem One-time setup of DeFaketive on a new PC. Afterwards, start the app with start.cmd.
rem Needs: Python 3.11 (python.org, tick "Add python.exe to PATH"), Node.js LTS (nodejs.org) and Google Chrome.
rem It makes backend\.venv, installs the Python and Node packages, fetches NLTK's VADER word list, and loads the
rem starter reports into a new database. Run it again at any time: it only does what is still missing.

set "BACK=%~dp0backend"
set "VPY=%BACK%\.venv\Scripts\python.exe"

if not exist "%VPY%" (
    set "BASE="
    py -3.11 --version >nul 2>nul && set "BASE=py -3.11"
    if not defined BASE (
        python --version >nul 2>nul && set "BASE=python"
    )
    if not defined BASE (
        echo Python was not found. Install Python 3.11 from https://www.python.org/downloads/
        echo and tick "Add python.exe to PATH" during the install. Then run setup.cmd again.
        pause
        exit /b 1
    )
    echo Making the Python environment in backend\.venv ...
    call %%BASE%% -m venv "%BACK%\.venv"
    if errorlevel 1 (
        echo The Python environment could not be made. Nothing else was done.
        pause
        exit /b 1
    )
)
"%VPY%" -c "import sys; v=sys.version_info; print('Python', sys.version.split()[0]); sys.exit(0 if v[:2]==(3,11) else 3)"
if errorlevel 3 echo Note: the app was tested with Python 3.11. Another version may work, or packages may fail to install.

echo Installing the Python packages, a few minutes the first time ...
"%VPY%" -m pip install --disable-pip-version-check -q --upgrade pip
set "REQ=%~dp0scripts\requirements-lock.txt"
if not exist "%REQ%" set "REQ=%BACK%\requirements.txt"
"%VPY%" -m pip install --disable-pip-version-check -q -r "%REQ%"
if errorlevel 1 (
    echo The Python packages could not be installed. Check the internet connection and run setup.cmd again.
    pause
    exit /b 1
)

"%VPY%" -c "import nltk; nltk.data.find('sentiment/vader_lexicon.zip')" >nul 2>nul
if errorlevel 1 (
    echo Fetching NLTK's VADER word list ...
    "%VPY%" -m nltk.downloader -q -d "%BACK%\.venv\nltk_data" vader_lexicon
)

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js is not installed. Install the LTS version from https://nodejs.org and run setup.cmd again.
    pause
    exit /b 1
)
if not exist node_modules (
    echo Installing the app's packages ...
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        echo The app's packages could not be installed. Run setup.cmd again.
        pause
        exit /b 1
    )
)

echo Loading the starter reports ...
"%VPY%" "%~dp0scripts\load_starter_data.py"
if errorlevel 1 (
    pause
    exit /b 1
)

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=1"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=1"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=1"
if not defined CHROME echo Note: Google Chrome was not found. The app opens without it, but checking a new product needs Chrome.

echo.
echo DeFaketive is set up. Start it with start.cmd.
echo The first Lazada check on this PC opens a Chrome window so you can log in to Lazada once.
pause
