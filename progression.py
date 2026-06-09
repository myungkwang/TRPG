"""게임 진행 상태 — 플래그 / 이벤트 / 호감도 / 아이템의 정의와 변경 로직.

세션의 flags·relations·inventory(JSONB)를 읽고 쓰는 곳.
엔딩 '판정'(endings.py)과 상태 '변경'(여기)을 분리한다.
AI GM은 도구(set_flag/visit_event/give_item)를 통해 여기 함수를 호출한다.
"""
from __future__ import annotations

import json
from db import get_conn

# 진행 플래그 (8_플래그마스터). AI GM이 set_flag 도구로 켠다.
FLAGS = {
    "FLG_CLUE_01": "사라진 광부들을 인지 (광산 조사/가일 대화)",
    "FLG_CLUE_02": "기계 이상·봉우리의 그림자 목격 (야간 관찰/간파)",
    "FLG_CLUE_03": "산의 옛 전설 입수 (마르타). 게이트: FLG_CLUE_02",
    "FLG_CLUE_04": "갱도 심부의 진실 도달. 게이트: FLG_CLUE_01 + FLG_CLUE_03",
    "FLG_LIN_PLOT_SEEN": "린의 이중 공작 간파 성공",
    "FLG_KARGAS_ALLY": "카르가스와 우호 — 채굴 중단 합의 (절정 선택)",
    "FLG_LIN_ALLY": "린과 동맹",
    "FLG_MEMORY_RECOVERED": "기억상실 복선 회수",
    "FLG_TOWN_DESTROYED": "마을 파괴 / 주인공 사망",
}

# 주요 이벤트 노드 (9_이벤트씬). AI GM이 visit_event 도구로 '통과'를 기록한다.
EVENT_NODES = {
    "EVT_INTRO": "진료소 도입(캐릭터 생성)",
    "EVT_MINE_INVESTIGATE": "광산 입구 조사",
    "EVT_NIGHT_WATCH": "마을 야간 관찰",
    "EVT_MARTA_LEGEND": "마르타에게 봉우리 전설 청취",
    "EVT_MINE_DEEP": "갱도 심부 진입",
    "EVT_LIN_TALK": "여관에서 린과 정보 거래",
    "EVT_PEAK_CONFRONT": "봉우리에서 카르가스 대면(절정)",
}

# 호감도는 '진행 중 이벤트 통과'로만 변한다. 이벤트별 NPC 호감도 변화량.
# (AI가 임의로 호감도를 못 올리고, 실제 장면을 거쳐야만 적용됨)
RELATION_MIN, RELATION_MAX = -50, 50
EVENT_RELATION_REWARDS = {
    "EVT_MARTA_LEGEND": {"마르타": 10, "카르가스": 5},
    "EVT_MINE_DEEP": {"토비": 10, "카르가스": 10},
    "EVT_LIN_TALK": {"린": 5},
    "EVT_PEAK_CONFRONT": {"카르가스": 5},
}

# 도감에서 확인하는 '해금 단서' (인벤토리 아이템이 아니다).
# 연결된 플래그가 켜지면 도감에 자동으로 열린다. (05-사건 '해금 단서' / 7_단서비트)
CODEX_CLUES = {
    "은폐된 명부": {"unlock": "FLG_CLUE_01",
                "desc": "가일이 숨긴 광부 명부. 사라진 인원이 공식 발표의 세 배."},
    "봉우리의 그림자": {"unlock": "FLG_CLUE_02",
                  "desc": "마르타가 말한 옛 둥지. 봉우리 위에 거대한 무언가가 산다."},
    "잊혀진 자장가": {"unlock": "FLG_MEMORY_RECOVERED",
                "desc": "토비가 흥얼대는 노래. 어딘가 주인공의 기억을 건드린다."},
}


def as_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value or "{}")
        except json.JSONDecodeError:
            return {}
    return {}


def _load_row(session_id: str) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT flags, relations, inventory FROM game_sessions WHERE id = %s",
            (session_id,),
        ).fetchone()
    if not row:
        raise RuntimeError("session not found")
    return {"flags": as_dict(row[0]), "relations": as_dict(row[1]),
            "inventory": as_dict(row[2])}


def load_state(session_id: str) -> dict:
    """엔딩 판정용 전체 상태(flags·inventory·relations·stats)를 읽어온다."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT flags, inventory, relations, str, dex, int_stat, cha "
            "FROM game_sessions WHERE id = %s",
            (session_id,),
        ).fetchone()
    if not row:
        raise RuntimeError("session not found")
    return {
        "flags": row[0], "inventory": row[1], "relations": row[2],
        "str": row[3], "dex": row[4], "int_stat": row[5], "cha": row[6],
    }


def _save(session_id: str, column: str, value: dict) -> None:
    # column은 내부 상수만 받으므로 안전하다.
    with get_conn() as conn:
        conn.execute(
            f"UPDATE game_sessions SET {column} = %s, updated_at = now() WHERE id = %s",
            (json.dumps(value, ensure_ascii=False), session_id),
        )


def get_session_flags(session_id: str) -> dict:
    return _load_row(session_id)["flags"]


def set_flag(session_id: str, flag: str, value: bool = True) -> dict:
    """진행 플래그를 켠다(끈다). 갱신된 flags를 돌려준다."""
    if flag not in FLAGS:
        raise ValueError(f"unknown flag: {flag}")
    flags = get_session_flags(session_id)
    flags[flag] = bool(value)
    _save(session_id, "flags", flags)
    return flags


def visit_event(session_id: str, node_id: str) -> dict:
    """이벤트 통과를 기록하고, 그 이벤트에 정해진 호감도·아이템 보상을 적용한다.

    반환: {"relations_changed": {npc: {"delta","value"}}, "items_added": [...]}
    """
    if node_id not in EVENT_NODES:
        raise ValueError(f"unknown event node: {node_id}")

    row = _load_row(session_id)
    flags, relations = row["flags"], row["relations"]

    flags[node_id] = True
    _save(session_id, "flags", flags)

    # 호감도: 오직 이 경로(이벤트 통과)로만 변한다.
    changed: dict = {}
    for npc, delta in EVENT_RELATION_REWARDS.get(node_id, {}).items():
        cur = int(relations.get(npc, 0) or 0)
        new = max(RELATION_MIN, min(RELATION_MAX, cur + delta))
        if new != cur:
            relations[npc] = new
            changed[npc] = {"delta": delta, "value": new}
    if changed:
        _save(session_id, "relations", relations)

    return {"relations_changed": changed}


def unlocked_clues(session_id: str) -> list[dict]:
    """도감에 열린 해금 단서 목록(인벤토리 아이템이 아니라 '단서').

    연결된 플래그가 켜진 단서만 반환한다. 도감 화면에서 확인용.
    """
    flags = get_session_flags(session_id)
    return [
        {"name": name, "desc": clue["desc"]}
        for name, clue in CODEX_CLUES.items()
        if flags.get(clue["unlock"])
    ]


def give_item(session_id: str, item: str) -> dict:
    """인벤토리에 아이템을 추가하고, 갱신된 inventory를 돌려준다."""
    inventory = _load_row(session_id)["inventory"]
    items = inventory.get("items")
    if not isinstance(items, list):
        items = []
    if item not in items:
        items.append(item)
    inventory["items"] = items
    _save(session_id, "inventory", inventory)
    return inventory
