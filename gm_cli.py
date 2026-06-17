from __future__ import annotations

import json
import os
import re
import uuid
from types import SimpleNamespace
from db import get_conn
import dialogue
from llm import chat, chat_stream, chat_with_tools
from rag import retrieve_context
from game_logic import perform_roll, infer_check
from personas import PERSONA_CONTEXT
import progression
import items_catalog
import endings
import codex
import reflection

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
   트루 엔딩 분기: 린의 말 모순을 짚고, 은폐된 명부/암시장 장부/영정 흐름을 대조해
       린이 인간과 용의 충돌을 부추기는 이중 공작을 실제로 간파했을 때만
       FLG_LIN_PLOT_SEEN을 켠다. 단순 의심이나 호감도 상승만으로는 켜지 않는다.
8. 플레이어가 주요 장면(이벤트 노드)을 실제로 통과하면 visit_event 도구로 기록한다.
   예) 봉우리에서 카르가스와 대면→EVT_PEAK_CONFRONT.
   호감도(NPC 관계)는 이 이벤트 통과로만 오른다. 임의로 호감도를 올리지 말 것.
   (visit_event 결과의 relations_changed에 오른 수치가 나오니 서사에 반영하라.)
9. 아이템과 단서를 구분하라.
   - "진짜 아이템"(무기·장비·소모품 등 손에 드는 물건)을 얻으면 give_item 도구로 인벤토리에 넣는다.
   - "단서·증거·정보"(예: 은폐된 명부, 봉우리의 그림자, 잊혀진 자장가)는 인벤토리 아이템이 아니다.
     이런 건 set_flag로 해당 플래그를 켜서 "도감"에만 기록한다(인벤토리에 넣지 말 것).
     예) 가일이 숨긴 광부 명부 입수 → set_flag("FLG_CLUE_01") (도감 '은폐된 명부' 해금).
   - 단서는 한 번 도감에 기록되면 사라지지 않는다. 단서를 "잃었다"고 서술하지 말 것.
   - 현재 인벤토리/도감에 없는 아이템·단서를 가진 것처럼 서술하지 말고, 이미 가진 것을
     처음 얻는 것처럼 중복 서술하지도 마라(상태와 서사가 어긋나지 않게).
10. [매우 중요·절대 잊지 말 것] 장면의 무대(장소)가 바뀌면 — 플레이어가 어딘가로 이동하거나,
    다른 장소의 NPC와 대화가 시작되면 — 그 서술을 쓰기 "전에 가장 먼저" set_location 도구를
    호출해 현재 위치를 그 장소로 바꾼다(배경이 따라 바뀐다). 이 호출을 빠뜨리면 배경이 안 바뀐다.
    핵심 장소(정해진 배경): 진료소, 여관, 주둔소(가일), 봉우리(카르가스), 산기슭 오두막(마르타), 재끝 마을 광장.
    그 외 장소(대장간, 정제소, 광산, 갱도, 암시장, 교단 성소 등)는 AI가 배경을 생성하므로 장소명을 구체적으로 적어 호출한다.
    예) 플레이어가 대장간에 감 → set_location("대장간"); 여관→광산 이동 → set_location("광산").
11. 엔딩은 플래그·이벤트·아이템·관계의 조합으로 열린다. 도구 결과에 ending_reached가
    오면, 그 엔딩 장면을 연출하고 이야기를 마무리한다.
12. [보상·아이템 — 실제 존재하는 것만] 판정 성공이나 사건의 대가로 아이템을 주기로 했으면
    반드시 give_item 도구를 호출해 "실제로" 지급한다(서술로만 주지 말 것). 게임에 없는 물건을
    지어내지 마라 — 무기·장비·소모품(앰플·등불·밧줄·영석 등 카탈로그에 있는 것)만 준다.
    '광부의 초' 같은 임의 아이템 금지. 마땅한 게 없으면 화폐(동화/은화)나 단서(set_flag·도감)로 대신한다.
13. [선택 진행 — 같은 결정 반복 금지] 플레이어가 이미 택해 "행동한" 선택지는 다음 턴에 다시 내지 마라.
    플레이어의 결정(예: "명부를 판다")을 받아들여 그 결과로 이야기를 '전진'시키고, 같은 결정을
    되묻지 않는다. 선택지는 항상 '다음에 할 새로운 행동'이어야 한다.
14. [이동 일관성] 플레이어가 이미 이동을 말했으면(예: "여관으로 간다") set_location을 부르고 그대로
    이동을 서술한다. "이동하시겠습니까?"라고 되묻지 마라. 반대로 단순히 장소를 언급만 했거나
    "거기서 팔까?"처럼 다른 행동/질문이면 함부로 이동시키지 말고 그 자리에서 처리한다.

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

# AI GM이 부를 수 있는 도구. 대화 맥락에서 스스로 호출해 진행을 건드린다.
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "roll_check",
            "description": "행동에 불확실성이 있을 때 d12 판정을 굴린다. d12 + 내림(능력치÷2) + 직업보정 ≥ DC 면 성공.",
            "parameters": {
                "type": "object",
                "properties": {
                    "stat": {"type": "string", "enum": ["str", "dex", "int_stat", "cha"],
                             "description": "힘=str, 민첩=dex, 지능=int_stat, 매력=cha"},
                    "dc": {"type": "integer", "description": "난이도 5~15"},
                    "reason": {"type": "string", "description": "무엇을 판정하는지 한 줄"},
                },
                "required": ["stat", "dc"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_flag",
            "description": "스토리 진행 플래그를 켠다. 플레이어가 해당 핵심 비트에 실제로 도달했을 때만 호출.",
            "parameters": {
                "type": "object",
                "properties": {
                    "flag": {"type": "string", "enum": list(progression.FLAGS),
                             "description": "세팅할 플래그 ID"},
                    "reason": {"type": "string", "description": "어떤 행동/대사로 켜졌는지 한 줄"},
                },
                "required": ["flag"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "visit_event",
            "description": "주요 이벤트 노드(장면)를 플레이어가 실제로 통과했을 때 기록한다. 일부 엔딩의 조건.",
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string", "enum": list(progression.EVENT_NODES),
                                "description": "통과한 이벤트 노드 ID"},
                    "reason": {"type": "string", "description": "어떤 장면이었는지 한 줄"},
                },
                "required": ["node_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_location",
            "description": ("장면의 무대(장소)가 바뀔 때마다 반드시 호출해 현재 위치를 갱신한다(배경이 따라 바뀐다). "
                            "핵심 장소(정해진 배경): 진료소/여관/주둔소/봉우리/오두막/재끝 마을 광장. "
                            "그 외 장소(대장간/정제소/광산/갱도/암시장/교단 등)는 AI가 배경을 생성한다."),
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string",
                                 "description": "바뀐 현재 장소(주요 장소명 우선, 없으면 자유 서술)"},
                },
                "required": ["location"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "give_item",
            "description": "플레이어가 '진짜 아이템'(무기·장비·소모품 등)을 손에 넣었을 때 인벤토리에 추가한다. 단서·증거(예: 은폐된 명부)는 아이템이 아니므로 여기 말고 set_flag로 도감에 기록할 것.",
            "parameters": {
                "type": "object",
                "properties": {
                    "item": {"type": "string", "description": "획득한 아이템/단서 이름"},
                    "reason": {"type": "string", "description": "어떻게 얻었는지 한 줄"},
                },
                "required": ["item"],
            },
        },
    },
]

MAX_TOOL_ROUNDS = 4

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


def create_session() -> str:
    session_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute("INSERT INTO game_sessions(id) VALUES (%s)", (session_id,))
    return session_id


def load_session(session_id: str) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM game_sessions WHERE id = %s", (session_id,)).fetchone()
        cols = [desc.name for desc in conn.execute("SELECT * FROM game_sessions LIMIT 0").description]
    if not row:
        raise RuntimeError("session not found")
    return dict(zip(cols, row))


def save_event(session_id: str, role: str, content: str, metadata: dict | None = None) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO game_events(session_id, role, content, metadata) VALUES (%s, %s, %s, %s)",
            (session_id, role, content, json.dumps(metadata or {}, ensure_ascii=False)),
        )


def recent_history(session_id: str, limit: int = 8) -> list[dict[str, str]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT role, content FROM game_events
            WHERE session_id = %s
            ORDER BY id DESC
            LIMIT %s
            """,
            (session_id, limit),
        ).fetchall()
    return [{"role": r[0], "content": r[1]} for r in reversed(rows)]


def _execute_tool(session_id: str, session: dict, tool_call) -> dict:
    """GM이 부른 도구를 실행하고 결과(dict)를 돌려준다."""
    name = tool_call.function.name
    try:
        args = json.loads(tool_call.function.arguments or "{}")
    except json.JSONDecodeError:
        args = {}

    if name == "roll_check":
        stat = args.get("stat")
        dc = int(args.get("dc", 8))
        r = perform_roll(session, stat, dc)
        return {
            "stat": stat, "dc": dc, "roll": r.roll,
            "stat_bonus": r.stat_bonus, "job_bonus": r.job_bonus,
            "total": r.total, "success": r.success,
        }

    if name == "set_flag":
        try:
            progression.set_flag(session_id, args.get("flag"), True)
        except ValueError as exc:
            return {"error": str(exc)}
        return _with_ending(session_id, {"ok": True, "flag": args.get("flag")})

    if name == "visit_event":
        try:
            res = progression.visit_event(session_id, args.get("node_id"))
        except ValueError as exc:
            return {"error": str(exc)}
        payload = {"ok": True, "event": args.get("node_id")}
        if res["relations_changed"]:
            payload["relations_changed"] = res["relations_changed"]  # 이벤트로 오른 호감도
        if res.get("items_added"):
            payload["items_added"] = res["items_added"]              # 이벤트로 받은 아이템(이름)
        return _with_ending(session_id, payload)

    if name == "give_item":
        item = args.get("item", "").strip()
        if not item:
            return {"error": "item is empty"}
        res = progression.give_item(session_id, item)
        return _with_ending(session_id, {
            "ok": True,
            "item": res.get("display") or item,
            "already_had": not res.get("added", True),
        })

    if name == "set_location":
        try:
            loc = progression.set_location(session_id, args.get("location"))
        except ValueError as exc:
            return {"error": str(exc)}
        return {"ok": True, "location": loc}

    return {"error": f"unknown tool: {name}"}


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


# 안전망: GM이 set_location을 빠뜨려도, 플레이어가 '명확히' 이동을 선언하면 서버가 갱신한다.
# 주의: 계획/조건/다른 행동이 섞인 표현(가서, 에 가, 가야 등)은 자동이동시키지 않는다(오작동 방지).
_MOVE_HINTS = ("간다", "갈래", "갈게", "갈란다", "가자", "향한다", "향해", "향하",
               "들어간다", "들어선", "도착했", "도착한", "이동", "들른다", "들러",
               "올라간다", "내려간다", "떠난다", "떠난", "출발", "나선다",
               "로 간다", "으로 간다", "로 이동", "으로 이동")
# 질문·추측·미정·이동 외 행동(거래 등)이 섞이면 자동이동 보류 → GM이 판단하게 둔다
_MOVE_BLOCK = ("?", "？", "갈까", "할까", "될까", "갈지", "가도", "가면", "갈 수", "팔", "판다",
               "판매", "거래", "물어", "물을", "확인", "대조")
_KNOWN_LOCS = ["재끝 마을 광장", "마을 광장", "광장", "진료소", "여관", "주점", "주막",
               "대장간", "풀무간", "정제소", "갱도 심부", "갱도", "광산", "봉우리",
               "산기슭 오두막", "오두막", "주둔소", "암시장", "교단 성소", "교단", "폐광"]


def _detect_move_target(text: str) -> str | None:
    """플레이어가 '명확히' 특정 장소로 이동을 선언했을 때만 그 장소명을 돌려준다.
    질문·계획·거래 등 다른 의도가 섞이면(예: '여관에 가서 판다', '여관 갈까?')
    자동이동하지 않고 None을 반환한다 — 무대 전환 판단은 GM에게 맡긴다."""
    if not text:
        return None
    if any(b in text for b in _MOVE_BLOCK):   # 질문/다른행동 섞임 → 보류
        return None
    if not any(h in text for h in _MOVE_HINTS):
        return None
    for loc in _KNOWN_LOCS:   # 더 구체적인 이름(긴 것)부터 매칭
        if loc in text:
            return loc
    return None


_STREAM_CHOICE_HEADER = re.compile(r"\[\s*선택지\s*\]", re.IGNORECASE)
_STREAM_SENTENCE_ENDS = ".!?。！？…"
_STREAM_TRAILING_QUOTES = "\"'”’)]}»"


def _tool_call_from_raw(raw: dict) -> SimpleNamespace:
    function = raw.get("function") or {}
    return SimpleNamespace(
        id=raw.get("id") or "",
        function=SimpleNamespace(
            name=function.get("name") or "",
            arguments=function.get("arguments") or "{}",
        ),
    )


def _stream_boundary_index(buffer: str) -> int | None:
    source = buffer or ""
    newline = source.find("\n")
    if newline >= 0 and newline + 1 < len(source):
        return newline + 1

    for index, char in enumerate(source):
        if char not in _STREAM_SENTENCE_ENDS:
            continue
        end = index + 1
        while end < len(source) and source[end] in _STREAM_TRAILING_QUOTES:
            end += 1
        if end >= len(source) or source[end].isspace():
            return end
    return None


def _focus_npc_name(focus_npc: str) -> str:
    """NPC speaker id('gail' 등)를 프롬프트용 한글 이름('가일')으로 변환."""
    for name, sid in dialogue.NPC_SPEAKERS.items():
        if sid == focus_npc:
            return name
    return focus_npc


def _focus_system_message(focus_npc: str | None) -> dict | None:
    """1:1 대화 상대가 있으면 GM이 그 NPC 대사를 가로채지 않도록 지시하는 system 메시지."""
    if not focus_npc:
        return None
    name = _focus_npc_name(focus_npc)
    return {
        "role": "system",
        "content": (
            f"[1:1 대화 모드] 지금 플레이어는 '{name}'와(과) 직접 대화 중이다. "
            f"'{name}'이(가) 하는 말은 반드시 「{name}: ...」 라벨이나 따옴표로 표기하고, "
            f"그 대사를 GM 서술로 대신 풀어 쓰지 마라. "
            f"순수한 장면 묘사·행동 서술만 GM(나레이션)으로 작성한다. "
            f"문맥상 다른 인물이 말하는 부분은 그 인물 이름으로 표기한다."
        ),
    }


def _segments_from_stream_piece(piece: str, current_npc: str | None = None) -> list[dict]:
    segments = []
    for segment in dialogue.split_segments(piece, current_npc):
        text = (segment.get("text") or "").strip()
        if not text:
            continue
        speaker = segment.get("speaker") or ("gm" if segment.get("role") == "gm" else "gm")
        segments.append({
            "role": segment.get("role") or ("gm" if speaker == "gm" else "npc"),
            "speaker": speaker,
            "text": text,
        })
    return segments


def _drain_stream_segments(buffer: str, final: bool = False, current_npc: str | None = None) -> tuple[list[dict], str]:
    pending = buffer or ""
    drained: list[dict] = []

    while pending.strip():
        boundary = len(pending) if final else _stream_boundary_index(pending)
        if boundary is None:
            break
        piece = pending[:boundary].strip()
        pending = pending[boundary:].lstrip()
        if piece:
            drained.extend(_segments_from_stream_piece(piece, current_npc))
        if final:
            break

    return drained, pending


def _finalize_gm_answer(session_id: str, user_input: str, answer: str, contexts: list, tool_log: list) -> dict:
    if os.getenv("GM_DEBUG") and tool_log:
        for t in tool_log:
            print(f"   · [도구] {t['tool']}({t['args']}) → {t['result']}", flush=True)

    if not any(t.get("tool") == "set_location" for t in tool_log):
        moved = _detect_move_target(user_input)
        if moved:
            try:
                progression.set_location(session_id, moved)
            except Exception:
                pass

    body, choice_texts = split_choices(answer)
    choices = []
    for t in choice_texts:
        required, stat, dc = infer_check(t)
        choices.append({"text": t, "judge": bool(required), "stat": stat, "dc": dc})

    save_event(session_id, "user", user_input, {})
    save_event(session_id, "assistant", body,
               {"contexts": contexts, "tools": tool_log, "choices": choices})
    reflection.dispatch(session_id, user_input, body)
    return {"answer": body, "choices": choices}


def gm_reply_stream(session_id: str, user_input: str, focus_npc: str | None = None):
    session = load_session(session_id)
    contexts = retrieve_context(user_input, limit=5)

    context_text = "\n\n".join(
        f"[출처:{c['document_title']} / {c['section_title']} / 유사도:{c['similarity']:.3f}]\n{c['content']}"
        for c in contexts
    )

    state_text = json.dumps(
        {
            "location": session["location"],
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
            "inventory": _humanize_inventory(session["inventory"]),
            "flags": session["flags"],
            "relations": session["relations"],
        },
        ensure_ascii=False,
        default=str,
    )

    messages: list = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": PERSONA_CONTEXT},
        {"role": "system", "content": f"현재 세션 상태:\n{state_text}"},
        {"role": "system", "content": f"RAG 컨텍스트:\n{context_text}"},
        *recent_history(session_id),
        {"role": "user", "content": user_input},
    ]
    _focus_msg = _focus_system_message(focus_npc)
    if _focus_msg:
        messages.insert(-1, _focus_msg)

    tool_log: list = []
    answer_parts: list[str] = []
    body_buffer = ""
    choices_started = False
    emitted_segments: list[dict] = []

    for _ in range(MAX_TOOL_ROUNDS):
        tool_calls: dict[int, dict] = {}
        call_content_parts: list[str] = []

        for chunk in chat_stream(messages, TOOLS):
            if not getattr(chunk, "choices", None):
                continue
            delta = chunk.choices[0].delta

            for tool_delta in getattr(delta, "tool_calls", None) or []:
                index = int(getattr(tool_delta, "index", 0) or 0)
                raw = tool_calls.setdefault(index, {
                    "id": "",
                    "type": "function",
                    "function": {"name": "", "arguments": ""},
                })
                if getattr(tool_delta, "id", None):
                    raw["id"] = tool_delta.id
                if getattr(tool_delta, "type", None):
                    raw["type"] = tool_delta.type
                function = getattr(tool_delta, "function", None)
                if function:
                    if getattr(function, "name", None):
                        raw["function"]["name"] += function.name
                    if getattr(function, "arguments", None):
                        raw["function"]["arguments"] += function.arguments

            content = getattr(delta, "content", None) or ""
            if not content:
                continue
            call_content_parts.append(content)
            answer_parts.append(content)

            if choices_started:
                continue
            body_buffer += content
            choice_match = _STREAM_CHOICE_HEADER.search(body_buffer)
            if choice_match:
                body_buffer = body_buffer[:choice_match.start()]
                choices_started = True

            segments, body_buffer = _drain_stream_segments(body_buffer, current_npc=focus_npc)
            for segment in segments:
                emitted_segments.append(segment)
                yield {"type": "segment", "segment": segment}

        ordered_tool_calls = [tool_calls[i] for i in sorted(tool_calls)]
        if not ordered_tool_calls:
            break

        messages.append({
            "role": "assistant",
            "content": "".join(call_content_parts) or None,
            "tool_calls": ordered_tool_calls,
        })
        for raw in ordered_tool_calls:
            if not raw.get("id"):
                raw["id"] = f"call_{len(tool_log)}"
            result = _execute_tool(session_id, session, _tool_call_from_raw(raw))
            tool_log.append({
                "tool": raw["function"]["name"],
                "args": raw["function"]["arguments"],
                "result": result,
            })
            messages.append({
                "role": "tool",
                "tool_call_id": raw["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })
    else:
        for chunk in chat_stream(messages):
            if not getattr(chunk, "choices", None):
                continue
            delta = chunk.choices[0].delta
            content = getattr(delta, "content", None) or ""
            if not content:
                continue
            answer_parts.append(content)
            if choices_started:
                continue
            body_buffer += content
            choice_match = _STREAM_CHOICE_HEADER.search(body_buffer)
            if choice_match:
                body_buffer = body_buffer[:choice_match.start()]
                choices_started = True
            segments, body_buffer = _drain_stream_segments(body_buffer, current_npc=focus_npc)
            for segment in segments:
                emitted_segments.append(segment)
                yield {"type": "segment", "segment": segment}

    for segment in _drain_stream_segments(body_buffer, final=True, current_npc=focus_npc)[0]:
        emitted_segments.append(segment)
        yield {"type": "segment", "segment": segment}

    answer = "".join(answer_parts)
    result = _finalize_gm_answer(session_id, user_input, answer, contexts, tool_log)
    yield {
        "type": "final",
        "answer": result["answer"],
        "choices": result["choices"],
        "segments": emitted_segments or dialogue.split_segments(result["answer"], focus_npc),
    }


def _humanize_inventory(inventory) -> dict:
    """ITM_* ID가 섞인 인벤토리를 GM이 읽기 쉬운 이름으로 바꿔 준다(상태 전달용)."""
    inv = progression.as_dict(inventory)
    out = dict(inv)
    items = inv.get("items")
    if isinstance(items, list):
        out["items"] = [items_catalog.display_name(it) for it in items]
    equip = inv.get("equipment")
    if isinstance(equip, dict):
        out["equipment"] = {
            slot: (items_catalog.display_name(v) if v else None)
            for slot, v in equip.items()
        }
    return out


def gm_reply(session_id: str, user_input: str, focus_npc: str | None = None) -> dict:
    session = load_session(session_id)
    contexts = retrieve_context(user_input, limit=5)

    context_text = "\n\n".join(
        f"[출처:{c['document_title']} / {c['section_title']} / 유사도:{c['similarity']:.3f}]\n{c['content']}"
        for c in contexts
    )

    state_text = json.dumps(
        {
            "location": session["location"],
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
            "inventory": _humanize_inventory(session["inventory"]),
            "flags": session["flags"],
            "relations": session["relations"],
        },
        ensure_ascii=False,
        default=str,
    )

    messages: list = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": PERSONA_CONTEXT},
        {"role": "system", "content": f"현재 세션 상태:\n{state_text}"},
        {"role": "system", "content": f"RAG 컨텍스트:\n{context_text}"},
        *recent_history(session_id),
        {"role": "user", "content": user_input},
    ]
    _focus_msg = _focus_system_message(focus_npc)
    if _focus_msg:
        messages.insert(-1, _focus_msg)

    # 툴 호출 루프: GM이 roll_check/set_flag 를 부르면 실행해 결과를 돌려주고,
    # 더 부를 게 없으면(최종 서술) 빠져나온다.
    tool_log: list = []
    answer = ""
    for _ in range(MAX_TOOL_ROUNDS):
        msg = chat_with_tools(messages, TOOLS)
        if not msg.tool_calls:
            answer = msg.content or ""
            break
        messages.append(msg)
        for tc in msg.tool_calls:
            result = _execute_tool(session_id, session, tc)
            tool_log.append({"tool": tc.function.name,
                             "args": tc.function.arguments, "result": result})
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False),
            })
    else:
        # 라운드 소진 시 도구 없이 마지막 서술을 받는다.
        answer = chat(messages) or ""

    if os.getenv("GM_DEBUG") and tool_log:
        for t in tool_log:
            print(f"   · [도구] {t['tool']}({t['args']}) → {t['result']}", flush=True)

    # 안전망: GM이 이번 턴에 set_location을 부르지 않았는데 플레이어가 이동을 명시했다면 서버가 장소를 갱신.
    if not any(t.get("tool") == "set_location" for t in tool_log):
        moved = _detect_move_target(user_input)
        if moved:
            try:
                progression.set_location(session_id, moved)
            except Exception:
                pass

    body, choice_texts = split_choices(answer)
    # 선택지마다 판정 필요 여부를 자동 감지해 구조화한다(프론트에서 주사위 모달 트리거용).
    choices = []
    for t in choice_texts:
        required, stat, dc = infer_check(t)
        choices.append({"text": t, "judge": bool(required), "stat": stat, "dc": dc})
    save_event(session_id, "user", user_input, {})
    save_event(session_id, "assistant", body,
               {"contexts": contexts, "tools": tool_log, "choices": choices})

    # 성찰 패스: 모델이 1차에서 도구를 빠뜨려도, 자기 서술을 다시 읽고
    # 발생한 비트를 스스로 판단해 보완한다. 비동기(백그라운드)라 응답 지연 없음.
    reflection.dispatch(session_id, user_input, body)
    return {"answer": body, "choices": choices}


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


def main() -> None:
    session_id = create_session()
    print(f"새 세션: {session_id}")
    print("AI GM 테스트를 시작합니다. 종료하려면 /quit 입력")

    while True:
        user_input = input("\n플레이어> ").strip()
        if user_input in {"/quit", "종료", "exit"}:
            break
        if not user_input:
            continue
        result = gm_reply(session_id, user_input)
        print()
        for seg in dialogue.split_segments(result["answer"]):
            who = "GM(시스템)" if seg["role"] == "gm" else seg["speaker"]
            print(f"[{who}] {seg['text']}")
        for i, c in enumerate(result["choices"], 1):
            print(f"  ({i}) {c}")

if __name__ == "__main__":
    main()
