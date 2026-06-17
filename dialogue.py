"""Split GM responses into narration and NPC speech segments."""
from __future__ import annotations

import re

NPC_SPEAKERS = {
    "린": "lin",
    "사우 린": "lin",
    "사우 '린'": "lin",
    "사우 \"린\"": "lin",
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

LINE_RE = re.compile(r"^\s*([^:：]{1,32})[:：]\s*(.*)$")
QUOTE_PAIRS = {
    '"': '"',
    "'": "'",
    "“": "”",
    "‘": "’",
}
OPEN_QUOTES = set(QUOTE_PAIRS)


def _clean_label(label: str) -> str:
    return label.strip().strip("'\"“”‘’[]()<>").strip()


def _resolve_speaker(label: str) -> tuple[str, str | None] | None:
    name = _clean_label(label)
    if name in GM_LABELS or name.lower() in {item.lower() for item in GM_LABELS}:
        return ("gm", None)
    speaker = NPC_SPEAKERS.get(name)
    if speaker:
        return ("npc", speaker)
    return None


def _infer_speaker_from_context(context: str) -> str | None:
    tail = (context or "")[-180:]
    best: tuple[int, int, str] | None = None
    for label, speaker in NPC_SPEAKERS.items():
        index = tail.rfind(label)
        if index < 0:
            continue
        score = (index, len(label), speaker)
        if best is None or score > best:
            best = score
    return best[2] if best else None


def _find_quote_end(source: str, start: int) -> int:
    closing = QUOTE_PAIRS[source[start]]
    return source.find(closing, start + 1)


def _push(segments: list[dict], role: str, speaker: str | None, body: str) -> None:
    body = body.strip()
    if not body:
        return
    if segments and segments[-1]["role"] == role and segments[-1].get("speaker") == speaker:
        segments[-1]["text"] = f"{segments[-1]['text']} {body}".strip()
        return
    segments.append({"role": role, "speaker": speaker, "text": body})


def _split_quoted_speech(text: str, current_npc: str | None = None) -> list[dict]:
    source = (text or "").strip()
    if not source:
        return []

    segments: list[dict] = []
    cursor = 0
    i = 0
    while i < len(source):
        if source[i] not in OPEN_QUOTES:
            i += 1
            continue

        end = _find_quote_end(source, i)
        if end < 0:
            i += 1
            continue

        before = source[cursor:i]
        _push(segments, "gm", None, before)

        speaker = _infer_speaker_from_context(source[:i])
        quote = source[i + 1:end]
        if speaker:
            # 인용문 직전 문맥에서 추론된 화자(다른 NPC 인용 포함)는 그대로 존중.
            _push(segments, "npc", speaker, quote)
        elif current_npc:
            # 1:1 대화 중 화자 미추론 인용문은 GM이 가로채지 않고 현재 NPC 발화로 귀속.
            _push(segments, "npc", current_npc, quote)
        else:
            _push(segments, "gm", None, quote)

        cursor = end + 1
        i = end + 1

    # 인용 없는 순수 서술 prose는 장면 묘사로 보고 GM 유지.
    _push(segments, "gm", None, source[cursor:])
    return segments or [{"role": "gm", "speaker": None, "text": source}]


def split_segments(text: str, current_npc: str | None = None) -> list[dict]:
    """LLM 답변을 GM/NPC 세그먼트로 분리.

    current_npc 가 주어지면(프론트 activeSpeaker 기반 1:1 대화 상대) 화자를 추론하지
    못한 인용문을 GM 대신 그 NPC 발화로 귀속한다. None 이면 기존 동작 그대로.
    """
    source = (text or "").strip()
    if not source:
        return []

    raw_segments: list[dict] = []
    cur_role, cur_speaker, buf = "gm", None, []

    def flush() -> None:
        nonlocal buf
        body = "\n".join(buf).strip()
        if body:
            raw_segments.append({"role": cur_role, "speaker": cur_speaker, "text": body})
        buf = []

    for line in source.splitlines():
        match = LINE_RE.match(line)
        resolved = _resolve_speaker(match.group(1)) if match else None
        if resolved:
            flush()
            cur_role, cur_speaker = resolved
            buf = [match.group(2)]
        else:
            buf.append(line)
    flush()

    if not raw_segments:
        raw_segments = [{"role": "gm", "speaker": None, "text": source}]

    segments: list[dict] = []
    for segment in raw_segments:
        if segment["role"] == "gm":
            for quoted in _split_quoted_speech(segment["text"], current_npc):
                _push(segments, quoted["role"], quoted.get("speaker"), quoted["text"])
        else:
            _push(segments, segment["role"], segment.get("speaker"), segment["text"])

    return segments or [{"role": "gm", "speaker": None, "text": source}]
