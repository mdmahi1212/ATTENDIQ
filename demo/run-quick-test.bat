@echo off
rem Quick test: plays demo\door.mp4 + demo\room.mp4 as a class that ends when the videos end.
cd /d "%~dp0..\apps\edge"
if not exist ".venv\Scripts\python.exe" (
  echo apps\edge\.venv is missing. Set up the edge first ^(see README.md^).
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m edge.demo %*
echo.
pause
