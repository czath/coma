@echo off
echo Setting up environment variables...

REM Set paths usually found in default installations
set "PYTHON_PATH=%LOCALAPPDATA%\Microsoft\WindowsApps"
set "NODE_PATH=C:\Program Files\nodejs"

REM Check if paths exist and add to PATH
if exist "%PYTHON_PATH%\python.exe" (
    echo Found Python at %PYTHON_PATH%
    set "PATH=%PYTHON_PATH%;%PATH%"
) else (
    echo Python not found at %PYTHON_PATH%
)

if exist "%NODE_PATH%\node.exe" (
    echo Found Node.js at %NODE_PATH%
    set "PATH=%NODE_PATH%;%PATH%"
) else (
    echo Node.js not found at %NODE_PATH%
)

REM Verify
echo.
echo Verifying tools...
python --version
node --version
npm --version
