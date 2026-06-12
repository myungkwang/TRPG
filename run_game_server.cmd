@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PYTHON_EXE="
if exist "external\envs\cosyvoice\python.exe" set "PYTHON_EXE=external\envs\cosyvoice\python.exe"
if not defined PYTHON_EXE if exist ".venv\Scripts\python.exe" set "PYTHON_EXE=.venv\Scripts\python.exe"
if not defined PYTHON_EXE set "PYTHON_EXE=python"

set COSYVOICE_ONNX_PROVIDER=auto
set KMP_DUPLICATE_LIB_OK=TRUE
set "PYTHONPATH=%~dp0;%PYTHONPATH%"

echo Starting TRPG game server...
echo Working directory: %cd%
echo Python: %PYTHON_EXE%
echo URL: http://127.0.0.1:8000
echo.

"%PYTHON_EXE%" -m uvicorn --app-dir "%~dp0." server:app --reload --host 127.0.0.1 --port 8000
pause
