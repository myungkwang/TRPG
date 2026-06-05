# 웹 테스트 맵 실행 방법

기존 `setup_db.py`와 `ingest_docx.py`까지 성공한 뒤 실행합니다.

## 1. 패키지 추가 설치

```bash
pip install -r requirements.txt
```

## 2. 서버 실행

```bash
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

## 3. 접속

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:8000
```

## 사용법

- 오른쪽 채팅창에 자유 행동을 입력합니다.
- 왼쪽 보드게임형 맵 타일을 클릭하면 해당 장소로 이동합니다.
- 이동 시 서버가 DB의 현재 위치를 갱신하고, AI GM이 RAG 컨텍스트를 참고해 장소 상황을 묘사합니다.

## 주의

- `.env`의 `DATABASE_URL`은 현재 성공한 값 그대로 유지하세요.
- PostgreSQL 컨테이너가 켜져 있어야 합니다.
- 기획서 ingest가 되어 있어야 RAG 답변 품질이 좋아집니다.
