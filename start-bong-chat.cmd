@echo off
rem BONG CHAT - start dev servers (client on 5173, server on 4000)
rem Each service runs in a self-restarting supervisor window.
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  start "BongChat Client" /min cmd.exe /c "C:\Users\User\AppData\Local\Temp\bong-start-client.cmd"
)
netstat -ano | findstr /r /c:":4000 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  start "BongChat Server" /min cmd.exe /c "C:\Users\User\AppData\Local\Temp\bong-start-server.cmd"
)
