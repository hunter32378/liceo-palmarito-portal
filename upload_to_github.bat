@echo off
REM Batch script to automatically add, commit and push changes to GitHub
REM Place this file in the root of your git repository

REM Change to the directory where this script is located
cd /d "%~dp0"

echo.
echo ===============================================
echo  GitHub Auto-Upload Script
echo ===============================================
echo.

REM Check if git is available
git --version >nul 2>&1
if errorlevel 1 (
    echo Error: Git no está instalado o no está en el PATH.
    echo Por favor instala Git desde https://git-scm.com/
    pause
    exit /b 1
)

REM Show current status
echo Estado actual del repositorio:
git status --short
echo.

REM Add all changes
echo Agregando todos los cambios...
git add .
if errorlevel 1 (
    echo Error al ejecutar 'git add .'
    pause
    exit /b 1
)

REM Prepare commit message with timestamp
for /f "tokens=2 delims==" %%i in ('wmic os get localdatetime /value') do set ldt=%%i
set commitmsg=Auto update at %ldt:~0,4%-%ldt:~4,2%-%ldt:~6,2% %ldt:~8,2%:%ldt:~10,2%:%ldt:~12,2%
echo.
echo Mensaje de commit: %commitmsg%

REM Commit changes
echo Creando commit...
git commit -m "%commitmsg%"
if errorlevel 1 (
    echo No hay cambios para commitear o error en commit.
    REM Continue to push anyway in case there are staged changes from before
)

REM Push to origin master
echo Subiendo cambios a GitHub...
git push origin master
if errorlevel 1 (
    echo Error al hacer push. Posibles causas:
    echo - No tienes permisos para push
    echo - El remoto no está configurado correctamente
    echo - Hay cambios remotos que necesitas pull primero
    echo.
    echo Intentando pull antes de push...
    git pull origin master
    if errorlevel 1 (
        echo Error al hacer pull. Resuelve conflictos manualmente.
    ) else (
        echo Pull exitoso, reintentando push...
        git push origin master
    )
)

echo.
echo ===============================================
echo  Proceso completado
echo ===============================================
pause