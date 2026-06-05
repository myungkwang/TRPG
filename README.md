# 증기와 비늘 - RAG + PostgreSQL 테스트 프로그램

업로드한 기획 초안을 PostgreSQL(pgvector)에 넣고, LLM이 `AI GM`처럼 응답하는 최소 테스트용 파이썬 프로그램입니다.

## 1. PostgreSQL 실행

Docker가 있다면 아래 명령으로 pgvector 포함 DB를 실행합니다.

```bash
docker compose up -d
```

## 2. Python 설치

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

## 3. 환경변수 설정

`.env.example`을 `.env`로 복사한 뒤 `OPENAI_API_KEY`를 넣습니다.

```bash
cp .env.example .env
```

## 4. DB 테이블 생성

```bash
python setup_db.py
```

## 5. 기획 초안 문서 ingest

업로드된 docx 파일 경로 예시:

```bash
python ingest_docx.py "/mnt/data/증기와비늘 기획 초안.docx"
```

## 6. CLI 테스트

```bash
python gm_cli.py
```

예시 입력:

```text
나는 진료소에서 깨어났어. 손에 영석 조각을 쥐고 있어.
린에 대해 조사하고 싶어.
카르가스를 설득해서 광부들을 풀어달라고 말해볼래.
/quit
```

## 핵심 구조

- `documents`, `chunks`: 기획 초안/RAG 지식 저장
- `game_sessions`: 플레이어 상태 저장
- `game_events`: 대화/판정 로그 저장
- `retrieve_context()`: 질문과 유사한 설정 조각 검색
- `roll_check()`: d12 + 능력치 보정 + 직업 보정 판정
- `gm_reply()`: RAG 컨텍스트 + 현재 상태 + 판정 결과를 LLM 프롬프트에 넣어 응답 생성

## 주의

이 코드는 MVP 검증용입니다. 실제 게임 서버로 확장하려면 FastAPI API, 프론트엔드 연동, 세션 저장/불러오기, NPC별 페르소나 프롬프트 분리, 퀘스트 플래그 검증 로직을 추가하는 편이 좋습니다.
