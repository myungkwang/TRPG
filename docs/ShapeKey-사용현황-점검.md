# Shape Key 사용 현황 점검 (한국어 립싱크)

> 목적: 팀원이 Blender로 제작한 입모양 Shape Key 24개가 TRPG1 코드에서 **실제로 쓰이는지** 점검하고, 안 쓰는 것 / 부족한 것을 정리.
> 관련 코드: [Character3D.jsx](../frontend_src/src/components/Character3D.jsx)
> 같이 보기: [한국어-입모양-ShapeKey-가이드.md](한국어-입모양-ShapeKey-가이드.md)
> 작성일: 2026-06-14

---

## 0. 기준 — 코드가 실제로 구동하는 morph

현재 [Character3D.jsx](../frontend_src/src/components/Character3D.jsx)의 립싱크가 `setMorph()`로 실제 구동하는 Shape Key는 **아래 6개뿐**입니다. ([`lipMorphState`](../frontend_src/src/components/Character3D.jsx#L351), [`blendVisemeWeights`](../frontend_src/src/components/Character3D.jsx#L161))

```
JawOpen, jawOpen, aa_viseme, eh_viseme, ee_viseme, oh_viseme
```

이름이 정확히 일치하는 Shape Key만 [`morphTargetDictionary`](../frontend_src/src/components/Character3D.jsx#L424)로 매칭되어 움직입니다. 그 외 이름은 코드가 호출하지 않으므로 모델에 있어도 동작하지 않습니다.

팀원 제작 24개와 대조한 결과는 다음과 같습니다.

---

## 1. 지금 사용 중 (4개)

| Shape Key | 담당 한국어 음 | 비고 |
|---|---|---|
| `aa_viseme` | ㅏ ㅓ | |
| `eh_viseme` | ㅐ ㅔ | |
| `ee_viseme` | ㅣ | |
| `oh_viseme` | ㅗ (+ ㅜ까지 뭉뚱그림) | ㅜ가 분리되지 않아 부정확 |

---

## 2. 만들었지만 코드가 안 쓰는 것 (20개)

### (a) 한국어에 유용 — 연결하면 바로 품질 향상 ★

| Shape Key | 연결하면 |
|---|---|
| `viseme_PP` ★★ | **ㅁ·ㅂ·ㅍ 입 다묾** — 한국어 립싱크 체감 1순위. (가이드의 `mbp` 역할) |
| `oo_viseme` ★ | ㅜ·ㅠ 분리 (지금 `oh`로 뭉개지는 것 해소) |
| `mouthPucker` / `mouthFunnel` | ㅗ·ㅜ 둥글림 보강 |
| `mouthSmile_L` / `mouthSmile_R` | ㅣ·ㅔ 좌우 당김(미소형) 보강 |
| `mouthClose` | 입술 다묾 — `viseme_PP` 보조 |
| `viseme_U` | ㅜ 계열 (단, `oo_viseme`와 중복 → 둘 중 하나만 사용) |

### (b) 한국어에는 거의 불필요 (영어 음소 / 혀 자음 — 입모양 변화 미미)

```
viseme_FF (f/v, 한국어에 없는 음), viseme_TH, viseme_DD, viseme_kk,
viseme_CH, viseme_SS, viseme_nn, viseme_RR, mouthWide, mouthNarrow,
mouthFrown_L, mouthFrown_R
```

- 한국어 립싱크에는 안 써도 무방합니다(대부분 혀·치아 동작이라 입모양에 거의 안 보임).
- `mouthFrown_*` / `mouthSmile_*` 등은 립싱크 외 **감정 표정용**으로는 따로 활용 가치가 있습니다.

---

## 3. 부족한 것 (코드가 필요로 하나 세트에 없음)

| 필요한 Shape Key | 상태 | 대응 |
|---|---|---|
| **`JawOpen`** (+ `jawOpen`) | **없음 ⚠️ 치명적** | 코드의 입벌림 주동력. 세트에 jaw 키가 없으면 오디오 볼륨 → 입벌림이 **거의 무동작**이 됨. 턱이 **본(bone)** 으로 움직이는 모델이면 별개지만, morph 기반이라면 **반드시 추가** 필요 |
| `eu_viseme` (ㅡ) | 없음 | 한국어 ㅡ 전용 키 없음. `mouthWide` + 턱 거의 닫힘으로 근사하거나 신규 제작 |

---

## 4. 핵심 정리

1. **24개를 만들었지만 코드는 4개만 사용** 중 — 대부분 미연결 상태.
2. **가장 시급**: `JawOpen` 존재 여부 확인 / 추가. (없으면 입벌림 자체가 동작하지 않음)
3. **빠른 개선(quick win)**: `viseme_PP`(ㅁㅂㅍ) + `oo_viseme`(ㅜ) 두 개만 코드에 연결해도 한국어 자연스러움이 크게 향상됨.
4. **네이밍 규칙 불일치 주의**: 기존 코드는 `aa_viseme`(접미사식), 팀원 신규 키는 `viseme_PP`(접두사식)로 혼용됨. 코드는 **이름 문자열 정확 일치**로 매칭하므로, 연결 시 코드에 실제 Shape Key 이름을 그대로 적어야 함.

> 연결 방법(분해·매핑·턱 처리 코드)은 [한국어-입모양-ShapeKey-가이드.md](한국어-입모양-ShapeKey-가이드.md) B 섹션 참고. 단, 그 가이드는 `mbp_viseme`라는 이름을 가정했으므로, 실제로는 팀원이 만든 **`viseme_PP`** 이름으로 코드의 viseme 키를 맞춰 주면 됩니다.
