# 한국어 입모양(립싱크) Shape Key 가이드

> 대상: 3D 모델러(Blender Shape Key 제작) + 프론트 개발자(립싱크 코드)
> 관련 코드: [Character3D.jsx](../frontend_src/src/components/Character3D.jsx)
> 작성일: 2026-06-14

3D 아바타가 한국어를 자연스럽게 발음하는 것처럼 보이게 하려면 **(A) 어떤 Shape Key를 만들지** 와 **(B) 그것을 어떻게 코드로 구동할지** 가 모두 맞아야 합니다. 이 문서는 두 가지를 함께 정리합니다.

---

## 0. 현재 상태와 문제점

현재 [Character3D.jsx](../frontend_src/src/components/Character3D.jsx)의 립싱크는 모음 비짐(viseme) **4개 + 턱**만 사용합니다.

```
aa_viseme / eh_viseme / ee_viseme / oh_viseme + JawOpen
```

한국어에 부족한 부분 두 가지:

1. **양순 폐쇄(ㅁ·ㅂ·ㅍ) 입 다묾이 없음** — 한국어 립싱크에서 가장 눈에 띄는 동작인데 전혀 표현되지 않습니다. 입이 항상 벌어진 채 웅얼거립니다.
2. **ㅜ와 ㅡ가 구분되지 않음** — 둘 다 `oh`로 뭉개져 부정확합니다.

또한 현재 코드는 글자의 **중성(모음)만** 보고 입모양을 정하며([`guessVisemeFromChar`](../frontend_src/src/components/Character3D.jsx#L85)), **초성·종성 자음을 무시**합니다.

---

## A. 필요한 Shape Key 세트 (모델러용)

아래 **8개**를 권장합니다. 이름은 코드의 [`morphTargetDictionary`](../frontend_src/src/components/Character3D.jsx#L424) 매칭에 그대로 쓰이므로 **정확히 동일하게** 명명해 주세요.

| Shape Key 이름 | 담당 한국어 음 | 입 모양 | 비고 |
|---|---|---|---|
| `aa_viseme` | ㅏ ㅑ ㅓ ㅕ | 크게 벌림, 입술 중립 | 기존 |
| `eh_viseme` | ㅐ ㅔ ㅒ ㅖ | 중간 벌림, 좌우로 약간 | 기존 |
| `ee_viseme` | ㅣ ㅢ | 좁게, 좌우로 당김(미소형) | 기존 |
| `oh_viseme` | ㅗ ㅛ ㅘ | 둥글게 중간 | 기존 |
| `oo_viseme` | ㅜ ㅠ ㅝ ㅟ ㅚ | 둥글게 오므림(좁게) | **신규 ★** |
| `eu_viseme` | ㅡ | 입술 다물 듯, 좌우로(턱 거의 안 벌림) | **신규 ★** |
| `mbp_viseme` | ㅁ ㅂ ㅃ ㅍ (초성·받침) | **입술 완전히 다묾** | **신규 ★ (가장 중요)** |
| `JawOpen` | (모든 모음 공통) | 턱만 별도로 벌림 | 모음 위에 가산 |

선택 사항(여유 있을 때):
- `ss_viseme` — ㅅ·ㅈ·ㅊ에서 입을 살짝 벌리고 좌우로. 미세한 차이.
- 받침 ㄴ·ㄹ은 혀 동작이라 입 모양 변화가 거의 없으므로 **생략 가능**.

### 모델러 핵심 원칙

- **`JawOpen`은 모음 Shape Key와 분리**해서 만드세요. 입술 모양(viseme)과 턱 벌림(JawOpen)을 코드에서 **따로 섞기** 때문에, 같은 ㅏ라도 "턱을 더/덜 벌린 ㅏ"를 표현할 수 있습니다.
- `mbp_viseme`는 **입술이 확실히 맞붙는** 형태로 만들어야 합니다. 어설프게 닫히면 ㅁㅂㅍ가 살지 않습니다.
- 각 Shape Key는 0~1 범위에서 독립적으로 더해지므로, 다른 Shape Key와 자연스럽게 합성되도록(상호 파괴 없이) 제작해 주세요.

---

## B. 립싱크 코드 (개발자용)

핵심은 **한글을 초성/중성/종성으로 분해**해서, 자음(ㅁㅂㅍ)에서는 입을 닫고 모음에서는 여는 것입니다.

### B-1. 한글 분해

```js
const CHOSEONG_COUNT = 19
// 양순음 인덱스: 초성 ㅁ=6 ㅂ=7 ㅃ=8 ㅍ=17 / 종성 ㅁ=16 ㅂ=17 ㅄ=18 ㅍ=26
const BILABIAL_CHO = new Set([6, 7, 8, 17])
const BILABIAL_JONG = new Set([16, 17, 18, 26])

// 중성(21) → viseme. 입술 모양 기준 재매핑
const JUNG_TO_VISEME = [
  'aa', 'eh', 'aa', 'eh',   // ㅏ ㅐ ㅑ ㅒ
  'aa', 'eh', 'aa', 'eh',   // ㅓ ㅔ ㅕ ㅖ
  'oh', 'oh', 'oo', 'oo',   // ㅗ ㅘ ㅙ ㅚ
  'oh', 'oo', 'oo', 'oo',   // ㅛ ㅜ ㅝ ㅞ
  'oo', 'oo', 'eu', 'ee',   // ㅟ ㅠ ㅡ ㅢ
  'ee',                     // ㅣ
]

function decomposeHangul(char) {
  const code = char.charCodeAt(0)
  if (code < HANGUL_BASE || code > HANGUL_END) return null
  const s = code - HANGUL_BASE
  return {
    cho: Math.floor(s / (JUNGSEONG_COUNT * JONGSEONG_COUNT)),
    jung: Math.floor(s / JONGSEONG_COUNT) % JUNGSEONG_COUNT,
    jong: s % JONGSEONG_COUNT,   // 0 = 받침 없음
  }
}
```

### B-2. 한 글자 → viseme 이벤트 (자음 폐쇄 + 모음)

한 글자를 `[양순 폐쇄(있으면)] → [모음]` 으로 쪼개고, 받침이 ㅁㅂㅍ면 글자 끝에 다시 닫기를 추가합니다.

```js
function syllableToVisemes(char) {
  const d = decomposeHangul(char)
  if (!d) {                       // 한글 아님 → 기존 영문 로직
    return [{ viseme: guessVisemeFromChar(char), close: false }]
  }
  const events = []
  if (BILABIAL_CHO.has(d.cho)) events.push({ viseme: 'mbp', close: true })  // 초성 ㅁㅂㅍ
  events.push({ viseme: JUNG_TO_VISEME[d.jung] || 'aa', close: false })     // 모음
  if (BILABIAL_JONG.has(d.jong)) events.push({ viseme: 'mbp', close: true }) // 받침 ㅁㅂㅍ
  return events
}
```

### B-3. 타임라인 — 자음은 짧게, 모음은 길게

자음 폐쇄는 짧고 빠르게(가중치 0.4), 모음은 길게(1.0) 배분해야 자연스럽습니다.

```js
function makeKoreanTimeline(text, duration) {
  const chars = Array.from(String(text || '').replace(/\s+/g, '')).filter(Boolean)
  if (!chars.length || !duration) return []
  const events = chars.flatMap(syllableToVisemes)
  const totalW = events.reduce((s, e) => s + (e.close ? 0.4 : 1), 0)
  let t = 0
  return events.map((e) => {
    const span = (duration / totalW) * (e.close ? 0.4 : 1)
    const frame = { time: t, step: span, viseme: e.viseme, close: e.close }
    t += span
    return frame
  })
}
```

### B-4. 가중치 산출 — 폐쇄 때 턱 닫음, 모음 사이 보간

여기가 자연스러움의 핵심입니다. **`mbp`(폐쇄) 구간엔 `JawOpen`을 0 쪽으로 눌러야** 입이 실제로 다물립니다. 모음 사이는 부드럽게 보간(coarticulation)합니다.

```js
function getKoreanWeights(timeline, time) {
  if (!timeline.length) return {}
  const i = THREE.MathUtils.clamp(
    timeline.findIndex((f) => time < f.time + f.step), 0, timeline.length - 1)
  const cur = timeline[i]
  const next = timeline[Math.min(i + 1, timeline.length - 1)]
  const local = (time - cur.time) / cur.step
  const blend = smoothStep(0.5, 0.95, local)   // 다음 음으로 넘어가는 구간

  const w = {}
  const add = (v, amt) => { if (v && amt > 0.01) w[v + '_viseme'] = (w[v + '_viseme'] || 0) + amt }
  add(cur.viseme, 1 - blend)
  if (next !== cur) add(next.viseme, blend)

  // 양순 폐쇄 구간엔 턱을 강제로 닫기
  const closeAmt = (cur.close ? (1 - blend) : 0) + (next.close ? blend : 0)
  w.JawOpen = THREE.MathUtils.clamp(0.35 * (1 - closeAmt), 0, 0.45)
  w.mbp_viseme = closeAmt   // 입술 다묾 강도
  return w
}
```

### B-5. 적용부 연결 (수정 체크리스트)

- [ ] [`makeVisemeTimeline`](../frontend_src/src/components/Character3D.jsx#L100) 호출들을 `makeKoreanTimeline`로 교체
- [ ] [`getRhythmTextVisemeWeights`](../frontend_src/src/components/Character3D.jsx#L183) / [`getVisemeWeights`](../frontend_src/src/components/Character3D.jsx#L112)를 `getKoreanWeights`로 교체
- [ ] [`lipMorphState`](../frontend_src/src/components/Character3D.jsx#L350) / `smoothedVisemes`에 **`oo_viseme`, `eu_viseme`, `mbp_viseme` 키 추가** (없으면 [`applyStableLipMorphs`](../frontend_src/src/components/Character3D.jsx#L448)가 무시함)
- [ ] [`applyStableLipMorphs`](../frontend_src/src/components/Character3D.jsx#L448) 보간 계수: 폐쇄(mbp)는 빠르게 닫고(factor ~0.4), 모음은 현행(~0.2) 유지 → 자음이 또렷해짐

---

## 정리 — 자연스러운 한국어 입모양 3원칙

1. **자음 입 다묾(mbp) 필수** — 한글을 분해해 ㅁ·ㅂ·ㅍ 초성/받침에서 입술을 닫는다. 체감 차이가 가장 큰 부분.
2. **ㅜ(oo)·ㅡ(eu) 분리** — `oh` 하나로 뭉개지 않는다.
3. **턱(JawOpen)은 가산이되 폐쇄 때 0** — 모음 위에 턱을 따로 얹고, 자음을 닫을 땐 턱도 함께 닫아야 입이 진짜 다물린다.

> 모델러는 위 8개 Shape Key를 **정확한 이름**으로, 개발자는 B-1~B-5 코드를 적용하면 됩니다. Shape Key 이름과 코드의 viseme 키가 1:1로 맞아야 동작합니다.
