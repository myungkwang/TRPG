# 증기와 비늘

한국어 AI TRPG 웹 게임입니다. FastAPI 서버가 세션, 인증, RAG 기반 AI GM, TTS, AI 배경/엔딩 생성 API를 제공하고, React/Three.js 프론트엔드가 대화 로그, 선택지, 3D 캐릭터, 배경 연출, 도감, 평가 패널을 보여줍니다.

초기 CLI/RAG 실험용 프로젝트가 아니라, 현재는 브라우저에서 플레이하는 통합 게임 앱입니다.

## 주요 기능

- 로그인/회원가입과 계정별 세션 관리
- 캐릭터 생성 질문, 능력치/직업/아이템 상태 저장
- RAG 기반 AI GM 대화와 스토리 선택지 진행
- D12 판정, 지도 이동, 장비 장착, 단서/엔딩 도감
- React + Three.js 기반 3D NPC/GM 모델, 립싱크, 애니메이션
- Edge TTS 기본 지원, Supertone 선택 지원, CosyVoice 실험 코드 보관
- 고정 배경과 ComfyUI/OpenAI 기반 AI 배경 및 엔딩 이미지 생성
- NPC 대화 품질, TTS, 립싱크 정량검사 패널

## 실행 구조

| 영역 | 위치 | 역할 |
|---|---|---|
| 서버 | `server.py` | FastAPI 앱, 인증, 세션, 대화, TTS, 이미지, 평가 API |
| AI GM | `gm_cli.py`, `llm.py`, `rag.py` | LLM 호출, RAG 검색, GM 응답 생성 |
| 진행/규칙 | `story.py`, `progression.py`, `game_logic.py`, `items_catalog.py` | 스토리 노드, 플래그, 판정, 아이템 |
| 프론트 원본 | `frontend_src/` | React/Vite 소스 |
| 배포 프론트 | `static/` | FastAPI가 직접 서빙하는 빌드 결과와 정적 자산 |
| 설정 자료 | `docs/lore/` | RAG에 적재하는 세계관/인물/사건 문서 |
| 평가 | `eval/`, `eval_service.py` | G-Eval, 발음, 립싱크, 리포트 생성 |

## 빠른 시작

### 1. 의존성 설치

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

프론트 소스를 수정할 때만 Node 의존성이 필요합니다.

```powershell
cd frontend_src
npm install
cd ..
```

### 2. PostgreSQL 실행

Docker가 있으면 pgvector 포함 PostgreSQL을 바로 띄울 수 있습니다.

```powershell
docker compose up -d
```

기본 DB 접속값은 `.env.example`의 `DATABASE_URL=postgresql://persona:persona@localhost:5433/persona_ai`와 맞춰져 있습니다.

### 3. 환경변수 설정

```powershell
Copy-Item .env.example .env
```

최소 필수 값:

| 변수 | 설명 |
|---|---|
| `OPENAI_API_KEY` | AI GM 대화, RAG 응답, 일부 평가/이미지 기능에 사용 |
| `DATABASE_URL` | PostgreSQL 접속 주소 |
| `JWT_SECRET_KEY` | 로그인 토큰 서명용 긴 랜덤 문자열 |
| `IMAGE_PROVIDER` | `static`, `comfyui`, `openai` 중 선택 |
| `TTS_PROVIDER` | 기본값은 `edge`; `supertone` 사용 시 별도 API 키 필요 |

GPU나 ComfyUI가 없으면 `IMAGE_PROVIDER=static`으로 두면 됩니다. 이 경우 주요 고정 배경으로 게임은 진행되고, AI 배경/AI 엔딩 이미지만 비활성화됩니다.

### 4. DB 초기화와 RAG 적재

```powershell
python setup_db.py
python ingest_md.py
```

`ingest_md.py`는 `docs/lore/*.md` 세계관 문서를 pgvector에 적재합니다. `.docx` 초안 적재가 필요할 때는 `ingest_docx.py`를 사용할 수 있습니다.

### 5. 서버 실행

```powershell
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

또는 Windows에서:

```powershell
.\run_game_server.cmd
```

접속:

- 메인: `http://127.0.0.1:8000/`
- 로그인: `http://127.0.0.1:8000/login`
- 회원가입: `http://127.0.0.1:8000/signup`

## 프론트엔드 개발

개발 서버:

```powershell
cd frontend_src
npm run dev
```

Vite 개발 서버는 `http://127.0.0.1:5173/static/` 경로로 열립니다.

빌드:

```powershell
.\build_frontend_static.ps1
```

또는:

```powershell
cd frontend_src
npm run build
```

`frontend_src/vite.config.js`의 `outDir`이 `../static`이므로 빌드 결과는 `static/index.html`과 `static/assets/`에 바로 반영됩니다. 별도 복사 단계는 필요 없습니다.

## AI 이미지 생성

`IMAGE_PROVIDER` 값에 따라 동작이 달라집니다.

| 값 | 동작 |
|---|---|
| `static` | 런타임 이미지 생성 없음. 고정 배경/고정 엔딩 이미지만 사용 |
| `comfyui` | 로컬 ComfyUI로 장소 배경과 엔딩 일러스트 생성 |
| `openai` | OpenAI 이미지 API로 생성 |

ComfyUI 사용 시:

1. ComfyUI를 `http://127.0.0.1:8188`에서 실행합니다.
2. SDXL base checkpoint를 `ComfyUI/models/checkpoints/`에 둡니다.
3. `steamscale_style.safetensors` LoRA를 `ComfyUI/models/loras/`에 둡니다.
4. `.env`에서 `IMAGE_PROVIDER=comfyui`로 설정합니다.

생성된 장소 배경은 `static/backgrounds/gen/`에 캐시되고, 깊이맵은 가능한 경우 `static/backgrounds/gen/depth/`에 저장됩니다.

## TTS

기본 개발/시연 경로는 Edge TTS입니다.

```env
TTS_PROVIDER=edge
TTS_FALLBACK_PROVIDER=none
```

Supertone을 쓰려면 `.env.example`의 Supertone 관련 값을 채우고 `TTS_PROVIDER=supertone`으로 바꿉니다. CosyVoice 관련 파일과 코드는 남아 있지만, 현재 서버 기본 동작에서는 실수로 무거운 모델이 로드되지 않도록 비활성화되어 있습니다.

## 주요 API

| 경로 | 설명 |
|---|---|
| `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me` | 인증 |
| `POST /api/session`, `GET /api/session/{session_id}` | 게임 세션 |
| `POST /api/chat`, `POST /api/chat/stream` | AI GM 대화 |
| `GET /api/character/questions`, `POST /api/character/preview`, `POST /api/character/confirm` | 캐릭터 생성 |
| `GET /api/story/{session_id}`, `POST /api/story/choice` | 스토리 장면과 선택지 |
| `POST /api/move`, `POST /api/equip` | 지도 이동과 장비 |
| `POST /api/background` | 비고정 장소 AI 배경 생성 |
| `POST /api/ending/lock`, `GET /api/ending/{session_id}` | 엔딩 확정/조회 |
| `POST /api/tts`, `POST /api/tts/stream` | 음성 생성 |
| `GET /api/codex`, `GET /api/codex/clues/{session_id}` | 도감/단서 |
| `POST /api/eval/run`, `GET /api/eval/status/{job_id}`, `POST /api/eval/lipsync` | 정량검사 |

## 문서

- `TEAM_SETUP.md`: 팀원이 같은 환경으로 실행하기 위한 상세 셋업
- `README_UI_AUTH.md`: UI/Auth 통합 시점의 보조 메모
- `WEB_3D_README.md`, `WEB_3D_ANIMATION_README.md`: 3D 모델/애니메이션 관련 메모
- `docs/lore/`: AI GM용 세계관 정본
- `docs/tts-연동가이드.md`: TTS 연동 메모
- `eval/README.md`: 정량평가 하네스 설명

## 자주 겪는 문제

### `OPENAI_API_KEY is missing`

`.env`가 없거나 `OPENAI_API_KEY`가 비어 있습니다. `.env.example`을 복사한 뒤 본인 키를 넣으세요.

### 로그인 후 메인으로 가지 않음

`JWT_SECRET_KEY`가 설정되어 있는지 확인하고, 브라우저 localStorage의 오래된 토큰을 지운 뒤 다시 로그인하세요.

### AI 배경이 안 나옴

`IMAGE_PROVIDER=static`이면 정상 동작입니다. 런타임 생성을 원하면 `comfyui` 또는 `openai`로 바꾸고 필요한 서버/API 키를 준비하세요.

### 프론트 수정이 화면에 반영되지 않음

FastAPI는 `static/`을 서빙합니다. `frontend_src/`를 수정한 뒤 `.\build_frontend_static.ps1` 또는 `cd frontend_src && npm run build`를 실행하세요.
