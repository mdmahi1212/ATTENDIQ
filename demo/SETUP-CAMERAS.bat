@echo off
rem Sends one picture from each demo video to the website, so you can draw the seat area + exit line on it.
title AttendIQ demo camera setup
cd /d "%~dp0..\apps\edge"
".venv\Scripts\python.exe" -m edge.demo --setup %*
echo.
pause
