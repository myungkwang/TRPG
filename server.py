from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import OpenAI

from db import get_conn
from gm_cli import create_session, gm_reply, load_session, recent_history
import progression
import dialogue
from auth import (
    validate_signup,
    hash_password,
    verify_password,
    create_access_token,
    get_user_id_from_token,
)
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
AUDIO_DIR = STATIC_DIR / "audio"
AUDIO_DIR.mkdir(exist_ok=True)
openai_client = OpenAI()

app = FastAPI(title="증기와 비늘 Web Test")
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


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None


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
    return FileResponse(STATIC_DIR / "index.html")
@app.get("/login")
def login_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "login.html")


@app.get("/signup")
def signup_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "signup.html")

@app.post("/api/session")
def new_session(user_id: str = Depends(get_user_id_from_token)) -> dict[str, Any]:
    session_id = create_session()

    intro = (
        "GM: 영석 등불이 희미하게 깜빡이는 진료소. 당신은 기억을 잃은 채 눈을 뜬다. "
        "한 사내가 당신을 들여다본다.\n"
        "의사: \"깨어났군요. 당신이 누군지… 기억나는 게 있습니까?\""
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
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/api/codex/clues/{session_id}")
def codex_clues(
    session_id: str,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """도감에서 확인하는 해금 단서(인벤토리 아이템 아님). 플래그로 열린 것만."""
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

    answer = gm_reply(req.session_id, message)

    return {
        "answer": answer,
        "segments": dialogue.split_segments(answer),
        "session": public_session(req.session_id),
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

    answer = gm_reply(
        req.session_id,
        f"나는 {location}으로 이동한다. 그곳의 상황을 묘사해줘.",
    )

    return {
        "answer": answer,
        "segments": dialogue.split_segments(answer),
        "session": public_session(req.session_id),
    }


VOICE_BY_HINT = {
    "normal": "alloy",
    "happy": "shimmer",
    "angry": "onyx",
    "thinking": "echo",
    "sad": "fable",
}


def _voice_from_text(text: str, requested: str | None = None) -> str:
    if requested:
        return requested
    if any(k in text for k in ["분노", "화가", "격노", "위협", "공격", "전투"]):
        return VOICE_BY_HINT["angry"]
    if any(k in text for k in ["기쁘", "반갑", "성공", "환영", "미소"]):
        return VOICE_BY_HINT["happy"]
    if any(k in text for k in ["생각", "고민", "추리", "관찰", "단서"]):
        return VOICE_BY_HINT["thinking"]
    return VOICE_BY_HINT["normal"]


@app.post("/api/tts")
def tts(req: TTSRequest, user_id: str = Depends(get_user_id_from_token)) -> dict[str, str]:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")

    filename = f"{uuid.uuid4()}.mp3"
    out_path = AUDIO_DIR / filename
    voice = _voice_from_text(text, req.voice)

    try:
        with openai_client.audio.speech.with_streaming_response.create(
            model="gpt-4o-mini-tts",
            voice=voice,
            input=text,
        ) as response:
            response.stream_to_file(out_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS 생성 실패: {exc}")

    return {"audio_url": f"/static/audio/{filename}", "voice": voice}


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
        except Exception:
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