from __future__ import annotations

import hashlib
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
from gm_cli import create_session, gm_reply, load_session, recent_history, generate_ending
from llm import generate_image
import progression
import endings
import dialogue
import codex
import llm
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
ENDING_DIR = STATIC_DIR / "endings"
ENDING_DIR.mkdir(exist_ok=True)
GEN_BG_DIR = STATIC_DIR / "backgrounds" / "gen"   # AI가 즉석 생성한 배경 캐시
GEN_BG_DIR.mkdir(parents=True, exist_ok=True)
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
        "progress": progression.progress_pct(_json_safe(session["flags"]) or {}),
        "stage": progression.current_stage(_json_safe(session["flags"]) or {}),
        "settle_threshold": progression.SETTLE_THRESHOLD,
        "ending_locked": session.get("ending") is not None,
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


@app.post("/api/ending/lock")
def lock_ending(
    req: EndingRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """70% 정산: 엔딩 분기를 확정하고, 서술 + 일러스트를 생성해 세션에 저장한다.

    정규(노멀/트루/히든) 트리거 충족 시 그 엔딩, 미달이면 베드. 둘 다 LLM이 여정 반영해 서술.
    이미지 생성은 시간이 걸리므로, 남은 30% 진행 동안 미리 만들어 두는 용도.
    """
    assert_session_owner(req.session_id, user_id)
    ending = _finalize_ending(req.session_id)
    return {"ending": ending, "segments": dialogue.split_segments(ending["text"])}


class DebugEndingRequest(BaseModel):
    session_id: str
    ending: str | None = None   # '노멀'|'트루'|'히든'|'베드' (없으면 현재 플래그대로 판정)


# 디버그용: 각 엔딩 조건을 즉석에서 만족시키는 플래그/이벤트 (endings.py와 일치).
_DEBUG_ENDING_TARGETS = {
    "노멀": {"flags": ["FLG_KARGAS_ALLY"], "events": ["EVT_PEAK_CONFRONT"]},
    "트루": {"flags": ["FLG_LIN_PLOT_SEEN", "FLG_KARGAS_ALLY"], "events": ["EVT_PEAK_CONFRONT"]},
    "히든": {"flags": ["FLG_LIN_ALLY", "FLG_MEMORY_RECOVERED"], "events": ["EVT_LIN_TALK"]},
    "베드": {"flags": [], "events": []},
}
# 진행도 100%를 만들기 위한 스토리 단계 마커(progression.STORY_STAGES와 일치).
_DEBUG_STAGE_EVENTS = [
    "EVT_INTRO", "EVT_MINE_INVESTIGATE", "EVT_MINE_DEEP", "EVT_PEAK_CONFRONT", "EVT_EPILOGUE",
]


@app.post("/api/debug/ending")
def debug_ending(
    req: DebugEndingRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """[테스트 전용] 원하는 엔딩으로 즉시 점프한다.

    선택한 엔딩 조건의 플래그/이벤트를 켜고, 진행도를 100%로 만든 뒤 엔딩을 생성한다.
    자기 세션에만 적용(assert_session_owner). 정상 플레이를 거치지 않고 엔딩만 확인할 때 사용.
    """
    assert_session_owner(req.session_id, user_id)

    # 100% 진행을 위해 모든 단계 마커를 켠다.
    for ev in _DEBUG_STAGE_EVENTS:
        progression.visit_event(req.session_id, ev)

    target = _DEBUG_ENDING_TARGETS.get(req.ending or "")
    if target:
        for fl in target["flags"]:
            progression.set_flag(req.session_id, fl, True)
        for ev in target["events"]:
            progression.visit_event(req.session_id, ev)

    ending = _finalize_ending(req.session_id)
    return {"ending": ending, "session": public_session(req.session_id)}


@app.get("/api/ending/{session_id}")
def get_ending(
    session_id: str,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """100% 공개: 70%에서 확정·저장해 둔 엔딩(서술+이미지)을 그대로 돌려준다."""
    assert_session_owner(session_id, user_id)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT ending FROM game_sessions WHERE id = %s", (session_id,)
        ).fetchone()
    ending = _json_safe(row[0]) if row and row[0] else None
    return {"ending": ending}


@app.get("/api/codex/clues/{session_id}")
def codex_clues(
    session_id: str,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """도감에서 확인하는 해금 단서(인벤토리 아이템 아님). 플래그로 열린 것만."""
    assert_session_owner(session_id, user_id)
    return {"clues": progression.unlocked_clues(session_id)}


@app.get("/api/codex")
def get_account_codex(
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """계정 단위로 누적된 도감(단서·엔딩·인물). 회차가 바뀌어도 사라지지 않는다."""
    return codex.get_codex(user_id)


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

    return {
        "answer": result["answer"],
        "segments": dialogue.split_segments(result["answer"]),
        "choices": result["choices"],
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

    result = gm_reply(
        req.session_id,
        f"나는 {location}으로 이동한다. 그곳의 상황을 묘사해줘.",
    )

    return {
        "answer": result["answer"],
        "segments": dialogue.split_segments(result["answer"]),
        "choices": result["choices"],
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