"""Deterministic main-story scene flow for the normal ending route."""
from __future__ import annotations

import json
from copy import deepcopy

from db import get_conn
import dialogue
import progression


BAD_MAX = 4
NORMAL_MAX = 8
LIGHT_REWARDS = ["낡은 붕대", "소형 회복 포션", "영정 조각", "광부의 초"],


SCENES: dict[str, dict] = {
    "clinic_wake": {
        "title": "도입 - 진료소 각성",
        "location": "진료소",
        "event": "EVT_INTRO",
        "text": (
            "GM: 진료소의 노란 등불이 흔들립니다. 기억은 안개처럼 비어 있고, 의사는 낮은 목소리로 "
            "사라진 광부들에 대한 이야기를 꺼냅니다.\n"
            "의사: \"몸은 움직일 수 있습니다. 다만 이 마을의 안개는, 사람을 쉽게 놓아주지 않습니다. "
            "먼저 누구의 말을 들어볼지 정하십시오.\""
        ),
        "choices": [
            {"id": "clinic_to_tavern", "text": "여관에서 린과 마을 소문을 거래한다", "next": "tavern_rin"},
            {"id": "clinic_to_mine", "text": "광산 쪽 상황을 직접 살핀다", "next": "mine_gate"},
        ],
    },
    "clinic_nurse": {
        "title": "진료소 - 간호사의 기록",
        "location": "진료소",
        "text": (
            "GM: 진료소 뒤편 기록 선반에는 이름 대신 숫자로 묶인 부상자 표식이 줄지어 있습니다.\n"
            "간호사: \"공식 보고보다 들것이 훨씬 많이 들어왔어요. 광산 쪽 사람들은 다들 입을 닫으라 하더군요.\""
        ),
        "choices": [
            {"id": "nurse_to_mine", "text": "기록의 숫자를 따라 광산 입구로 간다", "next": "mine_gate"},
            {"id": "nurse_to_tavern", "text": "린에게 기록 속 표식의 의미를 묻는다", "next": "tavern_rin"},
        ],
    },
    "mine_gate": {
        "title": "사라진 광부들",
        "location": "광산",
        "event": "EVT_MINE_INVESTIGATE",
        "flag": "FLG_CLUE_01",
        "item": "은폐된 명부",
        "text": (
            "GM: 광산 입구에는 새 명패보다 뜯겨 나간 명패가 더 많습니다. 감독 가일은 당신을 보자마자 "
            "서류철을 품 안으로 숨깁니다.\n"
            "가일: \"실종? 헛소문이오. 채굴은 멈추지 않습니다.\""
        ),
        "choices": [
            {"id": "mine_question_gail", "text": "가일을 압박해 은폐된 명부를 확인한다", "next": "night_watch"},
            {"id": "mine_talk_miner", "text": "갱도 앞 광부에게 실제 실종 규모를 묻는다", "next": "miner_rumor"},
            {"id": "mine_watch_shift", "text": "교대 시간이 끝날 때까지 숨어서 관찰한다", "next": "night_watch"},
        ],
    },
    "miner_rumor": {
        "title": "광부의 증언",
        "location": "광산",
        "flag": "FLG_CLUE_01",
        "item": "은폐된 명부",
        "text": (
            "GM: 먼지를 뒤집어쓴 광부가 낮은 목소리로 주변을 살핍니다.\n"
            "광부: \"셋이 아닙니다. 사라진 사람은 훨씬 많아요. 밤이면 갱도 안쪽에서 기계도 아닌 것이 숨을 쉽니다.\""
        ),
        "choices": [
            {"id": "miner_to_night", "text": "밤까지 기다려 광산과 마을의 움직임을 본다", "next": "night_watch"},
            {"id": "miner_to_tavern", "text": "여관으로 돌아가 린에게 광부의 말을 확인한다", "next": "tavern_rin"},
        ],
    },
    "tavern_rin": {
        "title": "여관 - 린의 소문값",
        "location": "여관",
        "event": "EVT_LIN_TALK",
        "text": (
            "GM: 여관 안쪽의 램프가 흔들리고, 계산대 뒤에 있던 주점 점원이 당신을 먼저 막아섭니다.\n"
            "주점 점원: \"어서 오세요. 무엇 때문에 오셨는지 먼저 확인해도 될까요? 광산 이야기라면 함부로 꺼낼 수 없어서요.\"\n"
            "GM: 당신의 목적을 들은 점원은 고개를 끄덕이고, 바 안쪽에 기대어 있던 린에게 낮게 보고합니다.\n"
            "주점 점원: \"주인님, 광산의 실종과 검은 표식에 대해 묻는 손님입니다. 어떻게 할까요?\"\n"
            "린: \"너는 다른 일 봐. 이 손님은 내가 직접 상대할게.\"\n"
            "GM: 점원이 물러나자 린이 잔을 내려놓고 당신 쪽으로 천천히 다가옵니다.\n"
            "린: \"광산 이야기는 값이 비싸요. 그래도 당신이 그쪽으로 갈 거라면 밤의 그림자부터 보는 게 좋겠어요.\""
        ),
        "choices": [
            {"id": "rin_follow_hint", "text": "린의 힌트를 따라 밤의 마을을 관찰한다", "next": "night_watch"},
            {"id": "rin_press_plot", "text": "린이 숨기는 의도를 떠본다", "next": "night_watch", "good_flag": "FLG_LIN_PLOT_SEEN"},
            {"id": "rin_to_mine", "text": "정보값 대신 광산에서 직접 확인하겠다고 나선다", "next": "mine_gate"},
        ],
    },
    "night_watch": {
        "title": "살아 움직이는 기계",
        "location": "마을 광장",
        "event": "EVT_NIGHT_WATCH",
        "flag": "FLG_CLUE_02",
        "text": (
            "GM: 자정이 지나자 멈춰 있던 술식기계들이 한 박자 늦게 고개를 돌립니다. 봉우리 위에는 "
            "용의 등뼈 같은 그림자가 안개 속에 잠깐 떠오릅니다."
        ),
        "choices": [
            {"id": "night_to_marta", "text": "봉우리 그림자를 아는 마르타를 찾아간다", "next": "marta_legend"},
            {"id": "night_to_miner", "text": "갱도 쪽 광부들에게 밤마다 벌어지는 일을 묻는다", "next": "miner_rumor"},
            {"id": "night_to_tobi", "text": "광산 근처에서 토비의 흔적을 찾는다", "next": "deep_mine"},
        ],
    },
    "marta_legend": {
        "title": "산의 옛 전설",
        "location": "산기슭 오두막",
        "event": "EVT_MARTA_LEGEND",
        "flag": "FLG_CLUE_03",
        "text": (
            "GM: 산기슭 오두막에서 마르타는 낡은 등잔을 켭니다. 불빛은 봉우리 쪽으로만 길게 눕습니다.\n"
            "마르타: \"저 산은 빈 산이 아니야. 인간이 둥지를 광맥이라 부르기 시작하면서 모든 일이 비틀렸지.\""
        ),
        "choices": [
            {"id": "marta_to_deep", "text": "마르타의 전설을 단서 삼아 갱도 심부로 향한다", "next": "deep_mine"},
            {"id": "marta_find_tobi", "text": "토비를 찾아 함께 갱도 표식을 확인한다", "next": "deep_mine"},
        ],
    },
    "deep_mine": {
        "title": "갱도 심부의 비밀",
        "location": "갱도 심부",
        "event": "EVT_MINE_DEEP",
        "flag": "FLG_CLUE_04",
        "text": (
            "GM: 갱도 심부의 새 광맥은 광물이 아니라 거대한 둥지의 상처처럼 맥동합니다. 갇혀 있던 광부들의 "
            "두드림이 암벽 너머에서 희미하게 돌아옵니다.\n"
            "토비: \"형이 살아 있을지도 몰라요. 저 소리, 광부들이 쓰는 신호예요!\""
        ),
        "choices": [
            {"id": "deep_rescue", "text": "갇힌 광부들의 위치를 표시하고 봉우리로 향한다", "next": "peak_confront"},
            {"id": "deep_report_rin", "text": "린에게 둥지의 정체를 확인하고 봉우리로 간다", "next": "peak_confront"},
            {"id": "deep_go_alone", "text": "혼자 봉우리로 올라 카르가스를 대면한다", "next": "peak_confront"},
        ],
    },
    "peak_confront": {
        "title": "절정 - 봉우리의 대면",
        "location": "봉우리",
        "event": "EVT_PEAK_CONFRONT",
        "text": (
            "GM: 봉우리의 안개가 찢어지고, 잿빛 비늘의 거대한 형체가 낡은 영석 장치들 사이에서 눈을 뜹니다.\n"
            "카르가스: \"작은 인간아. 너희는 둥지를 광맥이라 부르고, 상처를 번영이라 불렀다. 이제 무엇을 멈출 수 있느냐.\""
        ),
        "choices": [
            {"id": "peak_promise", "text": "채굴 중단을 약속하고 영석 반환을 받아들인다", "next": "normal_epilogue", "flag": "FLG_KARGAS_ALLY"},
            {"id": "peak_negotiate", "text": "마을 생존을 조건으로 카르가스와 휴전을 협상한다", "next": "normal_epilogue", "flag": "FLG_KARGAS_ALLY"},
        ],
    },
    "normal_epilogue": {
        "title": "노멀 엔딩 - 유예의 새벽",
        "location": "마을 광장",
        "event": "EVT_EPILOGUE",
        "ending": True,
        "text": (
            "GM: 채굴은 멈추고 봉우리의 안개가 조금씩 걷힙니다. 갱도에 갇혔던 광부 일부가 돌아오고, "
            "재끝 마을은 완전한 구원이 아닌 짧은 유예를 얻습니다. 당신은 아직 잃어버린 이름을 다 찾지 못했지만, "
            "최악은 막았습니다. 그것으로 충분한 날이 있습니다."
        ),
        "choices": [],
    },
}


def _json(value) -> dict:
    return progression.as_dict(value)


def _get_session_story_state(session_id: str) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT flags, inventory, hp FROM game_sessions WHERE id = %s",
            (session_id,),
        ).fetchone()
    if not row:
        raise RuntimeError("session not found")
    flags = _json(row[0])
    return {"flags": flags, "inventory": _json(row[1]), "hp": int(row[2] or 0)}


def _save_flags(session_id: str, flags: dict) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE game_sessions SET flags = %s, updated_at = now() WHERE id = %s",
            (json.dumps(flags, ensure_ascii=False), session_id),
        )


def _save_inventory(session_id: str, inventory: dict) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE game_sessions SET inventory = %s, updated_at = now() WHERE id = %s",
            (json.dumps(inventory, ensure_ascii=False), session_id),
        )


def _set_hp(session_id: str, hp: int) -> int:
    hp = max(1, min(30, int(hp)))
    with get_conn() as conn:
        conn.execute(
            "UPDATE game_sessions SET hp = %s, updated_at = now() WHERE id = %s",
            (hp, session_id),
        )
    return hp


def _current_scene_id(flags: dict) -> str:
    scene_id = flags.get("STORY_SCENE") or "clinic_wake"
    return scene_id if scene_id in SCENES else "clinic_wake"


def _public_scene(scene_id: str) -> dict:
    scene = deepcopy(SCENES[scene_id])
    public_choices = []
    for choice in scene.get("choices", []):
        next_scene = SCENES.get(choice.get("next", ""), {})
        public_choices.append({
            "id": choice["id"],
            "text": choice["text"],
            "no_roll": bool(choice.get("no_roll") or next_scene.get("ending")),
        })
    return {
        "id": scene_id,
        "title": scene["title"],
        "location": scene["location"],
        "text": scene["text"],
        "choices": public_choices,
        "ending": bool(scene.get("ending")),
        "segments": dialogue.split_segments(scene["text"]),
    }


def current_scene(session_id: str, include_text: bool = False) -> dict:
    state = _get_session_story_state(session_id)
    scene_id = _current_scene_id(state["flags"])
    scene = _public_scene(scene_id)
    if not include_text:
        scene.pop("text", None)
        scene.pop("segments", None)
    return scene


def ensure_story_started(session_id: str) -> dict:
    state = _get_session_story_state(session_id)
    flags = state["flags"]
    if not flags.get("STORY_SCENE"):
        flags["STORY_SCENE"] = "clinic_wake"
        _save_flags(session_id, flags)
    return current_scene(session_id, include_text=True)


def _roll_tier(roll: int) -> str:
    if roll <= BAD_MAX:
        return "bad"
    if roll <= NORMAL_MAX:
        return "normal"
    return "good"


def _apply_scene_marks(session_id: str, scene: dict, choice: dict, flags: dict) -> list[str]:
    notes = []
    for key in ("event", "flag"):
        value = scene.get(key)
        if value:
            flags[value] = True
    if choice.get("flag"):
        flags[choice["flag"]] = True
    if choice.get("good_flag"):
        flags[choice["good_flag"]] = True
        notes.append("숨겨진 의도를 조금 더 선명하게 짚어냈습니다.")
    if scene.get("item"):
        progression.give_item(session_id, scene["item"])
        notes.append(f"{scene['item']}을(를) 확보했습니다.")
    return notes


def _apply_roll_effect(session_id: str, tier: str, state: dict) -> str:
    hp = state["hp"]
    inventory = state["inventory"]
    items = inventory.get("items")
    if not isinstance(items, list):
        items = []

    if tier == "bad":
        if len(items) > 1:
            lost = next((item for item in reversed(items) if item != "d12 주사위"), None)
            if lost:
                items.remove(lost)
                inventory["items"] = items
                _save_inventory(session_id, inventory)
                return f"Bad: 길을 서두르다 {lost}을(를) 잃었습니다."
        new_hp = _set_hp(session_id, hp - 3)
        return f"Bad: 돌부리에 발을 헛디뎌 체력이 {hp}에서 {new_hp}(으)로 낮아졌습니다."

    if tier == "good":
        reward = LIGHT_REWARDS[(hp + len(items)) % len(LIGHT_REWARDS)]
        progression.give_item(session_id, reward)
        new_hp = _set_hp(session_id, hp + 2)
        return f"Good: 숨을 고르며 체력이 {hp}에서 {new_hp}(으)로 회복되고, {reward}을(를) 얻었습니다."

    return "Normal: 별다른 변수 없이 다음 장면으로 이동합니다."


def choose(session_id: str, choice_id: str, roll: int | None = None) -> dict:
    if roll is not None and (roll < 1 or roll > 12):
        raise ValueError("roll must be between 1 and 12")

    state = _get_session_story_state(session_id)
    flags = state["flags"]
    scene_id = _current_scene_id(flags)
    scene = SCENES[scene_id]
    choice = next((c for c in scene.get("choices", []) if c["id"] == choice_id), None)
    if not choice:
        raise ValueError(f"unknown choice for current scene: {choice_id}")

    next_scene_id = choice["next"]
    next_scene = SCENES[next_scene_id]
    no_roll = bool(choice.get("no_roll") or next_scene.get("ending"))
    if not no_roll and roll is None:
        raise ValueError("roll is required for this choice")

    tier = _roll_tier(roll) if roll is not None else "none"
    notes = _apply_scene_marks(session_id, scene, choice, flags)
    roll_note = ""
    if not no_roll:
        state = _get_session_story_state(session_id)
        roll_note = _apply_roll_effect(session_id, tier, state)

    flags["STORY_SCENE"] = next_scene_id
    _save_flags(session_id, flags)

    progression.set_location(session_id, next_scene["location"])
    if next_scene.get("event"):
        flags = progression.get_session_flags(session_id)
        flags[next_scene["event"]] = True
        if next_scene.get("flag"):
            flags[next_scene["flag"]] = True
        if next_scene.get("ending"):
            flags["EVT_EPILOGUE"] = True
        _save_flags(session_id, flags)

    answer = (
        f"GM: [{scene['title']}] {choice['text']}\n"
    )
    if roll_note:
        answer += f"GM: D12 result {roll} - {roll_note}\n"
    if notes:
        answer += "GM: " + " ".join(notes) + "\n"
    answer += next_scene["text"]

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO game_events(session_id, role, content, metadata) VALUES (%s, %s, %s, %s)",
            (
                session_id,
                "assistant",
                answer,
                json.dumps({
                    "type": "story_choice",
                    "from": scene_id,
                    "to": next_scene_id,
                    "choice": choice_id,
                    "roll": roll,
                    "tier": tier,
                    "no_roll": no_roll,
                }, ensure_ascii=False),
            ),
        )

    return {
        "answer": answer,
        "segments": dialogue.split_segments(answer),
        "choices": _public_scene(next_scene_id)["choices"],
        "roll": None if no_roll else {"value": roll, "tier": tier, "note": roll_note},
        "scene": _public_scene(next_scene_id),
    }
