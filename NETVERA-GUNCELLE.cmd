@echo off
setlocal
title NetVera AI IDE - Update Installed Windows App
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0NETVERA-GUNCELLE.ps1"
if errorlevel 1 (
    echo.
    echo Guncelleme tamamlanamadi. Hata mesaji yukarida. Mevcut surum korunur.
    pause
    exit /b 1
)
exit /b 0
