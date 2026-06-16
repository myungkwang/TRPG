"""아이템 카탈로그 — 백엔드의 아이템 ID 계약(contract).

프론트의 items.js(표시 마스터)와 **같은 ITM_* ID**를 공유한다.
백엔드는 ID만 정확히 저장하면 되고, 이름/아이콘/3D는 프론트가 items.js로 해석한다.

여기 담는 것:
  - JOB_KITS         : 직업 선택 → 시작 지급(시작 T1 무기 + 직업 장비)
  - START_COMMON     : 직업 무관 공통 시작 아이템
  - EQUIP_SLOT       : 장착 슬롯(머리/몸통/무기) — 자동 장착·교체 판정용
  - EVENT_ITEM_REWARDS : 이벤트 노드 통과 시 자동 지급(튜닝 가능)
  - ALIASES / resolve_item : GM이 자유 텍스트로 준 이름 → ITM_* ID 해석
  - display_name     : ID → 사람이 읽는 이름(GM 상태 전달·로그용)
"""
from __future__ import annotations

# ID → 표시 이름 (백엔드가 다루는 아이템만. 프론트 items.js와 이름 일치)
NAMES: dict[str, str] = {
    # 직업 시작 유일무기(T1)
    "ITM_UNIQ_SHORTSWORD": "숏 소드",
    "ITM_UNIQ_DAGGER": "대거",
    "ITM_UNIQ_CROWHAMMER": "크로우해머",
    "ITM_UNIQ_GAUNTLET": "기계 건틀릿",
    "ITM_UNIQ_REVOLVER": "리볼버",
    # 상위 티어 유일무기
    "ITM_UNIQ_BROADSWORD": "증기 브로드소드",
    "ITM_UNIQ_SABER": "영석 세이버",
    "ITM_UNIQ_TWINDAGGER": "톱니 쌍단검",
    "ITM_UNIQ_FOXFANG": "여우의 송곳니",
    "ITM_UNIQ_PISTONHAMMER": "피스톤 해머",
    "ITM_UNIQ_PILEBUNKER": "영석 파일벙커",
    "ITM_UNIQ_SHOCKGAUNTLET": "충격 건틀릿",
    "ITM_UNIQ_NAMDU": "남두의 권",
    "ITM_UNIQ_ESSREVOLVER": "영정 리볼버",
    "ITM_UNIQ_ARIA": "아리아 리볼버",
    # 해금 부품
    "ITM_UNL_CORE": "가압 노심",
    "ITM_UNL_GEAR": "맞물림 기어",
    "ITM_UNL_CYLINDER": "유압 실린더",
    "ITM_UNL_COIL": "충격 코일",
    "ITM_UNL_CHAMBER": "공명 약실",
    # 장비
    "ITM_WPN_ARM": "술식 의수",
    "ITM_HEAD_GOGGLE": "영정 고글",
    "ITM_PART": "술식 강화 부품",
    "ITM_CHARM_GEAR": "톱니 부적",
    "ITM_COMPASS": "안개 나침반",
    "ITM_BODY_STEAMPLATE": "증기 흉갑",
    # 소모품·자원·기타
    "ITM_LANTERN": "영석 등불",
    "ITM_ROPE": "밧줄",
    "ITM_HP_AMPLE_LOW": "HP앰플(저가형)",
    "ITM_HP_AMPLE_HIGH": "HP앰플(고급형)",
    "ITM_MP_AMPLE_LOW": "MP앰플(저가형)",
    "ITM_TOME": "마법서",
    "ITM_TOME_NAMDU": "비법서 『남두의 권』",
    "ITM_ESSENCE": "영정",
}

# 장착 슬롯 (없는 아이템 = 장착 불가). 자동 장착/교체 판정에 쓴다.
EQUIP_SLOT: dict[str, str] = {
    "ITM_UNIQ_SHORTSWORD": "weapon",
    "ITM_UNIQ_DAGGER": "weapon",
    "ITM_UNIQ_CROWHAMMER": "weapon",
    "ITM_UNIQ_GAUNTLET": "weapon",
    "ITM_UNIQ_REVOLVER": "weapon",
    "ITM_UNIQ_BROADSWORD": "weapon",
    "ITM_UNIQ_SABER": "weapon",
    "ITM_UNIQ_TWINDAGGER": "weapon",
    "ITM_UNIQ_FOXFANG": "weapon",
    "ITM_UNIQ_PISTONHAMMER": "weapon",
    "ITM_UNIQ_PILEBUNKER": "weapon",
    "ITM_UNIQ_SHOCKGAUNTLET": "weapon",
    "ITM_UNIQ_NAMDU": "weapon",
    "ITM_UNIQ_ESSREVOLVER": "weapon",
    "ITM_UNIQ_ARIA": "weapon",
    "ITM_WPN_ARM": "weapon",
    "ITM_HEAD_GOGGLE": "head",
    "ITM_BODY_STEAMPLATE": "body",
}

# 직업 선택 → 시작 지급. weapon = 자동 장착되는 T1 유일무기, items = 가방에 들어가는 장비.
JOB_KITS: dict[str, dict] = {
    "증기 갑주병":   {"weapon": "ITM_UNIQ_SHORTSWORD", "items": ["ITM_BODY_STEAMPLATE"]},
    "변경 탐사꾼":   {"weapon": "ITM_UNIQ_DAGGER",     "items": ["ITM_ROPE", "ITM_COMPASS"]},
    "메카닉":        {"weapon": "ITM_UNIQ_CROWHAMMER", "items": ["ITM_PART"]},
    "영석 인파이터": {"weapon": "ITM_UNIQ_GAUNTLET",   "items": ["ITM_CHARM_GEAR"]},
    "영석 연금술사": {"weapon": "ITM_UNIQ_REVOLVER",   "items": ["ITM_WPN_ARM"]},
}

# 직업 무관 공통 시작 아이템(가방).
START_COMMON: list[str] = ["ITM_LANTERN", "ITM_HP_AMPLE_LOW"]

# 이벤트 노드 통과 시 자동 지급(스토리에 맞게 튜닝 가능).
EVENT_ITEM_REWARDS: dict[str, list[str]] = {
    "EVT_NIGHT_WATCH": ["ITM_LANTERN"],
    "EVT_MINE_DEEP": ["ITM_HP_AMPLE_HIGH"],
}

# GM 자유 텍스트 → ITM_* 해석용 별칭. 키는 소문자/공백제거로 비교한다.
# (값이 None 이면 '의도적으로 인벤토리 아이템이 아님' — 단서 등으로 문자열 유지)
_EXTRA_ALIASES: dict[str, str] = {
    "영석등불": "ITM_LANTERN",
    "등불": "ITM_LANTERN",
    "밧줄": "ITM_ROPE",
    "로프": "ITM_ROPE",
    "나침반": "ITM_COMPASS",
    "안개나침반": "ITM_COMPASS",
    "술식의수": "ITM_WPN_ARM",
    "영정총": "ITM_WPN_ARM",
    "고글": "ITM_HEAD_GOGGLE",
    "영정고글": "ITM_HEAD_GOGGLE",
    "톱니부적": "ITM_CHARM_GEAR",
    "부적": "ITM_CHARM_GEAR",
    "술식강화부품": "ITM_PART",
    "강화부품": "ITM_PART",
    "부품": "ITM_PART",
    "마법서": "ITM_TOME",
    "가압노심": "ITM_UNL_CORE",
    "맞물림기어": "ITM_UNL_GEAR",
    "기어": "ITM_UNL_GEAR",
    "유압실린더": "ITM_UNL_CYLINDER",
    "실린더": "ITM_UNL_CYLINDER",
    "충격코일": "ITM_UNL_COIL",
    "코일": "ITM_UNL_COIL",
    "공명약실": "ITM_UNL_CHAMBER",
    "약실": "ITM_UNL_CHAMBER",
    "여우의송곳니": "ITM_UNIQ_FOXFANG",
    "송곳니": "ITM_UNIQ_FOXFANG",
    "아리아리볼버": "ITM_UNIQ_ARIA",
    "영정리볼버": "ITM_UNIQ_ESSREVOLVER",
    "영석세이버": "ITM_UNIQ_SABER",
    "세이버": "ITM_UNIQ_SABER",
    "증기브로드소드": "ITM_UNIQ_BROADSWORD",
    "브로드소드": "ITM_UNIQ_BROADSWORD",
    "톱니쌍단검": "ITM_UNIQ_TWINDAGGER",
    "쌍단검": "ITM_UNIQ_TWINDAGGER",
    "피스톤해머": "ITM_UNIQ_PISTONHAMMER",
    "영석파일벙커": "ITM_UNIQ_PILEBUNKER",
    "파일벙커": "ITM_UNIQ_PILEBUNKER",
    "충격건틀릿": "ITM_UNIQ_SHOCKGAUNTLET",
    "남두의권": "ITM_UNIQ_NAMDU",
    "비법서": "ITM_TOME_NAMDU",
    "hp앰플": "ITM_HP_AMPLE_LOW",
    "mp앰플": "ITM_MP_AMPLE_LOW",
    "영정": "ITM_ESSENCE",
}


def _norm(s: str) -> str:
    return "".join(str(s or "").lower().split())


# 이름(NAMES) + 별칭을 합쳐 정규화 키 → ID 사전 구성
_ALIAS_INDEX: dict[str, str] = {}
for _id, _name in NAMES.items():
    _ALIAS_INDEX[_norm(_name)] = _id
    _ALIAS_INDEX[_norm(_id)] = _id
_ALIAS_INDEX.update({_norm(k): v for k, v in _EXTRA_ALIASES.items()})


def is_item_id(value: str) -> bool:
    return isinstance(value, str) and value.startswith("ITM_")


def display_name(item: str) -> str:
    """ID면 이름으로, 아니면(자유 문자열) 그대로 반환."""
    return NAMES.get(item, item)


def slot_of(item_id: str) -> str | None:
    return EQUIP_SLOT.get(item_id)


def resolve_item(name: str) -> str | None:
    """GM이 준 자유 텍스트를 ITM_* ID로 해석. 못 찾으면 None(=단서/문자열 유지)."""
    if not name:
        return None
    if is_item_id(name):
        return name
    key = _norm(name)
    if key in _ALIAS_INDEX:
        return _ALIAS_INDEX[key]
    # 부분 일치: 입력이 아이템 이름을 포함하거나 그 반대
    for alias_key, item_id in _ALIAS_INDEX.items():
        if len(alias_key) >= 2 and (alias_key in key or key in alias_key):
            return item_id
    return None


def job_kit(job: str) -> dict:
    """직업 시작 지급 {weapon, items}. 모르는 직업이면 빈 키트."""
    return JOB_KITS.get(job, {"weapon": None, "items": []})
