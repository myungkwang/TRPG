"""엔딩 정의와 트리거 판정.

정본: 증기와비늘_데이터시트.xlsx 의 11_엔딩.
세션 상태(flags·inventory·relations·stats)를 보고 어떤 엔딩이 열렸는지 판정한다.
상태 '변경'은 progression.py가 담당하고, 여기는 '판정'만 한다.

조건 타입(requires의 각 항목):
  {"flag": "FLG_KARGAS_ALLY"}         진행 플래그가 켜짐
  {"event": "EVT_PEAK_CONFRONT"}      특정 이벤트 노드를 통과함
  {"item": "은폐된 명부"}              인벤토리에 아이템 보유
  {"relation": "카르가스", "min": 20}  NPC 호감도 이상
  {"stat": "int_stat", "min": 6}      능력치 이상
  {"any": [ ... ]}  / {"all": [ ... ]}  조건 묶음(OR / AND)
requires 리스트의 모든 항목이 충족되면 그 엔딩이 열린다(최상위는 AND).
"""
from __future__ import annotations

from progression import as_dict, load_state

# 11_엔딩 표. 위에서부터 평가하며, requires가 모두 충족된 첫 엔딩이 열린다.
# (특수/파국 엔딩을 위에 두어 노멀보다 우선시킨다)
ENDINGS = [
    {
        "id": "END_BAD",
        "name": "베드",
        "requires": [{"flag": "FLG_TOWN_DESTROYED"}],
        "summary": "주인공 사망 또는 외부 세력(카르가스·드래그니카)에 의한 마을 멸망.",
    },
    {
        "id": "END_HIDDEN",
        "name": "히든",
        "requires": [
            {"flag": "FLG_LIN_ALLY"},
            {"flag": "FLG_MEMORY_RECOVERED"},
            {"event": "EVT_LIN_TALK"},
        ],
        "summary": "숨겨진 진실이 밝혀지는 복선 회수형 엔딩.",
    },
    {
        "id": "END_TRUE",
        "name": "트루",
        "requires": [
            {"flag": "FLG_LIN_PLOT_SEEN"},
            {"flag": "FLG_KARGAS_ALLY"},
            {"event": "EVT_PEAK_CONFRONT"},
        ],
        "summary": "마을과 드래그니카의 교류 협정. 전쟁을 막은 최선의 결말.",
    },
    {
        # 노멀 — 기본 결말. 특별한 달성 없이 메인 갈등만 해소하면 도달한다.
        # (아이템/호감도 같은 추가 게이트 없음 — 조건을 빡빡하게 두지 않는다)
        "id": "END_NORMAL",
        "name": "노멀",
        "requires": [
            {"event": "EVT_PEAK_CONFRONT"},   # 봉우리에서 카르가스와 대면하고
            {"flag": "FLG_KARGAS_ALLY"},      # 채굴 중단에 합의하면 끝
        ],
        "summary": "영석 채굴 중단. 마을은 일단 살아남는다 (기본 엔딩).",
    },
]


def _state_view(session_or_flags: dict) -> dict:
    """세션(dict) 또는 flags 단독 dict를 평가용 상태로 정규화한다."""
    d = session_or_flags or {}
    if not any(k in d for k in ("inventory", "relations", "str", "stamina")):
        return {"flags": d, "items": [], "relations": {}, "stats": {}}

    inv = as_dict(d.get("inventory"))
    items = inv.get("items", []) if isinstance(inv.get("items"), list) else []
    return {
        "flags": as_dict(d.get("flags")),
        "items": items,
        "relations": as_dict(d.get("relations")),
        "stats": {k: int(d.get(k, 0) or 0) for k in ("str", "dex", "int_stat", "cha")},
    }


def _check(cond: dict, state: dict) -> bool:
    if "any" in cond:
        return any(_check(c, state) for c in cond["any"])
    if "all" in cond:
        return all(_check(c, state) for c in cond["all"])
    if "flag" in cond:
        return state["flags"].get(cond["flag"]) is True
    if "event" in cond:
        return state["flags"].get(cond["event"]) is True  # 이벤트 통과도 flags에 기록됨
    if "item" in cond:
        return cond["item"] in state["items"]
    if "relation" in cond:
        return int(state["relations"].get(cond["relation"], 0)) >= int(cond.get("min", 1))
    if "stat" in cond:
        return int(state["stats"].get(cond["stat"], 0)) >= int(cond.get("min", 1))
    return False


def evaluate_ending(session_or_flags: dict) -> dict | None:
    """세션 상태로 열린 엔딩을 판정한다. 아직 없으면 None."""
    state = _state_view(session_or_flags)
    for ending in ENDINGS:
        if all(_check(cond, state) for cond in ending["requires"]):
            return ending
    return None


def check_session_ending(session_id: str) -> dict | None:
    """세션 ID로 현재 상태를 읽어 열린 엔딩을 판정한다."""
    return evaluate_ending(load_state(session_id))
