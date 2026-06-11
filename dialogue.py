"""GM 응답을 화자별 말풍선 세그먼트로 분리한다.

GM은 각 줄을 화자 라벨로 시작해 출력한다:
  GM: 서술 / 판정 결과 / 안내 (= 시스템 말풍선)
  의사: "대사"   린: "대사"  ...  (= 그 인물의 말풍선)

이 모듈은 그 텍스트를 [{role, speaker, text}] 로 파싱한다.
  role = "gm"  → 시스템/서술/판정 (speaker=None)
  role = "npc" → 인물 대사 (speaker=인물 이름)
"""
from __future__ import annotations

import re

# NPC 화자 (4_NPC). 이 이름으로 시작하는 줄은 그 인물의 대사 말풍선.
NPC_SPEAKERS = ["의사", "린", "가일", "마르타", "토비", "카르가스"]
# 별칭 → 표준 이름
SPEAKER_ALIASES = {"여우 린": "린", "여우": "린"}
# 시스템/GM 라벨 (시스템 말풍선)
GM_LABELS = {"gm", "시스템", "안내", "system", "system말", "내레이션"}

_LINE_RE = re.compile(r"^\s*([^:：]{1,24})[:：]\s*(.*)$")


def _resolve_speaker(label: str):
    """접두 라벨을 (role, speaker)로. 화자가 아니면 None."""
    name = label.strip().strip("'\"’“”[]()").strip()
    if name.lower() in GM_LABELS:
        return ("gm", None)
    canonical = SPEAKER_ALIASES.get(name, name)
    if canonical in NPC_SPEAKERS:
        return ("npc", canonical)
    return None


def split_segments(text: str) -> list[dict]:
    text = (text or "").strip()
    if not text:
        return []

    segments: list[dict] = []

    def push(role, speaker, body):
        body = body.strip()
        if body:
            segments.append({"role": role, "speaker": speaker, "text": body})

    cur_role, cur_speaker, buf = "gm", None, []
    for line in text.splitlines():
        m = _LINE_RE.match(line)
        spk = _resolve_speaker(m.group(1)) if m else None
        if spk is not None:
            push(cur_role, cur_speaker, "\n".join(buf))
            cur_role, cur_speaker = spk
            buf = [m.group(2)]
        else:
            buf.append(line)
    push(cur_role, cur_speaker, "\n".join(buf))

    # 마커가 하나도 없으면 전체를 GM(시스템) 한 덩어리로.
    return segments or [{"role": "gm", "speaker": None, "text": text}]
