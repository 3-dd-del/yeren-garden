@echo off
cd /d "%~dp0"
echo Yeren Garden - http://127.0.0.1:4173
if not exist "dist\index.html" (
  call npm.cmd run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "" "http://127.0.0.1:4173"
node scripts\serve.mjs
pause
