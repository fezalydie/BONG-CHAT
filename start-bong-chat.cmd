@echo off
rem BONG CHAT - single-process app (API + built frontend) on port 4000
cd /d "C:\Users\User\BA folder\bong-chat"
:loop
echo [%date% %time%] starting app >> "C:\Users\User\AppData\Local\Temp\bong-app.log"
node server\dist\index.js >> "C:\Users\User\AppData\Local\Temp\bong-app.log" 2>&1
echo [%date% %time%] app exited code %errorlevel% >> "C:\Users\User\AppData\Local\Temp\bong-app.log"
timeout /t 5 /nobreak >nul
goto loop
