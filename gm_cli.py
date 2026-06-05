from __future__ import annotations

import json
import uuid
from db import get_conn
from llm import chat
from rag import retrieve_context
from game_logic import roll_check

SYSTEM_PROMPT = """
너는 한국어 AI TRPG 게임 '증기와 비늘'의 AI 게임마스터다.
반드시 지켜야 할 규칙:
1. 제공된 RAG 컨텍스트를 세계관의 정본(canon)으로 우선한다.
2. 모르는 설정은 단정하지 말고, 세계관에 어울리게 작게 보완한다.
3. 플레이어의 자유 입력을 존중하되, 핵심 사건 비트와 결말로 자연스럽게 유도한다.
4. 판정 결과가 있으면 성공/실패를 서사에 반영한다.
5. NPC는 목적과 비밀을 가진 인격처럼 말한다. 린은 거짓과 진실을 섞을 수 있다.
6. 응답은 4~8문장 정도로 짧게 유지하고, 마지막에는 플레이어가 할 수 있는 행동을 열어둔다.
""".strip()


def create_session() -> str:
    session_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute("INSERT INTO game_sessions(id) VALUES (%s)", (session_id,))
    return session_id


def load_session(session_id: str) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM game_sessions WHERE id = %s", (session_id,)).fetchone()
        cols = [desc.name for desc in conn.execute("SELECT * FROM game_sessions LIMIT 0").description]
    if not row:
        raise RuntimeError("session not found")
    return dict(zip(cols, row))


def save_event(session_id: str, role: str, content: str, metadata: dict | None = None) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO game_events(session_id, role, content, metadata) VALUES (%s, %s, %s, %s)",
            (session_id, role, content, json.dumps(metadata or {}, ensure_ascii=False)),
        )


def recent_history(session_id: str, limit: int = 8) -> list[dict[str, str]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT role, content FROM game_events
            WHERE session_id = %s
            ORDER BY id DESC
            LIMIT %s
            """,
            (session_id, limit),
        ).fetchall()
    return [{"role": r[0], "content": r[1]} for r in reversed(rows)]


def gm_reply(session_id: str, user_input: str) -> str:
    session = load_session(session_id)
    check = roll_check(user_input, session)
    contexts = retrieve_context(user_input, limit=5)

    context_text = "\n\n".join(
        f"[출처:{c['document_title']} / {c['section_title']} / 유사도:{c['similarity']:.3f}]\n{c['content']}"
        for c in contexts
    )

    check_text = "판정 없음"
    if check.required:
        check_text = (
            f"판정: d12={check.roll}, 능력치={check.stat}, 능력치보정={check.stat_bonus}, "
            f"직업보정={check.job_bonus}, 합계={check.total}, DC={check.dc}, "
            f"결과={'성공' if check.success else '실패'}"
        )

    state_text = json.dumps(
        {
            "location": session["location"],
            "hp": session["hp"],
            "mp": session["mp"],
            "stamina": session["stamina"],
            "stats": {
                "힘": session["str"],
                "민첩": session["dex"],
                "지능": session["int_stat"],
                "매력": session["cha"],
            },
            "talent_grade": session["talent_grade"],
            "job": session["job"],
            "inventory": session["inventory"],
            "flags": session["flags"],
            "relations": session["relations"],
        },
        ensure_ascii=False,
        default=str,
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"현재 세션 상태:\n{state_text}"},
        {"role": "system", "content": f"RAG 컨텍스트:\n{context_text}"},
        {"role": "system", "content": f"이번 입력의 코드 판정 결과:\n{check_text}"},
        *recent_history(session_id),
        {"role": "user", "content": user_input},
    ]

    answer = chat(messages)
    save_event(session_id, "user", user_input, {"check": check.__dict__})
    save_event(session_id, "assistant", answer, {"contexts": contexts})
    return answer


def main() -> None:
    session_id = create_session()
    print(f"새 세션: {session_id}")
    print("AI GM 테스트를 시작합니다. 종료하려면 /quit 입력")

    while True:
        user_input = input("\n플레이어> ").strip()
        if user_input in {"/quit", "종료", "exit"}:
            break
        if not user_input:
            continue
        print("\nGM>")
        print(gm_reply(session_id, user_input))

if __name__ == "__main__":
    main()
