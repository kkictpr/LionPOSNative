@echo off
title LionPOS Auto Start

echo ==========================================
echo   LionPOS Auto Start
echo ==========================================

:: 1) เปิด VS Code พร้อมโปรเจกต์
start "" "C:\Users\PC-001\AppData\Local\Programs\Microsoft VS Code\Code.exe" "D:\LionPOSNative"

:: 2) เปิด Metro
start "Metro" cmd /k "cd /d D:\LionPOSNative && npm start"

:: 3) รอ 1 นาที 30 วินาที
timeout /t 90 /nobreak >nul

:: 4) เปิด Android Studio
start "" "C:\Program Files\Android\Android Studio\bin\studio64.exe"

:: 5) รอ Android Studio เปิดครบ 1 นาที (กัน Error)
timeout /t 60 /nobreak >nul

:: 6) เปิด Emulator Medium_Phone
:: ถ้าชื่อ AVD ไม่ตรง ให้เปลี่ยน Medium_Phone เป็นชื่อใน Device Manager
start "" "C:\Users\PC-001\AppData\Local\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone

exit
