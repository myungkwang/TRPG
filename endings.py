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

from progression import as_dict, load_state, progress_pct, SETTLE_THRESHOLD

# 정규(트리거 기반) 엔딩 = 노멀/트루/히든. 위에서부터 평가, 충족된 첫 엔딩이 열린다.
# 베드는 규칙으로 두지 않는다 — 정규 엔딩에 못 미치면 AI가 생성하는 fallback이다.
ENDINGS = [
    {
        "id": "END_HIDDEN",
        "name": "히든",
        "requires": [
            {"flag": "FLG_LIN_ALLY"},
            {"flag": "FLG_MEMORY_RECOVERED"},
            {"event": "EVT_LIN_TALK"},
        ],
        "summary": "숨겨진 진실이 밝혀지는 복선 회수형 엔딩.",
        "text": (
            "린의 손을 잡은 순간, 흐릿하던 기억의 장막이 걷힙니다. 당신은 자신이 누구였는지, "
            "어째서 이 산으로 이끌려 왔는지를 마침내 떠올립니다. 토비가 흥얼대던 자장가가 "
            "당신의 잊힌 과거와 맞닿아 있었음을 깨닫습니다. 린은 더 이상 진실을 숨기지 않고, "
            "당신과 함께 봉우리의 가장 깊은 비밀을 마주합니다. 영정의 근원도, 카르가스의 태고도, "
            "당신의 정체와 하나의 실로 이어져 있었습니다. 복선처럼 흩어져 있던 모든 조각이 "
            "제자리를 찾습니다. 재끝 마을의 이야기는, 사실 처음부터 당신의 이야기였습니다. "
            "안갯속에 가려졌던 진실이, 마침내 빛 아래 드러납니다."
        ),
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
        "text": (
            "봉우리 위에서, 당신은 린의 이중 공작을 모두 꿰뚫어 본 채 카르가스 앞에 섭니다. "
            "거짓과 진실이 뒤섞인 말들 너머로, 당신은 마을과 드래그니카 사이에 다리를 놓습니다. "
            "채굴은 멈추고, 태고의 존재와 인간은 처음으로 협정을 맺습니다. 전쟁의 불씨는 "
            "피어오르기 전에 꺼집니다. 가일의 은폐도, 제국의 욕망도 더는 산을 어지럽히지 못합니다. "
            "마르타는 오래된 의례의 마지막 구절을 읊으며 미소 짓습니다. 재끝 마을은 잿빛 변경의 "
            "끝에서, 가장 나은 새벽을 맞이합니다. 당신이 고른 길은, 누구도 죽지 않은 단 하나의 "
            "결말이었습니다."
        ),
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
        "text": (
            "봉우리의 바람이 잦아들고, 카르가스의 잿빛 비늘이 천천히 어둠 속으로 가라앉습니다. "
            "당신은 채굴을 멈추기로 한 약속을 가지고 산을 내려옵니다. 사라진 이들은 끝내 돌아오지 "
            "못했지만, 영석을 향한 곡괭이질도 이제 멈추었습니다. 재끝 마을에는 오랜만에 조용한 "
            "새벽이 찾아옵니다. 가일은 고개를 떨구고, 마르타는 말없이 산을 올려다봅니다. 살아남은 "
            "자들은 다시 각자의 자리로 돌아갑니다. 완전한 승리는 아니었으나, 마을은 일단 숨을 "
            "붙입니다. 당신의 이름은 기억되지 않을지라도, 그날의 선택만은 산이 기억할 것입니다."
        ),
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
    """세션 ID로 현재 상태를 읽어 열린 정규 엔딩을 판정한다. (베드는 제외)"""
    return evaluate_ending(load_state(session_id))


def resolve_ending(session_or_state: dict) -> dict:
    """정산 시점의 최종 엔딩을 결정한다.

    - 정규 엔딩(노멀/트루/히든) 트리거가 충족되면 그 엔딩(규칙 기반).
    - 못 미치면 'bad' — 진행도와 함께, AI가 그 플레이에 맞춰 생성할 fallback.
    """
    state = _state_view(session_or_state)
    pct = progress_pct(state["flags"])
    good = evaluate_ending(session_or_state)
    if good:
        return {"kind": "good", "id": good["id"], "name": good["name"],
                "summary": good["summary"], "text": good.get("text", ""),
                "progress": pct}
    return {
        "kind": "bad", "id": "END_BAD", "name": "베드",
        "progress": pct,
        "settled": pct >= SETTLE_THRESHOLD,  # 70% 이상이면 '아쉽게 놓친' 결말
        "town_destroyed": bool(state["flags"].get("FLG_TOWN_DESTROYED")),
    }
