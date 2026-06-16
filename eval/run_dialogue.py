"""검문소 A 준비 단계: testset 을 제품 GM(블랙박스)에 통과시켜 응답을 모은다.

제품의 gm_reply 를 직접 import 해서 호출한다(인증 불필요, 실제 시스템 그대로).
각 문항마다 새 세션을 만들어 단일턴으로 보낸다. TTFB(첫 응답까지 시간)도 같이 잰다.

출력: eval/outputs/dialogue.jsonl  ({id, category, input, expected, output, ttfb_sec, error})
"""
from __future__ import annotations

import sys
import time
import traceback

import common

# 제품 모듈을 import 하려면 프로젝트 루트가 path 에 있어야 한다.
sys.path.insert(0, str(common.PROJECT_DIR))


def run() -> None:
    common.ensure_dirs()
    # import 는 여기서(무거운 의존성 로드를 실행 시점으로 미룸).
    from gm_cli import create_session, gm_reply, gm_reply_stream

    testset = common.load_testset()
    rows: list[dict] = []

    for item in testset:
        rid = item["id"]
        user_input = item.get("input", "")
        row = {
            "id": rid,
            "category": item.get("category"),
            "input": user_input,
            "expected": item.get("expected"),
            "output": "",
            "ttfb_sec": None,
            "error": None,
        }
        try:
            session_id = create_session()
            # TTFB: 첫 segment 이벤트(첫 서술 조각)가 나오는 순간까지. (가이드 §2-1)
            t_start = time.time()
            first_seen = False
            for ev in gm_reply_stream(session_id, user_input):
                etype = ev.get("type")
                if etype == "segment" and not first_seen:
                    row["ttfb_sec"] = round(time.time() - t_start, 3)
                    first_seen = True
                if etype == "final" and ev.get("answer"):
                    row["output"] = ev["answer"]
            # 스트림이 답을 못 주면 비스트리밍으로 폴백.
            if not row["output"]:
                result = gm_reply(create_session(), user_input)
                row["output"] = result.get("answer", "")
        except Exception as exc:  # noqa: BLE001 - 한 문항 실패가 전체를 막지 않게.
            row["error"] = f"{exc}"
            traceback.print_exc()
        status = "ok" if not row["error"] else "ERR"
        print(f"[{status}] id={rid} ttfb={row['ttfb_sec']} len={len(row['output'])}", flush=True)
        rows.append(row)

    out_path = common.OUT_DIR / "dialogue.jsonl"
    common.write_jsonl(out_path, rows)
    ok = sum(1 for r in rows if not r["error"])
    ttfbs = [r["ttfb_sec"] for r in rows if r["ttfb_sec"] is not None]
    avg_ttfb = round(sum(ttfbs) / len(ttfbs), 3) if ttfbs else None
    print(f"\n저장: {out_path}  성공 {ok}/{len(rows)}  평균 TTFB {avg_ttfb}s", flush=True)


if __name__ == "__main__":
    run()
