@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "LOG_DIR=%ROOT%deploy-logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
set "LOG_FILE=%LOG_DIR%\deploy-%STAMP%.log"

call :log "ThemeAtlas deploy started"
call :log "Working directory: %CD%"
call :run "Updating from GitHub" "git pull --rebase --autostash" || goto :end_fail
call :run "Building themes" "node tools/build-themes.mjs" || goto :end_fail
call :run "Validating" "node tools/validate.mjs" || goto :end_fail
call :run "Staging changes" "git add index.html themes/ assets/ robots.txt sitemap.xml site.webmanifest 404.html .nojekyll package.json tools/ README.md deploy.bat .gitignore && git add -f .github/workflows/pages.yml" || goto :end_fail

git diff --cached --quiet >> "%LOG_FILE%" 2>&1
if not errorlevel 1 (
    call :log "Nothing to commit - working tree clean."
    call :run "Pushing" "git push" || goto :end_fail
    goto :success
)

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HHmm"') do set "COMMIT_STAMP=%%I"
call :run "Committing" "git commit -m chore-rebuild-themes-%COMMIT_STAMP%" || goto :end_fail
call :run "Pushing" "git push" || goto :end_fail

:success
call :log "Deploy finished successfully."
echo.
echo Log written to: "%LOG_FILE%"
goto :end

:run
set "STEP=%~1"
set "COMMAND=%~2"
call :log "[RUN] !STEP!: !COMMAND!"
cmd /d /c "!COMMAND!" >> "%LOG_FILE%" 2>&1
set "STATUS=!ERRORLEVEL!"
if not "!STATUS!"=="0" (
    call :log "[FAIL] !STEP! exited with code !STATUS!."
    echo.
    echo Last log lines:
    powershell -NoProfile -Command "Get-Content -LiteralPath '%LOG_FILE%' -Tail 30"
    exit /b !STATUS!
)
call :log "[OK] !STEP!"
exit /b 0

:log
echo %~1
>> "%LOG_FILE%" echo [%date% %time%] %~1
exit /b 0

:end_fail
echo.
echo Deploy failed. Full log: "%LOG_FILE%"
echo.
pause
exit /b 1

:end
echo.
pause
exit /b 0
