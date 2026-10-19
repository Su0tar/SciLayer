@echo off
powershell.exe -NoProfile -File "%~dp0scripts\launch.ps1"
if errorlevel 1 pause
