@echo off
title Temple BCI Runner
echo ========================================================
echo       Starting Temple BCI Runner Game...
echo ========================================================
cd /d "%~dp0"

echo Opening browser at http://localhost:8000...
start "" "http://localhost:8000"

echo Starting local web server on port 8000...
node server.js
if %ERRORLEVEL% NEQ 0 (
    echo Node server failed or not found, falling back to Python server...
    python -m http.server 8000
)
pause
