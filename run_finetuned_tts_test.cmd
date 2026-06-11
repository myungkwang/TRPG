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

echo Starting fine-tuned CosyVoice3 test server...
echo Python: %PYTHON_EXE%
echo URL: http://127.0.0.1:8023
echo.
echo If the server cannot find the model, put the model folder here:
echo   %cd%\CosyVoice3_game_chars_epoch23_for_team\eval_model
echo or set COSYVOICE_MODEL_DIR in .env.
echo.

"%PYTHON_EXE%" .\finetuned_cosyvoice_test_server.py --host 127.0.0.1 --port 8023
pause
