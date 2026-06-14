# 팀 공유 / 셋업 가이드 — 증기와 비늘

게임을 **AI 배경·엔딩 생성까지** 똑같이 돌리려면 아래대로 하면 된다.

## 0. 무엇을 받나
| 받을 것 | 어디서 |
|---|---|
| **코드 전체** (빌드된 프론트 포함) | git: `github.com/myungkwang/TRPG` |
| **LoRA 파일** `steamscale_style.safetensors` (~170MB) | 구글드라이브/HF 링크 (git엔 없음) |
| **SDXL 1.0 base** `sd_xl_base_1.0.safetensors` | [공식](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) 무료 다운 |
| 본인 **OpenAI 키 / DB / JWT 시크릿** | 각자 발급 (공유 X) |

> `.env`(비밀키), LoRA·체크포인트(대용량), ComfyUI, 학습데이터(`lora_dataset/`)는 **git에 없음.** 코드 + 고정배경만 git으로 온다.

## 1. 코드 받기 + 파이썬 의존성
```powershell
git clone https://github.com/myungkwang/TRPG.git
cd TRPG
pip install -r requirements.txt
```

## 2. 환경설정 (.env)
```powershell
Copy-Item .env.example .env
```
`.env` 열어서 **본인 값**으로 채운다:
- `OPENAI_API_KEY` — 본인 OpenAI 키 (대사·RAG용, 필수)
- `DATABASE_URL` — 본인 PostgreSQL 주소
- `JWT_SECRET_KEY` — 아무 긴 랜덤 문자열
- `IMAGE_PROVIDER` — GPU 있으면 `comfyui`, 없으면 `static`(AI이미지만 비활성, 게임은 됨)

## 3. DB 준비 (PostgreSQL + pgvector)
```powershell
# Postgres에 DB 생성 후
python setup_db.py          # 테이블 생성
python ingest_md.py         # 세계관 RAG 적재 (docs/lore/*.md)
```

## 4. AI 이미지 (ComfyUI) — `IMAGE_PROVIDER=comfyui`일 때만
1. ComfyUI 설치 + 실행 (포터블 권장, NVIDIA GPU 필요)
2. `sd_xl_base_1.0.safetensors` → `ComfyUI/models/checkpoints/`
3. **`steamscale_style.safetensors`(공유받은 LoRA)** → `ComfyUI/models/loras/`
4. ComfyUI 켜두기 (`http://127.0.0.1:8188`)
> GPU 없으면 이 단계 건너뛰고 `.env`에서 `IMAGE_PROVIDER=static`. 핵심 6개 고정배경은 그대로 보이고, 그 외 AI생성·AI엔딩만 비활성.

## 5. 실행
```powershell
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```
→ 브라우저 `http://127.0.0.1:8000`

## 참고
- **프론트는 이미 빌드돼 있음**(`static/`) — 프론트 코드 안 고치면 `npm run build` 불필요.
- 프론트 수정 시: `cd frontend_src && npm install && npm run build`
- LoRA 갱신(재학습) 시: 새 `.safetensors`를 `ComfyUI/models/loras/`에 덮고 ComfyUI 새로고침. 트리거(`steamscale_style`) 유지하면 코드 수정 불필요.
