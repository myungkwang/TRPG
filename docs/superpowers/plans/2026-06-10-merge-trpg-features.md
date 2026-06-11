# TRPG → TRPG1 기능 병합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TRPG1을 베이스로, TRPG의 엔딩 이미지·도감·선택지·set_location·진행도 시스템을 이식한다. TTS는 TRPG1(CosyVoice+Edge), GM어조·인트로는 TRPG1 유지.

**Architecture:** 백엔드 6개 파일 수정/생성 → DB 스키마 마이그레이션 → 프론트엔드 3개 파일 수정 + Ending.jsx 신규 생성 순서로 진행. gm_cli.py의 gm_reply 반환 타입이 str→dict로 바뀌므로 server.py가 그에 맞게 따라간다.

**Tech Stack:** Python/FastAPI, React/Vite, PostgreSQL, OpenAI API, CosyVoice, ComfyUI(선택)

---

## 파일 맵

| 작업 | 파일 |
|------|------|
| 생성 | `E:/lmk/TRPG1/codex.py` |
| 수정 | `E:/lmk/TRPG1/llm.py` |
| 수정 | `E:/lmk/TRPG1/gm_cli.py` |
| 수정 | `E:/lmk/TRPG1/server.py` |
| 수정 | `E:/lmk/TRPG1/setup_db.py` |
| 생성 | `E:/lmk/TRPG1/frontend_src/src/components/Ending.jsx` |
| 수정 | `E:/lmk/TRPG1/frontend_src/src/api.js` |
| 수정 | `E:/lmk/TRPG1/frontend_src/src/App.jsx` |

---

## Task 1: codex.py 생성

**Files:**
- Create: `E:/lmk/TRPG1/codex.py`

- [ ] **Step 1: codex.py 생성**

```python
"""도감 — 계정 단위로 영구 누적되는 발견물(단서·엔딩·인물).

세션(회차)이 바뀌어도 사라지지 않는다. 베드엔딩이 반복돼도 그동안 발견한
단서와 도달한 엔딩이 user_codex 테이블에 차곡차곡 쌓인다.

세션 안에서 단서가 해금되거나(플래그) 엔딩에 도달하면 record_* 로 적재하고,
도감 화면은 get_codex 로 계정의 누적분을 읽어 잠금/해금 상태를 칠한다.
"""
from __future__ import annotations

import json
import time

from db import get_conn
import progression


def _user_of_session(session_id: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT user_id FROM game_sessions WHERE id = %s", (session_id,)
        ).fetchone()
    return str(row[0]) if row and row[0] else None


def record(user_id: str, kind: str, key: str, data: dict | None = None) -> None:
    """발견물 1건을 계정 도감에 적재한다(이미 있으면 무시)."""
    if not user_id or not key:
        return
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO user_codex (user_id, kind, key, data)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id, kind, key) DO NOTHING
            """,
            (user_id, kind, key, json.dumps(data or {}, ensure_ascii=False)),
        )


def sync_clues_from_session(session_id: str) -> None:
    """세션에서 지금까지 해금된 단서를 계정 도감에 반영한다(플래그 기반)."""
    user_id = _user_of_session(session_id)
    if not user_id:
        return
    for clue in progression.unlocked_clues(session_id):
        record(user_id, "clue", clue["name"], {"desc": clue["desc"]})


def _ending_summary(ending: dict) -> str:
    """도감 표시용 짧은 요약. summary가 없으면 본문에서 추린다."""
    s = (ending.get("summary") or "").strip()
    if s:
        return s
    text = (ending.get("text") or "").replace("GM:", " ").replace("\n", " ").strip()
    return text[:160] + ("…" if len(text) > 160 else "")


def record_ending_for_session(session_id: str, ending: dict) -> None:
    """도달한 엔딩을 계정 도감에 적재한다.

    - 정규(노멀/트루/히든): 이름으로 1슬롯만(중복 무시).
    - 베드: AI가 회차마다 새로 쓰므로 매번 고유 키로 누적한다.
    """
    user_id = _user_of_session(session_id)
    if not user_id or not ending:
        return
    kind = ending.get("kind")
    data = {
        "id": ending.get("id"),
        "kind": kind,
        "name": ending.get("name"),
        "summary": _ending_summary(ending),
        "text": ending.get("text", ""),
        "image_url": ending.get("image_url"),
    }
    if kind == "bad":
        key = f"베드-{int(time.time() * 1000)}"
    else:
        key = ending.get("name") or ending.get("id") or "엔딩"
    record(user_id, "ending", key, data)


def get_codex(user_id: str) -> dict:
    """계정에 누적된 도감을 종류별로 묶어 돌려준다."""
    if not user_id:
        return {"clues": [], "endings": [], "characters": []}
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT kind, key, data, unlocked_at FROM user_codex "
            "WHERE user_id = %s ORDER BY unlocked_at",
            (user_id,),
        ).fetchall()

    out: dict[str, list] = {"clues": [], "endings": [], "characters": []}
    bucket = {"clue": "clues", "ending": "endings", "character": "characters"}
    for kind, key, data, _ in rows:
        group = bucket.get(kind)
        if not group:
            continue
        entry = {"key": key}
        if isinstance(data, dict):
            entry.update(data)
        elif isinstance(data, str):
            try:
                entry.update(json.loads(data))
            except json.JSONDecodeError:
                pass
        out[group].append(entry)
    return out
```

- [ ] **Step 2: import 확인 (python 문법 검사)**

```bash
cd E:/lmk/TRPG1 && python -c "import codex; print('codex OK')"
```
Expected: `codex OK` (DB 연결 실패는 무방, ImportError만 없으면 됨)

- [ ] **Step 3: Commit**

```bash
git -C E:/lmk/TRPG1 add codex.py
git -C E:/lmk/TRPG1 commit -m "feat: add codex.py — account-level discovery log"
```

---

## Task 2: llm.py — 이미지 생성 함수 추가

**Files:**
- Modify: `E:/lmk/TRPG1/llm.py`

TRPG1의 llm.py에는 `embed_text`, `chat`, `chat_with_tools`만 있다. TRPG의 이미지 생성 코드를 추가한다.

- [ ] **Step 1: llm.py 수정**

기존 파일 상단(import 블록)과 함수 앞에 아래를 삽입한다. 기존 `embed_text`, `chat`, `chat_with_tools`는 그대로 유지.

```python
from __future__ import annotations

import base64
import json
import os
import random
import time
import urllib.parse
import urllib.request
import uuid as _uuid
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "gpt-image-1")
IMAGE_PROVIDER = os.getenv("IMAGE_PROVIDER", "static").lower()
LIVE_IMAGE_PROVIDERS = {"openai", "comfyui", "local"}
COMFY_URL = os.getenv("COMFY_URL", "http://127.0.0.1:8188").rstrip("/")
COMFY_CHECKPOINT = os.getenv("COMFY_CHECKPOINT", "sd_xl_base_1.0.safetensors")
COMFY_LORA = os.getenv("COMFY_LORA", "").strip()
COMFY_LORA_TRIGGER = os.getenv("COMFY_LORA_TRIGGER", "").strip()
COMFY_LORA_STRENGTH = float(os.getenv("COMFY_LORA_STRENGTH", "0.9"))


def _image_openai(prompt: str, size: str) -> bytes:
    response = client.images.generate(model=IMAGE_MODEL, prompt=prompt, size=size, n=1)
    item = response.data[0]
    b64 = getattr(item, "b64_json", None)
    if b64:
        return base64.b64decode(b64)
    url = getattr(item, "url", None)
    if url:
        with urllib.request.urlopen(url) as resp:
            return resp.read()
    raise RuntimeError("image response had neither b64_json nor url")


def _image_comfyui(prompt: str, size: str = "1024x1024") -> bytes:
    try:
        w, h = (int(x) for x in size.lower().split("x"))
    except Exception:
        w, h = 1024, 1024
    negative = "text, watermark, signature, blurry, lowres, ugly, deformed, extra limbs"
    seed = random.randint(0, 2**31 - 1)
    if COMFY_LORA_TRIGGER:
        prompt = f"{COMFY_LORA_TRIGGER}, {prompt}"

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


def generate_image(prompt: str, size: str = "1024x1024") -> bytes:
    """엔딩 일러스트를 생성해 이미지 바이트로 돌려준다. IMAGE_PROVIDER 로 생성기 선택."""
    if IMAGE_PROVIDER in ("comfyui", "local"):
        return _image_comfyui(prompt, size)
    return _image_openai(prompt, size)


def embed_text(text: str) -> list[float]:
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=text)
    return response.data[0].embedding

def chat(messages: list[dict], temperature: float = 0.8) -> str:
    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def chat_with_tools(messages: list[dict], tools: list[dict], temperature: float = 0.8):
    """툴(function calling)을 줘서 호출한다. 응답 메시지 객체를 그대로 돌려준다.

    반환값의 .tool_calls 가 있으면 모델이 도구를 부른 것이고, 없으면 .content 가 최종 서술.
    """
    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,
        tools=tools,
        temperature=temperature,
    )
    return response.choices[0].message
```

- [ ] **Step 2: import 검사**

```bash
cd E:/lmk/TRPG1 && python -c "from llm import generate_image, IMAGE_PROVIDER, LIVE_IMAGE_PROVIDERS; print('llm OK')"
```
Expected: `llm OK`

- [ ] **Step 3: Commit**

```bash
git -C E:/lmk/TRPG1 add llm.py
git -C E:/lmk/TRPG1 commit -m "feat: add image generation to llm.py (OpenAI + ComfyUI)"
```

---

## Task 3: gm_cli.py — 선택지·set_location·codex·generate_ending 추가

**Files:**
- Modify: `E:/lmk/TRPG1/gm_cli.py`

변경 사항:
1. `import re` + `import codex` 추가
2. SYSTEM_PROMPT에 set_location 규칙(rule 10) + [선택지] 섹션 추가 (GM어조는 TRPG1 유지)
3. TOOLS에 `set_location` 도구 추가
4. `_execute_tool()`에 `set_location` 핸들러 추가
5. `_with_ending()`에 `codex.sync_clues_from_session()` 호출 추가
6. `split_choices()` 함수 추가
7. `gm_reply()` 반환 타입 `str` → `dict` (answer + choices)
8. `BAD_ENDING_SYSTEM`, `_journey_summary()`, `generate_ending()` 추가
9. `main()` 업데이트

- [ ] **Step 1: import 라인 수정**

`E:/lmk/TRPG1/gm_cli.py` 파일 상단의 import 블록을:

```python
from __future__ import annotations

import json
import os
import uuid
from db import get_conn
import dialogue
from llm import chat, chat_with_tools
from rag import retrieve_context
from game_logic import perform_roll
from personas import PERSONA_CONTEXT
import progression
import endings
```

아래로 교체:

```python
from __future__ import annotations

import json
import os
import re
import uuid
from db import get_conn
import dialogue
from llm import chat, chat_with_tools
from rag import retrieve_context
from game_logic import perform_roll
from personas import PERSONA_CONTEXT
import progression
import endings
import codex
```

- [ ] **Step 2: SYSTEM_PROMPT 수정**

기존 SYSTEM_PROMPT의 `[출력 형식 — 화자별로 줄을 나눠라]` 섹션 뒤에 두 가지를 추가한다.

기존 (TRPG1):
```
[출력 형식 — 화자별로 줄을 나눠라]
- 모든 줄은 화자 라벨로 시작한다. 라벨 뒤에 콜론(:)을 쓴다.
- 서술·장면 묘사·판정 결과·안내(시스템)는 'GM:' 으로 시작한다.
- NPC가 직접 입으로 말하는 대사는 그 인물 이름으로 시작한다.
  쓸 수 있는 이름: 의사, 린, 가일, 마르타, 토비, 카르가스.
- 한 응답에 GM 서술과 여러 NPC 대사가 번갈아 나와도 된다. 예:
    GM: 진료소의 등불이 흔들린다. 낯선 사내가 당신을 들여다본다.
    의사: "깨어나셨군요. 기억나는 게 있습니까?"
- NPC의 '대사'만 그 인물 라벨로, 행동·묘사는 GM 라벨로 둔다.
""".strip()
```

교체 후 (rule 10과 [선택지] 추가):

```python
SYSTEM_PROMPT = """
너는 한국어 AI TRPG 게임 '증기와 비늘'의 AI 게임마스터다.
반드시 지켜야 할 규칙:
1. 제공된 RAG 컨텍스트를 세계관의 정본(canon)으로 우선한다.
2. 모르는 설정은 단정하지 말고, 세계관에 어울리게 작게 보완한다.
3. 플레이어의 자유 입력을 존중하되, 핵심 사건 비트와 결말로 자연스럽게 유도한다.
4. NPC는 목적과 비밀을 가진 인격처럼 말한다. 린은 거짓과 진실을 섞을 수 있다.
5. 응답은 4~8문장 정도로 짧게 유지하고, 마지막에는 플레이어가 할 수 있는 행동을 열어둔다.

[도구 사용 — 이야기가 자연스럽게 진행을 건드리게 하라]
6. 행동 결과가 불확실하면 roll_check 도구로 판정한 뒤, 성공/실패를 서사에 반영한다.
   (DC: 쉬움 5, 보통 8, 어려움 11, 매우 어려움 14, 거의 불가능 15)
7. 플레이어가 핵심 비트에 실제로 도달했을 때만 set_flag 도구로 진행 플래그를 켠다.
   예) 광부 실종을 알게 됨→FLG_CLUE_01, 갱도 심부의 진실 도달→FLG_CLUE_04,
       카르가스와 채굴 중단에 합의→FLG_KARGAS_ALLY. 남발하지 말 것.
8. 플레이어가 주요 장면(이벤트 노드)을 실제로 통과하면 visit_event 도구로 기록한다.
   예) 봉우리에서 카르가스와 대면→EVT_PEAK_CONFRONT.
   호감도(NPC 관계)는 이 이벤트 통과로만 오른다. 임의로 호감도를 올리지 말 것.
   (visit_event 결과의 relations_changed에 오른 수치가 나오니 서사에 반영하라.)
9. 플레이어가 단서/아이템을 손에 넣으면 give_item 도구로 인벤토리에 넣는다.
   예) 가일이 숨긴 광부 명부를 입수→"은폐된 명부".
10. 장면의 장소가 바뀌면(이동·이벤트로) set_location 도구로 현재 위치를 바꿔 배경을 전환한다.
    예) 진료소→여관, 여관→광산, 광산→갱도 심부, 절정→봉우리.
11. 엔딩은 플래그·이벤트·아이템·관계의 조합으로 열린다. 도구 결과에 ending_reached가
    오면, 그 엔딩 장면을 연출하고 이야기를 마무리한다.

[출력 형식 — 화자별로 줄을 나눠라]
- 모든 줄은 화자 라벨로 시작한다. 라벨 뒤에 콜론(:)을 쓴다.
- 서술·장면 묘사·판정 결과·안내(시스템)는 'GM:' 으로 시작한다.
- NPC가 직접 입으로 말하는 대사는 그 인물 이름으로 시작한다.
  쓸 수 있는 이름: 의사, 린, 가일, 마르타, 토비, 카르가스.
- 한 응답에 GM 서술과 여러 NPC 대사가 번갈아 나와도 된다. 예:
    GM: 진료소의 등불이 흔들린다. 낯선 사내가 당신을 들여다본다.
    의사: "깨어나셨군요. 기억나는 게 있습니까?"
- NPC의 '대사'만 그 인물 라벨로, 행동·묘사는 GM 라벨로 둔다.

[선택지 — 매번 끝에 붙여라]
- 응답의 맨 끝에, 플레이어가 지금 취할 수 있는 행동 2~4개를 아래 형식으로 제시한다.
- 반드시 이 형식을 그대로 지킨다(다른 말 없이):
    [선택지]
    - 마르타를 찾아간다
    - 린에게서 정보를 얻는다
- 선택지는 짧은 행동 문장으로. 플레이어는 이 중 하나를 고르거나 자유롭게 입력할 수 있다.
""".strip()
```

- [ ] **Step 3: TOOLS에 set_location 추가**

기존 TOOLS 리스트의 `give_item` 도구 뒤에 다음을 삽입:

```python
    {
        "type": "function",
        "function": {
            "name": "set_location",
            "description": "장면의 장소가 바뀌면 현재 위치를 갱신한다(배경 이미지가 따라 바뀐다).",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "enum": list(progression.LOCATIONS),
                                 "description": "바뀐 현재 장소"},
                },
                "required": ["location"],
            },
        },
    },
```

- [ ] **Step 4: _execute_tool()에 set_location 핸들러 추가**

`give_item` 핸들러 블록 뒤, `return {"error": f"unknown tool: {name}"}` 바로 앞에 삽입:

```python
    if name == "set_location":
        try:
            loc = progression.set_location(session_id, args.get("location"))
        except ValueError as exc:
            return {"error": str(exc)}
        return {"ok": True, "location": loc}
```

- [ ] **Step 5: _with_ending()에 codex 동기화 추가**

기존 `_with_ending()`:
```python
def _with_ending(session_id: str, result: dict) -> dict:
    """상태 변경 후 전체 상태로 엔딩을 다시 판정해 결과에 실어준다."""
    ending = endings.check_session_ending(session_id)
    if ending:
        result["ending_reached"] = {
            "id": ending["id"], "name": ending["name"], "summary": ending["summary"],
        }
    return result
```

교체:
```python
def _with_ending(session_id: str, result: dict) -> dict:
    """상태 변경 후 전체 상태로 엔딩을 다시 판정해 결과에 실어준다."""
    try:
        codex.sync_clues_from_session(session_id)
    except Exception:
        pass
    ending = endings.check_session_ending(session_id)
    if ending:
        result["ending_reached"] = {
            "id": ending["id"], "name": ending["name"], "summary": ending["summary"],
        }
    return result
```

- [ ] **Step 6: split_choices() 함수 추가**

`MAX_TOOL_ROUNDS = 4` 바로 아래에 삽입:

```python
_CHOICE_HEADER = re.compile(r"\n?\s*\[\s*선택지\s*\]\s*", re.IGNORECASE)
_CHOICE_LINE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s*(.+?)\s*$")


def split_choices(text: str) -> tuple[str, list[str]]:
    """본문과 선택지를 분리한다. 반환: (선택지 블록을 뺀 본문, 선택지 문자열 리스트)."""
    if not text:
        return "", []
    parts = _CHOICE_HEADER.split(text, maxsplit=1)
    if len(parts) < 2:
        return text.strip(), []
    body, tail = parts[0], parts[1]
    choices: list[str] = []
    for line in tail.splitlines():
        m = _CHOICE_LINE.match(line)
        if m:
            choices.append(m.group(1).strip())
        elif line.strip() and choices:
            break
    return body.strip(), choices
```

- [ ] **Step 7: gm_reply() 반환 타입 변경**

기존 `gm_reply()` 마지막 3줄:
```python
    save_event(session_id, "user", user_input, {})
    save_event(session_id, "assistant", answer, {"contexts": contexts, "tools": tool_log})
    return answer
```

교체:
```python
    body, choices = split_choices(answer)
    save_event(session_id, "user", user_input, {})
    save_event(session_id, "assistant", body,
               {"contexts": contexts, "tools": tool_log, "choices": choices})
    return {"answer": body, "choices": choices}
```

그리고 함수 시그니처도 타입 힌트 업데이트:
```python
def gm_reply(session_id: str, user_input: str) -> dict:
```

- [ ] **Step 8: generate_ending() + 관련 함수 추가**

`main()` 함수 바로 앞에 삽입:

```python
BAD_ENDING_SYSTEM = """
너는 한국어 AI TRPG '증기와 비늘'의 게임마스터다. 지금은 이 회차의 '베드 엔딩'을 쓰는 순간이다.
플레이어는 충분한 단서를 모으거나 핵심 합의에 이르지 못한 채 이야기가 끝났다.

[반드시 '증기와 비늘' 세계관 안에서만 쓴다 — 이탈 금지]
- 무대: 잿빛 변경의 광산 마을 '재끝 마을', 영석(영정) 광산, 안갯속 봉우리.
- 핵심 존재/인물: 봉우리의 태고 드래곤 '카르가스', 여관 주인이자 구미호 '린', 채굴 감독 '가일',
  노파 '마르타', 소년 광부 '토비', 진료소 '의사'. 주인공은 기억을 잃은 채 깨어난 자.
- 제공된 RAG '세계관 정본'과 페르소나를 우선한다. 현대·SF·타 세계관 요소는 절대 쓰지 않는다.

[작성 규칙]
- 아래 '여정 요약'의 달성/누락 비트와 NPC 관계를 반영해, 그 플레이어만의 실패 결말을 써라.
- 재끝 마을과 인물들에게 닥친 결과를 잿빛·스팀펑크 톤으로 묘사한다.
- 작위적 구원 없이 실패의 무게를 남긴다. 6~9문장. 정중한 존댓말 나레이션.
- 마지막 한 줄로, 결정적으로 놓친 비트가 무엇이었는지 여운처럼 암시한다.
- 'GM:' 으로 시작해 서술한다.
""".strip()


def _journey_summary(session: dict, pct: int) -> dict:
    flags = progression.as_dict(session["flags"])
    return {
        "진행도": f"{pct}%",
        "달성한 핵심비트": [progression.beat_label(b) for b in progression.PROGRESS_BEATS if flags.get(b)],
        "놓친 핵심비트": [progression.beat_label(b) for b in progression.PROGRESS_BEATS if not flags.get(b)],
        "NPC 관계": progression.as_dict(session["relations"]),
        "마을 파괴": bool(flags.get("FLG_TOWN_DESTROYED")),
    }


def generate_ending(session_id: str) -> dict:
    """정산 시점: 엔딩 분기를 확정하고 서술을 돌려준다.

    - 정규(노멀/트루/히든): 고정 정본 텍스트를 그대로 사용 (LLM 호출 없음).
    - 베드: 그 플레이어 여정에 맞춰 AI가 생성.
    반환: {kind, id, name, progress, text}  (이미지는 서버가 별도 생성)
    """
    session = load_session(session_id)
    resolved = endings.resolve_ending(session)
    pct = resolved["progress"]

    if resolved["kind"] == "good":
        text = resolved.get("text") or resolved.get("summary") or ""
        save_event(session_id, "assistant", text,
                   {"type": "ending", "ending": resolved["id"], "progress": pct})
        return {**resolved, "text": text}

    summary = _journey_summary(session, pct)
    try:
        lore = retrieve_context(
            "증기와 비늘 재끝 마을 영석 광산 봉우리 카르가스 광부 실종 결말", limit=4)
        lore_text = "\n\n".join(
            f"[{c['document_title']} / {c['section_title']}]\n{c['content']}" for c in lore)
    except Exception:
        lore_text = ""
    messages = [
        {"role": "system", "content": BAD_ENDING_SYSTEM},
        {"role": "system", "content": PERSONA_CONTEXT},
        {"role": "system", "content": "세계관 정본(RAG):\n" + lore_text},
        {"role": "system", "content": "여정 요약:\n" + json.dumps(summary, ensure_ascii=False, indent=2)},
        *recent_history(session_id, limit=20),
        {"role": "user", "content": "이 여정에 맞는 베드 엔딩을 써줘. 반드시 위 세계관 정본과 페르소나 안에서만."},
    ]
    try:
        text = chat(messages)
    except Exception:
        text = (
            "안개는 끝내 걷히지 않았습니다. 놓친 단서와 닿지 못한 합의가 재끝 마을 위로 잿빛 "
            "그림자를 드리웁니다. 사라진 이들은 돌아오지 않았고, 봉우리의 비늘은 다시 어둠 속에서 "
            "숨을 고릅니다. 당신의 이야기는, 미처 꿰지 못한 한 가닥의 실로 닫힙니다."
        )
    save_event(session_id, "assistant", text,
               {"type": "ending", "ending": resolved["id"], "progress": pct})
    return {**resolved, "text": text}
```

- [ ] **Step 9: main() 업데이트**

기존 `main()` 내부 루프 끝:
```python
        answer = gm_reply(session_id, user_input)
        print()
        # 화자별 말풍선을 콘솔에서도 구분해 보여준다.
        for seg in dialogue.split_segments(answer):
            who = "GM(시스템)" if seg["role"] == "gm" else seg["speaker"]
            print(f"[{who}] {seg['text']}")
```

교체:
```python
        result = gm_reply(session_id, user_input)
        print()
        for seg in dialogue.split_segments(result["answer"]):
            who = "GM(시스템)" if seg["role"] == "gm" else seg["speaker"]
            print(f"[{who}] {seg['text']}")
        for i, c in enumerate(result["choices"], 1):
            print(f"  ({i}) {c}")
```

- [ ] **Step 10: 문법 검사**

```bash
cd E:/lmk/TRPG1 && python -c "import gm_cli; print('gm_cli OK')"
```
Expected: `gm_cli OK`

- [ ] **Step 11: Commit**

```bash
git -C E:/lmk/TRPG1 add gm_cli.py
git -C E:/lmk/TRPG1 commit -m "feat: add set_location, choices, codex sync, generate_ending to gm_cli"
```

---

## Task 4: setup_db.py — user_codex 테이블 + ending 컬럼 추가

**Files:**
- Modify: `E:/lmk/TRPG1/setup_db.py`

- [ ] **Step 1: DDL 문자열 끝에 추가**

기존 DDL 문자열의 마지막 `"""` 바로 앞(ALTER TABLE 구문 아래)에 삽입:

```sql
CREATE TABLE IF NOT EXISTS user_codex (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    unlocked_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, kind, key)
);

ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS ending JSONB;
```

- [ ] **Step 2: 검증**

```bash
cd E:/lmk/TRPG1 && python -c "import setup_db; print('setup_db OK')"
```
Expected: `setup_db OK`

- [ ] **Step 3: Commit**

```bash
git -C E:/lmk/TRPG1 add setup_db.py
git -C E:/lmk/TRPG1 commit -m "feat: add user_codex table and ending column to setup_db"
```

---

## Task 5: server.py — 엔딩 API·도감 API·진행도 추가

**Files:**
- Modify: `E:/lmk/TRPG1/server.py`

- [ ] **Step 1: import 블록 수정**

기존:
```python
from gm_cli import create_session, gm_reply, load_session, recent_history
```

교체:
```python
from gm_cli import create_session, gm_reply, load_session, recent_history, generate_ending
import endings
import codex
import llm
from llm import generate_image
```

- [ ] **Step 2: ENDING_DIR 설정 추가**

`AUDIO_DIR.mkdir(exist_ok=True)` 바로 아래에:
```python
ENDING_DIR = STATIC_DIR / "endings"
ENDING_DIR.mkdir(exist_ok=True)
```

- [ ] **Step 3: public_session()에 진행도 필드 추가**

기존 `public_session()` 함수의 return dict 끝에 추가:
```python
        "progress": progression.progress_pct(_json_safe(session["flags"]) or {}),
        "stage": progression.current_stage(_json_safe(session["flags"]) or {}),
        "settle_threshold": progression.SETTLE_THRESHOLD,
        "ending_locked": session.get("ending") is not None,
```

기존 return 블록:
```python
    return {
        "id": str(session["id"]),
        "player_name": session["player_name"],
        "hp": session["hp"],
        "mp": session["mp"],
        "stamina": session["stamina"],
        "stats": {
            "힘": session["str"],
            "민첩": session["dex"],
            "지능": session["int_stat"],
            "매력": session["cha"],
        },
        "talent_grade": session["talent_grade"],
        "job": session["job"],
        "location": session["location"],
        "inventory": _json_safe(session["inventory"]),
        "flags": _json_safe(session["flags"]),
        "relations": _json_safe(session["relations"]),
    }
```

교체:
```python
    return {
        "id": str(session["id"]),
        "player_name": session["player_name"],
        "hp": session["hp"],
        "mp": session["mp"],
        "stamina": session["stamina"],
        "stats": {
            "힘": session["str"],
            "민첩": session["dex"],
            "지능": session["int_stat"],
            "매력": session["cha"],
        },
        "talent_grade": session["talent_grade"],
        "job": session["job"],
        "location": session["location"],
        "inventory": _json_safe(session["inventory"]),
        "flags": _json_safe(session["flags"]),
        "relations": _json_safe(session["relations"]),
        "progress": progression.progress_pct(_json_safe(session["flags"]) or {}),
        "stage": progression.current_stage(_json_safe(session["flags"]) or {}),
        "settle_threshold": progression.SETTLE_THRESHOLD,
        "ending_locked": session.get("ending") is not None,
    }
```

- [ ] **Step 4: /api/chat 와 /api/move 응답에 choices 추가**

`/api/chat` 핸들러 내부:
```python
    answer = gm_reply(req.session_id, message)

    return {
        "answer": answer,
        "segments": dialogue.split_segments(answer),
        "session": public_session(req.session_id),
    }
```

교체:
```python
    result = gm_reply(req.session_id, message)

    return {
        "answer": result["answer"],
        "segments": dialogue.split_segments(result["answer"]),
        "choices": result["choices"],
        "session": public_session(req.session_id),
    }
```

`/api/move` 핸들러 내부:
```python
    answer = gm_reply(
        req.session_id,
        f"나는 {location}으로 이동한다. 그곳의 상황을 묘사해줘.",
    )

    return {
        "answer": answer,
        "segments": dialogue.split_segments(answer),
        "session": public_session(req.session_id),
    }
```

교체:
```python
    result = gm_reply(
        req.session_id,
        f"나는 {location}으로 이동한다. 그곳의 상황을 묘사해줘.",
    )

    return {
        "answer": result["answer"],
        "segments": dialogue.split_segments(result["answer"]),
        "choices": result["choices"],
        "session": public_session(req.session_id),
    }
```

- [ ] **Step 5: 엔딩 관련 헬퍼·API 추가**

`/api/tts` 엔드포인트 바로 앞에 삽입:

```python
def _ending_image_prompt(ending: dict) -> str:
    snippet = (ending.get("text") or "").replace("GM:", " ").strip()[:280]
    return (
        "steampunk gaslit mining town 'Jaekkeut' in a gray foggy frontier valley, "
        "blue ether-crystal(영석) glow, misty peak with an ancient dragon's nest, "
        f"ending mood: {ending['name']}. scene: {snippet} "
        "19th-century steampunk, cinematic digital painting, atmospheric, no text, no letters."
    )


FIXED_ENDING_IMAGES = {
    "노멀": "normal.png",
    "트루": "true.png",
    "히든": "hidden.png",
}
BAD_FALLBACK_IMAGE = "bad.png"


def _static_image_url(filename: str | None) -> str | None:
    if filename and (ENDING_DIR / filename).exists():
        return f"/static/endings/{filename}"
    return None


def _finalize_ending(session_id: str) -> dict:
    result = generate_ending(session_id)

    if result["kind"] == "good":
        image_url = _static_image_url(FIXED_ENDING_IMAGES.get(result["name"]))
    else:
        image_url = None
        if llm.IMAGE_PROVIDER in llm.LIVE_IMAGE_PROVIDERS:
            try:
                img = generate_image(_ending_image_prompt(result))
                filename = f"{uuid.uuid4()}.png"
                (ENDING_DIR / filename).write_bytes(img)
                image_url = f"/static/endings/{filename}"
            except Exception:
                image_url = None
        if not image_url:
            image_url = _static_image_url(BAD_FALLBACK_IMAGE)

    ending = {
        "kind": result["kind"], "id": result["id"], "name": result["name"],
        "progress": result["progress"], "text": result["text"], "image_url": image_url,
    }
    with get_conn() as conn:
        conn.execute(
            "UPDATE game_sessions SET ending = %s, updated_at = now() WHERE id = %s",
            (json.dumps(ending, ensure_ascii=False), session_id),
        )

    try:
        codex.record_ending_for_session(session_id, ending)
    except Exception:
        pass

    return ending


class EndingRequest(BaseModel):
    session_id: str


@app.post("/api/ending/lock")
def lock_ending(
    req: EndingRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """70% 정산: 엔딩 분기를 확정하고, 서술 + 일러스트를 생성해 세션에 저장한다."""
    assert_session_owner(req.session_id, user_id)
    ending = _finalize_ending(req.session_id)
    return {"ending": ending, "segments": dialogue.split_segments(ending["text"])}


class DebugEndingRequest(BaseModel):
    session_id: str
    ending: str | None = None


_DEBUG_ENDING_TARGETS = {
    "노멀": {"flags": ["FLG_KARGAS_ALLY"], "events": ["EVT_PEAK_CONFRONT"]},
    "트루": {"flags": ["FLG_LIN_PLOT_SEEN", "FLG_KARGAS_ALLY"], "events": ["EVT_PEAK_CONFRONT"]},
    "히든": {"flags": ["FLG_LIN_ALLY", "FLG_MEMORY_RECOVERED"], "events": ["EVT_LIN_TALK"]},
    "베드": {"flags": [], "events": []},
}
_DEBUG_STAGE_EVENTS = [
    "EVT_INTRO", "EVT_MINE_INVESTIGATE", "EVT_MINE_DEEP", "EVT_PEAK_CONFRONT", "EVT_EPILOGUE",
]


@app.post("/api/debug/ending")
def debug_ending(
    req: DebugEndingRequest,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """[테스트 전용] 원하는 엔딩으로 즉시 점프한다."""
    assert_session_owner(req.session_id, user_id)

    for ev in _DEBUG_STAGE_EVENTS:
        progression.visit_event(req.session_id, ev)

    target = _DEBUG_ENDING_TARGETS.get(req.ending or "")
    if target:
        for fl in target["flags"]:
            progression.set_flag(req.session_id, fl, True)
        for ev in target["events"]:
            progression.visit_event(req.session_id, ev)

    ending = _finalize_ending(req.session_id)
    return {"ending": ending, "session": public_session(req.session_id)}


@app.get("/api/ending/{session_id}")
def get_ending(
    session_id: str,
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """100% 공개: 70%에서 확정·저장해 둔 엔딩(서술+이미지)을 그대로 돌려준다."""
    assert_session_owner(session_id, user_id)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT ending FROM game_sessions WHERE id = %s", (session_id,)
        ).fetchone()
    ending = _json_safe(row[0]) if row and row[0] else None
    return {"ending": ending}


@app.get("/api/codex")
def get_account_codex(
    user_id: str = Depends(get_user_id_from_token),
) -> dict[str, Any]:
    """계정 단위로 누적된 도감(단서·엔딩·인물). 회차가 바뀌어도 사라지지 않는다."""
    return codex.get_codex(user_id)
```

- [ ] **Step 6: 문법 검사**

```bash
cd E:/lmk/TRPG1 && python -c "import server; print('server OK')"
```
Expected: `server OK`

- [ ] **Step 7: Commit**

```bash
git -C E:/lmk/TRPG1 add server.py
git -C E:/lmk/TRPG1 commit -m "feat: add ending/codex APIs, progress fields, choices to server.py"
```

---

## Task 6: frontend — Ending.jsx 생성 + api.js 업데이트

**Files:**
- Create: `E:/lmk/TRPG1/frontend_src/src/components/Ending.jsx`
- Modify: `E:/lmk/TRPG1/frontend_src/src/api.js`

- [ ] **Step 1: Ending.jsx 생성**

```jsx
import React from 'react'

const KIND_COLOR = {
  good: '#c9a24b',
  bad: '#9b1c31',
}

const NAME_TITLE = {
  '노멀': '노멀 엔딩',
  '트루': '트루 엔딩',
  '히든': '히든 엔딩',
  '베드': '베드 엔딩',
}

export default function Ending({ ending, onClose }) {
  if (!ending) return null
  const color = KIND_COLOR[ending.kind] || '#c9a24b'
  const title = NAME_TITLE[ending.name] || `${ending.name} 엔딩`
  const body = String(ending.text || '').replace(/^\s*GM\s*[:：]\s*/gm, '').trim()

  return (
    <div style={overlay}>
      <div style={{ ...card, borderColor: color }}>
        {ending.image_url && (
          <div style={imgWrap}>
            <img src={ending.image_url} alt={title} style={img} />
          </div>
        )}
        <div style={{ ...badge, color, borderColor: color }}>END</div>
        <h2 style={{ ...titleStyle, color }}>{title}</h2>
        <p style={summaryStyle}>{ending.summary || ''}</p>
        <div style={textStyle}>{body}</div>
        <button style={{ ...btn, borderColor: color, color }} onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(8,8,10,0.92)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: '24px',
}
const card = {
  maxWidth: '720px', width: '100%', maxHeight: '92vh', overflowY: 'auto',
  background: '#14110d', border: '2px solid', borderRadius: '14px',
  padding: '0 0 24px', textAlign: 'center', boxShadow: '0 12px 50px #000a',
}
const imgWrap = { width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: '12px 12px 0 0', background: '#000' }
const img = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
const badge = {
  display: 'inline-block', marginTop: '18px', padding: '2px 14px',
  border: '1px solid', borderRadius: '999px', fontSize: '12px', letterSpacing: '3px',
}
const titleStyle = { margin: '10px 0 6px', fontSize: '28px', letterSpacing: '2px' }
const summaryStyle = { margin: '0 24px 14px', color: '#b8a98c', fontSize: '14px' }
const textStyle = {
  margin: '0 28px', color: '#e8e0d2', fontSize: '15px', lineHeight: 1.85,
  textAlign: 'left', whiteSpace: 'pre-wrap',
}
const btn = {
  marginTop: '22px', padding: '10px 28px', background: 'transparent',
  border: '1px solid', borderRadius: '8px', cursor: 'pointer', fontSize: '15px',
}
```

- [ ] **Step 2: api.js에 엔딩·도감 함수 추가**

기존 `apiTTS` 함수 바로 앞에 삽입:

```js
export async function apiLockEnding(sessionId) {
  return fetchJson('/api/ending/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId }),
  })
}

export async function apiGetEnding(sessionId) {
  return fetchJson(`/api/ending/${sessionId}`, {
    headers: { ...authHeaders() },
  })
}

export async function apiGetCodex() {
  return fetchJson('/api/codex', {
    headers: { ...authHeaders() },
  })
}

export async function apiDebugEnding(sessionId, ending) {
  return fetchJson('/api/debug/ending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId, ending }),
  })
}
```

- [ ] **Step 3: Commit**

```bash
git -C E:/lmk/TRPG1 add frontend_src/src/components/Ending.jsx frontend_src/src/api.js
git -C E:/lmk/TRPG1 commit -m "feat: add Ending.jsx component and ending/codex API functions"
```

---

## Task 7: App.jsx — 엔딩 상태 관리 추가

**Files:**
- Modify: `E:/lmk/TRPG1/frontend_src/src/App.jsx`

- [ ] **Step 1: import 업데이트**

기존:
```js
import { apiLoadSession, apiNewSession, getStoredUser, getToken, logout } from './api.js'
```

교체:
```js
import { apiLoadSession, apiNewSession, apiLockEnding, apiGetEnding, getStoredUser, getToken, logout } from './api.js'
import Ending from './components/Ending.jsx'
```

- [ ] **Step 2: 엔딩 state + ref 추가**

기존:
```js
  const mapResolver = useRef(null)
```

교체:
```js
  const [ending, setEnding] = useState(null)
  const mapResolver = useRef(null)
  const endingLockRef = useRef(false)
  const endingShownRef = useRef(null)
```

- [ ] **Step 3: 진행도 감지 useEffect 추가**

`useEffect(() => { setHasSave(...) }, [])` 바로 아래에 삽입:

```js
  useEffect(() => {
    if (!session?.id) return
    const pct = session.progress || 0
    const threshold = session.settle_threshold || 70

    if (pct >= threshold && !session.ending_locked && !endingLockRef.current) {
      endingLockRef.current = true
      apiLockEnding(session.id).catch(() => { endingLockRef.current = false })
    }
    if (pct >= 100 && !ending && endingShownRef.current !== session.id) {
      apiGetEnding(session.id).then((d) => {
        if (d.ending) { setEnding(d.ending); endingShownRef.current = session.id }
      }).catch(() => {})
    }
  }, [session])

  const closeEnding = () => {
    setEnding(null)
    setOverlay(null)
    setScreen('title')
  }
```

- [ ] **Step 4: startNew()에 엔딩 상태 리셋 추가**

기존 `startNew()`:
```js
      localStorage.removeItem(SAVE_KEY)
      setJourney([])
      setMapDepth(0)
      const data = await apiNewSession()
```

교체:
```js
      localStorage.removeItem(SAVE_KEY)
      setJourney([])
      setMapDepth(0)
      setEnding(null)
      endingLockRef.current = false
      endingShownRef.current = null
      const data = await apiNewSession()
```

- [ ] **Step 5: continueGame()에 엔딩 상태 리셋 추가**

기존 `continueGame()` 내부 try 블록 첫 부분:
```js
      const data = await apiLoadSession(sessionId)
```

앞에 삽입:
```js
      setEnding(null)
      endingLockRef.current = false
      endingShownRef.current = null
```

- [ ] **Step 6: JSX에 Ending 컴포넌트 + onEnding prop 추가**

기존 `{toast && ...}` 줄 바로 앞에 삽입:
```jsx
      {ending && <Ending ending={ending} onClose={closeEnding} />}
```

Dialogue 컴포넌트에 `onEnding` prop 추가:
기존:
```jsx
          <Dialogue
            session={session}
            history={history}
            onHistoryChange={setHistory}
            onSessionChange={setSession}
            runMapStep={runMapStep}
          />
```

교체:
```jsx
          <Dialogue
            session={session}
            history={history}
            onHistoryChange={setHistory}
            onSessionChange={setSession}
            onEnding={setEnding}
            runMapStep={runMapStep}
          />
```

- [ ] **Step 7: Commit**

```bash
git -C E:/lmk/TRPG1 add frontend_src/src/App.jsx
git -C E:/lmk/TRPG1 commit -m "feat: wire ending state management in App.jsx"
```

---

## Task 8: DB 마이그레이션 실행 및 프론트 빌드

**Files:** 없음 (실행 단계)

- [ ] **Step 1: DB 스키마 적용**

```bash
cd E:/lmk/TRPG1 && python setup_db.py
```
Expected: `DB schema ready.`

- [ ] **Step 2: 프론트 빌드**

```bash
cd E:/lmk/TRPG1/frontend_src && npm run build
```
Expected: `dist/` 폴더 생성, 오류 없음

- [ ] **Step 3: static 폴더에 빌드 결과 반영 확인**

TRPG1의 서버는 `static/` 폴더를 서빙한다. 빌드 결과가 `static/`에 복사되는 구조인지 확인한다.

```bash
ls E:/lmk/TRPG1/static/
```

`index.html`이 없으면 `frontend_src/dist/`의 내용을 `static/`에 복사:
```bash
cp -r E:/lmk/TRPG1/frontend_src/dist/* E:/lmk/TRPG1/static/
```

- [ ] **Step 4: 서버 기동 확인**

```bash
cd E:/lmk/TRPG1 && uvicorn server:app --reload --port 8000
```
Expected: `Uvicorn running on http://127.0.0.1:8000` — import error 없음

- [ ] **Step 5: 최종 Commit**

```bash
git -C E:/lmk/TRPG1 add -A
git -C E:/lmk/TRPG1 commit -m "chore: apply DB migration and rebuild frontend"
```

---

## Self-Review

### Spec coverage

| 요구사항 | 대응 Task |
|---------|---------|
| TTS: CosyVoice + Edge TTS (TRPG1) | 기존 유지, 변경 없음 |
| 엔딩 이미지 생성 (TRPG) | Task 2 (llm.py), Task 5 (server.py) |
| 도감 시스템 (TRPG) | Task 1 (codex.py), Task 4 (setup_db), Task 5 (/api/codex) |
| 선택지 [선택지] 시스템 (TRPG) | Task 3 (gm_cli split_choices + SYSTEM_PROMPT) |
| set_location 도구 (TRPG) | Task 3 (gm_cli TOOLS + _execute_tool) |
| 진행도 API (TRPG) | Task 5 (public_session progress/stage) |
| GM 어조 (TRPG1) | Task 3 — SYSTEM_PROMPT 어조 TRPG1 유지 |
| 인트로 텍스트 (TRPG1) | server.py 인트로 텍스트 이미 TRPG1 버전 유지 |
| Ending UI | Task 6 (Ending.jsx), Task 7 (App.jsx) |
| DB user_codex 테이블 | Task 4 (setup_db.py) |

### Placeholder scan

없음. 모든 step에 실제 코드 포함.

### Type consistency

- `gm_reply()` 반환 `dict` → server.py에서 `result["answer"]`, `result["choices"]` 로 접근 (일관)
- `generate_ending()` 반환 `dict` → `_finalize_ending()`이 그대로 소비 (일관)
- `codex.sync_clues_from_session(session_id)` → `codex.record_ending_for_session(session_id, ending)` 모두 Task 1에서 정의 (일관)
