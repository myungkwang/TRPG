"""노멀엔딩까지 자동 플레이 — 신뢰성·게이트 검증용 (일회성 테스트 스크립트)."""
from __future__ import annotations

import json
import os

os.environ["GM_DEBUG"] = "1"  # 도구호출 콘솔 출력

from db import get_conn
import gm_cli
import progression
import endings


def show_schema():
    with get_conn() as c:
        cols = c.execute(
            "SELECT column_name, column_default FROM information_schema.columns "
            "WHERE table_name='game_sessions' ORDER BY ordinal_position"
        ).fetchall()
    print("[스키마] game_sessions 컬럼/기본값:")
    for n, d in cols:
        print(f"   {n} = {d}")


def setup_character(sid: str):
    """능력치/직업이 없으면 판정이 깨지므로 표준 캐릭터로 채운다."""
    with get_conn() as c:
        c.execute(
            "UPDATE game_sessions SET str=%s, dex=%s, int_stat=%s, cha=%s, "
            "job=%s, talent_grade=%s, hp=%s, mp=%s, stamina=%s, location=%s "
            "WHERE id=%s",
            (4, 4, 6, 4, "영석 연금술사", "B", 20, 10, 10, "진료소", sid),
        )


def dump_state(sid: str, label: str):
    st = progression.load_state(sid)
    flags = progression.as_dict(st["flags"])
    on = [k for k, v in flags.items() if v]
    pct = progression.progress_pct(flags)
    print(f"\n----- 상태[{label}] 진행도 {pct}% -----")
    print("  켜진 플래그/이벤트:", ", ".join(on) or "(없음)")
    print("  관계:", progression.as_dict(st["relations"]))
    ending = endings.check_session_ending(sid)
    print("  현재 열린 엔딩:", ending["name"] if ending else "(아직 없음)")
    return ending


# 노멀엔딩(EVT_PEAK_CONFRONT + FLG_KARGAS_ALLY) 향한 플레이어 입력 시퀀스
TURNS = [
    "여기가 어디지? 의사에게 무슨 일이 있었는지 묻는다.",
    "마을로 나가 광산 입구를 조사한다. 사라진 광부들에 대해 알아본다.",
    "감독 가일을 찾아가 실종된 광부 명부를 보여달라고 따진다.",
    "밤에 마을을 관찰하며 봉우리 쪽의 이상한 그림자를 살핀다.",
    "노파 마르타를 찾아가 봉우리의 옛 전설을 듣는다.",
    "갱도 심부로 직접 내려가 진실을 확인한다.",
    "여관에서 여우 린과 만나 정보를 거래한다.",
    "봉우리로 올라가 태고의 드래곤 카르가스와 대면한다.",
    "카르가스를 설득해 영석 채굴을 멈추기로 합의한다. 전쟁을 막는다.",
]


def main():
    show_schema()
    sid = gm_cli.create_session()
    setup_character(sid)
    print(f"\n새 세션: {sid}\n캐릭터: 영석 연금술사 / 지능6")

    reached = None
    for i, ui in enumerate(TURNS, 1):
        print(f"\n========== 턴 {i} ==========")
        print(f"[플레이어] {ui}")
        try:
            res = gm_cli.gm_reply(sid, ui)
        except Exception as exc:
            print("!! gm_reply 예외:", repr(exc))
            break
        ans = res["answer"][:400]
        print(f"[GM] {ans}{'...' if len(res['answer'])>400 else ''}")
        if res["choices"]:
            print("  선택지:", " | ".join(res["choices"]))
        ending = dump_state(sid, f"턴{i} 후")
        if ending and not reached:
            reached = ending
            print(f"\n>>> 엔딩 트리거됨: {ending['name']} (턴 {i})")

    print("\n========== 정산 (generate_ending) ==========")
    final = gm_cli.generate_ending(sid)
    print("종류:", final.get("kind"), "/ id:", final.get("id"),
          "/ 이름:", final.get("name"), "/ 진행도:", final.get("progress"))
    print("엔딩 텍스트:\n", (final.get("text") or "")[:600])

    print("\n========== 검증 요약 ==========")
    st = progression.load_state(sid)
    flags = progression.as_dict(st["flags"])
    print("  EVT_PEAK_CONFRONT:", flags.get("EVT_PEAK_CONFRONT"))
    print("  FLG_KARGAS_ALLY  :", flags.get("FLG_KARGAS_ALLY"))
    print("  노멀 조건 충족   :", bool(flags.get("EVT_PEAK_CONFRONT") and flags.get("FLG_KARGAS_ALLY")))
    print("  최종 엔딩 id     :", final.get("id"))


if __name__ == "__main__":
    main()
