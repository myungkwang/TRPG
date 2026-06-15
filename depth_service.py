# -*- coding: utf-8 -*-
"""깊이맵 마이크로서비스 (2.5D 패럴랙스용).
   POST /depth  (요청 본문 = 이미지 바이트)  →  응답 = 깊이맵 PNG (가까울수록 밝게)
   모델은 시작 시 1회만 로드한다. 보통 server.py(uvicorn) 시작 시 자동 기동되며,
   ComfyUI 내장 파이썬(torch 보유)으로 실행한다 → 팀원도 ComfyUI만 있으면 됨(kohya 불필요).
   수동 실행 예:
     d:/ComfyUI_windows_portable/python_embeded/python.exe depth_service.py
"""
import io
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np
from PIL import Image
import torch
from transformers import pipeline

PORT = 8189
_dev = 0 if torch.cuda.is_available() else -1
print(f"[depth] 모델 로딩... (device={'cuda' if _dev == 0 else 'cpu'})", flush=True)
try:
    PIPE = pipeline("depth-estimation", model="LiheYoung/depth-anything-small-hf", device=_dev)
except Exception as e:
    print("[depth] depth-anything 실패, dpt 로 폴백:", e, flush=True)
    PIPE = pipeline("depth-estimation", model="Intel/dpt-hybrid-midas", device=_dev)
print(f"[depth] 준비 완료. http://127.0.0.1:{PORT}/depth 로 POST", flush=True)


def estimate_depth(img_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    W, H = img.size
    pred = PIPE(img)["predicted_depth"]
    d = pred.squeeze().detach().cpu().numpy().astype(np.float32)
    d = np.array(Image.fromarray(d).resize((W, H), Image.BILINEAR), dtype=np.float32)
    d = (d - d.min()) / (d.max() - d.min() + 1e-6)            # 0..1, 큰값=가까움
    out = io.BytesIO()
    Image.fromarray((d * 255).astype(np.uint8)).save(out, format="PNG")
    return out.getvalue()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        self.send_response(200); self.send_header("Content-Type", "text/plain"); self.end_headers()
        self.wfile.write(b"depth ok")

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(n)
            png = estimate_depth(raw)
            self.send_response(200); self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(png))); self.end_headers()
            self.wfile.write(png)
        except Exception as e:
            self.send_response(500); self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
