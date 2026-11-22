@echo off
rem AttendIQ one-click demo: plays demo\videos\door.mp4 + room.mp4 as a live class (see INSTRUCTIONS.md).
title AttendIQ demo
cd /d "%~dp0..\apps\edge"
if not exist ".venv\Scripts\python.exe" (
  echo apps\edge\.venv is missing. Set up the edge first ^(README.md, Quick start^).
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m edge.demo %*
echo.
pause
