@echo off
rem AttendIQ live classroom: starts everything (cameras check, broker, face API, ingest, edge + models, live view).
title AttendIQ classroom
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-live.ps1"
echo.
pause
