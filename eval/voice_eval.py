"""검문소 D: 화자 음성 정합 (성별/동일성/안정성) — G-Eval(텍스트)·CER(발음)이 못 잡는 축.

라이브 플레이에서 "남자가 여자 목소리를 낸다 / 발화 중 톤이 바뀐다 / 화자가 다 똑같은
목소리다" 같은 문제는 텍스트 채점(G-Eval)과 발음 채점(CER)에 전혀 안 잡힌다.
이 검문소는 각 화자의 TTS 음성을 실제로 합성해 기본주파수(f0, 피치)를 측정한다.

측정:
  1) 성별 정합   — 화자별 기대 성별의 f0 대역 안에 들어오는가 (남↔여 뒤바뀜 탐지)
  2) 발화내 안정성 — 한 발화 안에서 f0 변동(CV)이 과하지 않은가 (도중 톤 바뀜 탐지)
  3) 화자 구분도  — 서로 달라야 할 화자들의 f0 가 사실상 동일하지 않은가
                    (Supertone voice id 가 전부 기본값이면 모두 같은 목소리가 되는 버그 탐지)

사용:
  python eval/voice_eval.py                # 화자별 프로브 합성 후 분석 (서버+토큰 필요)
  python eval/voice_eval.py --analyze-only # outputs/voice/<speaker>.wav 만 분석 (서버 불필요)

입력:  /api/tts (EVAL_BASE_URL, EVAL_TOKEN) — 합성 단계에서만
출력:  eval/outputs/voice/<speaker>.wav  +  eval/outputs/voice.json
"""
from __future__ import annotations

import argparse
import sys

import common

sys.path.insert(0, str(common.PROJECT_DIR))

# 화자별 기대 성별. personas.js 설정 기준(가일·의사=중년 남성, 토비=소년, 린·마르타·간호사·점원=여성).
# 필요시 여기만 고치면 된다.
SPEAKER_GENDER = {
    "gm": "male",
    "doctor": "male",
    "gail": "male",
    "kargas": "male",
    "miner": "male",
    "tobi": "boy",
    "lin": "female",
    "marta": "female",
    "nurse": "female",
    "tavern_clerk": "female",
}

# 기대 f0(Hz) 대역. boy/female 은 겹치게 둬서 '심한' 성별 뒤바뀜만 플래그한다.
GENDER_F0_RANGE = {
    "male": (80.0, 185.0),
    "boy": (160.0, 320.0),
    "female": (165.0, 290.0),
}

# 모든 화자가 같은 한 문장을 읽게 해 화자 간 비교를 공정하게 한다.
PROBE_TEXT = "여기까지 잘 따라오고 있어. 이제 다음으로 무엇을 할지 말해 줘."

# 발화내 f0 변동계수(CV)가 이 값을 넘으면 '도중에 톤이 흔들린다'고 본다.
F0_CV_UNSTABLE = 0.35
# 두 화자 median f0 가 이 Hz 이내면 '사실상 같은 목소리'로 본다(구분도 측정).
SAME_VOICE_HZ = 8.0


def _synth_probe(speakers: list[str]) -> dict[str, str]:
    """각 화자로 PROBE_TEXT 를 합성해 outputs/voice/<speaker>.wav 로 저장. wav 경로 맵 반환."""
    from synth_tts import _post_tts, _download  # 합성 헬퍼 재사용

    base_url = common.env("EVAL_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    token = common.env("EVAL_TOKEN")
    if not token:
        print("EVAL_TOKEN 이 필요합니다(로그인 액세스 토큰). --analyze-only 로 합성을 건너뛸 수 있습니다.",
              file=sys.stderr)
        sys.exit(2)

    out_dir = common.OUT_DIR / "voice"
    out_dir.mkdir(parents=True, exist_ok=True)
    wavs: dict[str, str] = {}
    for sp in speakers:
        try:
            resp = _post_tts(base_url, token, PROBE_TEXT, sp)
            out_wav = out_dir / f"{sp}.wav"
            _download(base_url, resp["audio_url"], out_wav)
            wavs[sp] = str(out_wav)
            print(f"[ok] {sp} -> {out_wav.name} (provider={resp.get('provider')}, voice={resp.get('voice')})",
                  flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[ERR] {sp} 합성 실패: {exc}", flush=True)
    return wavs


def _measure_f0(wav_path: str) -> dict:
    """wav 의 voiced 구간 f0(median)과 변동계수(CV)를 측정."""
    import librosa
    import numpy as np

    y, sr = librosa.load(wav_path, sr=None)
    # 사람 음성 범위로 한정해 f0 추정(잡음/배음 영향↓).
    f0, voiced, _ = librosa.pyin(
        y, sr=sr, fmin=70.0, fmax=400.0, frame_length=2048,
    )
    f0v = f0[~np.isnan(f0)] if f0 is not None else np.array([])
    if f0v.size < 5:
        return {"error": "voiced frames too few", "n_voiced": int(f0v.size)}
    median = float(np.median(f0v))
    cv = float(np.std(f0v) / median) if median > 0 else None
    return {
        "median_f0": round(median, 1),
        "f0_cv": round(cv, 3) if cv is not None else None,
        "n_voiced": int(f0v.size),
    }


def _classify(median_f0: float) -> str:
    # 대역 기준 단순 분류(boy/female 겹침 → 둘 다 'high' 로 묶지 않고 가까운 쪽 표기는 생략).
    if median_f0 < GENDER_F0_RANGE["male"][1]:
        return "male"
    return "female/boy"


def run(analyze_only: bool = False) -> None:
    common.ensure_dirs()
    speakers = list(SPEAKER_GENDER.keys())

    out_dir = common.OUT_DIR / "voice"
    if analyze_only:
        wavs = {sp: str(out_dir / f"{sp}.wav") for sp in speakers
                if (out_dir / f"{sp}.wav").exists()}
        if not wavs:
            print(f"분석할 wav 가 없습니다: {out_dir}/<speaker>.wav 를 먼저 만드세요.", file=sys.stderr)
            sys.exit(2)
    else:
        wavs = _synth_probe(speakers)

    results: list[dict] = []
    for sp in speakers:
        wav = wavs.get(sp)
        expected = SPEAKER_GENDER[sp]
        if not wav:
            results.append({"speaker": sp, "expected_gender": expected, "skipped": True})
            continue
        m = _measure_f0(wav)
        if m.get("error"):
            results.append({"speaker": sp, "expected_gender": expected, **m})
            continue
        lo, hi = GENDER_F0_RANGE[expected]
        in_band = lo <= m["median_f0"] <= hi
        stable = (m["f0_cv"] is not None and m["f0_cv"] <= F0_CV_UNSTABLE)
        results.append({
            "speaker": sp,
            "expected_gender": expected,
            "expected_f0_band": [lo, hi],
            "median_f0": m["median_f0"],
            "detected": _classify(m["median_f0"]),
            "gender_match": bool(in_band),
            "f0_cv": m["f0_cv"],
            "stable": bool(stable),
            "n_voiced": m["n_voiced"],
        })
        flag = "" if in_band else "  ⚠️성별대역밖"
        flag += "" if stable else "  ⚠️발화내 톤 불안정"
        print(f"[{sp}] f0={m['median_f0']}Hz 기대={expected}{lo}-{hi} cv={m['f0_cv']}{flag}", flush=True)

    scored = [r for r in results if r.get("median_f0") is not None]

    # 화자 구분도: median f0 가 SAME_VOICE_HZ 이내로 붙는 화자쌍 수.
    near_pairs = []
    for i in range(len(scored)):
        for j in range(i + 1, len(scored)):
            if abs(scored[i]["median_f0"] - scored[j]["median_f0"]) <= SAME_VOICE_HZ:
                near_pairs.append([scored[i]["speaker"], scored[j]["speaker"]])
    n_distinct = len({round(r["median_f0"] / SAME_VOICE_HZ) for r in scored})

    summary = {
        "probe_text": PROBE_TEXT,
        "n_speakers": len(speakers),
        "n_scored": len(scored),
        "gender_match_rate": round(sum(r["gender_match"] for r in scored) / len(scored), 3) if scored else None,
        "n_gender_mismatch": sum(1 for r in scored if not r["gender_match"]),
        "n_unstable": sum(1 for r in scored if not r["stable"]),
        "distinct_voice_buckets": n_distinct,
        "near_identical_pairs": near_pairs,
        "f0_cv_unstable_threshold": F0_CV_UNSTABLE,
        "same_voice_hz": SAME_VOICE_HZ,
    }
    out = {"summary": summary, "speakers": results}
    common.write_json(common.OUT_DIR / "voice.json", out)
    print(f"\n저장: {common.OUT_DIR / 'voice.json'}", flush=True)
    print(f"  성별정합 {summary['gender_match_rate']} / 불일치 {summary['n_gender_mismatch']}명"
          f" / 톤불안정 {summary['n_unstable']}명 / 구분버킷 {summary['distinct_voice_buckets']}"
          f" / 거의같은쌍 {len(near_pairs)}", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--analyze-only", action="store_true",
                    help="합성 생략, outputs/voice/<speaker>.wav 만 분석")
    args = ap.parse_args()
    run(analyze_only=args.analyze_only)
