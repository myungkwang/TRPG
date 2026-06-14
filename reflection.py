"""비동기 성찰 패스 — AI가 자기 서술을 다시 읽고, 발생한 핵심 비트를 스스로 판단해
진행 플래그/이벤트를 기록한다.

키워드 하드코딩이 아니다. 모델이 '방금 일어난 장면'을 읽고 어떤 비트가 달성됐는지
직접 판단한다(AI 판단 유지). 서사 생성과 상태 판단을 한 번에 처리하기 버거운
모델(gpt-4o-mini)을 위해 일을 둘로 쪼갠다:
  1차 = gm_reply 의 서사 생성 + 도구호출(모델이 부를 때만)
  2차 = 여기. 1차에서 모델이 빠뜨린 상태 변경을 자기 서술을 근거로 보완.

플래그는 엔딩 정산(generate_ending) 때만 쓰이므로, 성찰은 백그라운드 스레드로 돌려
플레이어 응답의 실시간성을 해치지 않는다. (GM_REFLECT_SYNC 설정 시 동기 실행 — 테스트용)
"""
from __future__ import annotations

import json
import os
import threading

from llm import chat
import progression
import codex


def _catalog() -> str:
    """모델에게 줄, 기록 가능한 비트 목록(설명 포함)."""
    lines = ["[이벤트 노드]"]
    for k, v in progression.EVENT_NODES.items():
        lines.append(f"- {k}: {v}")
    lines.append("[진행 플래그]")
    for k, v in progression.FLAGS.items():
        lines.append(f"- {k}: {v}")
    return "\n".join(lines)


REFLECT_SYSTEM = """
너는 '증기와 비늘' TRPG의 진행 판정 보조자다.
방금 GM이 출력한 '장면'을 읽고, 그 장면에서 플레이어가 실제로 도달/달성한
핵심 비트(이벤트 노드 / 진행 플래그)가 있는지 판단하라.

규칙:
- 장면에서 '실제로 일어난' 것만 기록한다. 단순 언급·예고·가능성은 제외.
- 부정/실패/거부/결렬로 끝난 일은 기록하지 않는다.
- 이미 켜진 비트는 다시 넣지 않는다.
- 확실하지 않으면 넣지 않는다(과기록 금지).
- FLG_LIN_PLOT_SEEN은 린을 단순히 의심한 장면이 아니라, 린의 말 모순과
  은폐된 명부/암시장 장부/영정 흐름이 연결되어 그녀의 이중 공작이 실제로
  드러난 장면에서만 기록한다.

반드시 아래 JSON만 출력한다(다른 말 없이):
{"events": ["EVT_..."], "flags": ["FLG_..."]}
해당 없으면 {"events": [], "flags": []}
""".strip()


def _parse(raw: str) -> dict:
    """모델 출력에서 JSON을 안전하게 뽑고, 알려진 ID만 남긴다."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1:
        return {"events": [], "flags": []}
    try:
        data = json.loads(text[s:e + 1])
    except json.JSONDecodeError:
        return {"events": [], "flags": []}
    events = [x for x in data.get("events", []) if x in progression.EVENT_NODES]
    flags = [x for x in data.get("flags", []) if x in progression.FLAGS]
    return {"events": events, "flags": flags}


def decide_beats(session_id: str, user_input: str, narration: str) -> dict:
    """모델에게 장면을 읽혀 발생한 비트를 판단시킨다. {'events':[], 'flags':[]} 반환."""
    flags = progression.get_session_flags(session_id) or {}
    on = [k for k, v in flags.items() if v]
    messages = [
        {"role": "system", "content": REFLECT_SYSTEM},
        {"role": "system", "content": "기록 가능한 비트 목록:\n" + _catalog()},
        {"role": "system",
         "content": "이미 켜진 비트(다시 넣지 말 것): " + (", ".join(on) or "(없음)")},
        {"role": "user",
         "content": f"[플레이어 입력]\n{user_input}\n\n[GM 장면]\n{narration}"},
    ]
    # temperature=0: 판정은 일관성 우선
    raw = chat(messages, temperature=0)
    return _parse(raw)


def apply_beats(session_id: str, decided: dict) -> list[str]:
    """판단된 비트를 실제로 켠다. 이미 켜진 건 건너뛴다. 새로 켜진 ID 목록 반환."""
    flags = progression.get_session_flags(session_id) or {}
    fired: list[str] = []
    for ev in decided.get("events", []):
        if not flags.get(ev):
            progression.visit_event(session_id, ev)
            fired.append(ev)
    for fl in decided.get("flags", []):
        if not flags.get(fl):
            progression.set_flag(session_id, fl, True)
            fired.append(fl)
    if fired:
        try:
            codex.sync_clues_from_session(session_id)
        except Exception:
            pass
    return fired


def reflect_and_apply(session_id: str, user_input: str, narration: str) -> list[str]:
    """성찰 패스 본체: 모델 판단 → 적용. 새로 켜진 비트 ID 목록 반환."""
    try:
        decided = decide_beats(session_id, user_input, narration)
        fired = apply_beats(session_id, decided)
        if fired and os.getenv("GM_DEBUG"):
            print(f"   · [성찰] 비트 기록: {fired}", flush=True)
        return fired
    except Exception as exc:
        if os.getenv("GM_DEBUG"):
            print(f"   · [성찰] 실패: {exc!r}", flush=True)
        return []


def dispatch(session_id: str, user_input: str, narration: str) -> None:
    """성찰 패스를 비동기로(백그라운드 데몬 스레드) 실행한다 — 실시간성 보호.

    GM_REFLECT_SYNC 가 설정되면 동기로 실행한다(테스트·재현용).
    """
    if os.getenv("GM_REFLECT_SYNC"):
        reflect_and_apply(session_id, user_input, narration)
        return
    threading.Thread(
        target=reflect_and_apply,
        args=(session_id, user_input, narration),
        daemon=True,
    ).start()
