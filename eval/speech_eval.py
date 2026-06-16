"""검문소 B: TTS 음성을 Whisper 로 되받아쓰기해 CER/WER 을 잰다 (가이드 §4).

한국어는 조사/띄어쓰기 때문에 WER 이 왜곡된다 → CER 을 메인 지표로 본다.

입력:  eval/outputs/tts_manifest.jsonl  (synth_tts.py 산출)
출력:  eval/outputs/speech.json
"""
from __future__ import annotations

import re

import common

_WS = re.compile(r"\s+")


def _norm(text: str) -> str:
    """채점 전 정규화: 구두점 제거 + 공백 정리(한국어 CER 안정화)."""
    text = re.sub(r"[\"'“”‘’.,!?…·~\-—:;()\[\]{}]", "", text)
    return _WS.sub(" ", text).strip()


def run() -> None:
    common.ensure_dirs()
    import whisper
    from jiwer import cer, wer

    manifest = common.read_jsonl(common.OUT_DIR / "tts_manifest.jsonl")
    if not manifest:
        print("tts_manifest.jsonl 이 비어 있습니다. 먼저 synth_tts.py 를 실행하세요.")
        return

    model_name = common.env("EVAL_WHISPER_MODEL", "large-v3")
    print(f"Whisper 모델 로딩: {model_name} ...", flush=True)
    model = whisper.load_model(model_name)

    items: list[dict] = []
    for row in manifest:
        wav = (common.EVAL_DIR / row["wav"]).resolve()
        ref = _norm(row["reference"])
        if not wav.exists() or not ref:
            continue
        heard_raw = model.transcribe(str(wav), language="ko")["text"]
        heard = _norm(heard_raw)
        rec = {
            "id": row["id"],
            "category": row.get("category"),
            "reference": ref,
            "heard": heard,
            "CER": round(cer(ref, heard), 4),
            "WER": round(wer(ref, heard), 4),
        }
        items.append(rec)
        print(f"[ok] id={row['id']} CER={rec['CER']} WER={rec['WER']}", flush=True)

    def avg(key: str) -> float | None:
        vals = [i[key] for i in items if i.get(key) is not None]
        return round(sum(vals) / len(vals), 4) if vals else None

    out = {
        "whisper_model": model_name,
        "n": len(items),
        "CER_avg": avg("CER"),
        "WER_avg": avg("WER"),
        "items": items,
    }
    common.write_json(common.OUT_DIR / "speech.json", out)
    print(f"\n저장: {common.OUT_DIR / 'speech.json'}  평균 CER {out['CER_avg']} (목표 ≤0.10)", flush=True)


if __name__ == "__main__":
    run()
