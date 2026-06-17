# AI휴먼 정량 평가 하네스 (증기와 비늘)

`AI휴먼_정량평가_실행가이드_수정.md` 를 이 프로젝트에 맞춰 구현한 **블랙박스 평가 파이프라인**.
평가 모델("검문소")은 제품 코드와 완전히 분리돼 있고, 출력물(텍스트·음성·립싱크·로그) 뒤에 붙어 점수만 찍는다.

이 프로젝트는 **전체 AI휴먼**(텍스트 챗 + TTS + 3D 캐릭터 립싱크) 이다.
아바타가 **사람 얼굴이 아닌 3D 캐릭터**라서 립싱크는 가이드 **§5-B(입벌림↔RMS 상관)** 를 쓴다. SyncNet/LSE(§5-A)는 적용하지 않는다.

```
사용자 입력
   │
   ▼
[제품 = 블랙박스]  gm_reply(LLM) · CosyVoice/Edge TTS · Character3D 립싱크
   │ 텍스트 ───────► (A) GPT-4o Judge      → run_dialogue.py + g_eval.py
   │ 텍스트(멀티턴)► (A') 멀티턴 일관성 채점 → run_multiturn.py + g_eval_multiturn.py
   │ 음성   ───────► (B) Whisper STT        → synth_tts.py + speech_eval.py
   │ 음성(화자정합)► (E) f0 성별/안정성/구분 → voice_eval.py
   │ 립싱크 ───────► (C) mouth_open↔RMS 상관 → lipsync_eval.py
   ▼
화면      ◄──────── (D) 서버 로그/DB         → metrics_system.py (TTFB·완료율·FPS)
```

> (A') 멀티턴·(E) 화자정합은 단일턴 G-Eval(텍스트)·CER(발음)이 못 잡는 축을 보강한다.
> - (A') 긴 대화에서 페르소나 드리프트/맥락 유지 — 오프토픽·역할해제 요구에 흔들리는지.
> - (E) "남자가 여자 목소리/발화 중 톤 바뀜/전 화자 동일 목소리" 같은 음성 정합 문제.

## 설치

가상환경은 conda `trpg` 를 쓴다. 모든 명령은 그 환경에서 실행한다.

```bash
conda activate trpg
pip install -r eval/requirements.txt
# 또는 활성화 없이: conda run -n trpg python eval/<script>.py
```

`speech_eval.py` 는 `ffmpeg` 가 PATH 에 있어야 한다(Whisper 디코딩).

## 실행 순서

산출물은 모두 `eval/outputs/` 에 떨어진다.

```bash
# 0) 테스트셋: eval/testset.jsonl (38문 — 일상12/전문9/엣지6/위험3/오프토픽4/탈주4)
#            eval/testset_multiturn.jsonl (멀티턴 대화 3건)

# A) 대화 품질 (G-Eval) -----------------------------------------
python eval/run_dialogue.py        # testset → 제품 gm_reply → outputs/dialogue.jsonl (TTFB도 같이 잰다)
python eval/g_eval.py              # GPT-4o 채점관(temperature=0, 3회 평균) → outputs/g_eval.json

# A') 멀티턴 일관성 -------------------------------------------
python eval/run_multiturn.py       # 한 세션에서 여러 턴 → outputs/dialogue_multiturn.jsonl
python eval/g_eval_multiturn.py    # 전사 전체를 일관성/드리프트저항/맥락유지로 채점 → outputs/g_eval_multiturn.json

# B) 음성 품질 (CER/WER) ----------------------------------------
#    서버를 띄우고(EVAL_BASE_URL), 로그인 토큰을 EVAL_TOKEN 에 넣는다.
python eval/synth_tts.py           # dialogue 응답 → /api/tts → outputs/audio/*.wav
python eval/speech_eval.py         # Whisper 되받아쓰기 → CER/WER → outputs/speech.json

# E) 화자 음성 정합 (성별/안정성/구분도) ------------------------
#    서버+토큰 필요(화자별 프로브를 /api/tts 로 합성). 이미 합성된 wav 만 분석하려면 --analyze-only.
python eval/voice_eval.py          # 화자별 f0 → 성별 대역/발화내 안정성/화자 구분도 → outputs/voice.json

# C) 립싱크 (§5-B) ----------------------------------------------
#    브라우저에서 window.__LIPSYNC_LOG__=true 로 켜고 발화시킨 뒤,
#    window.__lipsyncDump() 로 받은 JSON 과 해당 wav 를 짝지어 둔다.
python eval/lipsync_eval.py --mouth outputs/lipsync/<name>.json --wav outputs/audio/<name>.wav

# D) 시스템 지표 ------------------------------------------------
#    FPS: 브라우저 콘솔에 eval/fps_probe.js 를 붙여넣고 await window.__fpsReport(5) 실행.
python eval/metrics_system.py --fps 58 --fps-keep-rate 100   # TTFB(dialogue) + 완료율(DB) + FPS → outputs/system.json

# 보고서 ------------------------------------------------------
python eval/report.py              # 위 결과 전부 모아 outputs/report.md (§7 평가표)
```

## 환경 변수

| 변수 | 기본 | 용도 |
|---|---|---|
| `OPENAI_API_KEY` | (필수) | G-Eval 채점관(gpt-4o) |
| `EVAL_JUDGE_MODEL` | `gpt-4o` | 채점관 모델. 응답모델과 달라야 함 |
| `EVAL_JUDGE_REPEAT` | `3` | 같은 응답 반복 채점 횟수(편차↓) |
| `EVAL_BASE_URL` | `http://127.0.0.1:8000` | TTS 호출용 서버 주소 |
| `EVAL_TOKEN` | (TTS 시 필수) | 로그인 액세스 토큰. `/api/auth/login` 응답의 토큰 |
| `EVAL_TTS_SPEAKER` | `gm` | 합성 화자 |

## 목표치 (가이드 §7)

| 지표 | 목표 |
|---|---|
| G-Eval 일관성/유용성/자연스러움 (1~5) | ≥ 4.0 |
| 멀티턴 일관성/드리프트저항/맥락유지 (1~5) | ≥ 4.0 |
| 음성 성별 정합률 | = 1.0 (전 화자 기대 성별 대역 내) |
| 음성 발화내 톤 불안정 화자수 / 거의 같은 목소리 쌍 | 0 |
| CER | ≤ 0.10 |
| 립싱크 상관계수 | ≥ 0.7 |
| 립싱크 지연 | ±100ms 이내 |
| TTFB | ≤ 1.5s |
| FPS | ≥ 30 |
| 완료율 | ≥ 80% |
| MOS (교차검증) | 자동지표와 동일 방향 |

MOS(§6)는 사람 5~10명 구글폼이라 코드 밖. **평가자 일정부터 확정**할 것(가이드가 짚은 최빈 실패).
