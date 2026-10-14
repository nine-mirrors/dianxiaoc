@echo off
chcp 65001 > nul
title 店小C · 一键启动

echo ============================================
echo    店小C · 蒙牛 AI 巡店助手  一键启动
echo ============================================
echo.

echo [1/2] 启动后端（Express + SQLite，端口 3000）...
start "店小C-后端" cmd /k "cd /d %~dp0server && npm start"

timeout /t 2 /nobreak > nul

echo [2/2] 启动前端（Vue3，端口 5180）...
start "店小C-前端" cmd /k "cd /d %~dp0store-app && npm run dev -- --port 5180 --host 127.0.0.1"

timeout /t 6 /nobreak > nul
start http://127.0.0.1:5180/#/login

echo.
echo  ============================================
echo   已启动！浏览器将自动打开登录页
echo   前端页面：http://127.0.0.1:5180
echo   后端接口：http://127.0.0.1:3000/health
echo   关闭演示：关闭两个命令行窗口即可
echo  ============================================
echo.
pause
