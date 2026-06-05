from __future__ import annotations

import random
from dataclasses import dataclass

STAT_KEYWORDS = {
    "cha": ["설득", "교섭", "협상", "대화", "속이다", "회유"],
    "dex": ["잠입", "회피", "몰래", "정찰", "도망", "숨다"],
    "int_stat": ["해독", "분석", "관찰", "조사", "기계", "술식", "간파"],
    "str": ["힘", "돌파", "부수", "버티", "들어올", "막다"],
}

JOB_BONUS = {
    "변경 탐사꾼": {"dex": 2, "int_stat": 1},
    "메카닉": {"int_stat": 2},
    "증기 갑주병": {"str": 2},
    "영석 인파이터": {"str": 1, "dex": 1},
    "영석 연금술사": {"int_stat": 1, "cha": 1},
}

DC_BY_RISK = {
    "easy": 5,
    "normal": 8,
    "hard": 11,
    "very_hard": 14,
    "nearly_impossible": 15,
}

@dataclass
class CheckResult:
    required: bool
    stat: str | None = None
    dc: int | None = None
    roll: int | None = None
    stat_bonus: int = 0
    job_bonus: int = 0
    total: int | None = None
    success: bool | None = None


def infer_check(user_input: str) -> tuple[bool, str | None, int]:
    text = user_input.lower()
    for stat, keywords in STAT_KEYWORDS.items():
        if any(k in text for k in keywords):
            # 기본은 보통. 위험/용/전투성 표현이 있으면 어려움.
            dc = DC_BY_RISK["hard"] if any(k in text for k in ["용", "카르가스", "전투", "정면", "위험"]) else DC_BY_RISK["normal"]
            return True, stat, dc
    return False, None, 0


def roll_check(user_input: str, session: dict) -> CheckResult:
    required, stat, dc = infer_check(user_input)
    if not required or stat is None:
        return CheckResult(required=False)

    roll = random.randint(1, 12)
    stat_bonus = int(session.get(stat, 0))
    job = session.get("job", "")
    job_bonus = JOB_BONUS.get(job, {}).get(stat, 0)
    total = roll + stat_bonus + job_bonus
    return CheckResult(
        required=True,
        stat=stat,
        dc=dc,
        roll=roll,
        stat_bonus=stat_bonus,
        job_bonus=job_bonus,
        total=total,
        success=total >= dc,
    )
