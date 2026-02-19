@echo off
echo Setting up Whisper Service...

cd /d %~dp0

:: Create virtual environment
python -m venv venv
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b %errorlevel%
)

:: Activate and install dependencies
call venv\Scripts\activate
pip install -r requirements.txt

echo.
echo setup complete! 
echo To start the server, run: python transcribe_server.py
pause
