# -*- coding: utf-8 -*-
"""
고정 맵 일괄 생성 — steamscale_style LoRA 적용해서 static/backgrounds/ 에 저장.

사용법:
  python generate_maps.py            # 아래 MAPS 전부 생성
  python generate_maps.py forge cult # 지정한 것만 생성
필요: ComfyUI 서버 실행 중(127.0.0.1:8188) + loras/steamscale_style.safetensors

* 게임 런타임이 아니라 "미리 굽는" 용도. 고정 맵은 PNG로 박아두고 게임은 그걸 즉시 표시.
"""
import json, os, random, sys, time, urllib.parse, urllib.request, uuid

COMFY_URL  = "http://127.0.0.1:8188"
CHECKPOINT = "sd_xl_base_1.0.safetensors"
LORA       = "steamscale_style.safetensors"
TRIGGER    = "steamscale_style"
STRENGTH   = 0.9
W, H       = 1344, 768
OUT_DIR    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "backgrounds")

NEG = ("text, watermark, signature, blurry, lowres, ugly, deformed, extra limbs, "
       "people, person, photorealistic, photograph, 3d render, oversaturated, cartoon, anime")

# 파일명 -> 긍정 프롬프트 (트리거는 자동으로 앞에 붙음)
MAPS = {
    "square": ("a foggy cobblestone village square in a remote 1800s steampunk mountain town, "
               "overcast grey daylight, weathered half-timber houses with dark slate roofs and "
               "stone chimneys, wrought-iron street lamps, a winding cobblestone road, a looming "
               "foggy mountain silhouette, drifting grey fog, faint pale-blue spirit-stone glow, "
               "quiet desolate, wide street view"),
    "forge":  ("a warm cramped blacksmith forge interior in an 1800s steampunk town, a large glowing "
               "furnace and a big leather bellows, an anvil with hammers and tongs, steampunk brass "
               "parts and pipes, glowing embers and pale-blue spirit-stone light, cozy smoky gloom"),
    "garrison": ("the austere interior of an imperial military command post, dark stone and iron, "
                 "crimson red banners and insignia, a strategy table with maps, spirit-stone lamps, "
                 "disciplined imposing martial atmosphere, deep shadows, painterly"),
    "cult":   ("the vast interior of a grand gothic ash-cult cathedral, towering pointed gothic arches "
               "and a high ribbed vaulted ceiling, stone columns lining a long nave to a raised altar, "
               "tall stained-glass windows depicting a dragon, grey-ash braziers with ember and "
               "pale-blue spirit-stone fire, draconic carvings, drifting incense, solemn oppressive, "
               "interior wide shot down the nave"),
    "market": ("a narrow back-alley night bazaar in an 1800s steampunk town, both sides packed with "
               "crowded covered market stalls under sagging awnings, tables of contraband wares, "
               "smuggled crates and barrels, caged pale-blue spirit-stone shards glowing, hanging "
               "lanterns and goods overhead, the market corridor receding into fog, hushed illicit"),
    "mineshaft": ("a vast abandoned underground mine cavern, a wide collapsed gallery with a caved-in "
                  "vertical shaft, broken timber frames and snapped beams, rusted chains and ropes, "
                  "leaning ladders, overturned ore carts and bent rails, rubble, dark charcoal-grey "
                  "ashen stone, glowing pale-blue spirit-stone veins, a few warm lantern flames, "
                  "drifting dust, hand-painted oil-painting, wide environmental shot"),
}


def generate(name: str, positive: str):
    seed = random.randint(0, 2**31 - 1)
    text = f"{TRIGGER}, {positive}"
    graph = {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["10", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["10", 1]}},
        "3": {"class_type": "KSampler",
              "inputs": {"seed": seed, "steps": 28, "cfg": 7.0, "sampler_name": "dpmpp_2m",
                         "scheduler": "karras", "denoise": 1.0, "model": ["10", 0],
                         "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": f"map_{name}", "images": ["8", 0]}},
        "10": {"class_type": "LoraLoader",
               "inputs": {"lora_name": LORA, "strength_model": STRENGTH, "strength_clip": STRENGTH,
                          "model": ["4", 0], "clip": ["4", 1]}},
    }
    body = json.dumps({"prompt": graph, "client_id": uuid.uuid4().hex}).encode()
    req = urllib.request.Request(COMFY_URL + "/prompt", data=body, headers={"Content-Type": "application/json"})
    pid = json.loads(urllib.request.urlopen(req, timeout=30).read())["prompt_id"]
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
                os.makedirs(OUT_DIR, exist_ok=True)
                out = os.path.join(OUT_DIR, f"{name}.png")
                open(out, "wb").write(data)
                print(f"  [ok] {name} -> {out} ({len(data)} bytes, seed {seed})")
                return
    print(f"  [!] {name} timeout")


def main():
    targets = sys.argv[1:] or list(MAPS.keys())
    print(f"생성 대상: {targets}")
    for name in targets:
        if name not in MAPS:
            print(f"  [?] '{name}' 없음 (가능: {list(MAPS.keys())})"); continue
        print(f"생성중: {name} ...")
        generate(name, MAPS[name])
    print("완료. static/backgrounds/ 확인.")


if __name__ == "__main__":
    main()
