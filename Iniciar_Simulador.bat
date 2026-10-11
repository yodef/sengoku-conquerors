@echo off
title Sengoku Conquerors 1.4 Simulator
echo Iniciando Simulador Web Local...
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0server.ps1"
pause
