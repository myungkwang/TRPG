# TTS 연동 가이드 (TTS 담당자 전달용)

NPC마다 고정된 목소리로 GM 대사를 음성 출력하기 위한 연동 명세입니다.

## 1. 무엇을 쓰면 되나 — NPC별 목소리 데이터
`steamscale-proto/src/personas.js` 안에 NPC마다 `tts` 정보가 있습니다.

```js
PERSONAS.lin.tts // → { voice: 'shimmer', instructions: '낮고 느긋한 여성 목소리...' }
```

| NPC(id) | voice | 톤(instructions 요약) |
|---|---|---|
| 린 (lin) | shimmer | 낮고 느긋한 여성, 끝을 흐리며 의뭉스럽게 |
| 가일 (gail) | onyx | 굵고 위압적인 중년 남성, 단호하게 |
| 마르타 (marta) | fable | 느리고 차분한 노년, 이야기하듯 |
| 토비 (tobi) | alloy | 밝고 다급한 소년 톤 |
| 의사 (doctor) | echo | 차분하고 낮은 중년, 신중하게 |
| 카르가스 (kargas) | onyx | 깊고 울리는 초월적 저음, 위협적이고 느리게 |

> voice 값은 OpenAI TTS 보이스(alloy/echo/fable/onyx/nova/shimmer …). 바꾸고 싶으면 personas.js만 수정하면 전체 반영됩니다.

## 2. 백엔드 — 지금 상태 & 해야 할 일
현재 `server.py`의 `POST /api/tts`:
- 입력: `{ text, voice? }`
- voice를 안 주면 `_voice_from_text()`가 텍스트 감정으로 보이스를 **자동 선택**(전역 규칙)
- `gpt-4o-mini-tts`로 mp3 생성 → `{ audio_url, voice }` 반환
- ⚠️ 아직 **`instructions`(톤 가이드)를 안 받음**

### 해야 할 일 (백엔드, 작음)
요청에 `instructions`를 추가로 받아 TTS 호출에 넘기기:

```python
class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    instructions: str | None = None   # ← 추가

# tts() 안의 생성 호출에 instructions 전달
with openai_client.audio.speech.with_streaming_response.create(
    model="gpt-4o-mini-tts",
    voice=voice,
    input=text,
    instructions=req.instructions or "",   # ← 추가
) as response:
    response.stream_to_file(out_path)
```

이렇게만 하면 NPC별 보이스+톤이 그대로 반영됩니다. (감정 자동선택 로직은 그대로 둬도 되고, persona voice가 오면 그게 우선됩니다.)

## 3. 프론트 — 호출 방법 (계약)
대사를 출력할 때, **그 대사의 화자(speaker id)로 persona를 찾아 voice·instructions를 함께** 보냅니다.

```js
import { getPersona } from './personas.js'

// speakerId = 화자 id('lin' 등), emotion = 대사 감정(선택, persona.emotions 키)
async function speak(speakerId, text, emotion) {
  const p = getPersona(speakerId)            // 예: 'lin'
  // 기본 음색 지시문 + (있으면) 감정별 보정 문구를 합친다
  const extra = emotion ? (p?.tts.byEmotion?.[emotion] ?? '') : ''
  const instructions = `${p?.tts.instructions ?? ''} ${extra}`.trim()

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      text,
      voice: p?.tts.voice,                   // NPC 고정 보이스
      instructions,                          // NPC 음색 + 감정 보정
    }),
  })
  const { audio_url } = await res.json()
  new Audio(audio_url).play()                // 반환된 mp3 재생
}
```

요청/응답 계약 요약:
- 요청: `POST /api/tts` `{ text, voice, instructions }` (+ 인증 토큰)
- 응답: `{ audio_url, voice }` → `audio_url`을 `<audio>`로 재생

## 4. 역할 분담 제안
- **TTS 담당**: 위 2번(백엔드 `instructions` 추가) + mp3 재생/캐싱/끊김 처리.
- **프론트(우리)**: 대사 화자 id를 넘겨주는 3번 호출부 연결.
- **공통 데이터**: `personas.js`의 `tts` 필드 (보이스/톤 바꾸려면 여기만 수정).

## 5. 감정별 톤 (이미 포함됨)
각 persona의 `tts`에는 상세 `instructions`와 함께 **감정별 보정(`byEmotion`)**이 들어 있습니다.

```js
PERSONAS.lin.tts = {
  voice: 'shimmer',
  instructions: '20대 후반으로 들리는 여성... 부드럽고 약간 허스키한 중저음...',  // 음색·속도·높낮이·억양·감정 상세
  byEmotion: { talk: '나른하고 의뭉스럽게.', cocky: '장난스럽게...', thinking: '...', happy: '...' },
}
```

대사에 감정(`emotion`)이 있으면 `instructions` 뒤에 `byEmotion[emotion]`을 덧붙여 보냅니다 (§3 호출 예제 참고).
감정이 없으면 기본 `instructions`만 보내면 됩니다.

> ⚠️ gpt-4o-mini-tts는 음성을 "학습/훈련"하지 않습니다. `instructions`(자연어 음색 지시문)를 보고 매번 그 톤을 흉내 냅니다.
> 그래서 목소리 일관성은 **instructions를 얼마나 구체적으로 쓰느냐**에 달려 있고, 톤을 바꾸려면 personas.js의 해당 문구만 고치면 됩니다.
