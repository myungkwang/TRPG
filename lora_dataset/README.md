# 증기와 비늘 — 스타일 LoRA 데이터셋

맵/엔딩 배경을 우리 게임 톤으로 자동 생성하기 위한 **스타일 LoRA** 학습용 데이터셋.

- **트리거워드:** `steamscale_style`
- **목표 장수:** 15~40장 (기존 맵 4개 + 이번에 확정한 배경들 + 좋은 변형)

## 폴더 구조
```
lora_dataset/
  img/            ← 여기에 고해상도 PNG + 같은이름 .txt 캡션 (학습 입력)
  captions/       ← (참고용, 비워둬도 됨)
  make_captions.py
  README.md
```

## 작업 순서
1. **확정 이미지 모으기** — 고해상도 원본을 `img/`에 넣는다.
   파일명에 장소 키워드를 넣을 것: `peak`, `forge`, `garrison`, `cult`,
   `market`, `mineshaft`, `mine`, `refinery`, `clinic`, `inn`, `square`, `cabin`.
   예) `peak_final.png`, `forge_01.png`, `mineshaft_a.png`
2. **캡션 생성** — `python make_captions.py` → 각 이미지 옆에 `.txt` 자동 생성.
   키워드 못 잡은 건 `[?]`로 표시되니 그 `.txt`만 직접 다듬는다.
3. **kohya_ss 학습** (무료 Colab 권장, 로컬 4060도 가능):
   - base model: 기존 4개 맵을 뽑은 **그 SDXL 체크포인트와 동일**하게.
   - network: LoRA, dim 16~32 / alpha 16, lr 1e-4, ~10 repeats, 10~15 epoch.
   - 캡션에 `steamscale_style`가 고정으로 들어가야 스타일이 그 토큰에 묶임.
4. **결과물** `steamscale_style.safetensors` → ComfyUI `models/loras/`에 복사.
5. **추론** — 프롬포트 앞에 `steamscale_style,` 붙이고 LoRA 노드 weight 0.7~0.9.
   맵/엔딩/런타임 베드 엔딩 전부 이 톤으로 나옴.

## 메모
- 스타일 LoRA는 **구도가 아니라 톤**을 학습한다. 인물·용이 꼭 나와야 하는
  특수 엔딩은 여전히 Flow→img2img 컴포지팅으로 구도를 만든 뒤 이 LoRA로 톤만 입힌다.
- 원본(고해상도)을 꼭 보관할 것. 학습 리사이즈는 kohya가 알아서 함.
