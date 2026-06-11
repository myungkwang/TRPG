from __future__ import annotations

import random
from dataclasses import dataclass

STAT_KEYWORDS = {
    "cha": ["설득", "교섭", "협상", "대화", "속이다", "회유"],
    "dex": ["잠입", "회피", "몰래", "정찰", "도망", "숨다"],
    "int_stat": ["해독", "분석", "관찰", "조사", "기계", "술식", "간파"],
    "str": ["힘", "돌파", "부수", "버티", "들어올", "막다"],
}

# 데이터시트 3_직업의 '유리한 판정' 기준: 직업과 맞는 판정이면 +2, 무관하면 +0.
JOB_FAVORED_STAT = {
    "증기 갑주병": "str",      # 정면 돌파, 완력, 방어
    "변경 탐사꾼": "dex",      # 잠입, 정찰, 함정
    "메카닉": "int_stat",      # 기계 해독, 수리, 조작
    "영석 인파이터": "str",    # 근접 격투
    "영석 연금술사": "int_stat",  # 영석, 술식, 마법 해석
}

JOB_MATCH_BONUS = 2

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


def perform_roll(session: dict, stat: str, dc: int) -> CheckResult:
    """AI GM이 roll_check 도구로 지정한 stat/dc를 그대로 판정한다.

    공식은 키워드 방식과 동일: d12 + 내림(능력치÷2) + 직업 보정.
    """
    roll = random.randint(1, 12)
    stat_bonus = int(session.get(stat, 0)) // 2
    job = session.get("job", "")
    job_bonus = JOB_MATCH_BONUS if JOB_FAVORED_STAT.get(job) == stat else 0
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


def roll_check(user_input: str, session: dict) -> CheckResult:
    required, stat, dc = infer_check(user_input)
    if not required or stat is None:
        return CheckResult(required=False)

    roll = random.randint(1, 12)
    # 데이터시트 1_능력치판정: 보정 = 내림(능력치 ÷ 2)
    stat_bonus = int(session.get(stat, 0)) // 2
    job = session.get("job", "")
    job_bonus = JOB_MATCH_BONUS if JOB_FAVORED_STAT.get(job) == stat else 0
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
