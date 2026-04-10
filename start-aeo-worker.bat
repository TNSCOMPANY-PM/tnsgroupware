@echo off
chcp 65001 >nul
title AEO Scan Worker
cd /d "%~dp0"

if not exist "logs" mkdir "logs"

set LOGFILE=%~dp0logs\aeo-worker.log

:loop
>>"%LOGFILE%" echo [%date% %time%] === AEO worker starting ===
>>"%LOGFILE%" 2>&1 call npx tsx "%~dp0scripts\aeo-scan-worker.ts"
>>"%LOGFILE%" echo [%date% %time%] worker exited (errorlevel=%errorlevel%) - restarting in 10s
timeout /t 10 /nobreak >nul
goto loop
