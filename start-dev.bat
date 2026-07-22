@echo off
title DentiSys Local Dev Launcher
echo ===================================================
echo           Starting DentiSys Local Environment
echo ===================================================
echo.

:: Start PHP Backend Server on port 8090 in a new window
echo Starting PHP Backend API on http://localhost:8090/ ...
start "DentiSys Backend API (Port 8090)" cmd /k "cd /d "%~dp0" && php -S localhost:8090 -t backend/public"

:: Start Frontend Server on port 5173 in a new window
echo Starting Frontend Dev Server on http://localhost:5173/ ...
start "DentiSys Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend" && node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev"

:: Give servers 2 seconds to initialize then open browser
timeout /t 3 /nobreak > nul
echo Opening DentiSys in your web browser...
start http://localhost:5173/

echo.
echo ===================================================
echo   Both servers are running! Do not close the window.
echo ===================================================