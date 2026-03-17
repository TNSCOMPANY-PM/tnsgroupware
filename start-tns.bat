@echo off
title TNS Workspace - 개발 서버
cd /d "c:\Users\user1\Dropbox\Vibe coding project\groupware"
echo.
echo =========================================
echo   TNS Workspace 개발 서버 시작 중...
echo   http://localhost:3000
echo.
echo   [Pushbullet 리스너는 시작프로그램에서
echo    별도로 항상 실행 중입니다]
echo =========================================
echo.
npm run dev
pause
