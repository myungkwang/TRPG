"""검문소 A: GPT-4o 채점관으로 대화 품질을 1~5점 채점한다 (가이드 §3).

- 채점관 모델은 응답모델과 다른 모델을 권장(가이드). 기본 gpt-4o, temperature=0.
- 같은 응답을 EVAL_JUDGE_REPEAT(기본 3)회 채점해 평균(편차↓).
- 페르소나 설정으로 제품의 GM SYSTEM_PROMPT 를 그대로 넣어 일관성을 본다.

입력:  eval/outputs/dialogue.jsonl  (run_dialogue.py 산출)
출력:  eval/outputs/g_eval.json
"""
from __future__ import annotations

import json
import sys

import common

sys.path.insert(0, str(common.PROJECT_DIR))

JUDGE_PROMPT = """당신은 엄격한 대화 평가자입니다. 아래 기준으로 1~5점 채점하세요.

[평가 항목]
- 페르소나 일관성: 정해진 게임마스터 말투/성격/규칙(화자 라벨, 선택지 형식, 세계관)을 유지했는가
- 유용성: 사용자 의도를 해결했는가(엣지/위험 입력은 적절히 되묻거나 거절하는 것이 유용함)
- 자연스러움: 사람 게임마스터와 대화하는 느낌인가

[채점 규칙]
1점=전혀 아님 ... 5점=완벽. 근거를 1문장으로 먼저 쓰고 점수를 낸다.

[페르소나 설정]
{persona}

[이 문항의 기대 동작]
{expected}

[대화]
사용자: {input}
AI휴먼(GM): {output}

JSON으로만 출력:
{{"reason":"...", "consistency":n, "usefulness":n, "naturalness":n}}
"""


def _persona_summary() -> str:
    """제품 GM 시스템 프롬프트를 페르소나 설정으로 사용(요약 없이 원본)."""
    try:
        from gm_cli import SYSTEM_PROMPT
        return SYSTEM_PROMPT
    except Exception:
        return "한국어 AI TRPG '증기와 비늘'의 게임마스터. 화자 라벨과 선택지 형식을 지킨다."


def _make_judge():
    from openai import OpenAI
    return OpenAI()


def _score_once(client, model, persona, item) -> dict:
    prompt = JUDGE_PROMPT.format(
        persona=persona,
        expected=item.get("expected", ""),
        input=item.get("input", ""),
        output=item.get("output", ""),
    )
    r = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        response_format={"type": "json_object"},
    )
    return json.loads(r.choices[0].message.content)


def _avg(vals: list[float]) -> float | None:
    vals = [v for v in vals if isinstance(v, (int, float))]
    return round(sum(vals) / len(vals), 3) if vals else None


def run() -> None:
    common.ensure_dirs()
    model = common.env("EVAL_JUDGE_MODEL", "gpt-4o")
    repeat = int(common.env("EVAL_JUDGE_REPEAT", "3") or "3")
    persona = _persona_summary()
    client = _make_judge()

    dialogue = common.read_jsonl(common.OUT_DIR / "dialogue.jsonl")
    results: list[dict] = []

    for item in dialogue:
        if item.get("error") or not item.get("output"):
            results.append({"id": item["id"], "category": item.get("category"), "skipped": True})
            print(f"[skip] id={item['id']} (no output)", flush=True)
            continue
        runs = []
        for _ in range(repeat):
            try:
                runs.append(_score_once(client, model, persona, item))
            except Exception as exc:  # noqa: BLE001
                print(f"[warn] id={item['id']} judge fail: {exc}", flush=True)
        rec = {
            "id": item["id"],
            "category": item.get("category"),
            "consistency": _avg([r.get("consistency") for r in runs]),
            "usefulness": _avg([r.get("usefulness") for r in runs]),
            "naturalness": _avg([r.get("naturalness") for r in runs]),
            "runs": runs,
        }
        results.append(rec)
        print(f"[ok] id={item['id']} c={rec['consistency']} u={rec['usefulness']} n={rec['naturalness']}", flush=True)

    scored = [r for r in results if not r.get("skipped")]

    def overall(key: str) -> float | None:
        return _avg([r[key] for r in scored if r.get(key) is not None])

    summary = {
        "judge_model": model,
        "repeat": repeat,
        "n_items": len(dialogue),
        "n_scored": len(scored),
        "consistency_avg": overall("consistency"),
        "usefulness_avg": overall("usefulness"),
        "naturalness_avg": overall("naturalness"),
        "by_category": {},
    }
    for cat in sorted({r.get("category") for r in scored if r.get("category")}):
        rows = [r for r in scored if r.get("category") == cat]
        summary["by_category"][cat] = {
            "consistency": _avg([r["consistency"] for r in rows if r.get("consistency") is not None]),
            "usefulness": _avg([r["usefulness"] for r in rows if r.get("usefulness") is not None]),
            "naturalness": _avg([r["naturalness"] for r in rows if r.get("naturalness") is not None]),
        }

    out = {"summary": summary, "items": results}
    common.write_json(common.OUT_DIR / "g_eval.json", out)
    print(f"\n저장: {common.OUT_DIR / 'g_eval.json'}", flush=True)
    print(f"  일관성 {summary['consistency_avg']} / 유용성 {summary['usefulness_avg']} / 자연스러움 {summary['naturalness_avg']}", flush=True)


if __name__ == "__main__":
    run()
