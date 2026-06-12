"""Split GM responses into narrations and NPC speech segments."""
from __future__ import annotations

import re

NPC_SPEAKERS = {
    "린": "lin",
    "여우 린": "lin",
    "여우 ‘린’": "lin",
    "여우 '린'": "lin",
    "의사": "doctor",
    "닥터": "doctor",
    "가일": "gail",
    "마르타": "marta",
    "토비": "tobi",
    "카르가스": "kargas",
    "광부": "miner",
    "간호사": "nurse",
    "린 주점 점원": "tavern_clerk",
    "주점 점원": "tavern_clerk",
    "점원": "tavern_clerk",
}

GM_LABELS = {
    "gm",
    "GM",
    "진행자",
    "나레이션",
    "내레이션",
    "안내",
    "system",
    "시스템",
}

LINE_RE = re.compile(r"^\s*([^:：]{1,24})[:：]\s*(.*)$")


def _resolve_speaker(label: str) -> tuple[str, str | None] | None:
    name = label.strip().strip("'\"‘’“”[]()").strip()
    if name in GM_LABELS or name.lower() in {item.lower() for item in GM_LABELS}:
        return ("gm", None)
    speaker = NPC_SPEAKERS.get(name)
    if speaker:
        return ("npc", speaker)
    return None


def split_segments(text: str) -> list[dict]:
    source = (text or "").strip()
    if not source:
        return []

    segments: list[dict] = []

    def push(role: str, speaker: str | None, body: str) -> None:
        body = body.strip()
        if not body:
            return
        segments.append({"role": role, "speaker": speaker, "text": body})

    cur_role, cur_speaker, buf = "gm", None, []
    for line in source.splitlines():
        match = LINE_RE.match(line)
        resolved = _resolve_speaker(match.group(1)) if match else None
        if resolved:
            push(cur_role, cur_speaker, "\n".join(buf))
            cur_role, cur_speaker = resolved
            buf = [match.group(2)]
        else:
            buf.append(line)
    push(cur_role, cur_speaker, "\n".join(buf))

    return segments or [{"role": "gm", "speaker": None, "text": source}]
