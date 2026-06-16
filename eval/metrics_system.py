"""검문소 D: 시스템 지표 — TTFB · 완료율 · FPS (가이드 §2).

- TTFB: run_dialogue.py 가 문항별로 잰 ttfb_sec 를 모아 평균/분포.
- 완료율: game_sessions 에서 (엔딩 확정 세션 / 실제 플레이 세션) × 100.
          eval 이 만든 throwaway 세션은 user_id 가 NULL 이라 자동 제외된다.
- FPS: 브라우저 window.__fpsReport() 로 측정한 값을 --fps 로 넣는다(자동 측정 대상 아님).

출력: eval/outputs/system.json
"""
from __future__ import annotations

import argparse
import statistics
import sys

import common

sys.path.insert(0, str(common.PROJECT_DIR))


def _ttfb_stats() -> dict:
    path = common.OUT_DIR / "dialogue.jsonl"
    if not path.exists():
        return {"avg": None, "p95": None, "n": 0}
    rows = common.read_jsonl(path)
    vals = [r["ttfb_sec"] for r in rows if r.get("ttfb_sec") is not None]
    if not vals:
        return {"avg": None, "p95": None, "n": 0}
    vals_sorted = sorted(vals)
    p95 = vals_sorted[min(len(vals_sorted) - 1, int(round(0.95 * (len(vals_sorted) - 1))))]
    return {
        "avg": round(statistics.mean(vals), 3),
        "p95": round(p95, 3),
        "max": round(max(vals), 3),
        "n": len(vals),
        "target_sec": 1.5,
    }


def _completion_rate() -> dict:
    try:
        from db import get_conn
        with get_conn() as conn:
            total = conn.execute(
                "SELECT count(*) FROM game_sessions WHERE user_id IS NOT NULL"
            ).fetchone()[0]
            completed = conn.execute(
                "SELECT count(*) FROM game_sessions WHERE user_id IS NOT NULL AND ending IS NOT NULL"
            ).fetchone()[0]
    except Exception as exc:  # noqa: BLE001 - DB 미연결 시에도 나머지 지표는 낸다.
        return {"error": str(exc)}
    rate = round(100.0 * completed / total, 1) if total else None
    return {"total_sessions": total, "completed": completed, "rate_pct": rate, "target_pct": 80}


def run() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", type=float, default=None, help="브라우저에서 측정한 평균 FPS")
    ap.add_argument("--fps-keep-rate", type=float, default=None, help="30fps 이상 유지율(%)")
    args = ap.parse_args()
    common.ensure_dirs()

    out = {
        "ttfb": _ttfb_stats(),
        "completion": _completion_rate(),
        "fps": {
            "avg": args.fps,
            "keep_rate_30_pct": args.fps_keep_rate,
            "target_fps": 30,
            "note": "Character3D 의 window.__fpsReport() 값. dev 로거로 측정해 넣는다.",
        },
    }
    common.write_json(common.OUT_DIR / "system.json", out)
    print(f"저장: {common.OUT_DIR / 'system.json'}", flush=True)
    print(f"  TTFB avg {out['ttfb']['avg']}s / 완료율 {out['completion'].get('rate_pct')}% / FPS {args.fps}", flush=True)


if __name__ == "__main__":
    run()
