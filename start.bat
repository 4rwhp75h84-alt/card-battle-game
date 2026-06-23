@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo 正在安装依赖...
call npm install
if errorlevel 1 (
  echo.
  echo 未检测到 Node.js，请先安装: https://nodejs.org
  pause
  exit /b 1
)
echo.
echo 服务器启动中...
echo.
echo ===== 同一 WiFi 联机 =====
echo 本机浏览器: http://localhost:3000
echo.
echo 另一台设备请用下面地址之一打开（一般是 192.168 开头）:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i /c:"IPv4"') do (
  set "ADDR=%%a"
  set "ADDR=!ADDR: =!"
  if not "!ADDR!"=="" if not "!ADDR:~0,3!"=="127" echo   http://!ADDR!:3000
)
echo.
echo 流程: 你创建房间 -^> 把「地址 + 4位房间号」发给朋友 -^> 朋友点加入
echo 请保持本窗口不要关闭
echo ============================
echo.
call npm start
pause
