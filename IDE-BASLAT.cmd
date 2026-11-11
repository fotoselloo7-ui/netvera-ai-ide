@echo off
setlocal EnableExtensions
title NetVera AI IDE - Local Development

REM Keep this script inside the already cloned repository. No reclone needed.
cd /d "%~dp0"
if errorlevel 1 goto :path_error

echo.
echo ==========================================
echo      NetVera AI IDE - LOCAL LAUNCHER
echo ==========================================
echo Project: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git is not installed or is missing from PATH.
  goto :failed
)
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 22.13+ or 24+ is required.
  goto :failed
)
where npx >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npx is missing. Reinstall a supported Node.js release.
  goto :failed
)
where cargo >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Rust / Cargo is missing.
  echo Install the Rust MSVC toolchain and Visual Studio C++ Build Tools for Tauri.
  echo For a no-toolchain install, use the latest Windows build artifact instead.
  goto :failed
)

REM Refuse to overwrite work from a previous local editing session.
git diff --quiet
if errorlevel 1 (
  echo [ERROR] There are uncommitted changes to tracked files.
  echo Commit or stash your changes first. No files were overwritten.
  goto :failed
)
git diff --cached --quiet
if errorlevel 1 (
  echo [ERROR] There are staged local changes.
  echo Commit or stash your changes first. No files were overwritten.
  goto :failed
)

echo [1/3] Updating source code from GitHub...
git pull --ff-only origin main
if errorlevel 1 (
  echo [ERROR] Git pull could not fast-forward.
  echo Resolve the Git state manually. This launcher never force-resets.
  goto :failed
)

echo.
echo [2/3] Installing project dependencies using temporary pnpm...
echo NOTE: This does not require administrator rights or corepack enable.
call npx --yes pnpm@11.0.0 install --frozen-lockfile
if errorlevel 1 (
  echo [ERROR] Dependencies could not be installed.
  goto :failed
)

echo.
echo [3/3] Starting the real Tauri desktop application...
echo The first launch compiles Rust; subsequent launches reuse the build cache.
call npx --yes pnpm@11.0.0 tauri dev
if errorlevel 1 (
  echo [ERROR] Tauri did not start. Check Rust MSVC and Visual Studio C++ Build Tools.
  goto :failed
)
exit /b 0

:path_error
echo [ERROR] Could not open the repository folder.
:failed
echo.
echo Read the error above. The repository was NOT reset or recreated.
pause
exit /b 1
