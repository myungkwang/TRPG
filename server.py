from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import asyncio
import sys
import uuid
import threading
import random
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=True)

from db import get_conn
from gm_cli import create_session, gm_reply, gm_reply_stream, load_session, recent_history, generate_ending
import llm
from llm import generate_image
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

logger = logging.getLogger("uvicorn.error")

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
ENDING_DIR = STATIC_DIR / "endings"
ENDING_DIR.mkdir(exist_ok=True)
GEN_BG_DIR = STATIC_DIR / "backgrounds" / "gen"   # AI가 즉석 생성한 배경 캐시
GEN_BG_DIR.mkdir(parents=True, exist_ok=True)
GEN_DEPTH_DIR = GEN_BG_DIR / "depth"              # 그 배경들의 깊이맵(2.5D 패럴랙스용)
GEN_DEPTH_DIR.mkdir(parents=True, exist_ok=True)
DEPTH_URL = os.getenv("DEPTH_URL", "http://127.0.0.1:8189").rstrip("/")


def _save_depth(img_bytes: bytes, key: str) -> None:
    """깊이 서비스로 깊이맵을 받아 gen/depth/{key}.png 에 저장. 실패해도 무시(평면 폴백)."""
    try:
        import urllib.request
        rq = urllib.request.Request(DEPTH_URL + "/depth", data=img_bytes,
                                    headers={"Content-Type": "image/png"})
        with urllib.request.urlopen(rq, timeout=30) as r:
            (GEN_DEPTH_DIR / f"{key}.png").write_bytes(r.read())
    except Exception:
        pass
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
COSYVOICE_PRELOAD = os.getenv("COSYVOICE_PRELOAD", "true").strip().lower() in {"1", "true", "yes", "on"}
COSYVOICE_DEBUG = os.getenv("COSYVOICE_DEBUG", "false").strip().lower() in {"1", "true", "yes", "on"}
COSYVOICE_GM_SPEAKER = os.getenv("COSYVOICE_GM_SPEAKER", "aux_skt_voice_skt_m0001_serious").strip() or "aux_skt_voice_skt_m0001_serious"
COSYVOICE_WARMUP = os.getenv("COSYVOICE_WARMUP", "true").strip().lower() in {"1", "true", "yes", "on"}
COSYVOICE_WARMUP_TEXT = os.getenv("COSYVOICE_WARMUP_TEXT", "네, 준비되었습니다.").strip() or "네, 준비되었습니다."
COSYVOICE_WARMUP_SPEAKERS = [
    item.strip()
    for item in os.getenv("COSYVOICE_WARMUP_SPEAKERS", "gm,doctor").split(",")
    if item.strip()
]
TTS_CACHE_NORMALIZE = os.getenv("TTS_CACHE_NORMALIZE", "true").strip().lower() in {"1", "true", "yes", "on"}
TTS_SYNTHESIS_VERSION = "cosyvoice3-inline-prompt-stable-v2"
try:
    COSYVOICE_SPEED = float(os.getenv("COSYVOICE_SPEED", "1.0"))
except ValueError:
    COSYVOICE_SPEED = 1.0
COSYVOICE_SPEED = max(0.75, min(1.35, COSYVOICE_SPEED))

COSYVOICE_SPEAKERS = {
    "doctor": "char_doctor",
    "gm": COSYVOICE_GM_SPEAKER,
    "gail": "char_gail",
    "kargas": "char_kargas",
    "marta": "char_marta",
    "lin": "char_lin",
    "rin": "char_lin",
    "tobi": "char_tobi",
    "toby": "char_tobi",
    "nurse": "char_nurse",
    "miner": "char_miner",
    "tavern": "char_tavern_clerk",
    "tavern_clerk": "char_tavern_clerk",
    "char_gm": "char_gm",
    "char_rin": "char_lin",
    "char_toby": "char_tobi",
    "char_lin": "char_lin",
    "char_tobi": "char_tobi",
}

TTS_PROVIDER = os.getenv("TTS_PROVIDER", "edge").strip().lower()
TTS_FALLBACK_PROVIDER = os.getenv("TTS_FALLBACK_PROVIDER", "none").strip().lower()

SUPERTONE_API_KEY = os.getenv("SUPERTONE_API_KEY", "").strip()
SUPERTONE_BASE_URL = os.getenv("SUPERTONE_BASE_URL", "https://supertoneapi.com/v1").rstrip("/")
SUPERTONE_MODEL = os.getenv("SUPERTONE_MODEL", "sona_speech_2").strip() or "sona_speech_2"
SUPERTONE_LANGUAGE = os.getenv("SUPERTONE_LANGUAGE", "ko").strip() or "ko"
SUPERTONE_STYLE = os.getenv("SUPERTONE_STYLE", "neutral").strip() or "neutral"
SUPERTONE_OUTPUT_FORMAT = os.getenv("SUPERTONE_OUTPUT_FORMAT", "wav").strip().lower()
if SUPERTONE_OUTPUT_FORMAT not in {"wav", "mp3"}:
    SUPERTONE_OUTPUT_FORMAT = "wav"
SUPERTONE_DEFAULT_VOICE_ID = os.getenv("SUPERTONE_VOICE_ID", "91992bbd4758bdcf9c9b01").strip()


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


SUPERTONE_DEFAULT_VOICE_SETTINGS = {
    "pitch_shift": _env_float("SUPERTONE_PITCH_SHIFT", 0.0),
    "pitch_variance": _env_float("SUPERTONE_PITCH_VARIANCE", 1.0),
    "speed": _env_float("SUPERTONE_SPEED", 1.0),
    "text_guidance": _env_float("SUPERTONE_TEXT_GUIDANCE", 2.0),
}

SUPERTONE_VOICE_IDS = {
    "gm": os.getenv("SUPERTONE_GM_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
    "doctor": os.getenv("SUPERTONE_DOCTOR_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
    "gail": os.getenv("SUPERTONE_GAIL_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
    "kargas": os.getenv("SUPERTONE_KARGAS_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
    "marta": os.getenv("SUPERTONE_MARTA_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
    "lin": os.getenv("SUPERTONE_LIN_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
    "tobi": os.getenv("SUPERTONE_TOBI_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
    "miner": os.getenv("SUPERTONE_MINER_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
    "nurse": os.getenv("SUPERTONE_NURSE_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
    "tavern_clerk": os.getenv("SUPERTONE_TAVERN_CLERK_VOICE_ID", SUPERTONE_DEFAULT_VOICE_ID).strip() or SUPERTONE_DEFAULT_VOICE_ID,
}

SUPERTONE_SPEAKER_ALIASES = {
    "rin": "lin",
    "toby": "tobi",
    "tavern": "tavern_clerk",
    "char_gm": "gm",
    "char_lin": "lin",
    "char_rin": "lin",
    "char_tobi": "tobi",
    "char_toby": "tobi",
}

OPENAI_TTS_VOICE_NAMES = {"alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"}

def _env_text(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


EDGE_TTS_PROFILES = {
    "gm": {
        "voice": _env_text("EDGE_TTS_GM_VOICE", "ko-KR-HyunsuMultilingualNeural"),
        "rate": _env_text("EDGE_TTS_GM_RATE", "-3%"),
        "pitch": _env_text("EDGE_TTS_GM_PITCH", "-2Hz"),
    },
    "doctor": {
        "voice": _env_text("EDGE_TTS_DOCTOR_VOICE", "ko-KR-InJoonNeural"),
        "rate": _env_text("EDGE_TTS_DOCTOR_RATE", "-8%"),
        "pitch": _env_text("EDGE_TTS_DOCTOR_PITCH", "-4Hz"),
    },
    "gail": {
        "voice": _env_text("EDGE_TTS_GAIL_VOICE", "ko-KR-InJoonNeural"),
        "rate": _env_text("EDGE_TTS_GAIL_RATE", "-2%"),
        "pitch": _env_text("EDGE_TTS_GAIL_PITCH", "-7Hz"),
    },
    "kargas": {
        "voice": _env_text("EDGE_TTS_KARGAS_VOICE", "ko-KR-HyunsuMultilingualNeural"),
        "rate": _env_text("EDGE_TTS_KARGAS_RATE", "-16%"),
        "pitch": _env_text("EDGE_TTS_KARGAS_PITCH", "-18Hz"),
    },
    "marta": {
        "voice": _env_text("EDGE_TTS_MARTA_VOICE", "ko-KR-SunHiNeural"),
        "rate": _env_text("EDGE_TTS_MARTA_RATE", "-14%"),
        "pitch": _env_text("EDGE_TTS_MARTA_PITCH", "-7Hz"),
    },
    "lin": {
        "voice": _env_text("EDGE_TTS_LIN_VOICE", "ko-KR-SunHiNeural"),
        "rate": _env_text("EDGE_TTS_LIN_RATE", "-6%"),
        "pitch": _env_text("EDGE_TTS_LIN_PITCH", "-3Hz"),
    },
    "tobi": {
        "voice": _env_text("EDGE_TTS_TOBI_VOICE", "ko-KR-SunHiNeural"),
        "rate": _env_text("EDGE_TTS_TOBI_RATE", "+8%"),
        "pitch": _env_text("EDGE_TTS_TOBI_PITCH", "+9Hz"),
    },
    "miner": {
        "voice": _env_text("EDGE_TTS_MINER_VOICE", "ko-KR-InJoonNeural"),
        "rate": _env_text("EDGE_TTS_MINER_RATE", "-5%"),
        "pitch": _env_text("EDGE_TTS_MINER_PITCH", "-8Hz"),
    },
    "nurse": {
        "voice": _env_text("EDGE_TTS_NURSE_VOICE", "ko-KR-SunHiNeural"),
        "rate": _env_text("EDGE_TTS_NURSE_RATE", "-4%"),
        "pitch": _env_text("EDGE_TTS_NURSE_PITCH", "-1Hz"),
    },
    "tavern_clerk": {
        "voice": _env_text("EDGE_TTS_TAVERN_CLERK_VOICE", "ko-KR-SunHiNeural"),
        "rate": _env_text("EDGE_TTS_TAVERN_CLERK_RATE", "-2%"),
        "pitch": _env_text("EDGE_TTS_TAVERN_CLERK_PITCH", "+1Hz"),
    },
}

EDGE_TTS_ALIASES = {
    "rin": "lin",
    "toby": "tobi",
    "tavern": "tavern_clerk",
    "char_gm": "gm",
    "char_lin": "lin",
    "char_rin": "lin",
    "char_tobi": "tobi",
    "char_toby": "tobi",
    "char_tavern": "tavern_clerk",
    "char_tavern_clerk": "tavern_clerk",
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


def _preload_cosyvoice_client() -> None:
    if TTS_PROVIDER != "cosyvoice" or not COSYVOICE_PRELOAD:
        return
    try:
        get_cosyvoice_client()
    except Exception:
        logger.exception("CosyVoice preload failed")


app.on_event("startup")(_preload_cosyvoice_client)


def _cosyvoice_speaker(req: TTSRequest) -> str:
    key = (req.speaker or req.voice or "gm").strip().lower()
    if key in COSYVOICE_SPEAKERS:
        return COSYVOICE_SPEAKERS[key]
    if key.startswith(("char_", "aux_")):
        return key
    return COSYVOICE_GM_SPEAKER


def _edge_speaker(req: TTSRequest) -> str:
    key = (req.speaker or req.voice or "gm").strip().lower()
    key = EDGE_TTS_ALIASES.get(key, key)
    return key if key in EDGE_TTS_PROFILES else "gm"


def _edge_tts_profile(speaker: str) -> dict[str, str]:
    key = EDGE_TTS_ALIASES.get((speaker or "gm").strip().lower(), speaker or "gm")
    return EDGE_TTS_PROFILES.get(key, EDGE_TTS_PROFILES["gm"])


def _tts_model_stamp() -> dict[str, int | None]:
    flow_path = COSYVOICE_MODEL_DIR / "flow.pt"
    try:
        stat = flow_path.stat()
    except OSError:
        return {"flow_size": None, "flow_mtime_ns": None}
    return {"flow_size": stat.st_size, "flow_mtime_ns": stat.st_mtime_ns}


def _normalize_tts_cache_text(text: str) -> str:
    normalized = str(text or "")
    normalized = (
        normalized
        .replace("\u200b", "")
        .replace("\ufeff", "")
        .replace("“", '"')
        .replace("”", '"')
        .replace("‘", "'")
        .replace("’", "'")
    )
    normalized = re.sub(r"\s+", " ", normalized).strip()
    normalized = re.sub(r"\s+([,.!?;:，。！？；：])", r"\1", normalized)
    normalized = re.sub(r"([\"'])\s+(.+?)\s+\1", r"\1\2\1", normalized)
    return normalized


def _cache_text(text: str) -> str:
    return _normalize_tts_cache_text(text) if TTS_CACHE_NORMALIZE else str(text or "").strip()


def _tts_cache_key(req: TTSRequest, speaker: str, provider: str | bool) -> str:
    provider_name = "cosyvoice" if provider is True else "edge" if provider is False else str(provider)
    payload = {
        "provider": provider_name,
        "synthesis_version": TTS_SYNTHESIS_VERSION,
        "speaker": speaker,
        "voice": req.voice or "",
        "instructions": _cache_text(req.instructions or ""),
        "text": _cache_text(req.text),
    }
    if provider_name == "cosyvoice":
        payload.update({
            "model_dir": str(COSYVOICE_MODEL_DIR.resolve()),
            "mode": COSYVOICE_MODE,
            "llm_file": COSYVOICE_LLM_FILE,
            "seed": COSYVOICE_SEED,
            "text_frontend": COSYVOICE_TEXT_FRONTEND,
            "speed": COSYVOICE_SPEED,
            **_tts_model_stamp(),
        })
    elif provider_name == "edge":
        payload.update({
            "edge_profile": _edge_tts_profile(speaker),
        })
    elif provider_name == "supertone":
        voice_id = _supertone_direct_voice_id(req) or SUPERTONE_VOICE_IDS.get(speaker, SUPERTONE_DEFAULT_VOICE_ID)
        payload.update({
            "model": SUPERTONE_MODEL,
            "language": SUPERTONE_LANGUAGE,
            "style": SUPERTONE_STYLE,
            "voice_id": voice_id,
            "output_format": SUPERTONE_OUTPUT_FORMAT,
            "settings": _supertone_voice_settings(req),
        })
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def _warmup_cosyvoice_cache() -> None:
    if TTS_PROVIDER != "cosyvoice" or not COSYVOICE_WARMUP:
        return

    def worker() -> None:
        for speaker_key in COSYVOICE_WARMUP_SPEAKERS:
            try:
                req = TTSRequest(text=COSYVOICE_WARMUP_TEXT, speaker=speaker_key)
                speaker = _cosyvoice_speaker(req)
                filename = f"tts-{_tts_cache_key(req, speaker, True)}.wav"
                out_path = AUDIO_DIR / filename
                if out_path.exists():
                    logger.info("CosyVoice warmup cache hit speaker=%s file=%s", speaker, filename)
                    continue
                logger.info("CosyVoice warmup start speaker=%s", speaker)
                synthesize_cosyvoice(req, out_path)
                logger.info("CosyVoice warmup done speaker=%s file=%s", speaker, filename)
            except Exception:
                logger.exception("CosyVoice warmup failed for speaker=%s", speaker_key)

    threading.Thread(target=worker, name="cosyvoice-warmup", daemon=True).start()


app.on_event("startup")(_warmup_cosyvoice_cache)


def _cosyvoice3_text(text: str, instruction: str) -> str:
    if "<|endofprompt|>" in text:
        return text
    return f"{instruction}{text}"


def _is_cosyvoice3_model() -> bool:
    return (COSYVOICE_MODEL_DIR / "cosyvoice3.yaml").exists()


def _spoken_unit_count(text: str) -> int:
    return len(re.findall(r"[0-9A-Za-z가-힣]", str(text or "")))


def _minimum_reasonable_tts_duration(text: str) -> float:
    units = _spoken_unit_count(text)
    return max(0.45, min(6.0, units * 0.028))


def _cosyvoice_tts_text_variants(text: str) -> list[str]:
    source = str(text or "").strip()
    variants = [source]

    # CosyVoice3 can occasionally terminate immediately on some Korean particle patterns.
    # These variants are only for speech synthesis; the visible dialogue text stays unchanged.
    normalized = re.sub(r"([가-힣]+)에서는", r"\1에서", source)
    normalized = re.sub(r"([가-힣]+)에게서는", r"\1에게서", normalized)
    normalized = re.sub(r"([가-힣]+)로서는", r"\1로서", normalized)
    if normalized != source:
        variants.append(normalized)

    softer = normalized.replace(" 들립니다.", " 들려옵니다.")
    softer = softer.replace(" 들립니다!", " 들려옵니다!")
    softer = softer.replace(" 들립니다?", " 들려옵니까?")
    if softer not in variants:
        variants.append(softer)

    return [item for index, item in enumerate(variants) if item and item not in variants[:index]]


def _tensor_debug(value: Any) -> Any:
    if hasattr(value, "detach"):
        value = value.detach().cpu()
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


async def _synthesize_edge_tts_async(text: str, profile: dict[str, str], out_path: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(
        text=text,
        voice=profile["voice"],
        rate=profile["rate"],
        pitch=profile["pitch"],
    )
    await communicate.save(str(out_path))


def synthesize_edge_tts(req: TTSRequest, out_path: Path) -> str:
    key = _edge_speaker(req)
    profile = _edge_tts_profile(key)
    text = req.text.strip()

    try:
        asyncio.run(_synthesize_edge_tts_async(text, profile, out_path))
    except Exception as exc:
        logger.exception("Edge TTS generation failed")
        raise HTTPException(status_code=500, detail=f"Edge TTS 생성 실패({profile['voice']}): {exc}")

    return key


def _supertone_speaker_key(req: TTSRequest) -> str:
    key = (req.speaker or "").strip().lower()
    if not key:
        voice_key = (req.voice or "").strip().lower()
        if voice_key in SUPERTONE_VOICE_IDS or voice_key in SUPERTONE_SPEAKER_ALIASES:
            key = voice_key
    key = SUPERTONE_SPEAKER_ALIASES.get(key, key)
    return key if key in SUPERTONE_VOICE_IDS else "gm"


def _supertone_direct_voice_id(req: TTSRequest) -> str | None:
    value = (req.voice or "").strip()
    if not value:
        return None

    lowered = value.lower()
    if lowered in OPENAI_TTS_VOICE_NAMES:
        return None
    if lowered in SUPERTONE_VOICE_IDS or lowered in SUPERTONE_SPEAKER_ALIASES:
        return None
    if re.fullmatch(r"[A-Za-z0-9_-]{10,}", value):
        return value
    return None


def _supertone_voice_id(req: TTSRequest) -> str:
    direct_voice_id = _supertone_direct_voice_id(req)
    if direct_voice_id:
        return direct_voice_id
    speaker = _supertone_speaker_key(req)
    voice_id = SUPERTONE_VOICE_IDS.get(speaker) or SUPERTONE_DEFAULT_VOICE_ID
    if not voice_id:
        raise HTTPException(status_code=500, detail="SUPERTONE_VOICE_ID is missing")
    return voice_id


def _supertone_voice_settings(req: TTSRequest) -> dict[str, float]:
    settings = dict(SUPERTONE_DEFAULT_VOICE_SETTINGS)
    hint = f"{req.instructions or ''} {req.text or ''}".lower()

    if any(word in hint for word in ("속삭", "whisper")):
        settings.update({"pitch_shift": -1, "pitch_variance": 0.75, "speed": 0.82, "text_guidance": 2.0})
    elif any(word in hint for word in ("슬프", "체념", "울먹", "sad", "sorrow")):
        settings.update({"pitch_variance": 0.9, "speed": 0.88, "text_guidance": 2.5})
    elif any(word in hint for word in ("분노", "화난", "단호", "angry", "anger")):
        settings.update({"pitch_shift": -1, "pitch_variance": 1.15, "speed": 0.98, "text_guidance": 2.4})
    elif any(word in hint for word in ("긴장", "불길", "공포", "tense", "suspense")):
        settings.update({"pitch_variance": 1.25, "speed": 0.92, "text_guidance": 2.0})
    elif any(word in hint for word in ("긴박", "다급", "흥분", "excited", "urgent")):
        settings.update({"pitch_shift": 1, "pitch_variance": 1.45, "speed": 1.12, "text_guidance": 2.2})

    return settings


def synthesize_supertone_tts(req: TTSRequest, out_path: Path) -> str:
    if not SUPERTONE_API_KEY:
        raise HTTPException(status_code=500, detail="SUPERTONE_API_KEY is missing in .env")

    text = req.text.strip()
    if len(text) > 300:
        raise HTTPException(status_code=400, detail="Supertone TTS text must be 300 characters or less")

    voice_id = _supertone_voice_id(req)
    body = {
        "text": text,
        "language": SUPERTONE_LANGUAGE,
        "model": SUPERTONE_MODEL,
        "style": SUPERTONE_STYLE,
        "output_format": SUPERTONE_OUTPUT_FORMAT,
        "voice_settings": _supertone_voice_settings(req),
    }
    request = Request(
        f"{SUPERTONE_BASE_URL}/text-to-speech/{voice_id}",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-sup-api-key": SUPERTONE_API_KEY,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=120) as response:
            out_path.write_bytes(response.read())
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        logger.exception("Supertone TTS HTTP error voice_id=%s detail=%s", voice_id, detail)
        raise HTTPException(status_code=500, detail=f"Supertone TTS failed({voice_id}): HTTP {exc.code} {detail}") from exc
    except URLError as exc:
        logger.exception("Supertone TTS network error voice_id=%s", voice_id)
        raise HTTPException(status_code=500, detail=f"Supertone TTS network failed({voice_id}): {exc}") from exc
    except Exception as exc:
        logger.exception("Supertone TTS generation failed voice_id=%s", voice_id)
        raise HTTPException(status_code=500, detail=f"Supertone TTS failed({voice_id}): {exc}") from exc

    return _supertone_speaker_key(req)


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
                "CosyVoice synth mode=%s llm=%s seed=%s text_frontend=%s speed=%s speaker=%s text=%r",
                COSYVOICE_MODE,
                COSYVOICE_LLM_FILE,
                COSYVOICE_SEED,
                COSYVOICE_TEXT_FRONTEND,
                COSYVOICE_SPEED,
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
                    chunks = model.model.tts(**model_input, stream=False, speed=COSYVOICE_SPEED)
                    for chunk in chunks:
                        speech = chunk["tts_speech"].detach().cpu()
                        if speech.dim() == 1:
                            speech = speech.unsqueeze(0)
                        speeches.append(speech)
            else:
                prompt_text = COSYVOICE_SFT_INSTRUCTION
                if "<|endofprompt|>" not in prompt_text:
                    prompt_text = f"{prompt_text}<|endofprompt|>"
                prompt_text_token, prompt_text_token_len = model.frontend._extract_text_token(prompt_text)
                debug_segments = []
                min_duration = _minimum_reasonable_tts_duration(text)
                best_speeches = []
                best_duration = 0.0
                best_debug_segments = []

                for attempt_index, attempt_text in enumerate(_cosyvoice_tts_text_variants(text)):
                    attempt_speeches = []
                    attempt_debug_segments = []
                    segments = model.frontend.text_normalize(
                        attempt_text,
                        split=True,
                        text_frontend=COSYVOICE_TEXT_FRONTEND,
                    )
                    logger.info(
                        "CosyVoice sft prompt=%r attempt=%s min_duration=%.2f text=%r segments=%r",
                        prompt_text,
                        attempt_index,
                        min_duration,
                        attempt_text,
                        segments,
                    )
                    for segment in segments:
                        synthesis_text = _cosyvoice3_text(segment, prompt_text) if _is_cosyvoice3_model() else segment
                        model_input = model.frontend.frontend_sft(synthesis_text, speaker)
                        if not _is_cosyvoice3_model():
                            model_input["prompt_text"] = prompt_text_token
                            model_input["prompt_text_len"] = prompt_text_token_len
                        attempt_debug_segments.append({
                            "text": segment,
                            "synthesis_text": synthesis_text,
                            "text_token_len": int(model_input["text_len"].detach().cpu().item()),
                            "text_tokens": _tensor_debug(model_input["text"]),
                        })
                        chunks = model.model.tts(**model_input, stream=False, speed=COSYVOICE_SPEED)
                        for chunk in chunks:
                            speech = chunk["tts_speech"].detach().cpu()
                            if speech.dim() == 1:
                                speech = speech.unsqueeze(0)
                            attempt_speeches.append(speech)

                    if not attempt_speeches:
                        continue

                    attempt_audio = torch.cat(attempt_speeches, dim=-1).clamp(-1.0, 1.0)
                    attempt_duration = float(attempt_audio.shape[-1]) / float(getattr(model, "sample_rate", 24000))
                    if attempt_duration > best_duration:
                        best_duration = attempt_duration
                        best_speeches = attempt_speeches
                        best_debug_segments = attempt_debug_segments
                    if attempt_duration >= min_duration:
                        speeches = attempt_speeches
                        debug_segments = attempt_debug_segments
                        break
                    logger.warning(
                        "CosyVoice generated too-short audio attempt=%s duration=%.2f min=%.2f speaker=%s text=%r",
                        attempt_index,
                        attempt_duration,
                        min_duration,
                        speaker,
                        attempt_text,
                    )
                else:
                    speeches = best_speeches
                    debug_segments = best_debug_segments
            if not speeches:
                raise RuntimeError("CosyVoice generated no audio.")
            audio = torch.cat(speeches, dim=-1).clamp(-1.0, 1.0)
            audio_np = audio.detach().cpu().float().numpy()
            if audio_np.ndim == 2:
                audio_np = audio_np.T
            sf.write(str(out_path), audio_np, getattr(model, "sample_rate", 24000), subtype="PCM_16")
            if TTS_PROVIDER == "cosyvoice" and COSYVOICE_DEBUG:
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
                    "speed": COSYVOICE_SPEED,
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


def _prepare_cosyvoice_inputs(model: Any, req: TTSRequest, speaker: str) -> list[dict[str, Any]]:
    text = req.text.strip()
    instruction = (req.instructions or COSYVOICE_DEFAULT_INSTRUCTION).strip()
    if "<|endofprompt|>" not in instruction:
        instruction = f"{instruction}<|endofprompt|>"

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
        return [
            {
                "text": segment,
                "input": model.frontend.frontend_instruct(segment, speaker, normalized_instruction),
            }
            for segment in segments
        ]

    prompt_text = COSYVOICE_SFT_INSTRUCTION
    if "<|endofprompt|>" not in prompt_text:
        prompt_text = f"{prompt_text}<|endofprompt|>"
    prompt_text_token, prompt_text_token_len = model.frontend._extract_text_token(prompt_text)
    segments = model.frontend.text_normalize(
        text,
        split=True,
        text_frontend=COSYVOICE_TEXT_FRONTEND,
    )
    prepared = []
    for segment in segments:
        synthesis_text = _cosyvoice3_text(segment, prompt_text) if _is_cosyvoice3_model() else segment
        model_input = model.frontend.frontend_sft(synthesis_text, speaker)
        if not _is_cosyvoice3_model():
            model_input["prompt_text"] = prompt_text_token
            model_input["prompt_text_len"] = prompt_text_token_len
        prepared.append({"text": segment, "input": model_input})
    return prepared


def _save_cosyvoice_speech_wav(speech: Any, out_path: Path, sample_rate: int) -> None:
    import soundfile as sf

    audio_np = speech.detach().cpu().float().clamp(-1.0, 1.0).numpy()
    if audio_np.ndim == 2:
        audio_np = audio_np.T
    sf.write(str(out_path), audio_np, sample_rate, subtype="PCM_16")


def _stream_tts_manifest_path(cache_key: str) -> Path:
    return AUDIO_DIR / f"tts-stream-{cache_key}.json"


def _load_stream_tts_manifest(cache_key: str) -> dict[str, Any] | None:
    manifest_path = _stream_tts_manifest_path(cache_key)
    if not manifest_path.exists():
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    chunks = manifest.get("chunks")
    if not isinstance(chunks, list) or not chunks:
        return None
    for chunk in chunks:
        filename = chunk.get("filename")
        if not filename or not (AUDIO_DIR / filename).exists():
            return None
    return manifest


def _iter_cosyvoice_stream_chunks(req: TTSRequest, speaker: str, cache_key: str):
    try:
        import torch
        import numpy as np
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"torch/numpy is required for CosyVoice streaming. Import error: {exc}")

    cached_manifest = _load_stream_tts_manifest(cache_key)
    if cached_manifest:
        for chunk in cached_manifest["chunks"]:
            yield {
                "type": "chunk",
                "audio_url": f"/static/audio/{chunk['filename']}",
                "voice": speaker,
                "chunk_index": chunk["chunk_index"],
                "cached": True,
                "audio_sec": chunk.get("audio_sec"),
            }
        yield {
            "type": "final",
            "voice": speaker,
            "chunk_count": len(cached_manifest["chunks"]),
            "cached": True,
        }
        return

    model = get_cosyvoice_client()
    sample_rate = int(getattr(model, "sample_rate", 24000))

    try:
        with cosyvoice_lock:
            random.seed(COSYVOICE_SEED)
            np.random.seed(COSYVOICE_SEED)
            torch.manual_seed(COSYVOICE_SEED)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(COSYVOICE_SEED)
            if hasattr(model.model, "token_hop_len"):
                model.model.token_hop_len = 25

            chunk_infos = []
            chunk_index = 0
            for prepared in _prepare_cosyvoice_inputs(model, req, speaker):
                chunks = model.model.tts(
                    **prepared["input"],
                    stream=True,
                    speed=COSYVOICE_SPEED,
                )
                for chunk in chunks:
                    speech = chunk["tts_speech"].detach().cpu()
                    if speech.dim() == 1:
                        speech = speech.unsqueeze(0)
                    filename = f"tts-stream-{cache_key}-{chunk_index:03d}.wav"
                    out_path = AUDIO_DIR / filename
                    _save_cosyvoice_speech_wav(speech, out_path, sample_rate)
                    audio_sec = float(speech.shape[-1]) / sample_rate
                    chunk_info = {
                        "chunk_index": chunk_index,
                        "filename": filename,
                        "audio_sec": audio_sec,
                        "segment_text": prepared["text"],
                    }
                    chunk_infos.append(chunk_info)
                    yield {
                        "type": "chunk",
                        "audio_url": f"/static/audio/{filename}",
                        "voice": speaker,
                        "chunk_index": chunk_index,
                        "cached": False,
                        "audio_sec": audio_sec,
                    }
                    chunk_index += 1

            if not chunk_infos:
                raise RuntimeError("CosyVoice generated no stream chunks.")

            _stream_tts_manifest_path(cache_key).write_text(
                json.dumps({
                    "voice": speaker,
                    "chunks": chunk_infos,
                    "model_dir": str(COSYVOICE_MODEL_DIR.resolve()),
                    "mode": COSYVOICE_MODE,
                    "llm_file": COSYVOICE_LLM_FILE,
                    "speed": COSYVOICE_SPEED,
                    **_tts_model_stamp(),
                }, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            yield {
                "type": "final",
                "voice": speaker,
                "chunk_count": len(chunk_infos),
                "cached": False,
            }
    except Exception as exc:
        logger.exception("CosyVoice stream generation failed")
        raise HTTPException(status_code=500, detail=f"CosyVoice stream 생성 실패({speaker}): {exc}")


def _json_safe(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def _tts_provider() -> str:
    if TTS_PROVIDER in {"cosyvoice", "edge", "supertone"}:
        return TTS_PROVIDER
    logger.warning("Unknown TTS_PROVIDER=%s; using edge", TTS_PROVIDER)
    return "edge"


def _tts_speaker(req: TTSRequest, provider: str) -> str:
    if provider == "cosyvoice":
        return _cosyvoice_speaker(req)
    if provider == "supertone":
        return _supertone_speaker_key(req)
    return _edge_speaker(req)


def _tts_extension(provider: str) -> str:
    if provider == "cosyvoice":
        return "wav"
    if provider == "supertone":
        return SUPERTONE_OUTPUT_FORMAT
    return "mp3"


def _synthesize_tts_provider(req: TTSRequest, provider: str, out_path: Path) -> str:
    if provider == "cosyvoice":
        return synthesize_cosyvoice(req, out_path)
    if provider == "supertone":
        return synthesize_supertone_tts(req, out_path)
    return synthesize_edge_tts(req, out_path)


def public_session(session_id: str) -> dict[str, Any]:
    session = load_session(session_id)
    existing_ending = _json_safe(session.get("ending"))
    current_ending = endings.resolve_ending(session)
    ending_priority = {"END_BAD": 0, "END_NORMAL": 1, "END_TRUE": 2, "END_HIDDEN": 3}
    ending_locked = False
    if isinstance(existing_ending, dict):
        ending_locked = (
            ending_priority.get(existing_ending.get("id"), -1)
            >= ending_priority.get(current_ending.get("id"), -1)
        )
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
        "settle_threshold": 100,
        "ending_locked": ending_locked,
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


class EndingRequest(BaseModel):
    session_id: str


def _ending_image_prompt(ending: dict) -> str:
    """확정된 엔딩으로 일러스트 프롬프트를 만든다(우리 세계관에 고정)."""
    snippet = (ending.get("text") or "").replace("GM:", " ").strip()[:280]
    return (
        "steampunk gaslit mining town 'Jaekkeut' in a gray foggy frontier valley, "
        "blue ether-crystal(영석) glow, misty peak with an ancient dragon's nest, "
        f"ending mood: {ending['name']}. scene: {snippet} "
        "19th-century steampunk, cinematic digital painting, atmospheric, no text, no letters."
    )


# 정규 엔딩(고정 텍스트)에 대응하는 '미리 만들어 둔' 고정 일러스트.
#   static/endings/ 에 이 파일들을 두면 런타임 생성 없이 그대로 쓴다(비용 0·GPU 불필요).
FIXED_ENDING_IMAGES = {
    "노멀": "normal.png",
    "트루": "true.png",
    "히든": "hidden.png",
}
BAD_FALLBACK_IMAGE = "bad.png"   # 베드 생성 실패 시 폴백 일러스트


def _static_image_url(filename: str | None) -> str | None:
    """static/endings/ 에 파일이 실제로 있으면 그 URL을, 없으면 None."""
    if filename and (ENDING_DIR / filename).exists():
        return f"/static/endings/{filename}"
    return None


def _gen_ending_image(result: dict) -> str | None:
    """라이브 생성기(comfyui/openai)가 켜져 있으면 엔딩 일러스트를 AI로 생성한다."""
    if llm.IMAGE_PROVIDER not in llm.LIVE_IMAGE_PROVIDERS:
        return None
    try:
        img = generate_image(_ending_image_prompt(result))
        filename = f"{uuid.uuid4()}.png"
        (ENDING_DIR / filename).write_bytes(img)
        return f"/static/endings/{filename}"
    except Exception:
        return None


def _finalize_ending(session_id: str) -> dict:
    """엔딩 분기를 확정해 서술 + 일러스트를 정하고 세션·도감에 저장한다.

    - 정규(노멀/트루/히든): 고정 이미지가 있으면 그걸, 없으면 AI 생성.
    - 베드: AI 생성 시도 → 실패 시 고정 폴백 이미지.
    """
    result = generate_ending(session_id)  # {kind, id, name, progress, text}

    if result["kind"] == "good":
        # 정규 엔딩 — 고정 일러스트 우선, 없으면 AI 생성.
        image_url = _static_image_url(FIXED_ENDING_IMAGES.get(result["name"])) or _gen_ending_image(result)
    else:
        # 베드 — AI 생성 우선, 실패/미설정 시 고정 폴백.
        image_url = _gen_ending_image(result) or _static_image_url(BAD_FALLBACK_IMAGE)

    ending = {
        "kind": result["kind"], "id": result["id"], "name": result["name"],
        "progress": result["progress"], "text": result["text"], "image_url": image_url,
    }
    with get_conn() as conn:
        conn.execute(
            "UPDATE game_sessions SET ending = %s, updated_at = now() WHERE id = %s",
            (json.dumps(ending, ensure_ascii=False), session_id),
        )

    # 도달한 엔딩을 계정 도감에 영구 적재(회차가 바뀌어도 누적).
    try:
        codex.record_ending_for_session(session_id, ending)
    except Exception:
        pass

    return ending


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
        "의사: \"무리하지 마십시오. 재끝 마을은 지금 겉보기보다 훨씬 불안합니다. 영정 채굴량은 "
        "늘었는데 광부들은 돌아오지 않고, 공식 보고서에는 사라진 이름들이 빠져 있습니다.\"\n"
        "의사: \"밤마다 광산 쪽 종이 울리면 안개가 봉우리에서 내려오고, 부상자들은 모두 같은 말을 "
        "합니다. 갱도 안쪽에서 기계가 아닌 것이 숨을 쉰다고요.\"\n"
        "의사: \"여관의 린은 마을 소문과 거래 장부를 쥐고 있고, 광산의 감독 가일은 실종자 기록을 "
        "숨기고 있습니다. 기억이 돌아오지 않더라도, 그 둘을 따라가면 당신이 왜 이곳에 쓰러져 있었는지 "
        "단서가 남아 있을 겁니다.\"\n"
        "의사: \"먼저 여관의 린을 찾아가 보시겠습니까, 아니면 광산 쪽 상황을 살펴보시겠습니까?\""
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


class BackgroundRequest(BaseModel):
    session_id: str
    location: str


# 세계관 결속용 공통 태그 — 캐릭터 렌더(소프트 페인터리·반실사·정갈)와 맞춘 톤.
# 음울하되 지저분하지 않게: 차분한 채도 + 부드러운 분위기. 장소별 색·조명은 location에서 준다.
_BG_STYLE = (
    "stylized 3D game environment art, soft painterly PBR render, semi-realistic, clean detailed, "
    "atmospheric, 1800s steampunk eastern-fantasy, dark muted ashen palette, low-key lighting, "
    "deep shadows, dim and gloomy, wide landscape, no people, no text"
)

# AI 생성 장소용 공통 스타일(LoRA 트리거는 llm 쪽에서 자동으로 앞에 붙는다).
# 'eastern-fantasy'는 한글 장소명과 만나면 동양 사찰로 빠지므로 의도적으로 뺀다.
_AIGEN_STYLE = (
    "dark atmospheric painterly game concept art, semi-realistic stylized game environment, "
    "1800s steampunk, dark muted ashen palette, pale-blue spirit-stone glow, deep shadows, dim, no people, no text"
)

# 한글 장소명 → 영어 장면 프롬프트(SDXL은 한글을 못 읽으므로 영어로 매핑). 구체적 키워드를 먼저 둔다.
_LOC_SCENES: list[tuple[str, str, str]] = [
    ("교단", "the vast interior of a grand gothic cathedral serving as an ominous ash-cult sanctuary, "
             "towering pointed gothic arches and a high ribbed vaulted ceiling, stone columns lining a long "
             "central nave toward a raised altar, tall stained-glass windows depicting an ancient dragon, "
             "grey-ash braziers with ember and pale-blue fire, draconic carvings, drifting incense, interior wide shot down the nave",
             "exterior, building facade, pagoda, temple roof, rooftop, asian temple, seen from outside, aerial view, bright, sunny"),
    ("성소", "the vast interior of a grand gothic ash-cult cathedral, pointed arches, ribbed vaulted ceiling, "
             "long nave to a dragon-motif altar, stained-glass with a dragon, ash braziers with ember and blue glow, interior wide shot",
             "exterior, facade, pagoda, temple roof, asian temple, seen from outside, bright, sunny"),
    ("풀무", "a warm cramped blacksmith forge interior, a glowing furnace and a large leather bellows, anvil "
             "hammers and tongs, brass steampunk pipes and parts, glowing embers and pale-blue light, smoky gloom",
             "exterior, factory, train station, pagoda, abandoned, daytime, bright"),
    ("대장간", "a warm cramped blacksmith forge interior, a glowing furnace and a large leather bellows, anvil "
             "hammers and tongs, brass steampunk pipes and parts, glowing embers and pale-blue light, smoky gloom",
             "exterior, factory, train station, pagoda, abandoned, daytime, bright"),
    ("정제소", "a grimy spirit-essence refinery interior, tall brass pipes vats and tanks, hissing steam, heavy "
              "machinery, pale-blue spirit-stone glow, industrial gloom",
              "pagoda, asian temple, clean, bright, sunny, daytime"),
    ("심부", "the deep inner gallery of a mine, dark tunnels braced with timber, lantern-lit rock walls, glowing "
             "pale-blue spirit-stone veins in dark stone, ore carts and bent rails, damp gloom",
             "building, house, pagoda, sky, bright, sunny, daytime"),
    ("갱도", "the deep inner gallery of a mine, dark tunnels braced with timber, lantern-lit rock walls, glowing "
             "pale-blue spirit-stone veins in dark stone, ore carts and bent rails, damp gloom",
             "building, house, pagoda, sky, bright, sunny, daytime"),
    ("폐광", "a vast abandoned collapsed mine cavern, a caved-in vertical shaft, broken timber frames and snapped "
             "beams, rusted chains and ladders, rubble, dark charcoal-grey ashen stone, glowing pale-blue spirit-stone veins",
             "house, cabin, building, pagoda, intact, bright, sunny"),
    ("수직갱", "a vast abandoned collapsed mine cavern, a caved-in vertical shaft, broken timber frames, rusted "
              "chains and ladders, rubble, dark charcoal-grey ashen stone, glowing pale-blue spirit-stone veins",
              "house, cabin, building, pagoda, intact, bright, sunny"),
    ("광산", "a foggy mine entrance carved into a rocky mountainside, a timber-framed adit, ore carts and rails, "
             "scattered mining gear, drifting grey fog, gloomy",
             "interior hall, pagoda, asian temple, bright, sunny, clear sky"),
    ("암시장", "a narrow back-alley night bazaar packed wall-to-wall with crowded covered market stalls, contraband "
              "crates and barrels, hanging lanterns and goods overhead, caged pale-blue spirit-stone shards, hushed illicit gloom",
              "empty street, plain houses, pagoda, daytime, bright, clean, festival"),
]


def _location_prompt(location: str) -> tuple[str, str]:
    """한글 장소명을 영어 장면 프롬프트(+부정)로 변환한다. 미매핑이면 톤만 맞춘 일반 배경."""
    loc = location.replace(" ", "")
    for kw, pos, neg in _LOC_SCENES:
        if kw in loc:
            return f"{pos}, {_AIGEN_STYLE}", neg
    # 미매핑 자유 장소 — 한글이라 내용 신호는 약하지만 동양 사찰로 빠지지 않게 막고 톤만 맞춘다.
    return (f"a moody atmospheric steampunk location, {_AIGEN_STYLE}",
            "pagoda, asian temple, bright, sunny, daytime, modern")


@app.post("/api/background")
def gen_background(
    req: BackgroundRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """주요 장소가 아닌 곳으로 이동 시, 그 장소 배경을 즉석 생성한다(같은 장소는 캐시 재사용).

    라이브 이미지 생성기(comfyui/openai)가 꺼져 있으면 url=None (배경 없이 진행).
    """
    assert_session_owner(req.session_id, user_id)
    location = (req.location or "").strip()
    if not location:
        return {"url": None, "generated": False}
    if llm.IMAGE_PROVIDER not in llm.LIVE_IMAGE_PROVIDERS:
        return {"url": None, "generated": False}

    key = hashlib.md5(location.encode("utf-8")).hexdigest()[:16]
    fpath = GEN_BG_DIR / f"{key}.png"
    url = f"/static/backgrounds/gen/{key}.png"
    if fpath.exists():
        return {"url": url, "generated": True, "cached": True}
    try:
        pos, neg = _location_prompt(location)
        img = generate_image(pos, size="1344x768", negative=neg)
        fpath.write_bytes(img)
        _save_depth(img, key)   # 2.5D 패럴랙스용 깊이맵(베스트에포트, 깊이서비스 꺼져도 OK)
        return {"url": url, "generated": True}
    except Exception:
        return {"url": None, "generated": False}


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


def _sse_pack(event_type: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event_type}\ndata: {payload}\n\n"


@app.post("/api/chat/stream")
def chat_stream(
    req: ChatRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> StreamingResponse:
    message = req.message.strip()

    if not message:
        raise HTTPException(status_code=400, detail="message is empty")

    assert_session_owner(req.session_id, user_id)

    def events():
        try:
            for event in gm_reply_stream(req.session_id, message):
                event_type = event.get("type", "message")
                if event_type == "final":
                    event["session"] = public_session(req.session_id)
                    event["story"] = story.current_scene(req.session_id)
                yield _sse_pack(event_type, event)
        except Exception as exc:
            logger.exception("Streaming chat failed")
            yield _sse_pack("error", {"type": "error", "detail": str(exc)})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


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

    session = load_session(req.session_id)
    flags = progression.as_dict(session.get("flags") or {})
    existing = _json_safe(session.get("ending"))
    if isinstance(existing, dict):
        current = endings.resolve_ending(session)
        priority = {"END_BAD": 0, "END_NORMAL": 1, "END_TRUE": 2, "END_HIDDEN": 3}
        existing_rank = priority.get(existing.get("id"), -1)
        current_rank = priority.get(current.get("id"), -1)
        if existing_rank >= current_rank:
            return existing

    current = endings.resolve_ending(session)
    if current.get("kind") == "bad" and not flags.get("EVT_EPILOGUE"):
        raise HTTPException(status_code=409, detail="ending is not ready")

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
def tts(req: TTSRequest, user_id: str = Depends(get_user_id_from_token)) -> dict[str, Any]:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")

    provider = _tts_provider()
    use_cosyvoice = provider == "cosyvoice"
    logger.info("TTS request provider=%s speaker=%s text=%s repr=%r", TTS_PROVIDER, req.speaker or req.voice or "gm", text, text)
    speaker = _tts_speaker(req, provider)
    extension = _tts_extension(provider)
    filename = f"tts-{_tts_cache_key(req, speaker, provider)}.{extension}"
    out_path = AUDIO_DIR / filename
    if out_path.exists():
        return {
            "audio_url": f"/static/audio/{filename}",
            "voice": speaker,
            "provider": provider,
            "cached": True,
        }

    fallback_provider = None
    try:
        speaker = _synthesize_tts_provider(req, provider, out_path)
    except HTTPException:
        if provider == "edge" or TTS_FALLBACK_PROVIDER != "edge":
            logger.exception("%s TTS failed", provider)
            raise
        logger.exception("%s TTS failed; falling back to Edge TTS", provider)
        fallback_provider = "edge"
        speaker = _edge_speaker(req)
        filename = f"tts-{_tts_cache_key(req, speaker, 'edge')}.mp3"
        out_path = AUDIO_DIR / filename
        if not out_path.exists():
            speaker = synthesize_edge_tts(req, out_path)
    response = {"audio_url": f"/static/audio/{filename}", "voice": speaker, "provider": fallback_provider or provider}
    if fallback_provider:
        response["fallback_from"] = provider
    if use_cosyvoice and not fallback_provider and COSYVOICE_DEBUG:
        response["debug_url"] = f"/static/audio_debug/{out_path.stem}.json"
        response["debug_float32_url"] = f"/static/audio_debug/{out_path.stem}.float32.npy"
    return response


@app.post("/api/tts/stream")
def tts_stream(req: TTSRequest, user_id: str = Depends(get_user_id_from_token)) -> StreamingResponse:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")

    provider = _tts_provider()
    use_cosyvoice = provider == "cosyvoice"
    speaker = _tts_speaker(req, provider)
    cache_key = _tts_cache_key(req, speaker, provider)

    def events():
        try:
            event_provider = provider
            event_speaker = speaker
            if use_cosyvoice:
                for event in _iter_cosyvoice_stream_chunks(req, event_speaker, cache_key):
                    yield _sse_pack(event.get("type", "chunk"), event)
                return

            extension = _tts_extension(provider)
            filename = f"tts-{cache_key}.{extension}"
            out_path = AUDIO_DIR / filename
            was_cached = out_path.exists()
            if not was_cached:
                try:
                    _synthesize_tts_provider(req, provider, out_path)
                except HTTPException:
                    if provider == "edge" or TTS_FALLBACK_PROVIDER != "edge":
                        raise
                    logger.exception("%s stream TTS failed; falling back to Edge TTS", provider)
                    fallback_speaker = _edge_speaker(req)
                    fallback_cache_key = _tts_cache_key(req, fallback_speaker, "edge")
                    filename = f"tts-{fallback_cache_key}.mp3"
                    out_path = AUDIO_DIR / filename
                    was_cached = out_path.exists()
                    if not was_cached:
                        synthesize_edge_tts(req, out_path)
                    event_speaker = fallback_speaker
                    event_provider = "edge"
            chunk = {
                "type": "chunk",
                "audio_url": f"/static/audio/{filename}",
                "voice": event_speaker,
                "provider": event_provider,
                "chunk_index": 0,
                "cached": was_cached,
            }
            final = {
                "type": "final",
                "voice": event_speaker,
                "provider": event_provider,
                "chunk_count": 1,
                "cached": was_cached,
            }
            if event_provider != provider:
                chunk["fallback_from"] = provider
                final["fallback_from"] = provider
            yield _sse_pack("chunk", chunk)
            yield _sse_pack("final", final)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            yield _sse_pack("error", {"type": "error", "detail": detail})
        except Exception as exc:
            logger.exception("Streaming TTS failed")
            yield _sse_pack("error", {"type": "error", "detail": str(exc)})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )




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
