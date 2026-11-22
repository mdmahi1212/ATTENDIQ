@echo off
rem Full demo class: demo timing (present 2 min, late 5 min, count checks, professor alert), ends by itself.
cd /d "%~dp0..\apps\edge"
if not exist ".venv\Scripts\python.exe" (
  echo apps\edge\.venv is missing. Set up the edge first ^(see README.md^).
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m edge.demo --full %*
echo.
pause
