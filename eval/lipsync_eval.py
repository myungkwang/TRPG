"""검문소 C: 캐릭터 아바타 립싱크 (가이드 §5-B).

아바타가 사람 얼굴이 아닌 3D 캐릭터라 SyncNet/LSE(§5-A)는 못 쓴다.
대신 프레임별 '입 벌림 값(mouth_open)' 과 '오디오 음량 포락선(RMS)' 의 상관/지연으로 측정한다.

입 벌림 값은 Character3D.jsx 의 dev 로거(window.__LIPSYNC_LOG__) 가 내보낸 JSON 을 쓴다.
JSON 형식(둘 다 허용):
  {"name":"...", "fps":30, "frames":[{"t":0.0,"mouth":0.0}, ...]}
  {"name":"...", "fps":30, "times":[...], "mouth":[...]}

사용:
  python eval/lipsync_eval.py --mouth outputs/lipsync/a.json --wav outputs/audio/1.wav
  python eval/lipsync_eval.py --auto      # outputs/lipsync/*.json 을 같은 이름 wav 와 자동 매칭

출력(누적): eval/outputs/lipsync.json
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

import common


def _load_mouth(path: Path):
    obj = common.read_json(path)
    if "frames" in obj:
        times = np.array([f["t"] for f in obj["frames"]], dtype=float)
        mouth = np.array([f["mouth"] for f in obj["frames"]], dtype=float)
    else:
        times = np.array(obj.get("times", []), dtype=float)
        mouth = np.array(obj["mouth"], dtype=float)
    fps = obj.get("fps")
    if not fps and len(times) > 1:
        fps = 1.0 / float(np.median(np.diff(times)))
    return mouth, float(fps or 30.0)


def _score(mouth_path: Path, wav_path: Path) -> dict:
    import librosa
    from scipy.signal import correlate

    mouth, fps = _load_mouth(mouth_path)
    if mouth.size < 4:
        return {"error": "mouth frames too few"}

    y, sr = librosa.load(str(wav_path), sr=None)
    hop = 512
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    # 오디오 RMS 를 입벌림 프레임 수에 맞춰 리샘플.
    audio = np.interp(
        np.linspace(0, len(rms) - 1, len(mouth)),
        np.arange(len(rms)),
        rms,
    )

    if mouth.std() < 1e-8 or audio.std() < 1e-8:
        return {"error": "flat signal", "fps": fps, "n_frames": int(mouth.size)}

    m = (mouth - mouth.mean()) / mouth.std()
    a = (audio - audio.mean()) / audio.std()
    corr = float(np.corrcoef(m, a)[0, 1])
    lag_frames = int(np.argmax(correlate(m, a)) - (len(m) - 1))
    lag_ms = lag_frames / fps * 1000.0

    return {
        "correlation": round(corr, 4),         # 목표 ≥ 0.7
        "lag_ms": round(lag_ms, 1),            # 목표 ±100ms
        "fps": round(fps, 2),
        "n_frames": int(mouth.size),
        "pass": bool(corr >= 0.7 and abs(lag_ms) <= 100.0),
    }


def run() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mouth")
    ap.add_argument("--wav")
    ap.add_argument("--auto", action="store_true", help="outputs/lipsync/*.json 을 같은 stem wav 와 자동 매칭")
    args = ap.parse_args()
    common.ensure_dirs()

    pairs: list[tuple[Path, Path]] = []
    if args.auto:
        for mj in sorted(common.LIPSYNC_OUT_DIR.glob("*.json")):
            wav = common.AUDIO_OUT_DIR / f"{mj.stem}.wav"
            if wav.exists():
                pairs.append((mj, wav))
    elif args.mouth and args.wav:
        pairs.append((Path(args.mouth), Path(args.wav)))
    else:
        ap.error("--mouth+--wav 또는 --auto 중 하나가 필요합니다")

    out_path = common.OUT_DIR / "lipsync.json"
    existing = common.read_json(out_path) if out_path.exists() else {"items": []}
    by_name = {i["name"]: i for i in existing.get("items", [])}

    for mj, wav in pairs:
        res = _score(mj, wav)
        res["name"] = mj.stem
        res["wav"] = wav.name
        by_name[mj.stem] = res
        print(f"[{mj.stem}] corr={res.get('correlation')} lag_ms={res.get('lag_ms')} {res.get('error','')}", flush=True)

    items = list(by_name.values())
    corrs = [i["correlation"] for i in items if "correlation" in i]
    lags = [abs(i["lag_ms"]) for i in items if "lag_ms" in i]
    summary = {
        "n": len(items),
        "correlation_avg": round(sum(corrs) / len(corrs), 4) if corrs else None,
        "abs_lag_ms_avg": round(sum(lags) / len(lags), 1) if lags else None,
        "items": items,
    }
    common.write_json(out_path, summary)
    print(f"\n저장: {out_path}  평균 상관 {summary['correlation_avg']} (목표 ≥0.7)", flush=True)


if __name__ == "__main__":
    run()
