"""전 검문소 결과를 모아 가이드 §7 최종 평가표(markdown)를 만든다.

입력(있는 것만 사용): outputs/{g_eval,speech,lipsync,system}.json
출력: eval/outputs/report.md
"""
from __future__ import annotations

import common


def _g(obj, *keys, default=None):
    for k in keys:
        if not isinstance(obj, dict):
            return default
        obj = obj.get(k)
    return obj if obj is not None else default


def _load(name: str):
    path = common.OUT_DIR / name
    return common.read_json(path) if path.exists() else None


def _verdict(value, target, lower_is_better=False) -> str:
    if value is None:
        return "—"
    if lower_is_better:
        return "✅" if value <= target else "⚠️"
    return "✅" if value >= target else "⚠️"


def run() -> None:
    common.ensure_dirs()
    g = _load("g_eval.json")
    s = _load("speech.json")
    lip = _load("lipsync.json")
    sysm = _load("system.json")
    voice = _load("voice.json")
    gmt = _load("g_eval_multiturn.json")

    rows: list[tuple] = []  # (레이어, 지표, 결과, 목표, 판정)

    if g:
        c = _g(g, "summary", "consistency_avg")
        u = _g(g, "summary", "usefulness_avg")
        n = _g(g, "summary", "naturalness_avg")
        rows.append(("대화", "G-Eval 일관성(1~5)", c, "≥4.0", _verdict(c, 4.0)))
        rows.append(("대화", "G-Eval 유용성(1~5)", u, "≥4.0", _verdict(u, 4.0)))
        rows.append(("대화", "G-Eval 자연스러움(1~5)", n, "≥4.0", _verdict(n, 4.0)))
    if gmt:
        mc = _g(gmt, "summary", "consistency_avg")
        md = _g(gmt, "summary", "drift_resistance_avg")
        mr = _g(gmt, "summary", "context_retention_avg")
        rows.append(("대화(멀티턴)", "일관성(1~5)", mc, "≥4.0", _verdict(mc, 4.0)))
        rows.append(("대화(멀티턴)", "드리프트 저항(1~5)", md, "≥4.0", _verdict(md, 4.0)))
        rows.append(("대화(멀티턴)", "맥락 유지(1~5)", mr, "≥4.0", _verdict(mr, 4.0)))
    if voice:
        gmr = _g(voice, "summary", "gender_match_rate")
        nun = _g(voice, "summary", "n_unstable")
        npair = len(_g(voice, "summary", "near_identical_pairs", default=[]) or [])
        rows.append(("음성(화자정합)", "성별 정합률", gmr, "=1.0", _verdict(gmr, 1.0)))
        rows.append(("음성(화자정합)", "발화내 톤 불안정 화자수", nun, "0", _verdict(nun, 0, lower_is_better=True)))
        rows.append(("음성(화자정합)", "거의 같은 목소리 쌍", npair, "0", _verdict(npair, 0, lower_is_better=True)))
    if s:
        cer = _g(s, "CER_avg")
        rows.append(("음성", "CER", cer, "≤0.10", _verdict(cer, 0.10, lower_is_better=True)))
    if lip:
        corr = _g(lip, "correlation_avg")
        lag = _g(lip, "abs_lag_ms_avg")
        rows.append(("영상", "립싱크 상관(§5-B)", corr, "≥0.7", _verdict(corr, 0.7)))
        rows.append(("영상", "립싱크 |지연|ms", lag, "≤100", _verdict(lag, 100, lower_is_better=True)))
    if sysm:
        ttfb = _g(sysm, "ttfb", "avg")
        rows.append(("시스템", "TTFB(초)", ttfb, "≤1.5", _verdict(ttfb, 1.5, lower_is_better=True)))
        fps = _g(sysm, "fps", "avg")
        rows.append(("시스템", "FPS", fps, "≥30", _verdict(fps, 30)))
        rate = _g(sysm, "completion", "rate_pct")
        rows.append(("시스템", "완료율(%)", rate, "≥80", _verdict(rate, 80)))

    lines = ["# AI휴먼 정량 평가표 — 증기와 비늘", "",
             "> 가이드 §7. 모달리티: 텍스트 챗 + TTS + 3D 캐릭터 립싱크(§5-B).", "",
             "| 레이어 | 지표 | 우리 결과 | 목표 | 판정 |",
             "|---|---|---|---|---|"]
    for layer, metric, val, target, verdict in rows:
        shown = "—" if val is None else val
        lines.append(f"| {layer} | {metric} | {shown} | {target} | {verdict} |")
    lines.append("| 교차검증 | MOS(1~5) | (구글폼 §6) | 자동지표와 동일 방향 | — |")

    # 카테고리별 G-Eval(있으면)
    by_cat = _g(g or {}, "summary", "by_category", default={})
    if by_cat:
        lines += ["", "## 카테고리별 G-Eval", "",
                  "| 카테고리 | 일관성 | 유용성 | 자연스러움 |", "|---|---|---|---|"]
        for cat, v in by_cat.items():
            lines.append(f"| {cat} | {v.get('consistency')} | {v.get('usefulness')} | {v.get('naturalness')} |")

    lines += ["", "## 개선 메모", "",
              "> 숫자만이 아니라 '그래서 무엇을 개선할지'까지 적어야 점수가 높다(가이드 §7).",
              "- 유용성/일관성이 낮은 카테고리를 보고 few-shot·프롬프트를 보강한다.",
              "- '오프토픽/탈주' 카테고리 점수가 낮으면 거절·세계관 환기 지침을 SYSTEM_PROMPT 에 강화한다.",
              "- 멀티턴 드리프트/맥락유지가 낮으면 대화 기억 주입(요약·핀)과 역할 고정 지침을 보강한다.",
              "- 음성 성별 정합률<1.0 또는 '거의 같은 목소리 쌍'이 있으면 SUPERTONE_*_VOICE_ID 환경변수를 화자별로 설정한다(미설정 시 전원 기본 voice 로 동일해짐).",
              "- CER 이 높으면 발음이 뭉개지는 화자/문장 패턴을 추려 TTS 텍스트를 다듬는다.",
              "- 립싱크 상관이 낮거나 지연이 크면 Character3D 의 smoothing/openGate 파라미터를 조정한다.",
              "",
              "_MOS(§6)는 사람 5~10명 구글폼 결과를 위 표의 교차검증 행에 채운다. 평가자 일정부터 확정._"]

    out = common.OUT_DIR / "report.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"저장: {out}", flush=True)
    print("\n".join(lines))


if __name__ == "__main__":
    run()
