@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  Toguna - Recuperation des partages Facebook
echo ============================================
echo.
echo 1. Chrome va s'ouvrir
echo 2. Connectez-vous a Facebook si demande
echo 3. Quand la publication s'affiche, CLIQUEZ sur "X partages"
echo.

python main.py --url "https://www.facebook.com/share/p/18nh8dwj2L/" --login-wait 60 --manual-shares 90 --sync-pronostic

echo.
if exist "..\..\exports\participants_18nh8dwj2L.xlsx" (
    echo Fichier cree : exports\participants_18nh8dwj2L.xlsx
    echo Tirage web   : http://localhost:8000/?file=exports/participants_18nh8dwj2L.xlsx
) else (
    echo Echec ou interruption. Relancez le fichier .bat
)
echo.
pause
