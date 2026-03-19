@echo off
chcp 65001 >nul
title TNS Pushbullet 입금 감지 (24시간)
cd /d "%~dp0"
echo.
echo ================================================
echo   TNS Pushbullet 스트림 리스너 시작
echo   신한은행 입금 SMS 자동 감지 중...
echo   로컬 실패 시 Vercel 웹훅으로 자동 전송
echo ================================================
echo.

:loop
node "%~dp0scripts\pushbullet-stream.js"
if errorlevel 1 (
  echo [%time%] 오류 발생. 5초 후 재시작...
) else (
  echo [%time%] 스크립트 종료됨. 5초 후 재시작...
)
timeout /t 5 /nobreak >nul
goto loop
