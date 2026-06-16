from __future__ import annotations

import base64
import json
import os
import random
import time
import urllib.parse
import urllib.request
import uuid as _uuid
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"

client: OpenAI | None = None
_client_api_key: str | None = None


def _load_runtime_env() -> None:
    load_dotenv(ENV_PATH, override=True)


def _env(name: str, default: str) -> str:
    _load_runtime_env()
    return os.getenv(name, default)


def _require_client() -> OpenAI:
    global client, _client_api_key
    _load_runtime_env()
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError(f"OPENAI_API_KEY is missing in {ENV_PATH}")
    if client is None or api_key != _client_api_key:
        client = OpenAI(api_key=api_key)
        _client_api_key = api_key
    return client
# 이미지 생성기 선택: static(기본·생성안함, 고정이미지만) | comfyui(로컬GPU) | openai(클라우드)
#   기본 static → 별도 설치/키 없이 바로 돌아감(엔딩은 미리 만든 고정 이미지 사용).
IMAGE_PROVIDER = os.getenv("IMAGE_PROVIDER", "static").lower()
LIVE_IMAGE_PROVIDERS = {"openai", "comfyui", "local"}
# ComfyUI 서버 주소. 내 PC면 127.0.0.1:8188, 팀 공유면 터널 주소(ngrok/cloudflared)를 넣는다.
COMFY_URL = os.getenv("COMFY_URL", "http://127.0.0.1:8188").rstrip("/")
COMFY_CHECKPOINT = os.getenv("COMFY_CHECKPOINT", "sd_xl_base_1.0.safetensors")
# 우리 세계관 LoRA (학습 후). 파일명만 넣으면 자동 적용. 트리거 단어가 있으면 프롬프트 앞에 붙는다.
COMFY_LORA = os.getenv("COMFY_LORA", "").strip()                 # 예: jaekkeut_style.safetensors
COMFY_LORA_TRIGGER = os.getenv("COMFY_LORA_TRIGGER", "").strip()  # 예: jaekkeut_style
COMFY_LORA_STRENGTH = float(os.getenv("COMFY_LORA_STRENGTH", "0.9"))


def _image_openai(prompt: str, size: str) -> bytes:
    """OpenAI 이미지. 모델마다 응답 형태가 달라(b64_json 또는 url) 둘 다 처리한다."""
    response = _require_client().images.generate(model=_env("IMAGE_MODEL", "gpt-image-1"), prompt=prompt, size=size, n=1)
    item = response.data[0]
    b64 = getattr(item, "b64_json", None)
    if b64:
        return base64.b64decode(b64)
    url = getattr(item, "url", None)
    if url:
        with urllib.request.urlopen(url) as resp:
            return resp.read()
    raise RuntimeError("image response had neither b64_json nor url")


def _image_comfyui(prompt: str, size: str = "1024x1024", negative: str | None = None) -> bytes:
    """로컬/공유 ComfyUI(SDXL base)로 이미지를 생성한다. GPU PC만 켜져 있으면 무료·무제한.

    표준 SDXL txt2img 그래프를 API로 보내고(/prompt), 완료를 폴링(/history)한 뒤
    결과 이미지를 받아온다(/view). 백엔드→ComfyUI 서버 간 호출이라 CORS와 무관하다.
    """
    try:
        w, h = (int(x) for x in size.lower().split("x"))
    except Exception:
        w, h = 1024, 1024
    base_neg = "text, watermark, signature, blurry, lowres, ugly, deformed, extra limbs"
    negative = f"{negative}, {base_neg}" if negative else base_neg
    seed = random.randint(0, 2**31 - 1)
    if COMFY_LORA_TRIGGER:
        prompt = f"{COMFY_LORA_TRIGGER}, {prompt}"

    # LoRA가 설정돼 있으면 LoraLoader를 끼우고 모델/clip 출처를 그쪽으로 바꾼다.
    model_src, clip_src = ["4", 0], ["4", 1]
    graph = {
        "4": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": COMFY_CHECKPOINT}},
        "5": {"class_type": "EmptyLatentImage",
              "inputs": {"width": w, "height": h, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": clip_src}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": clip_src}},
        "3": {"class_type": "KSampler",
              "inputs": {"seed": seed, "steps": 25, "cfg": 7.0,
                         "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0,
                         "model": model_src, "positive": ["6", 0],
                         "negative": ["7", 0], "latent_image": ["5", 0]}},
        "8": {"class_type": "VAEDecode",
              "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage",
              "inputs": {"filename_prefix": "trpg_ending", "images": ["8", 0]}},
    }
    if COMFY_LORA:
        graph["10"] = {"class_type": "LoraLoader",
                       "inputs": {"lora_name": COMFY_LORA,
                                  "strength_model": COMFY_LORA_STRENGTH,
                                  "strength_clip": COMFY_LORA_STRENGTH,
                                  "model": ["4", 0], "clip": ["4", 1]}}
        graph["6"]["inputs"]["clip"] = ["10", 1]
        graph["7"]["inputs"]["clip"] = ["10", 1]
        graph["3"]["inputs"]["model"] = ["10", 0]

    client_id = _uuid.uuid4().hex
    body = json.dumps({"prompt": graph, "client_id": client_id}).encode("utf-8")
    req = urllib.request.Request(COMFY_URL + "/prompt", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        prompt_id = json.loads(resp.read())["prompt_id"]

    # 완료될 때까지 history 폴링 (최대 ~180초)
    for _ in range(180):
        time.sleep(1)
        with urllib.request.urlopen(COMFY_URL + f"/history/{prompt_id}", timeout=30) as resp:
            hist = json.loads(resp.read())
        entry = hist.get(prompt_id)
        if not entry or not entry.get("outputs"):
            continue
        for node_out in entry["outputs"].values():
            for im in node_out.get("images", []):
                q = urllib.parse.urlencode({
                    "filename": im["filename"],
                    "subfolder": im.get("subfolder", ""),
                    "type": im.get("type", "output"),
                })
                with urllib.request.urlopen(COMFY_URL + "/view?" + q, timeout=30) as r:
                    return r.read()
    raise RuntimeError("ComfyUI 이미지 생성 시간 초과 (서버가 켜져 있는지 확인)")


def generate_image(prompt: str, size: str = "1024x1024", negative: str | None = None) -> bytes:
    """이미지를 생성해 바이트로 돌려준다. IMAGE_PROVIDER 로 생성기 선택. negative는 comfyui에만 적용."""
    if IMAGE_PROVIDER in ("comfyui", "local"):
        return _image_comfyui(prompt, size, negative)
    return _image_openai(prompt, size)


def embed_text(text: str) -> list[float]:
    response = _require_client().embeddings.create(model=_env("EMBEDDING_MODEL", "text-embedding-3-small"), input=text)
    return response.data[0].embedding

def chat(messages: list[dict], temperature: float = 0.8) -> str:
    response = _require_client().chat.completions.create(
        model=_env("LLM_MODEL", "gpt-4o-mini"),
        messages=messages,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def chat_stream(messages: list[dict], tools: list[dict] | None = None, temperature: float = 0.8):
    request = {
        "model": _env("LLM_MODEL", "gpt-4o-mini"),
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    if tools:
        request["tools"] = tools
    return _require_client().chat.completions.create(**request)


def chat_with_tools(messages: list[dict], tools: list[dict], temperature: float = 0.8):
    """툴(function calling)을 줘서 호출한다. 응답 메시지 객체를 그대로 돌려준다.

    반환값의 .tool_calls 가 있으면 모델이 도구를 부른 것이고, 없으면 .content 가 최종 서술.
    """
    response = _require_client().chat.completions.create(
        model=_env("LLM_MODEL", "gpt-4o-mini"),
        messages=messages,
        tools=tools,
        temperature=temperature,
    )
    return response.choices[0].message
