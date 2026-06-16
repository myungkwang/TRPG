"""도입(진료소 각성) 캐릭터 생성 로직.

데이터시트 '증기와비늘_데이터시트.xlsx'가 정본이다.
- 1_능력치판정: 포인트 분배제(기본 3, 추가 +15, 스탯당 상한 10, 총합 27)
- 2_재능계층: 영석 반응(끓음/잔잔/무감) → 3계층
- 3_직업: 5종 + 직업별 시작 장비

대사·연출은 docs/lore/07-캐릭터생성.md(RAG)에 있고,
여기는 답변 → 수치/상태로 바꾸는 결정적 로직만 담는다.
"""
from __future__ import annotations

import json
import items_catalog
from db import get_conn

# --- 능력치 (데이터시트 1_능력치판정) ---
STATS = ["str", "dex", "int_stat", "cha"]
BASE_STAT = 3      # 각 스탯 기본값
EXTRA_POINTS = 15  # 추가 분배 포인트
STAT_CAP = 10      # 스탯당 상한
# 총합 = 기본 3 × 4 + 추가 15 = 27

# --- 질문 → 결정 항목 매핑 ---

# "몸이 먼저 기억하는 게 있나요?" → 특화 능력치
SENSE_TO_STAT = {
    "주먹": "str",       # 완력
    "손끝": "dex",       # 손끝의 감각
    "계산": "int_stat",  # 머릿속 계산
    "혀끝": "cha",       # 혀끝의 말솜씨
}

# "영석에 손을 대면…?" → 재능계층 (2_재능계층)
ESSENCE_TO_TALENT = {
    "끓어오른다": "각성자",  # TAL_PURE  순수 마법사
    "잔잔하다": "반각자",    # TAL_DEVICE 술식기계 사용자
    "무감하다": "무감자",    # TAL_NONE  일반인
}

# 직업 5종 + 시작 장비는 items_catalog.JOB_KITS(ITM_* ID 기반)가 정본.
JOBS = list(items_catalog.JOB_KITS)

# 도입 종료 후 향하는 시작 장소 (9_이벤트씬 EVT_INTRO_END)
START_LOCATION = "재끝 진료소"

# 의사(AI GM)의 질문 시퀀스. free=자유 입력, options=선택형.
QUESTIONS = [
    {
        "id": "name",
        "field": "player_name",
        "free": True,
        "prompt": "이름이 기억나십니까…? 없으면 제가 부를 이름을 정하죠.",
    },
    {
        "id": "item",
        "field": "start_item",
        "free": True,
        "prompt": "정신을 잃기 전, 손에 무엇이 들려 있던 것 같습니까?",
    },
    {
        "id": "sense",
        "field": "primary_stat",
        "options": list(SENSE_TO_STAT),
        "prompt": "몸이 먼저 기억하는 게 있나요? 주먹입니까, 손끝의 감각입니까, "
                  "머릿속 계산입니까, 혀끝의 말입니까?",
    },
    {
        "id": "talent",
        "field": "talent_grade",
        "options": list(ESSENCE_TO_TALENT),
        "prompt": "영석에 손을 대면… 무엇이 느껴집니까? "
                  "끓어오릅니까, 잔잔합니까, 아무 느낌도 없습니까?",
    },
    {
        "id": "job",
        "field": "job",
        "options": JOBS,
        "prompt": "몸이 기억하는 손놀림이 있습니다. 어떤 무기가 가장 익숙합니까?",
    },
]


def allocate_stats(primary_stat: str) -> dict[str, int]:
    """특화 능력치를 중심으로 포인트 분배제(+15)를 적용한 권장 스탯블록.

    기본 3에서 특화 스탯에 +7(→10, 상한), 남은 8점을 나머지에 +3/+3/+2.
    총합은 항상 27 (= 기본 3×4 + 추가 15).
    """
    if primary_stat not in STATS:
        raise ValueError(f"unknown primary stat: {primary_stat}")

    stats = {s: BASE_STAT for s in STATS}

    primary_add = min(EXTRA_POINTS, STAT_CAP - BASE_STAT)  # 7
    stats[primary_stat] = BASE_STAT + primary_add

    remaining = EXTRA_POINTS - primary_add  # 8
    others = [s for s in STATS if s != primary_stat]
    spread = [3, 3, 2]
    for stat, add in zip(others, spread):
        stats[stat] = min(STAT_CAP, stats[stat] + add)
        remaining -= add

    return stats


def build_character(answers: dict[str, str]) -> dict:
    """질문 답변(dict: 질문id → 답)을 캐릭터 상태로 변환한다.

    answers 예시:
        {"name": "카이", "item": "낡은 회중시계",
         "sense": "주먹", "talent": "잔잔하다", "job": "증기 갑주병"}
    """
    primary_stat = SENSE_TO_STAT[answers["sense"]]
    talent = ESSENCE_TO_TALENT[answers["talent"]]
    job = answers["job"]
    if job not in items_catalog.JOB_KITS:
        raise ValueError(f"unknown job: {job}")

    stats = allocate_stats(primary_stat)

    # 직업 선택 → ITM_* ID로 시작 지급. T1 유일무기는 자동 장착하되, 가방에도 둔다.
    kit = items_catalog.job_kit(job)
    weapon = kit.get("weapon")
    equipment = {"head": None, "body": None, "weapon": weapon}
    bag = list(items_catalog.START_COMMON)
    if weapon:
        bag.append(weapon)                   # 기본(장착)무기도 인벤토리에 표시
    # 장착 시연용: 어떤 직업이든 숏 소드 하나는 무조건 가방에
    if "ITM_UNIQ_SHORTSWORD" not in bag:
        bag.append("ITM_UNIQ_SHORTSWORD")
    for item_id in kit.get("items", []):
        slot = items_catalog.slot_of(item_id)
        if slot in ("head", "body") and equipment.get(slot) is None:
            equipment[slot] = item_id        # 직업 장비(머리/몸통) 자동 장착
        else:
            bag.append(item_id)
    # 도입 자유 답변('손에 들려 있던 것') — 유품 문자열로 가방에 남긴다.
    start_item = (answers.get("item") or "").strip()
    if start_item:
        bag.append(start_item)

    inventory = {
        "동화": 30, "은화": 0, "금화": 0, "영정": 1,
        "items": bag,
        "equipment": equipment,
    }

    return {
        "player_name": (answers.get("name") or "").strip() or "이름 없는 자",
        "str": stats["str"],
        "dex": stats["dex"],
        "int_stat": stats["int_stat"],
        "cha": stats["cha"],
        "primary_stat": primary_stat,
        "talent_grade": talent,
        "job": job,
        "location": START_LOCATION,
        "inventory": inventory,
    }


def apply_character(session_id: str, character: dict) -> None:
    """생성된 캐릭터를 game_sessions에 기록한다."""
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE game_sessions
            SET player_name = %s,
                str = %s, dex = %s, int_stat = %s, cha = %s,
                talent_grade = %s, job = %s, location = %s,
                inventory = %s, updated_at = now()
            WHERE id = %s
            """,
            (
                character["player_name"],
                character["str"], character["dex"],
                character["int_stat"], character["cha"],
                character["talent_grade"], character["job"],
                character["location"],
                json.dumps(character["inventory"], ensure_ascii=False),
                session_id,
            ),
        )


def create_character(session_id: str, answers: dict[str, str]) -> dict:
    """답변 → 캐릭터 빌드 → DB 반영을 한 번에. 빌드된 캐릭터를 돌려준다."""
    character = build_character(answers)
    apply_character(session_id, character)
    return character
