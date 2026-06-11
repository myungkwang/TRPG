"""도감 — 계정 단위로 영구 누적되는 발견물(단서·엔딩·인물).

세션(회차)이 바뀌어도 사라지지 않는다. 베드엔딩이 반복돼도 그동안 발견한
단서와 도달한 엔딩이 user_codex 테이블에 차곡차곡 쌓인다.

세션 안에서 단서가 해금되거나(플래그) 엔딩에 도달하면 record_* 로 적재하고,
도감 화면은 get_codex 로 계정의 누적분을 읽어 잠금/해금 상태를 칠한다.
"""
from __future__ import annotations

import json
import time
import uuid

from db import get_conn
import progression

_VALID_KINDS = {"clue", "ending", "character"}


def _user_of_session(session_id: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT user_id FROM game_sessions WHERE id = %s", (session_id,)
        ).fetchone()
    return str(row[0]) if row and row[0] else None


def record(user_id: str, kind: str, key: str, data: dict | None = None) -> None:
    """발견물 1건을 계정 도감에 적재한다(이미 있으면 무시)."""
    if not user_id or not key:
        return
    if kind not in _VALID_KINDS:
        raise ValueError(f"unknown codex kind: {kind!r}")
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO user_codex (user_id, kind, key, data)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id, kind, key) DO NOTHING
            """,
            (user_id, kind, key, json.dumps(data or {}, ensure_ascii=False)),
        )


def sync_clues_from_session(session_id: str) -> None:
    """세션에서 지금까지 해금된 단서를 계정 도감에 반영한다(플래그 기반)."""
    user_id = _user_of_session(session_id)
    if not user_id:
        return
    for clue in progression.unlocked_clues(session_id):
        record(user_id, "clue", clue["name"], {"desc": clue["desc"]})


def _ending_summary(ending: dict) -> str:
    """도감 표시용 짧은 요약. summary가 없으면 본문에서 추린다."""
    s = (ending.get("summary") or "").strip()
    if s:
        return s
    text = (ending.get("text") or "").replace("GM:", " ").replace("\n", " ").strip()
    return text[:160] + ("…" if len(text) > 160 else "")


def record_ending_for_session(session_id: str, ending: dict) -> None:
    """도달한 엔딩을 계정 도감에 적재한다.

    - 정규(노멀/트루/히든): 이름으로 1슬롯만(중복 무시).
    - 베드: AI가 회차마다 새로 쓰므로 매번 고유 키로 누적한다.
    """
    user_id = _user_of_session(session_id)
    if not user_id or not ending:
        return
    kind = ending.get("kind")
    data = {
        "id": ending.get("id"),
        "kind": kind,
        "name": ending.get("name"),
        "summary": _ending_summary(ending),
        "text": ending.get("text", ""),
        "image_url": ending.get("image_url"),
    }
    if kind == "bad":
        key = f"베드-{uuid.uuid4().hex[:12]}"
    else:
        key = ending.get("name") or ending.get("id") or "엔딩"
    record(user_id, "ending", key, data)


def get_codex(user_id: str) -> dict:
    """계정에 누적된 도감을 종류별로 묶어 돌려준다."""
    if not user_id:
        return {"clues": [], "endings": [], "characters": []}
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT kind, key, data, created_at FROM user_codex "
            "WHERE user_id = %s ORDER BY created_at",
            (user_id,),
        ).fetchall()

    out: dict[str, list] = {"clues": [], "endings": [], "characters": []}
    bucket = {"clue": "clues", "ending": "endings", "character": "characters"}
    for kind, key, data, _ in rows:
        group = bucket.get(kind)
        if not group:
            continue
        entry = {"key": key}
        if isinstance(data, dict):
            entry.update(data)
        out[group].append(entry)
    return out
