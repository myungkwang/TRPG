# 3D 모델 + 감정 애니메이션 테스트 버전

## 실행

```bash
pip install -r requirements.txt
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

브라우저:

```text
http://127.0.0.1:8000
```

## 핵심 수정

- `static/index.html`에 Three.js importmap 추가
- `static/model-viewer.js`를 CDN import 방식으로 수정
- `static/animations/*.fbx` 추가
- GM 응답 텍스트를 간단히 분석해서 말하기/기쁨/분노/생각 애니메이션을 자동 재생

## 주의

- CDN을 쓰므로 인터넷 연결이 필요합니다.
- 애니메이션 FBX와 캐릭터 FBX의 스켈레톤이 다르면 동작이 일부 깨질 수 있습니다. 이 경우 같은 리깅/스켈레톤으로 export된 FBX가 필요합니다.
- 브라우저에서 모델이 계속 로딩 중이면 F12 Console에서 `Failed to resolve module specifier three` 오류가 있는지 확인하세요. 이 버전은 importmap으로 해당 오류를 해결했습니다.
