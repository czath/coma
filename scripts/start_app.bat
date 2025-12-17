@echo off
echo Starting Coma Application...

REM Setup Environment
call setup_env.bat

REM Start Backend
echo Launching Backend...
start "Coma Backend" cmd /k "cd ..\backend && python -m uvicorn main:app --reload"

REM Start Frontend
echo Launching Frontend...
start "Coma Frontend" cmd /k "cd ..\frontend && npm run dev"

echo.
echo Application launched in separate windows.
echo Frontend: http://localhost:5173
echo Backend: http://localhost:8000
