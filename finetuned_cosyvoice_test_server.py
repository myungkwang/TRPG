from __future__ import annotations

import argparse
import html
import os
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

os.environ.setdefault("MPLCONFIGDIR", str(BASE_DIR / "external" / ".matplotlib"))
os.environ.setdefault("HF_HOME", str(BASE_DIR / "external" / ".hf_cache"))
os.environ.setdefault("TORCH_HOME", str(BASE_DIR / "external" / ".torch_cache"))
os.environ.setdefault("COSYVOICE_ONNX_PROVIDER", "auto")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
for env_name in ("MPLCONFIGDIR", "HF_HOME", "TORCH_HOME"):
    Path(os.environ[env_name]).mkdir(parents=True, exist_ok=True)

DEFAULT_REPO_DIR = BASE_DIR / "external" / "CosyVoice"
DEFAULT_TMP_DIR = BASE_DIR / "external" / "finetuned_cosyvoice_test_tmp"
DEFAULT_INSTRUCTION = "You are a helpful assistant.<|endofprompt|>"
SPEAKERS = [
    "char_doctor",
    "char_gail",
    "char_gm",
    "char_kargas",
    "char_marta",
    "char_miner",
    "char_nurse",
    "char_lin",
    "char_tavern_clerk",
    "char_tobi",
]


def env_path(name: str) -> Path | None:
    value = os.getenv(name, "").strip()
    if not value:
        return None
    path = Path(value).expanduser()
    return path if path.is_absolute() else BASE_DIR / path


def resolve_model_dir() -> Path:
    candidates = [
        env_path("COSYVOICE_MODEL_DIR"),
        BASE_DIR / "CosyVoice3_game_chars_epoch23_for_team" / "eval_model",
        BASE_DIR / "eval_model",
        BASE_DIR.parent / "CosyVoice3_game_chars_epoch23_for_team" / "eval_model",
        Path.home() / "Desktop" / "CosyVoice3_game_chars_epoch23_for_team" / "eval_model",
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate.resolve()
    return (BASE_DIR / "CosyVoice3_game_chars_epoch23_for_team" / "eval_model").resolve()


class TTSRequest(BaseModel):
    text: str
    speaker: str = "char_gm"
    instruction: str = DEFAULT_INSTRUCTION


app = FastAPI(title="Fine-tuned CosyVoice3 Test Server")
repo_dir = DEFAULT_REPO_DIR
model_dir = resolve_model_dir()
tmp_dir = DEFAULT_TMP_DIR
model: Any = None
model_lock = threading.Lock()


def add_cosyvoice_paths(path: Path) -> None:
    matcha_dir = path / "third_party" / "Matcha-TTS"
    sys.path.insert(0, str(path))
    if matcha_dir.exists():
        sys.path.insert(0, str(matcha_dir))


def save_chunks(chunks: list[dict[str, Any]], sample_rate: int, output_path: Path) -> None:
    import torch
    import soundfile as sf

    speeches = []
    for chunk in chunks:
        speech = chunk["tts_speech"].detach().cpu()
        if speech.dim() == 1:
            speech = speech.unsqueeze(0)
        speeches.append(speech)
    if not speeches:
        raise RuntimeError("CosyVoice returned no audio chunks.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    audio = torch.cat(speeches, dim=-1).clamp(-1.0, 1.0)
    audio_np = audio.detach().cpu().float().numpy()
    if audio_np.ndim == 2:
        audio_np = audio_np.T
    sf.write(str(output_path), audio_np, sample_rate, subtype="PCM_16")


def ensure_instruction(value: str) -> str:
    instruction = (value or DEFAULT_INSTRUCTION).strip()
    if "<|endofprompt|>" not in instruction:
        instruction = f"{instruction}<|endofprompt|>"
    return instruction


def synthesize(text: str, speaker: str, instruction: str) -> list[dict[str, Any]]:
    if model is None:
        raise RuntimeError("Model is not loaded yet.")
    if speaker not in SPEAKERS:
        raise RuntimeError(f"Unknown speaker: {speaker}")

    normalized_instruction = model.frontend.text_normalize(ensure_instruction(instruction), split=False, text_frontend=True)
    segments = model.frontend.text_normalize(text, split=True, text_frontend=True)
    chunks: list[dict[str, Any]] = []
    for segment in segments:
        model_input = model.frontend.frontend_instruct(segment, speaker, normalized_instruction)
        for model_output in model.model.tts(**model_input, stream=False, speed=1.0):
            chunks.append(model_output)
    return chunks


def configure(args: argparse.Namespace) -> None:
    global repo_dir, model_dir, tmp_dir
    repo_dir = args.repo_dir.resolve()
    model_dir = args.model_dir.resolve()
    tmp_dir = args.tmp_dir.resolve()
    tmp_dir.mkdir(parents=True, exist_ok=True)


@app.on_event("startup")
def startup() -> None:
    global model
    if model is not None:
        return
    if not repo_dir.exists():
        raise RuntimeError(f"CosyVoice repo not found: {repo_dir}")
    if not model_dir.exists():
        raise RuntimeError(
            "Fine-tuned model folder not found. Put the model folder at "
            f"{BASE_DIR / 'CosyVoice3_game_chars_epoch23_for_team'} or set COSYVOICE_MODEL_DIR in .env. "
            f"Current path: {model_dir}"
        )
    add_cosyvoice_paths(repo_dir)
    from cosyvoice.cli.cosyvoice import AutoModel

    model = AutoModel(model_dir=str(model_dir))


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    options = "\n".join(
        f'<option value="{html.escape(s)}" {"selected" if s == "char_gm" else ""}>{html.escape(s)}</option>'
        for s in SPEAKERS
    )
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CosyVoice3 Test</title>
  <style>
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font-family: "Segoe UI", "Malgun Gothic", Arial, sans-serif; background: #f6f7f9; color: #171b22; }}
    main {{ width: min(900px, 100%); background: white; border: 1px solid #d8dde6; border-radius: 8px; padding: 22px; box-shadow: 0 12px 30px rgba(25, 32, 46, .08); }}
    h1 {{ font-size: 22px; margin: 0 0 18px; }}
    label {{ display: block; font-size: 13px; font-weight: 700; margin: 14px 0 6px; }}
    select, textarea, input {{ width: 100%; box-sizing: border-box; border: 1px solid #b9c2d0; border-radius: 6px; padding: 10px 12px; font: inherit; }}
    textarea {{ min-height: 126px; resize: vertical; line-height: 1.5; }}
    .row {{ display: grid; grid-template-columns: 240px 1fr; gap: 14px; }}
    button {{ margin-top: 16px; border: 0; border-radius: 6px; background: #1f6feb; color: white; font: inherit; font-weight: 700; padding: 11px 16px; cursor: pointer; }}
    button:disabled {{ opacity: .55; cursor: wait; }}
    audio {{ width: 100%; margin-top: 18px; }}
    #status {{ min-height: 22px; margin-top: 12px; color: #475467; font-size: 14px; word-break: break-word; }}
    @media (max-width: 720px) {{ .row {{ grid-template-columns: 1fr; }} body {{ padding: 12px; }} }}
  </style>
</head>
<body>
  <main>
    <h1>CosyVoice3 Character TTS Test</h1>
    <div class="row">
      <div>
        <label for="speaker">Character</label>
        <select id="speaker">{options}</select>
      </div>
      <div>
        <label for="instruction">Instruction</label>
        <input id="instruction" value="{html.escape(DEFAULT_INSTRUCTION)}" />
      </div>
    </div>
    <label for="text">Text</label>
    <textarea id="text">의사는 낮은 목소리로 말한다. 깨어났군요. 몸은 좀 어떻습니까?</textarea>
    <button id="go" type="button">Generate Voice</button>
    <div id="status"></div>
    <audio id="audio" controls></audio>
  </main>
  <script>
    const button = document.getElementById("go");
    const statusBox = document.getElementById("status");
    const audio = document.getElementById("audio");
    button.addEventListener("click", async () => {{
      button.disabled = true;
      statusBox.textContent = "Generating...";
      audio.removeAttribute("src");
      try {{
        const res = await fetch("/api/tts", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{
            speaker: document.getElementById("speaker").value,
            instruction: document.getElementById("instruction").value,
            text: document.getElementById("text").value
          }})
        }});
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "TTS failed");
        audio.src = data.audio_url;
        audio.play();
        statusBox.textContent = `Done: ${{data.elapsed_seconds.toFixed(2)}}s, speaker=${{data.speaker}}`;
      }} catch (err) {{
        statusBox.textContent = String(err.message || err);
      }} finally {{
        button.disabled = false;
      }}
    }});
  </script>
</body>
</html>"""


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": model is not None, "repo_dir": str(repo_dir), "model_dir": str(model_dir), "speakers": SPEAKERS}


@app.post("/api/tts")
def tts(req: TTSRequest) -> dict[str, Any]:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")

    out_path = tmp_dir / f"{uuid.uuid4().hex}.wav"
    start = time.perf_counter()
    try:
        with model_lock:
            chunks = synthesize(text, req.speaker, req.instruction)
            save_chunks(chunks, model.sample_rate, out_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "ok": True,
        "speaker": req.speaker,
        "audio_url": f"/audio/{out_path.name}",
        "wav_path": str(out_path),
        "elapsed_seconds": time.perf_counter() - start,
    }


@app.get("/audio/{filename}")
def audio(filename: str) -> FileResponse:
    if "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="invalid filename")
    path = tmp_dir / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="audio not found")
    return FileResponse(path, media_type="audio/wav", filename=filename)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a browser test UI for the fine-tuned CosyVoice3 model.")
    parser.add_argument("--repo-dir", type=Path, default=DEFAULT_REPO_DIR)
    parser.add_argument("--model-dir", type=Path, default=resolve_model_dir())
    parser.add_argument("--tmp-dir", type=Path, default=DEFAULT_TMP_DIR)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8023)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    configure(args)
    import uvicorn

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
