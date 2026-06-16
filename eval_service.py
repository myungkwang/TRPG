"""NPC별 정량 평가 헬퍼 (게임 내 '정량검사' 버튼 백엔드).

server.py 가 이 모듈을 import 해서 백그라운드 잡으로 돌린다.
순수 헬퍼만 둔다(서버를 역으로 import 하지 않음). TTS 합성은 server.py 가 넘겨준다.

평가 대상 NPC: GM · 린 · 의사 · 가일 · 마르타 · 토비 (6종, 3D 모델 보유).
각 NPC에 대해:
  1) 인물 페르소나로 한두 문장 생성  → G-Eval(GPT-4o)로 일관성/유용성/자연스러움 채점
  2) 그 문장을 NPC 목소리로 TTS 합성  → Whisper 되받아쓰기 → CER/WER
  3) 같은 음성으로 립싱크 프록시(입벌림↔RMS 상관/지연) 측정
결과를 matplotlib 막대그래프 PNG 로 그려 저장한다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable

# 차트 라벨은 한글 폰트 문제를 피하려고 로마자(label)로, 표는 한글(name)로 쓴다.
NPC_EVAL_LIST = [
    {
        "key": "gm", "name": "GM", "label": "GM", "voice": "gm",
        "persona": "한국어 TRPG '증기와 비늘'의 게임마스터(서술자). 차분하고 분위기 있는 3인칭 서술로 장면을 묘사한다. 특정 NPC 대사가 아니라 상황·분위기·감각을 그린다.",
    },
    {
        "key": "lin", "name": "린", "label": "Lin", "voice": "lin",
        "persona": "린 — 재끝 마을 여관 주인이자 구미호. 의뭉스럽고 느긋하며, 존댓말로 말끝을 부드럽게 흐리고 은유와 농담을 즐긴다. 진실과 거짓을 섞어 말한다.",
    },
    {
        "key": "doctor", "name": "의사", "label": "Doctor", "voice": "doctor",
        "persona": "의사 — 재끝 마을 진료소 의사. 차분하고 신중하며 말을 아낀다. 낮고 차분한 목소리로 단어를 신중히 고른다. 무언가 알고 있는 듯하다.",
    },
    {
        "key": "gail", "name": "가일", "label": "Gail", "voice": "gail",
        "persona": "가일 — 제국 영석공사 채굴 감독. 권위적이고 강압적인 명령조지만 속은 겁이 많다. 다급해지면 말이 빨라지고 변명조가 된다.",
    },
    {
        "key": "marta", "name": "마르타", "label": "Marta", "voice": "marta",
        "persona": "마르타 — 재끝 마을의 노파. 차분하고 단호하며 느리고 무게 있는 옛말투를 쓴다. 비유와 옛이야기로 돌려 말한다.",
    },
    {
        "key": "tobi", "name": "토비", "label": "Tobi", "voice": "tobi",
        "persona": "토비 — 사라진 광부의 동생, 소년 광부. 순수하고 절박하며 정의감이 강하다. 빠르고 솔직하게 말하고 존댓말이 서툴며 감정이 그대로 드러난다.",
    },
]

# 모든 NPC에게 같은 상황을 던져 인물별 응답을 비교한다(공정 비교).
EVAL_SITUATION = "플레이어가 '광부 실종 사건에 대해 아는 것을 말해 달라'고 묻는다. 네 인물에 맞게 1~2문장으로 답하라. 화자 라벨 없이 대사/서술만."

JUDGE_PROMPT = """당신은 엄격한 대화 평가자입니다. 아래 NPC가 자기 인물답게 말했는지 1~5점으로 채점하세요.

[평가 항목]
- 페르소나 일관성: 정해진 성격/말투/목표를 유지했는가
- 유용성: 질문(광부 실종)에 인물답게 의미 있는 반응을 했는가
- 자연스러움: 사람 같은 대사인가

[채점 규칙]
1점=전혀 아님 ... 5점=완벽. 근거 1문장 먼저, 그 다음 점수.

[NPC 페르소나]
{persona}

[대사]
{line}

JSON으로만 출력:
{{"reason":"...", "consistency":n, "usefulness":n, "naturalness":n}}
"""


def generate_npc_line(llm_chat: Callable, persona: str) -> str:
    """NPC 페르소나로 인물 대사 1~2문장 생성. llm_chat 은 server 가 넘겨주는 llm.chat."""
    messages = [
        {"role": "system", "content": f"너는 다음 인물이다. 인물에 완전히 몰입해 말한다.\n{persona}"},
        {"role": "user", "content": EVAL_SITUATION},
    ]
    out = llm_chat(messages) or ""
    return out.strip()


def g_eval_line(judge_client, model: str, persona: str, line: str, repeat: int = 3) -> dict:
    """생성된 대사를 GPT-4o로 repeat회 채점해 평균."""
    runs = []
    prompt = JUDGE_PROMPT.format(persona=persona, line=line)
    for _ in range(max(1, repeat)):
        r = judge_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        try:
            runs.append(json.loads(r.choices[0].message.content))
        except Exception:
            continue

    def avg(k):
        vals = [x.get(k) for x in runs if isinstance(x.get(k), (int, float))]
        return round(sum(vals) / len(vals), 3) if vals else None

    return {
        "consistency": avg("consistency"),
        "usefulness": avg("usefulness"),
        "naturalness": avg("naturalness"),
        "reason": runs[0].get("reason") if runs else None,
    }


_WS = re.compile(r"\s+")


def _norm_text(text: str) -> str:
    text = re.sub(r"[\"'“”‘’.,!?…·~\-—:;()\[\]{}]", "", str(text or ""))
    return _WS.sub(" ", text).strip()


def cer_score(whisper_model, wav_path: str, reference: str) -> dict:
    """Whisper 되받아쓰기 → CER/WER (한국어는 CER 주지표)."""
    from jiwer import cer, wer
    heard_raw = whisper_model.transcribe(str(wav_path), language="ko")["text"]
    ref = _norm_text(reference)
    heard = _norm_text(heard_raw)
    if not ref:
        return {"CER": None, "WER": None, "heard": heard}
    return {
        "CER": round(cer(ref, heard), 4),
        "WER": round(wer(ref, heard), 4),
        "heard": heard,
    }


def lipsync_proxy(wav_path: str, fps: int = 30) -> dict:
    """립싱크 프록시(§5-B): 브라우저 렌더 파이프라인과 같은 공식으로 입벌림 곡선을
    음성에서 시뮬레이션한 뒤, 원본 음량(RMS)과의 상관/지연을 잰다.
    실제 3D 렌더 캡처가 아니라 '음성-구동 립싱크 가능성'의 자동 프록시."""
    import numpy as np
    import librosa
    from scipy.signal import correlate

    y, sr = librosa.load(str(wav_path), sr=None)
    hop = max(1, int(sr / fps))
    rms = librosa.feature.rms(y=y, frame_length=hop * 2, hop_length=hop)[0]
    if rms.size < 4:
        return {"correlation": None, "lag_ms": None, "frames": int(rms.size)}

    # Character3D.jsx 와 동일한 곡선: target → EMA(상승0.36/하강0.22) → pow(0.95)*1.05, clamp 0.85
    target = np.clip((rms - 0.018) / 0.14, 0.0, 1.0)
    mouth = np.zeros_like(target)
    s = 0.0
    for i, t in enumerate(target):
        factor = 0.36 if t > s else 0.22
        s += (t - s) * factor
        mouth[i] = min(0.85, (s * 1.05) ** 0.95)

    if mouth.std() < 1e-8 or target.std() < 1e-8:
        return {"correlation": None, "lag_ms": None, "frames": int(rms.size)}

    m = (mouth - mouth.mean()) / mouth.std()
    a = (target - target.mean()) / target.std()
    corr = float(np.corrcoef(m, a)[0, 1])
    lag_frames = int(np.argmax(correlate(m, a)) - (len(m) - 1))
    lag_ms = lag_frames / fps * 1000.0
    return {
        "correlation": round(corr, 4),
        "lag_ms": round(lag_ms, 1),
        "frames": int(rms.size),
        "pass": bool(corr >= 0.7 and abs(lag_ms) <= 100.0),
    }


def render_charts(results: list[dict], out_dir: Path) -> dict[str, str]:
    """G-Eval·CER 막대그래프 PNG 생성(립싱크는 클라 실측 후 render_lipsync_chart로 별도)."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    out_dir.mkdir(parents=True, exist_ok=True)
    labels = [r["label"] for r in results]
    x = np.arange(len(labels))
    files: dict[str, str] = {}

    # 1) G-Eval (그룹 막대)
    fig, ax = plt.subplots(figsize=(8, 4.5))
    width = 0.26
    for i, (k, color) in enumerate([("consistency", "#4e79a7"), ("usefulness", "#59a14f"), ("naturalness", "#e15759")]):
        vals = [(r["g_eval"].get(k) or 0) for r in results]
        ax.bar(x + (i - 1) * width, vals, width, label=k, color=color)
    ax.axhline(4.0, ls="--", c="gray", lw=1, label="target 4.0")
    ax.set_xticks(x); ax.set_xticklabels(labels)
    ax.set_ylim(0, 5.2); ax.set_ylabel("score (1-5)")
    ax.set_title("G-Eval per NPC (dialogue quality)")
    ax.legend(fontsize=8, ncol=2)
    fig.tight_layout(); fig.savefig(out_dir / "g_eval.png", dpi=120); plt.close(fig)
    files["g_eval"] = "g_eval.png"

    # 2) CER
    fig, ax = plt.subplots(figsize=(8, 4))
    vals = [(r["speech"].get("CER") or 0) for r in results]
    bars = ax.bar(x, vals, color="#f28e2b")
    ax.axhline(0.10, ls="--", c="red", lw=1, label="target ≤0.10")
    ax.set_xticks(x); ax.set_xticklabels(labels)
    ax.set_ylabel("CER (lower better)")
    ax.set_title("Speech CER per NPC (Whisper)")
    ax.legend(fontsize=8)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v, f"{v:.3f}", ha="center", va="bottom", fontsize=8)
    fig.tight_layout(); fig.savefig(out_dir / "cer.png", dpi=120); plt.close(fig)
    files["cer"] = "cer.png"

    return files


def render_lipsync_chart(results: list[dict], out_dir: Path) -> str:
    """브라우저에서 실측한 '실제 3D 모델 입 morph ↔ 오디오' 상관을 막대그래프로 그린다.
    입 shape key가 없는 NPC(상관 0)는 빨간색 + 'no shape key' 표기로 구분."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    out_dir.mkdir(parents=True, exist_ok=True)
    labels = [r["label"] for r in results]
    x = np.arange(len(labels))
    vals, colors = [], []
    for r in results:
        lip = r.get("lipsync") or {}
        corr = lip.get("correlation")
        has_key = lip.get("has_shapekey", True)
        vals.append(corr if isinstance(corr, (int, float)) else 0.0)
        colors.append("#76b7b2" if has_key else "#d1495b")

    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(x, vals, color=colors)
    ax.axhline(0.7, ls="--", c="green", lw=1, label="target ≥0.7")
    ax.set_xticks(x); ax.set_xticklabels(labels)
    ax.set_ylim(0, 1.05); ax.set_ylabel("correlation (higher better)")
    ax.set_title("Lip-sync: rendered mouth morph ↔ audio (per NPC)")
    ax.legend(fontsize=8)
    for b, r in zip(bars, results):
        lip = r.get("lipsync") or {}
        if not lip.get("has_shapekey", True):
            ax.text(b.get_x() + b.get_width() / 2, 0.02, "no\nshape key", ha="center", va="bottom", fontsize=7, color="#d1495b")
    fig.tight_layout(); fig.savefig(out_dir / "lipsync.png", dpi=120); plt.close(fig)
    return "lipsync.png"


def summarize(results: list[dict]) -> dict:
    def avg(path_a, path_b):
        vals = []
        for r in results:
            v = r.get(path_a, {}).get(path_b)
            if isinstance(v, (int, float)):
                vals.append(v)
        return round(sum(vals) / len(vals), 3) if vals else None

    return {
        "consistency_avg": avg("g_eval", "consistency"),
        "usefulness_avg": avg("g_eval", "usefulness"),
        "naturalness_avg": avg("g_eval", "naturalness"),
        "CER_avg": avg("speech", "CER"),
        "lipsync_corr_avg": avg("lipsync", "correlation"),
    }
