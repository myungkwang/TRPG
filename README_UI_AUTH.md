# 증기와 비늘 UI/Auth 통합 버전

## 실행
```bash
pip install -r requirements.txt
python setup_db.py
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

## 접속
- 로그인: http://127.0.0.1:8000/login
- 회원가입: http://127.0.0.1:8000/signup
- 메인: http://127.0.0.1:8000/

## 변경 내용
- 기존 PostgreSQL, RAG, 로그인/회원가입 API 유지
- `steamscale-proto` React UI를 빌드해 `static/index.html`, `static/assets/`로 적용
- 로그인하지 않은 상태에서 메인 접속 시 `/login`으로 이동
- 게임 시작/이어하기가 기존 `/api/session`, `/api/chat`, `/api/tts`와 연결됨
- 기존 3D 모델/애니메이션은 `static/models`, `static/animations`를 그대로 사용

## 프론트 소스
수정용 React 원본은 `frontend_src/`에 보관되어 있습니다.
수정 후 빌드하려면:
```bash
cd frontend_src
npm install
npm run build
```
생성된 `dist/index.html`, `dist/assets/`를 프로젝트의 `static/`에 복사하면 됩니다.
