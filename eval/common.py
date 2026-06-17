"""평가 하네스 공통 유틸 (경로/입출력/환경)."""
from __future__ import annotations

import json
import os
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
PROJECT_DIR = EVAL_DIR.parent
TESTSET_PATH = EVAL_DIR / "testset.jsonl"
OUT_DIR = EVAL_DIR / "outputs"
AUDIO_OUT_DIR = OUT_DIR / "audio"
LIPSYNC_OUT_DIR = OUT_DIR / "lipsync"


def ensure_dirs() -> None:
    for d in (OUT_DIR, AUDIO_OUT_DIR, LIPSYNC_OUT_DIR):
        d.mkdir(parents=True, exist_ok=True)


def load_testset() -> list[dict]:
    items = []
    for line in TESTSET_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            items.append(json.loads(line))
    return items


def read_jsonl(path: Path) -> list[dict]:
    items = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            items.append(json.loads(line))
    return items


def write_jsonl(path: Path, rows: list[dict]) -> None:
    Path(path).write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n",
        encoding="utf-8",
    )


def write_json(path: Path, obj) -> None:
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def make_judge_client():
    """채점관용 OpenAI 호환 클라이언트.

    EVAL_JUDGE_BASE_URL 을 주면 Gemini 등 OpenAI 호환 엔드포인트로 전환된다.
    - Gemini 무료키: EVAL_JUDGE_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
                     EVAL_JUDGE_API_KEY=<AI Studio 키>,  EVAL_JUDGE_MODEL=gemini-2.0-flash
    키는 EVAL_JUDGE_API_KEY 우선, 없으면 OPENAI_API_KEY.
    """
    from openai import OpenAI
    base_url = env("EVAL_JUDGE_BASE_URL")
    api_key = env("EVAL_JUDGE_API_KEY") or env("OPENAI_API_KEY")
    kwargs = {}
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


def _extract_json(text: str) -> dict:
    """모델 출력에서 JSON 추출. 코드펜스/잡설이 섞여도 첫 {...} 블록을 파싱."""
    import re
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t).strip()
    try:
        return json.loads(t)
    except Exception:  # noqa: BLE001
        m = re.search(r"\{.*\}", t, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


def judge_json(client, model: str, prompt: str) -> dict:
    """채점관 호출 + JSON 파싱. response_format(json_object) 미지원 모델이면 옵션을 빼고 자동 재시도."""
    msgs = [{"role": "user", "content": prompt}]
    try:
        r = client.chat.completions.create(
            model=model, messages=msgs, temperature=0,
            response_format={"type": "json_object"})
        return _extract_json(r.choices[0].message.content)
    except Exception:  # noqa: BLE001
        r = client.chat.completions.create(model=model, messages=msgs, temperature=0)
        return _extract_json(r.choices[0].message.content)
