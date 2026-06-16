# -*- coding: utf-8 -*-
"""고정 배경 깊이맵 일괄 생성 → static/backgrounds/depth/<같은이름>.png
   2.5D 패럴랙스용. Depth-Anything 으로 추정(가까울수록 밝게).
   실행: d:/kohya_ss/venv/Scripts/python.exe gen_depth_batch.py [--force]
"""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
BG = os.path.join(ROOT, "static", "backgrounds")
OUT = os.path.join(BG, "depth")
os.makedirs(OUT, exist_ok=True)
FORCE = "--force" in sys.argv

files = [f for f in os.listdir(BG) if f.lower().endswith(".png") and os.path.isfile(os.path.join(BG, f))]
todo = [f for f in files if FORCE or not os.path.exists(os.path.join(OUT, f))]
print(f"배경 {len(files)}개 중 생성 대상 {len(todo)}개")
if not todo:
    print("이미 다 있음 (--force 로 강제 재생성)"); sys.exit(0)

from transformers import pipeline
import torch
dev = 0 if torch.cuda.is_available() else -1
try:
    pipe = pipeline("depth-estimation", model="LiheYoung/depth-anything-small-hf", device=dev)
except Exception as e:
    print("fallback dpt:", e)
    pipe = pipeline("depth-estimation", model="Intel/dpt-hybrid-midas", device=dev)

for f in todo:
    img = Image.open(os.path.join(BG, f)).convert("RGB")
    W, H = img.size
    pred = pipe(img)["predicted_depth"]
    d = pred.squeeze().detach().cpu().numpy().astype(np.float32)
    d = np.array(Image.fromarray(d).resize((W, H), Image.BILINEAR), dtype=np.float32)
    d = (d - d.min()) / (d.max() - d.min() + 1e-6)
    Image.fromarray((d * 255).astype(np.uint8)).save(os.path.join(OUT, f))
    print(f"  [ok] {f}  ({W}x{H})")

print(f"\n완료 → {OUT}")
