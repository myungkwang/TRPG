# -*- coding: utf-8 -*-
"""steamscale_style LoRA 빠른 검증 — llm._image_comfyui 와 동일한 그래프."""
import json, random, time, urllib.parse, urllib.request, uuid, sys

COMFY_URL = "http://127.0.0.1:8188"
CHECKPOINT = "sd_xl_base_1.0.safetensors"
LORA = "steamscale_style.safetensors"
TRIGGER = "steamscale_style"
STRENGTH = 0.9

prompt = (f"{TRIGGER}, a foggy cobblestone village square in a remote 1800s steampunk "
          "mountain town, weathered half-timber houses with dark slate roofs, wrought-iron "
          "street lamps, a looming misty mountain silhouette, overcast grey light, drifting fog")
negative = "text, watermark, signature, blurry, lowres, ugly, deformed, extra limbs"
w, h = 1344, 768
seed = random.randint(0, 2**31 - 1)

graph = {
    "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
    "5": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["10", 1]}},
    "7": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["10", 1]}},
    "3": {"class_type": "KSampler",
          "inputs": {"seed": seed, "steps": 25, "cfg": 7.0, "sampler_name": "euler",
                     "scheduler": "normal", "denoise": 1.0, "model": ["10", 0],
                     "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "test_steamscale", "images": ["8", 0]}},
    "10": {"class_type": "LoraLoader",
           "inputs": {"lora_name": LORA, "strength_model": STRENGTH, "strength_clip": STRENGTH,
                      "model": ["4", 0], "clip": ["4", 1]}},
}

body = json.dumps({"prompt": graph, "client_id": uuid.uuid4().hex}).encode()
req = urllib.request.Request(COMFY_URL + "/prompt", data=body, headers={"Content-Type": "application/json"})
pid = json.loads(urllib.request.urlopen(req, timeout=30).read())["prompt_id"]
print("submitted:", pid, "seed:", seed)

for _ in range(180):
    time.sleep(1)
    hist = json.loads(urllib.request.urlopen(COMFY_URL + f"/history/{pid}", timeout=30).read())
    entry = hist.get(pid)
    if not entry or not entry.get("outputs"):
        continue
    for node_out in entry["outputs"].values():
        for im in node_out.get("images", []):
            q = urllib.parse.urlencode({"filename": im["filename"],
                                        "subfolder": im.get("subfolder", ""),
                                        "type": im.get("type", "output")})
            data = urllib.request.urlopen(COMFY_URL + "/view?" + q, timeout=30).read()
            out = "d:/trpg/lora_dataset/test_steamscale.png"
            open(out, "wb").write(data)
            print("saved:", out, f"({len(data)} bytes)")
            sys.exit(0)
print("timeout"); sys.exit(1)
