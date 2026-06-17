"""검문소 A(멀티턴) 준비: 한 세션에서 여러 턴을 이어 보내 대화 전사(transcript)를 모은다.

단일턴 run_dialogue.py 와 달리, 대화 하나당 세션 1개를 만들고 turns 를 순서대로 보낸다.
긴 대화에서 톤/페르소나가 흐트러지는지(드리프트), 앞 턴 내용을 기억하는지를 보기 위함.

입력:  eval/testset_multiturn.jsonl  ({id, category, turns:[...], expected})
출력:  eval/outputs/dialogue_multiturn.jsonl
       ({id, category, expected, transcript:[{turn,input,output}], error})
"""
from __future__ import annotations

import sys
import traceback

import common

sys.path.insert(0, str(common.PROJECT_DIR))

MT_TESTSET = common.EVAL_DIR / "testset_multiturn.jsonl"


def run() -> None:
    common.ensure_dirs()
    from gm_cli import create_session, gm_reply

    convos = common.read_jsonl(MT_TESTSET)
    rows: list[dict] = []

    for convo in convos:
        cid = convo["id"]
        row = {
            "id": cid,
            "category": convo.get("category"),
            "expected": convo.get("expected"),
            "transcript": [],
            "error": None,
        }
        try:
            session_id = create_session()  # 대화 하나 = 세션 하나(턴 간 맥락 유지)
            for i, user_input in enumerate(convo.get("turns", []), start=1):
                result = gm_reply(session_id, user_input)
                row["transcript"].append({
                    "turn": i,
                    "input": user_input,
                    "output": result.get("answer", ""),
                })
        except Exception as exc:  # noqa: BLE001
            row["error"] = f"{exc}"
            traceback.print_exc()
        status = "ok" if not row["error"] else "ERR"
        print(f"[{status}] id={cid} turns={len(row['transcript'])}", flush=True)
        rows.append(row)

    out_path = common.OUT_DIR / "dialogue_multiturn.jsonl"
    common.write_jsonl(out_path, rows)
    ok = sum(1 for r in rows if not r["error"])
    print(f"\n저장: {out_path}  성공 {ok}/{len(rows)}", flush=True)


if __name__ == "__main__":
    run()
