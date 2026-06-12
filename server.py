from __future__ import annotations

import json
import logging
import os
import asyncio
import sys
import uuid
import threading
import random
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from db import get_conn
from gm_cli import create_session, gm_reply, load_session, recent_history, generate_ending
import progression
import endings
import codex
import dialogue
import character_creation
import story
from auth import (
    validate_signup,
    hash_password,
    verify_password,
    create_access_token,
    get_user_id_from_token,
)

load_dotenv()
logger = logging.getLogger("uvicorn.error")

BASE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("MPLCONFIGDIR", str(BASE_DIR / "external" / ".matplotlib"))
os.environ.setdefault("HF_HOME", str(BASE_DIR / "external" / ".hf_cache"))
os.environ.setdefault("TORCH_HOME", str(BASE_DIR / "external" / ".torch_cache"))
os.environ.setdefault("COSYVOICE_ONNX_PROVIDER", "auto")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
for env_name in ("MPLCONFIGDIR", "HF_HOME", "TORCH_HOME"):
    Path(os.environ[env_name]).mkdir(parents=True, exist_ok=True)

STATIC_DIR = BASE_DIR / "static"
AUDIO_DIR = STATIC_DIR / "audio"
AUDIO_DEBUG_DIR = STATIC_DIR / "audio_debug"
AUDIO_DIR.mkdir(exist_ok=True)
AUDIO_DEBUG_DIR.mkdir(exist_ok=True)
cosyvoice_client = None
cosyvoice_lock = threading.Lock()
COSYVOICE_REPO_DIR = BASE_DIR / "external" / "CosyVoice"
COSYVOICE_MATCHA_DIR = COSYVOICE_REPO_DIR / "third_party" / "Matcha-TTS"


def _env_path(name: str) -> Path | None:
    value = os.getenv(name, "").strip()
    if not value:
        return None
    path = Path(value).expanduser()
    return path if path.is_absolute() else BASE_DIR / path


COSYVOICE_MODEL_CANDIDATES = [
    _env_path("COSYVOICE_MODEL_DIR"),
    BASE_DIR / "CosyVoice3_game_chars_epoch23_for_team" / "eval_model",
    BASE_DIR / "eval_model",
    BASE_DIR.parent / "CosyVoice3_game_chars_epoch23_for_team" / "eval_model",
    Path.home() / "Desktop" / "CosyVoice3_game_chars_epoch23_for_team" / "eval_model",
]
COSYVOICE_MODEL_DIR = next((path for path in COSYVOICE_MODEL_CANDIDATES if path and path.exists()), COSYVOICE_MODEL_CANDIDATES[1])
COSYVOICE_DEFAULT_INSTRUCTION = os.getenv("COSYVOICE_DEFAULT_INSTRUCTION", "You are a helpful assistant.<|endofprompt|>")
COSYVOICE_SFT_INSTRUCTION = os.getenv("COSYVOICE_SFT_INSTRUCTION", COSYVOICE_DEFAULT_INSTRUCTION)
COSYVOICE_LLM_FILE = os.getenv("COSYVOICE_LLM_FILE", "llm.pt").strip() or "llm.pt"
COSYVOICE_MODE = os.getenv("COSYVOICE_MODE", "sft").strip().lower()
COSYVOICE_TEXT_FRONTEND = os.getenv("COSYVOICE_TEXT_FRONTEND", "false").strip().lower() in {"1", "true", "yes", "on"}
COSYVOICE_SEED = int(os.getenv("COSYVOICE_SEED", "1986"))

COSYVOICE_SPEAKERS = {
    "doctor": "char_doctor",
    "gm": "char_gm",
    "gail": "char_gail",
    "kargas": "char_kargas",
    "marta": "char_marta",
    "lin": "char_rin",
    "rin": "char_rin",
    "tobi": "char_toby",
    "toby": "char_toby",
    "nurse": "char_nurse",
    "miner": "char_miner",
    "tavern": "char_tavern_clerk",
    "tavern_clerk": "char_tavern_clerk",
}

TTS_PROVIDER = "edge"

EDGE_TTS_VOICES = {
    "doctor": "ko-KR-HyunsuMultilingualNeural",
    "gm": "ko-KR-HyunsuMultilingualNeural",
    "gail": "ko-KR-HyunsuMultilingualNeural",
    "kargas": "ko-KR-HyunsuMultilingualNeural",
    "marta": "ko-KR-HyunsuMultilingualNeural",
    "lin": "ko-KR-HyunsuMultilingualNeural",
    "rin": "ko-KR-HyunsuMultilingualNeural",
    "tobi": "ko-KR-HyunsuMultilingualNeural",
    "toby": "ko-KR-HyunsuMultilingualNeural",
}


class Utf8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"


app = FastAPI(title="증기와 비늘 Web Test", default_response_class=Utf8JSONResponse)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class ChatRequest(BaseModel):
    session_id: str
    message: str


class MoveRequest(BaseModel):
    session_id: str
    location: str

class StoryChoiceRequest(BaseModel):
    session_id: str
    choice_id: str
    roll: int | None = None


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    instructions: str | None = None
    speaker: str | None = None


class EndingLockRequest(BaseModel):
    session_id: str

class DebugEndingRequest(BaseModel):
    session_id: str
    ending: str  # "노멀" | "트루" | "히든" | "베드"


class CharacterAnswersRequest(BaseModel):
    session_id: str
    answers: dict[str, str]


def get_cosyvoice_client():
    global cosyvoice_client
    if cosyvoice_client is not None:
        return cosyvoice_client

    with cosyvoice_lock:
        if cosyvoice_client is not None:
            return cosyvoice_client

        if not COSYVOICE_MODEL_DIR.exists():
            raise HTTPException(status_code=500, detail=f"CosyVoice model directory not found: {COSYVOICE_MODEL_DIR}")

        if COSYVOICE_REPO_DIR.exists():
            for import_path in (COSYVOICE_REPO_DIR, COSYVOICE_MATCHA_DIR):
                import_path_text = str(import_path)
                if import_path_text not in sys.path:
                    sys.path.insert(0, import_path_text)

        try:
            import torch
            from cosyvoice.cli.cosyvoice import AutoModel
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "CosyVoice runtime is not installed. Install the FunAudioLLM CosyVoice package "
                    "and its dependencies, then restart the server. "
                    f"Import error: {exc}"
                ),
            )

        use_fp16 = os.getenv("COSYVOICE_FP16", "").strip().lower() in {"1", "true", "yes", "on"}
        logger.info("Loading CosyVoice model from %s", COSYVOICE_MODEL_DIR)
        cosyvoice_client = AutoModel(model_dir=str(COSYVOICE_MODEL_DIR), fp16=use_fp16)
        llm_path = COSYVOICE_MODEL_DIR / COSYVOICE_LLM_FILE
        if COSYVOICE_LLM_FILE != "llm.pt":
            if not llm_path.exists():
                raise HTTPException(status_code=500, detail=f"CosyVoice LLM checkpoint not found: {llm_path}")
            logger.info("Reloading CosyVoice LLM checkpoint from %s", llm_path)
            cosyvoice_client.model.load(
                str(llm_path),
                str(COSYVOICE_MODEL_DIR / "flow.pt"),
                str(COSYVOICE_MODEL_DIR / "hift.pt"),
            )
        if not use_fp16:
            for module_name in ("llm", "flow", "hift"):
                module = getattr(cosyvoice_client.model, module_name, None)
                if hasattr(module, "float"):
                    module.float()
        logger.info("CosyVoice model loaded with llm=%s", COSYVOICE_LLM_FILE)
        return cosyvoice_client


def _cosyvoice_speaker(req: TTSRequest) -> str:
    key = (req.speaker or req.voice or "gm").strip().lower()
    return COSYVOICE_SPEAKERS.get(key, key if key.startswith("char_") else "char_gm")


def _edge_speaker(req: TTSRequest) -> str:
    return (req.speaker or req.voice or "gm").strip().lower()


def _cosyvoice3_text(text: str, instruction: str) -> str:
    if "<|endofprompt|>" in text:
        return text
    return f"{instruction}{text}"


def _tensor_debug(value: Any) -> Any:
    if hasattr(value, "detach"):
        value = value.detach().cpu()
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


async def _synthesize_edge_tts_async(text: str, voice: str, out_path: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
    )
    await communicate.save(str(out_path))


def synthesize_edge_tts(req: TTSRequest, out_path: Path) -> str:
    key = _edge_speaker(req)
    voice = EDGE_TTS_VOICES.get(key, EDGE_TTS_VOICES["gm"])
    text = req.text.strip()

    try:
        asyncio.run(_synthesize_edge_tts_async(text, voice, out_path))
    except Exception as exc:
        logger.exception("Edge TTS generation failed")
        raise HTTPException(status_code=500, detail=f"Edge TTS 생성 실패({voice}): {exc}")

    return voice


def synthesize_cosyvoice(req: TTSRequest, out_path: Path) -> str:
    try:
        import torch
        import numpy as np
        import soundfile as sf
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"torch/numpy/soundfile is required for CosyVoice saving. Import error: {exc}")

    model = get_cosyvoice_client()
    speaker = _cosyvoice_speaker(req)
    text = req.text.strip()
    instruction = (req.instructions or COSYVOICE_DEFAULT_INSTRUCTION).strip()
    if "<|endofprompt|>" not in instruction:
        instruction = f"{instruction}<|endofprompt|>"

    try:
        with cosyvoice_lock:
            random.seed(COSYVOICE_SEED)
            np.random.seed(COSYVOICE_SEED)
            torch.manual_seed(COSYVOICE_SEED)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(COSYVOICE_SEED)
            speeches = []
            logger.info(
                "CosyVoice synth mode=%s llm=%s seed=%s text_frontend=%s speaker=%s text=%r",
                COSYVOICE_MODE,
                COSYVOICE_LLM_FILE,
                COSYVOICE_SEED,
                COSYVOICE_TEXT_FRONTEND,
                speaker,
                text,
            )

            if COSYVOICE_MODE == "instruct":
                normalized_instruction = model.frontend.text_normalize(
                    instruction,
                    split=False,
                    text_frontend=COSYVOICE_TEXT_FRONTEND,
                )
                segments = model.frontend.text_normalize(
                    text,
                    split=True,
                    text_frontend=COSYVOICE_TEXT_FRONTEND,
                )
                logger.info("CosyVoice normalized segments=%r", segments)
                for segment in segments:
                    model_input = model.frontend.frontend_instruct(segment, speaker, normalized_instruction)
                    chunks = model.model.tts(**model_input, stream=False, speed=1.0)
                    for chunk in chunks:
                        speech = chunk["tts_speech"].detach().cpu()
                        if speech.dim() == 1:
                            speech = speech.unsqueeze(0)
                        speeches.append(speech)
            else:
                prompt_text = COSYVOICE_SFT_INSTRUCTION
                if "<|endofprompt|>" not in prompt_text:
                    prompt_text = f"{prompt_text}<|endofprompt|>"
                segments = model.frontend.text_normalize(
                    text,
                    split=True,
                    text_frontend=COSYVOICE_TEXT_FRONTEND,
                )
                prompt_text_token, prompt_text_token_len = model.frontend._extract_text_token(prompt_text)
                debug_segments = []
                logger.info("CosyVoice sft prompt=%r segments=%r", prompt_text, segments)
                for segment in segments:
                    model_input = model.frontend.frontend_sft(segment, speaker)
                    model_input["prompt_text"] = prompt_text_token
                    model_input["prompt_text_len"] = prompt_text_token_len
                    debug_segments.append({
                        "text": segment,
                        "text_token_len": int(model_input["text_len"].detach().cpu().item()),
                        "text_tokens": _tensor_debug(model_input["text"]),
                    })
                    chunks = model.model.tts(**model_input, stream=False, speed=1.0)
                    for chunk in chunks:
                        speech = chunk["tts_speech"].detach().cpu()
                        if speech.dim() == 1:
                            speech = speech.unsqueeze(0)
                        speeches.append(speech)
            if not speeches:
                raise RuntimeError("CosyVoice generated no audio.")
            audio = torch.cat(speeches, dim=-1).clamp(-1.0, 1.0)
            audio_np = audio.detach().cpu().float().numpy()
            if audio_np.ndim == 2:
                audio_np = audio_np.T
            sf.write(str(out_path), audio_np, getattr(model, "sample_rate", 24000), subtype="PCM_16")
            if TTS_PROVIDER == "cosyvoice":
                debug_stem = out_path.stem
                np.save(AUDIO_DEBUG_DIR / f"{debug_stem}.float32.npy", audio_np.astype(np.float32, copy=False))
                debug_info = {
                    "audio_file": out_path.name,
                    "audio_float32_npy": f"{debug_stem}.float32.npy",
                    "sample_rate": getattr(model, "sample_rate", 24000),
                    "speaker": speaker,
                    "mode": COSYVOICE_MODE,
                    "llm_file": COSYVOICE_LLM_FILE,
                    "seed": COSYVOICE_SEED,
                    "text_frontend": COSYVOICE_TEXT_FRONTEND,
                    "request_text": text,
                    "request_text_repr": repr(text),
                    "prompt_text": prompt_text if COSYVOICE_MODE != "instruct" else instruction,
                    "prompt_token_len": int(prompt_text_token_len.detach().cpu().item()) if COSYVOICE_MODE != "instruct" else None,
                    "prompt_tokens": _tensor_debug(prompt_text_token) if COSYVOICE_MODE != "instruct" else None,
                    "segments": debug_segments if COSYVOICE_MODE != "instruct" else None,
                    "audio_shape": list(audio_np.shape),
                    "audio_min": float(audio_np.min()) if audio_np.size else None,
                    "audio_max": float(audio_np.max()) if audio_np.size else None,
                    "audio_mean": float(audio_np.mean()) if audio_np.size else None,
                }
                (AUDIO_DEBUG_DIR / f"{debug_stem}.json").write_text(
                    json.dumps(debug_info, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
    except Exception as exc:
        logger.exception("CosyVoice generation failed")
        raise HTTPException(status_code=500, detail=f"CosyVoice 생성 실패({speaker}): {exc}")

    return speaker


def _json_safe(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def public_session(session_id: str) -> dict[str, Any]:
    session = load_session(session_id)
    return {
        "id": str(session["id"]),
        "player_name": session["player_name"],
        "hp": session["hp"],
        "mp": session["mp"],
        "stamina": session["stamina"],
        "stats": {
            "힘": session["str"],
            "민첩": session["dex"],
            "지능": session["int_stat"],
            "매력": session["cha"],
        },
        "talent_grade": session["talent_grade"],
        "job": session["job"],
        "location": session["location"],
        "inventory": _json_safe(session["inventory"]),
        "flags": _json_safe(session["flags"]),
        "relations": _json_safe(session["relations"]),
        "stage": progression.current_stage(progression.as_dict(session.get("flags") or {})),
        "progress": progression.progress_pct(progression.as_dict(session.get("flags") or {})),
    }
def assert_session_owner(session_id: str, user_id: str) -> None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT id
            FROM game_sessions
            WHERE id = %s AND user_id = %s
            """,
            (session_id, user_id),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="session not found")

@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-store"})
@app.get("/login")
def login_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "login.html", headers={"Cache-Control": "no-store"})


@app.get("/signup")
def signup_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "signup.html", headers={"Cache-Control": "no-store"})

@app.post("/api/session")
def new_session(user_id: str = Depends(get_user_id_from_token)) -> dict[str, Any]:
    session_id = create_session()

    intro = (
        "GM: 낯선 진료실에서 당신은 천천히 눈을 뜹니다. 공기에는 약품 냄새와 금속성 증기의 냄새가 섞여 있습니다. "
        "흰 가운을 입은 의사가 당신을 조심스럽게 내려다봅니다.\n"
        "의사: \"깨어나셨군요. 제 말이 들리십니까? 기억나는 것이 있습니까?\""
    )

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE game_sessions
            SET user_id = %s
            WHERE id = %s
            """,
            (user_id, session_id),
        )

        conn.execute(
            """
            INSERT INTO game_events(session_id, user_id, role, content, metadata)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                session_id,
                user_id,
                "assistant",
                intro,
                json.dumps({"type": "intro"}, ensure_ascii=False),
            ),
        )

    return {
        "session": public_session(session_id),
        "intro": intro,
        "intro_segments": dialogue.split_segments(intro),
    }


@app.get("/api/session/{session_id}")
def get_session(
    session_id: str,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    try:
        assert_session_owner(session_id, user_id)

        return {
            "session": public_session(session_id),
            "history": recent_history(session_id, limit=20),
            "story": story.current_scene(session_id),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))


def _public_character_preview(answers: dict[str, str]) -> dict[str, Any]:
    character = character_creation.build_character(answers)
    return {
        "player_name": character["player_name"],
        "stats": {
            "힘": character["str"],
            "민첩": character["dex"],
            "지능": character["int_stat"],
            "매력": character["cha"],
        },
        "primary_stat": character["primary_stat"],
        "talent_grade": character["talent_grade"],
        "job": character["job"],
        "location": character["location"],
        "inventory": character["inventory"],
    }


@app.get("/api/character/questions")
def character_questions(user_id: str = Depends(get_user_id_from_token)) -> dict[str, Any]:
    return {"questions": character_creation.QUESTIONS}


@app.post("/api/character/preview")
def character_preview(
    req: CharacterAnswersRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    assert_session_owner(req.session_id, user_id)
    try:
        return {"character": _public_character_preview(req.answers)}
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"missing answer: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/character/confirm")
def character_confirm(
    req: CharacterAnswersRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    assert_session_owner(req.session_id, user_id)
    try:
        character = character_creation.create_character(req.session_id, req.answers)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"missing answer: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stats = f"힘 {character['str']}, 민첩 {character['dex']}, 지능 {character['int_stat']}, 매력 {character['cha']}"
    summary = (
        "의사: \"질문이 끝났군요. 회복하신 듯합니다. "
        f"{character['player_name']} 님, 당신의 반응은 {character['talent_grade']}에 가깝고, "
        f"몸은 {character['job']}의 손놀림을 기억하고 있습니다. 능력치는 {stats}입니다. "
        "변경 광산마을 '재끝'으로 향하시면 됩니다.\""
    )
    next_scene = (
        "GM: 의사가 진료 기록을 덮자, 창밖의 증기관이 낮게 울립니다. "
        "낡은 진료소 문 너머로 재끝 마을의 축축한 안개와 광산 종소리가 밀려듭니다.\n"
        "의사: \"무리하지 마십시오. 기억이 돌아오지 않더라도, 마을 사람들과 이야기하다 보면 "
        "단서가 남아 있을 겁니다. 먼저 여관의 린을 찾아가 보시겠습니까, 아니면 광산 쪽 상황을 살펴보시겠습니까?\""
    )
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO game_events(session_id, user_id, role, content, metadata)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                req.session_id,
                user_id,
                "assistant",
                summary,
                json.dumps({"type": "character_creation", "character": character}, ensure_ascii=False),
            ),
        )
        conn.execute(
            """
            INSERT INTO game_events(session_id, user_id, role, content, metadata)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                req.session_id,
                user_id,
                "assistant",
                next_scene,
                json.dumps({"type": "intro_end"}, ensure_ascii=False),
            ),
        )

    story_scene = story.ensure_story_started(req.session_id)
    history = recent_history(req.session_id, limit=20)
    if history and history[-1].get("role") == "assistant":
        history[-1]["speak"] = True
        history[-1]["choicesToReveal"] = story_scene.get("choices", [])

    return {
        "character": _public_character_preview(req.answers),
        "session": public_session(req.session_id),
        "history": history,
        "story": story_scene,
    }


@app.get("/api/codex/clues/{session_id}")
def codex_clues(
    session_id: str,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """플래그에서 확인되는 해금 단서만 반환합니다."""
    assert_session_owner(session_id, user_id)
    return {"clues": progression.unlocked_clues(session_id)}


@app.post("/api/chat")
def chat(
    req: ChatRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    message = req.message.strip()

    if not message:
        raise HTTPException(status_code=400, detail="message is empty")

    assert_session_owner(req.session_id, user_id)

    result = gm_reply(req.session_id, message)
    answer = result["answer"]
    choices = result.get("choices", [])

    return {
        "answer": answer,
        "choices": choices,
        "segments": dialogue.split_segments(answer),
        "session": public_session(req.session_id),
        "story": story.current_scene(req.session_id),
    }


@app.post("/api/move")
def move(
    req: MoveRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    location = req.location.strip()

    if not location:
        raise HTTPException(status_code=400, detail="location is empty")

    assert_session_owner(req.session_id, user_id)

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE game_sessions
            SET location = %s, updated_at = now()
            WHERE id = %s AND user_id = %s
            """,
            (location, req.session_id, user_id),
        )

    result = gm_reply(
        req.session_id,
        f"나는 {location}으로 이동한다. 그곳의 상황을 묘사해줘.",
    )
    answer = result["answer"]
    choices = result.get("choices", [])

    return {
        "answer": answer,
        "choices": choices,
        "segments": dialogue.split_segments(answer),
        "session": public_session(req.session_id),
        "story": story.current_scene(req.session_id),
    }


@app.get("/api/story/{session_id}")
def get_story_scene(
    session_id: str,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    assert_session_owner(session_id, user_id)
    return {"story": story.current_scene(session_id)}


@app.post("/api/story/choice")
def story_choice(
    req: StoryChoiceRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    assert_session_owner(req.session_id, user_id)
    try:
        result = story.choose(req.session_id, req.choice_id, req.roll)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    ending = endings.check_session_ending(req.session_id)
    return {
        **result,
        "session": public_session(req.session_id),
        "ending_reached": ending,
    }




@app.post("/api/ending/lock")
def lock_ending(
    req: EndingLockRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """정산 시점: 엔딩을 확정하고 DB에 저장한다."""
    assert_session_owner(req.session_id, user_id)
    try:
        result = generate_ending(req.session_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # DB에 저장 (ending 컬럼)
    with get_conn() as conn:
        conn.execute(
            "UPDATE game_sessions SET ending = %s WHERE id = %s",
            (json.dumps(result, ensure_ascii=False), req.session_id),
        )

    # 도감에 엔딩 기록
    try:
        codex.record_ending_for_session(req.session_id, result)
    except Exception:
        pass

    return result


@app.get("/api/ending/{session_id}")
def get_ending(
    session_id: str,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """저장된 엔딩을 읽는다. 아직 정산 전이면 404."""
    assert_session_owner(session_id, user_id)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT ending FROM game_sessions WHERE id = %s",
            (session_id,),
        ).fetchone()
    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="ending not found")
    data = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    return data


@app.get("/api/codex")
def get_codex(
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """계정 단위로 누적된 도감(단서·엔딩)."""
    return codex.get_codex(user_id)


@app.post("/api/debug/ending")
def debug_ending(
    req: DebugEndingRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """[테스트 전용] 원하는 엔딩으로 즉시 점프."""
    assert_session_owner(req.session_id, user_id)
    NAME_MAP = {"노멀": "END_NORMAL", "트루": "END_TRUE", "히든": "END_HIDDEN", "베드": "END_BAD"}
    from endings import ENDINGS
    target_id = NAME_MAP.get(req.ending, req.ending)
    ending_data = None
    for e in ENDINGS:
        if e["id"] == target_id:
            ending_data = {
                "kind": "good", "id": e["id"], "name": e["name"],
                "summary": e.get("summary", ""), "text": e.get("text", ""),
                "progress": 100,
            }
            break
    if ending_data is None:
        try:
            ending_data = generate_ending(req.session_id)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))
    try:
        codex.record_ending_for_session(req.session_id, ending_data)
    except Exception:
        pass
    return {"session": public_session(req.session_id), "ending": ending_data}


@app.post("/api/tts")
def tts(req: TTSRequest, user_id: str = Depends(get_user_id_from_token)) -> dict[str, str]:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")

    use_cosyvoice = TTS_PROVIDER == "cosyvoice"
    logger.info("TTS request provider=%s speaker=%s text=%s repr=%r", TTS_PROVIDER, req.speaker or req.voice or "gm", text, text)
    filename = f"{uuid.uuid4()}.{'wav' if use_cosyvoice else 'mp3'}"
    out_path = AUDIO_DIR / filename
    fallback_provider = None
    if use_cosyvoice:
        try:
            speaker = synthesize_cosyvoice(req, out_path)
        except HTTPException:
            logger.exception("CosyVoice TTS failed; falling back to Edge TTS")
            fallback_provider = "edge"
            filename = f"{uuid.uuid4()}.mp3"
            out_path = AUDIO_DIR / filename
            speaker = synthesize_edge_tts(req, out_path)
    else:
        speaker = synthesize_edge_tts(req, out_path)
    response = {"audio_url": f"/static/audio/{filename}", "voice": speaker}
    if fallback_provider:
        response["provider"] = fallback_provider
    if use_cosyvoice and not fallback_provider:
        response["debug_url"] = f"/static/audio_debug/{out_path.stem}.json"
        response["debug_float32_url"] = f"/static/audio_debug/{out_path.stem}.float32.npy"
    return response




# 회원가입


class SignupRequest(BaseModel):
    username: str
    password: str
    name: str
    email: str


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/signup")
def signup(req: SignupRequest):
    username = req.username.strip()
    password = req.password.strip()
    name = req.name.strip()
    email = req.email.strip()

    validate_signup(username, password, name, email)

    with get_conn() as conn:
        try:
            row = conn.execute(
                """
                INSERT INTO users (username, password_hash, name, email)
                VALUES (%s, %s, %s, %s)
                RETURNING id, username, name, email
                """,
                (username, hash_password(password), name, email),
            ).fetchone()
        except Exception as _signup_exc:
            logger.error("signup INSERT failed: %s", _signup_exc)
            raise HTTPException(400, "이미 사용 중인 아이디 또는 이메일입니다.")

    return {
        "id": str(row[0]),
        "username": row[1],
        "name": row[2],
        "email": row[3],
    }


@app.post("/api/auth/login")
def login(req: LoginRequest):
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, username, password_hash, name, email
            FROM users
            WHERE username = %s
            """,
            (req.username,),
        ).fetchone()

    if not row or not verify_password(req.password, row[2]):
        raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다.")

    token = create_access_token(str(row[0]), row[1])

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(row[0]),
            "username": row[1],
            "name": row[3],
            "email": row[4],
        },
    }


@app.get("/api/auth/me")
def me(user_id: str = Depends(get_user_id_from_token)):
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, username, name, email
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        ).fetchone()

    if not row:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")

    return {
        "id": str(row[0]),
        "username": row[1],
        "name": row[2],
        "email": row[3],
    }
