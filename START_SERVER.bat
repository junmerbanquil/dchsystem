@echo off
cd /d %~dp0
echo Starting DCH Clinical Chart PWA...
echo.
if not exist node_modules (
  echo Installing required files. Please wait...
  npm install
)
node server.js
pause
