@echo off
echo Starte Planer App...
pip install -r requirements.txt >nul 2>&1
python app.py
pause
