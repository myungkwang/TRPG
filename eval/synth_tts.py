"""검문소 B 준비: 대화 응답을 제품 TTS(/api/tts)로 합성해 wav 를 모은다 (가이드 §4).

서버가 떠 있어야 하고(EVAL_BASE_URL), 로그인 토큰(EVAL_TOKEN)이 필요하다.
각 응답에서 화자 라벨/선택지 블록을 떼어낸 '발화 텍스트'를 합성하고, 그 원문을 CER 기준으로 같이 저장한다.

출력: eval/outputs/audio/<id>.wav  +  eval/outputs/tts_manifest.jsonl
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request

import common

sys.path.insert(0, str(common.PROJECT_DIR))

_LABELS = ("GM", "의사", "린", "가일", "마르타", "토비", "카르가스")
_LABEL_RE = re.compile(r"^(%s)\s*:\s*" % "|".join(_LABELS))
_CHOICE_RE = re.compile(r"\[\s*선택지\s*\]")


def spoken_text(answer: str) -> str:
    """화자 라벨과 [선택지] 블록을 제거해 TTS 가 실제로 읽을 텍스트만 남긴다."""
    body = _CHOICE_RE.split(answer)[0]
    lines = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line or line.startswith("-"):
            continue
        line = _LABEL_RE.sub("", line)
        line = line.replace('"', "").replace("“", "").replace("”", "")
        if line:
            lines.append(line)
    return " ".join(lines).strip()


def _post_tts(base_url: str, token: str, text: str, speaker: str) -> dict:
    body = json.dumps({"text": text, "speaker": speaker}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/tts",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def _download(base_url: str, audio_url: str, out_path) -> None:
    url = audio_url if audio_url.startswith("http") else f"{base_url}{audio_url}"
    with urllib.request.urlopen(url, timeout=120) as r:
        out_path.write_bytes(r.read())


def run() -> None:
    common.ensure_dirs()
    base_url = common.env("EVAL_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    token = common.env("EVAL_TOKEN")
    speaker = common.env("EVAL_TTS_SPEAKER", "gm")
    if not token:
        print("EVAL_TOKEN 이 필요합니다(로그인 액세스 토큰). 서버를 띄우고 토큰을 발급하세요.", file=sys.stderr)
        sys.exit(2)

    dialogue = common.read_jsonl(common.OUT_DIR / "dialogue.jsonl")
    manifest: list[dict] = []

    for item in dialogue:
        if item.get("error") or not item.get("output"):
            continue
        ref = spoken_text(item["output"])
        if not ref:
            continue
        try:
            resp = _post_tts(base_url, token, ref, speaker)
            out_wav = common.AUDIO_OUT_DIR / f"{item['id']}.wav"
            _download(base_url, resp["audio_url"], out_wav)
            manifest.append({
                "id": item["id"],
                "category": item.get("category"),
                "reference": ref,
                "wav": str(out_wav.relative_to(common.EVAL_DIR)),
                "provider": resp.get("provider"),
                "voice": resp.get("voice"),
            })
            print(f"[ok] id={item['id']} -> {out_wav.name} ({resp.get('provider')})", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[ERR] id={item['id']} tts fail: {exc}", flush=True)

    common.write_jsonl(common.OUT_DIR / "tts_manifest.jsonl", manifest)
    print(f"\n저장: {common.OUT_DIR / 'tts_manifest.jsonl'}  ({len(manifest)}개)", flush=True)


if __name__ == "__main__":
    run()
