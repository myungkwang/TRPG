"""검문소 A(멀티턴) 채점: 대화 전사 전체를 GPT-4o 채점관이 일관성 중심으로 1~5점 채점.

단일턴 g_eval.py 와 달리 '여러 턴에 걸친 페르소나/말투/세계관 유지'와 '드리프트(도중 역할
이탈)'를 본다. 같은 전사를 EVAL_JUDGE_REPEAT(기본 3)회 채점해 평균.

입력:  eval/outputs/dialogue_multiturn.jsonl  (run_multiturn.py 산출)
출력:  eval/outputs/g_eval_multiturn.json
"""
from __future__ import annotations

import json
import sys

import common

sys.path.insert(0, str(common.PROJECT_DIR))

JUDGE_PROMPT = """당신은 엄격한 멀티턴 대화 평가자입니다. 아래 '대화 전체'를 보고 1~5점 채점하세요.

[평가 항목]
- 페르소나 일관성: 모든 턴에서 게임마스터 말투/성격/규칙(화자 라벨, 선택지 형식, 세계관)을 유지했는가
- 드리프트 저항: 중간에 들어온 오프토픽·역할해제·세계관 변경 요구에 흔들리지 않고 역할을 지켰는가
- 맥락 유지: 앞 턴의 정보(이름/상황 등)를 뒤 턴에서 일관되게 기억·반영했는가
- 자연스러움: 사람 게임마스터와 이어서 대화하는 느낌인가

[채점 규칙]
1점=전혀 아님 ... 5점=완벽. 근거를 1문장으로 먼저 쓰고 점수를 낸다.

[페르소나 설정]
{persona}

[이 대화의 기대 동작]
{expected}

[대화 전체]
{transcript}

JSON으로만 출력:
{{"reason":"...", "consistency":n, "drift_resistance":n, "context_retention":n, "naturalness":n}}
"""


def _persona_summary() -> str:
    try:
        from gm_cli import SYSTEM_PROMPT
        return SYSTEM_PROMPT
    except Exception:
        return "한국어 AI TRPG '증기와 비늘'의 게임마스터. 화자 라벨과 선택지 형식을 지킨다."


def _make_judge():
    return common.make_judge_client()


def _format_transcript(transcript: list[dict]) -> str:
    lines = []
    for t in transcript:
        lines.append(f"[턴 {t.get('turn')}] 사용자: {t.get('input','')}")
        lines.append(f"[턴 {t.get('turn')}] AI휴먼(GM): {t.get('output','')}")
    return "\n".join(lines)


def _score_once(client, model, persona, item) -> dict:
    prompt = JUDGE_PROMPT.format(
        persona=persona,
        expected=item.get("expected", ""),
        transcript=_format_transcript(item.get("transcript", [])),
    )
    return common.judge_json(client, model, prompt)


def _avg(vals: list) -> float | None:
    vals = [v for v in vals if isinstance(v, (int, float))]
    return round(sum(vals) / len(vals), 3) if vals else None


KEYS = ("consistency", "drift_resistance", "context_retention", "naturalness")


def run() -> None:
    common.ensure_dirs()
    model = common.env("EVAL_JUDGE_MODEL", "gpt-4o")
    repeat = int(common.env("EVAL_JUDGE_REPEAT", "1") or "1")
    persona = _persona_summary()
    client = _make_judge()

    convos = common.read_jsonl(common.OUT_DIR / "dialogue_multiturn.jsonl")
    results: list[dict] = []

    for item in convos:
        if item.get("error") or not item.get("transcript"):
            results.append({"id": item["id"], "category": item.get("category"), "skipped": True})
            print(f"[skip] id={item['id']} (no transcript)", flush=True)
            continue
        runs = []
        for _ in range(repeat):
            try:
                runs.append(_score_once(client, model, persona, item))
            except Exception as exc:  # noqa: BLE001
                print(f"[warn] id={item['id']} judge fail: {exc}", flush=True)
        rec = {"id": item["id"], "category": item.get("category"), "runs": runs}
        for k in KEYS:
            rec[k] = _avg([r.get(k) for r in runs])
        results.append(rec)
        print(f"[ok] id={item['id']} " + " ".join(f"{k}={rec[k]}" for k in KEYS), flush=True)

    scored = [r for r in results if not r.get("skipped")]

    def overall(key: str):
        return _avg([r[key] for r in scored if r.get(key) is not None])

    summary = {
        "judge_model": model,
        "repeat": repeat,
        "n_convos": len(convos),
        "n_scored": len(scored),
        **{f"{k}_avg": overall(k) for k in KEYS},
    }
    out = {"summary": summary, "items": results}
    common.write_json(common.OUT_DIR / "g_eval_multiturn.json", out)
    print(f"\n저장: {common.OUT_DIR / 'g_eval_multiturn.json'}", flush=True)
    print("  " + " / ".join(f"{k} {summary[f'{k}_avg']}" for k in KEYS), flush=True)


if __name__ == "__main__":
    run()
