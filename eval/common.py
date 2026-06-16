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
