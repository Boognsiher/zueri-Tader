@echo off
rem Startet die Demo von Zueri-Trade: lokaler Webserver und Browser.
rem Beenden mit Strg+C oder durch Schliessen dieses Fensters.
cd /d "%~dp0"
echo Zueri-Trade laeuft auf http://localhost:8000/game/
start "" http://localhost:8000/game/
python -m http.server 8000
