@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo [Exam-Master] 서버 및 모바일 외부 접속 링크를 시작합니다...
echo ========================================================
start "Exam-Master Server" cmd /k ".\venv\Scripts\python.exe app.py"
timeout /t 2 /nobreak >nul
echo.
echo 아래 출력되는 [ https://...trycloudflare.com ] 주소를 핸드폰에서 여세요!
echo ========================================================
.\cloudflared.exe tunnel --url http://127.0.0.1:5002
pause
