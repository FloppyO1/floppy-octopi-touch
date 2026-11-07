@echo off
rem Stops the dev stack (OctoPrint, agent, Vite, webcam). Volumes are kept.
docker compose -f "%~dp0docker-compose.yml" down
docker stop fot-vite >nul 2>&1
pause
