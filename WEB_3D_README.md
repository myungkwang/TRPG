# 3D 모델 테스트 추가 버전

이 버전은 Perso AI TTS 변경 전 웹 테스트 버전을 기준으로, 브라우저에서 `GM_Demo.fbx`를 불러오는 3D 뷰어를 추가한 버전입니다.

## 추가 파일

```text
static/model-viewer.js
static/models/GM_Demo.fbx
```

## 실행

```bash
pip install -r requirements.txt
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

브라우저:

```text
http://127.0.0.1:8000
```

## 주의

- 3D 로딩은 브라우저에서 Three.js CDN을 사용합니다. 인터넷 연결이 필요합니다.
- FBX 파일이 크므로 첫 로딩에 시간이 걸릴 수 있습니다.
- 모델이 너무 작거나 크게 보이면 `static/model-viewer.js`의 `frameObject()` 함수에서 `160 / maxDim` 값을 조정하세요.
