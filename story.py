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
            {"id": "mine_question_gail", "text": "가일을 압박해 은폐된 명부를 확인한다", "next": "night_watch", "hidden_flags": ["FLG_CLUE_01"]},
            {"id": "mine_talk_miner", "text": "갱도 앞 광부에게 실제 실종 규모를 묻는다", "next": "miner_rumor", "hidden_flags": ["FLG_CLUE_01", "STORY_MINER_RUMOR"]},
            {"id": "mine_watch_shift", "text": "교대 시간이 끝날 때까지 숨어서 관찰한다", "next": "night_watch", "hidden_flags": ["FLG_CLUE_01", "FLG_CLUE_02"]},
            {"id": "mine_compare_ledger_night", "text": "명부의 숫자와 밤의 운송 시간을 대조한다", "next": "transport_schedule", "requires_flags": ["FLG_CLUE_01"], "hidden_flags": ["FLG_CLUE_02"]},
            {"id": "mine_to_marta", "text": "봉우리 그림자를 아는 마르타를 찾아간다", "next": "marta_legend", "requires_flags": ["FLG_CLUE_02"], "hidden_flags": ["FLG_CLUE_03", "FLG_LIN_PLOT_SEEN"]},
            {"id": "mine_to_marta_with_ledger", "text": "장부의 봉우리 표식을 들고 마르타를 찾아간다", "next": "marta_ledger_confirm", "requires_flags": ["FLG_LIN_PLOT_SEEN"], "hidden_flags": ["FLG_CLUE_03"]},
            {"id": "mine_to_deep_ready", "text": "모은 단서를 따라 갱도 심부로 들어간다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01", "FLG_CLUE_03"]},
        ],
    },
    "miner_rumor": {
        "title": "광부의 증언",
        "location": "광산",
        "flag": "FLG_CLUE_01",
        "story_flag": "STORY_MINER_RUMOR",
        "item": "은폐된 명부",
        "text": (
            "GM: 먼지를 뒤집어쓴 광부가 낮은 목소리로 주변을 살핍니다.\n"
            "광부: \"셋이 아닙니다. 사라진 사람은 훨씬 많아요. 밤이면 갱도 안쪽에서 기계도 아닌 것이 숨을 쉽니다.\""
        ),
        "choices": [
            {"id": "miner_to_night", "text": "밤까지 기다려 광산과 마을의 움직임을 본다", "next": "night_watch"},
            {"id": "miner_to_tavern", "text": "여관으로 돌아가 린에게 광부의 말을 확인한다", "next": "tavern_miner_followup"},
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
            {"id": "rin_press_plot", "text": "린이 숨기는 의도를 떠본다", "next": "rin_contradiction"},
            {"id": "rin_to_mine", "text": "정보값 대신 광산에서 직접 확인하겠다고 나선다", "next": "mine_gate"},
        ],
    },
    "tavern_miner_followup": {
        "title": "여관 - 광부의 말 확인",
        "location": "여관",
        "event": "EVT_LIN_TALK",
        "text": (
            "GM: 다시 여관 문을 열자, 이번에는 점원이 당신을 막지 않습니다. 이미 당신의 얼굴과 목적을 "
            "알아본 듯 술잔만 조용히 닦습니다.\n"
            "GM: 린은 계산대 안쪽에서 기다렸다는 듯 고개를 듭니다. 당신이 광부의 증언을 꺼내자, 그녀의 "
            "손끝이 잔 가장자리에서 아주 잠깐 멈춥니다.\n"
            "린: \"셋이 아니라 훨씬 많다, 그리고 밤이면 기계가 숨을 쉰다... 광부들이 그런 말을 했나요?\"\n"
            "린: \"그렇다면 당신은 이제 제국의 거짓말만 본 게 아니에요. 산이 숨기는 쪽도 보게 된 거죠.\""
        ),
        "choices": [
            {"id": "followup_trace_ledger", "text": "광부 증언과 린의 말을 장부로 확인한다", "next": "lin_ledger_shadow", "good_flag": "FLG_LIN_PLOT_SEEN"},
            {"id": "followup_follow_hint", "text": "린의 말대로 밤의 마을을 관찰한다", "next": "night_watch"},
            {"id": "followup_return_mine", "text": "광부의 말을 더 확인하러 광산으로 돌아간다", "next": "mine_records_recheck"},
        ],
    },
    "rin_contradiction": {
        "title": "여관 - 어긋나는 말들",
        "location": "여관",
        "text": (
            "GM: 당신이 린의 말을 되짚자, 여관의 소음이 한순간 멀어집니다. 린은 방금 전까지 제국의 "
            "은폐를 탓했지만, 다른 손님에게는 산이 광부를 데려갔다고 말했습니다.\n"
            "린: \"소문은 듣는 사람에 따라 모양이 달라져요. 당신은 어느 모양을 믿고 싶죠?\"\n"
            "GM: 웃음은 그대로지만, 눈은 아주 잠깐 웃지 않습니다."
        ),
        "choices": [
            {"id": "rin_check_ledger", "text": "장부의 흔적을 따라 뒷골목을 조사한다", "next": "lin_ledger_shadow", "good_flag": "FLG_LIN_PLOT_SEEN"},
            {"id": "rin_offer_trust", "text": "린을 적으로 몰지 않고 진짜 목적을 묻는다", "next": "lin_trust_trial", "requires_flags": ["STORY_TOBI_LULLABY"], "hidden_flags": ["FLG_LIN_ALLY"]},
            {"id": "rin_back_off", "text": "더 추궁하지 않고 밤의 마을을 관찰한다", "next": "night_watch"},
            {"id": "rin_to_mine_after_probe", "text": "광산으로 돌아가 실종자 수를 더 확인한다", "next": "mine_records_recheck"},
        ],
    },
    "lin_ledger_shadow": {
        "title": "뒷골목 - 장부의 그림자",
        "location": "정제소",
        "text": (
            "GM: 정제소 뒤편 암시장의 눅눅한 장부에는 같은 글씨체가 반복됩니다. 은폐된 명부의 누락분과 "
            "영정 거래 수량이 맞물리고, 흐름은 제국과 봉우리 양쪽으로 갈라져 있습니다.\n"
            "GM: 린은 어느 한 편이 아니었습니다. 인간과 용이 부딪칠수록, 그 사이에서 영정을 쥔 자가 "
            "가장 커진다는 패를 숨기고 있었습니다."
        ),
        "choices": [
            {"id": "ledger_to_night", "text": "장부의 흐름을 품고 밤의 마을을 관찰한다", "next": "ledger_night_watch"},
            {"id": "ledger_to_mine", "text": "장부의 숫자를 광산 실종자와 맞춰 본다", "next": "mine_records_recheck"},
        ],
    },
    "mine_records_recheck": {
        "title": "광산 - 다시 맞춰 보는 숫자",
        "location": "광산",
        "event": "EVT_MINE_INVESTIGATE",
        "flag": "FLG_CLUE_01",
        "text": (
            "GM: 광산 입구로 돌아오자, 처음에는 보이지 않던 것들이 눈에 들어옵니다. 새 명패 뒤쪽에는 "
            "뜯겨 나간 명패 자국이 층처럼 남아 있고, 교대 명단의 빈칸은 가일이 말한 실종자 수보다 훨씬 많습니다.\n"
            "GM: 당신이 여관에서 들은 말과 장부의 숫자를 나란히 꺼내자, 감독 가일의 손이 서류철 모서리를 "
            "너무 세게 움켜쥡니다.\n"
            "가일: \"그 장부를 어디서 봤소? 광산 일은 광산 안에서 끝나야 합니다. 외부인이 숫자를 헤집으면 "
            "살아 있는 사람들까지 위험해져.\"\n"
            "GM: 하지만 그의 협박은 이미 늦었습니다. 공식 보고서의 줄 수와 교대 명단의 빈칸이 서로 "
            "어긋나고, 그 어긋남은 가일의 서류철 안쪽으로 이어집니다. 이제 필요한 것은 숫자를 더 "
            "모으는 일이 아니라, 누가 그 숫자를 움직였는지 묻는 일입니다."
        ),
        "choices": [
            {"id": "recheck_press_gail", "text": "가일에게 누가 운송표를 조작했는지 추궁한다", "next": "gail_transport_confront", "hidden_flags": ["FLG_CLUE_02"]},
            {"id": "recheck_talk_miner", "text": "갱도 앞 광부에게 빈 짐칸을 확인한다", "next": "miner_rumor", "hidden_flags": ["STORY_MINER_RUMOR"]},
            {"id": "recheck_to_marta", "text": "봉우리 표식을 들고 마르타를 찾아간다", "next": "marta_ledger_confirm", "requires_flags": ["FLG_LIN_PLOT_SEEN"], "hidden_flags": ["FLG_CLUE_03"]},
            {"id": "recheck_to_deep", "text": "숫자가 가리키는 갱도 심부로 들어간다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_03"]},
            {"id": "recheck_watch_night", "text": "밤 운송이 시작될 때까지 광산을 지켜본다", "next": "night_watch", "hidden_flags": ["FLG_CLUE_02"]},
        ],
    },
    "gail_transport_confront": {
        "title": "광산 - 운송표 추궁",
        "location": "광산",
        "event": "EVT_NIGHT_WATCH",
        "flag": "FLG_CLUE_02",
        "text": (
            "GM: 당신이 운송표의 빈 짐칸 수와 실종자 명단을 가일 앞에 나란히 펼치자, 광산 입구의 "
            "기계음이 이상할 만큼 멀어집니다. 가일은 처음에는 웃으려 하지만, 운송표 오른쪽 아래의 "
            "감독 인장을 본 순간 입술을 다뭅니다.\n"
            "가일: \"그건 보급품 이동 기록이오. 숫자가 맞아 보인다고 해서 사람을 실었다는 뜻은 아니지.\"\n"
            "GM: 당신은 빈 짐칸이어야 할 칸들이 모두 자정 직후 출발했고, 같은 칸 번호가 은폐된 명부의 "
            "누락자 묶음과 맞물린다고 짚습니다. 가일의 시선이 서류철이 아니라 갱도 안쪽 어둠으로 향합니다.\n"
            "가일: \"나는 명령서에 도장만 찍었소. 누가 표식을 바꿨는지는 모른다. 다만... 봉우리 표식이 "
            "붙은 짐칸은 제국 창고로 가지 않았소. 그 밤마다 산 쪽 길이 먼저 열렸지.\"\n"
            "GM: 기록상 빈 짐칸이어야 할 칸들은 모두 봉우리 쪽 표식을 달고 있었습니다. 자정이 지나자 "
            "멈춰 있던 술식기계들이 한 박자 늦게 고개를 돌리고, 봉우리 위에는 용의 등뼈 같은 그림자가 "
            "안개 속에 잠깐 떠오릅니다."
        ),
        "choices": [
            {"id": "gail_confront_to_marta", "text": "봉우리 표식의 뜻을 마르타에게 확인한다", "next": "marta_ledger_confirm", "requires_flags": ["FLG_LIN_PLOT_SEEN"], "hidden_flags": ["FLG_CLUE_03"]},
            {"id": "gail_confront_to_miner", "text": "갱도 앞 광부에게 산 쪽 운송로를 묻는다", "next": "miner_rumor", "hidden_flags": ["STORY_MINER_RUMOR"]},
            {"id": "gail_confront_to_tobi", "text": "광산 근처에서 토비의 자장가를 듣는다", "next": "tobi_lullaby", "hidden_flags": ["STORY_TOBI_LULLABY"]},
            {"id": "gail_confront_to_deep", "text": "봉우리 표식이 가리키는 갱도 심부로 들어간다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_03"]},
        ],
    },
    "ledger_night_watch": {
        "title": "밤의 장부 대조",
        "location": "마을 광장",
        "event": "EVT_NIGHT_WATCH",
        "flag": "FLG_CLUE_02",
        "text": (
            "GM: 장부의 거래 흐름을 머릿속에 펼친 채 밤의 마을을 바라보자, 평범해 보이던 움직임들이 "
            "서로 맞물리기 시작합니다. 정제소의 등불이 세 번 깜빡인 뒤 광산 쪽 운송 수레가 늦게 출발하고, "
            "그 뒤를 따라 여관 뒤편의 그림자 하나가 봉우리 길로 사라집니다.\n"
            "GM: 장부에는 그 시간이 빈칸으로 남아 있었지만, 빈칸 옆의 봉우리 표식과 영정 수량은 정확히 "
            "그 움직임을 가리키고 있습니다. 린이 흘린 소문은 길잡이이자 덫이었습니다.\n"
            "GM: 자정이 지나자 멈춰 있던 술식기계들이 한 박자 늦게 고개를 돌립니다. 봉우리 위에는 "
            "용의 등뼈 같은 그림자가 안개 속에 잠깐 떠오릅니다."
        ),
        "choices": [
            {"id": "ledger_night_to_marta", "text": "장부의 봉우리 표식을 마르타에게 확인한다", "next": "marta_ledger_confirm", "hidden_flags": ["FLG_CLUE_03"]},
            {"id": "ledger_night_to_miner", "text": "갱도 쪽 광부들에게 운송 수레를 묻는다", "next": "miner_rumor", "hidden_flags": ["STORY_MINER_RUMOR"]},
            {"id": "ledger_night_to_tobi_song", "text": "광산 근처에서 토비의 자장가를 듣는다", "next": "tobi_lullaby", "hidden_flags": ["STORY_TOBI_LULLABY"]},
            {"id": "ledger_night_to_deep_ready", "text": "모은 단서를 따라 갱도 심부로 향한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_03"]},
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
            {"id": "night_to_marta", "text": "봉우리 그림자를 아는 마르타를 찾아간다", "next": "marta_legend", "hidden_flags": ["FLG_CLUE_03", "FLG_LIN_PLOT_SEEN"]},
            {"id": "night_to_marta_with_ledger", "text": "장부의 봉우리 표식을 마르타에게 확인한다", "next": "marta_ledger_confirm", "requires_flags": ["FLG_LIN_PLOT_SEEN"], "hidden_flags": ["FLG_CLUE_03"]},
            {"id": "night_to_miner", "text": "갱도 쪽 광부들에게 밤마다 벌어지는 일을 묻는다", "next": "miner_rumor", "hidden_flags": ["FLG_CLUE_01", "STORY_MINER_RUMOR"]},
            {"id": "night_to_tobi_song", "text": "광산 근처에서 토비의 자장가를 듣는다", "next": "tobi_lullaby", "hidden_flags": ["STORY_TOBI_LULLABY"]},
            {"id": "night_to_deep_ready", "text": "모은 단서를 따라 갱도 심부로 향한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01", "FLG_CLUE_03"]},
        ],
    },
    "transport_schedule": {
        "title": "명부와 운송 시간",
        "location": "광산",
        "event": "EVT_NIGHT_WATCH",
        "flag": "FLG_CLUE_02",
        "text": (
            "GM: 은폐된 명부의 숫자를 야간 운송 표와 맞춰 보자, 사라진 광부 수와 자정 직후 빠져나간 "
            "무표식 짐칸의 수가 맞물립니다. 기록상 빈 짐칸이어야 할 칸들은 모두 봉우리 쪽 표식을 달고 있었습니다.\n"
            "GM: 자정이 지나자 멈춰 있던 술식기계들이 한 박자 늦게 고개를 돌립니다. 봉우리 위에는 "
            "용의 등뼈 같은 그림자가 안개 속에 잠깐 떠오릅니다."
        ),
        "choices": [
            {"id": "transport_to_marta", "text": "봉우리 표식을 아는 마르타를 찾아간다", "next": "marta_legend", "hidden_flags": ["FLG_CLUE_03", "FLG_LIN_PLOT_SEEN"]},
            {"id": "transport_to_marta_with_ledger", "text": "장부의 봉우리 표식을 마르타에게 확인한다", "next": "marta_ledger_confirm", "requires_flags": ["FLG_LIN_PLOT_SEEN"], "hidden_flags": ["FLG_CLUE_03"]},
            {"id": "transport_to_miner", "text": "갱도 쪽 광부들에게 무표식 짐칸을 묻는다", "next": "miner_rumor", "hidden_flags": ["STORY_MINER_RUMOR"]},
            {"id": "transport_to_tobi_song", "text": "광산 근처에서 토비의 자장가를 듣는다", "next": "tobi_lullaby", "hidden_flags": ["STORY_TOBI_LULLABY"]},
            {"id": "transport_to_deep_ready", "text": "모은 단서를 따라 갱도 심부로 향한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_03"]},
        ],
    },
    "tobi_lullaby": {
        "title": "광산 근처 - 토비의 자장가",
        "location": "광산",
        "story_flag": "STORY_TOBI_LULLABY",
        "text": (
            "GM: 광산 울타리 근처에서 토비가 작은 목소리로 같은 구절을 되풀이합니다. 노래는 아이의 "
            "자장가처럼 들리지만, 이상하게도 봉우리 쪽 안개가 그 박자에 맞춰 얇게 흔들립니다.\n"
            "토비: \"형이 무서울 때 불러 주던 노래예요. 그런데 요즘은 제가 부르면 갱도 안쪽에서 대답이 오는 것 같아요.\""
        ),
        "choices": [
            {"id": "tobi_to_marta", "text": "노래의 뜻을 아는 마르타를 찾아간다", "next": "marta_legend", "hidden_flags": ["FLG_CLUE_03"]},
            {"id": "tobi_follow_memory", "text": "자장가가 건드린 기억을 끝까지 따라간다", "next": "memory_echo", "hidden_flags": ["FLG_MEMORY_RECOVERED"]},
            {"id": "tobi_to_deep_ready", "text": "토비와 함께 갱도 표식을 따라간다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01", "FLG_CLUE_03"]},
            {"id": "tobi_to_night", "text": "밤의 움직임을 조금 더 관찰한다", "next": "night_watch"},
        ],
    },
    "memory_echo": {
        "title": "잊힌 자장가",
        "location": "광산",
        "flag": "FLG_MEMORY_RECOVERED",
        "text": (
            "GM: 토비의 자장가를 따라 숨을 고르자, 당신의 머릿속 안개가 얇게 갈라집니다. 같은 노래가 "
            "오래전 봉우리 아래 피난길에서도 불렸고, 당신은 그때 누군가의 손을 놓치지 않으려 했습니다.\n"
            "GM: 기억 속 어린 린은 지금보다 훨씬 덜 능숙한 얼굴로, 사람과 용 사이에 놓인 약속의 이름을 "
            "숨기고 있었습니다. 그녀가 거짓말만 해 온 것이 아니라, 끝까지 말하지 못한 진실도 있었습니다.\n"
            "토비: \"그 노래, 형이 만든 게 아니었어요? 이상해요. 당신도 알고 있는 얼굴이에요.\""
        ),
        "choices": [
            {"id": "memory_to_lin", "text": "되살아난 기억을 들고 린을 찾아간다", "next": "lin_trust_trial", "requires_flags": ["EVT_LIN_TALK"], "hidden_flags": ["FLG_LIN_ALLY"]},
            {"id": "memory_to_marta", "text": "마르타에게 자장가와 봉우리 약속을 확인한다", "next": "marta_memory_confirm", "hidden_flags": ["FLG_CLUE_03"]},
            {"id": "memory_to_deep", "text": "기억 속 표식을 따라 갱도 심부로 향한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01", "FLG_CLUE_03"]},
        ],
    },
    "marta_memory_confirm": {
        "title": "마르타 - 잊힌 약속",
        "location": "산기슭 오두막",
        "event": "EVT_MARTA_LEGEND",
        "flag": "FLG_CLUE_03",
        "text": (
            "GM: 마르타는 자장가의 첫 구절을 듣자마자 등잔 심지를 낮춥니다. 방 안의 그림자가 봉우리 "
            "방향으로 길게 늘어집니다.\n"
            "마르타: \"그건 아이를 재우는 노래가 아니야. 산과 마을이 서로를 잊지 않도록 묶어 둔 약속이지.\"\n"
            "GM: 당신이 떠올린 얼굴과 린의 이름을 꺼내자, 마르타는 오래 침묵합니다.\n"
            "마르타: \"린이 모든 걸 망가뜨리려는 건 아닐 게다. 다만 오래 산 자들은, 상처를 숨기는 법도 "
            "너무 오래 배워 버리지.\""
        ),
        "choices": [
            {"id": "marta_memory_to_lin", "text": "린의 숨은 진실을 믿고 여관으로 돌아간다", "next": "lin_trust_trial", "hidden_flags": ["FLG_LIN_ALLY"]},
            {"id": "marta_memory_to_deep", "text": "약속의 표식을 따라 갱도 심부로 향한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01"]},
        ],
    },
    "lin_trust_trial": {
        "title": "여관 - 린의 시험",
        "location": "여관",
        "event": "EVT_LIN_TALK",
        "set_flags": ["FLG_LIN_ALLY"],
        "text": (
            "GM: 여관 안쪽 방에서 린은 문을 잠그지 않습니다. 당신이 장부의 죄를 들이밀지 않고, 자장가와 "
            "잊힌 약속을 먼저 꺼내자 그녀의 미소가 아주 천천히 사라집니다.\n"
            "린: \"그 노래를 기억해 냈군요. 그럼 나를 벌하러 온 건가요, 아니면 아직 늦지 않았다고 말하러 온 건가요?\"\n"
            "GM: 당신은 린이 인간과 용을 이용했다는 사실을 외면하지 않습니다. 하지만 그녀가 마지막 진실을 "
            "숨긴 이유까지 묻습니다. 린은 처음으로 계산하지 않은 목소리로 대답합니다.\n"
            "린: \"나는 전쟁을 막고 싶었어요. 그런데 막는 법을 너무 오래 장사꾼처럼 배웠죠. 당신이 "
            "봉우리까지 간다면, 이번엔 숨기지 않고 같이 가겠어요.\""
        ),
        "choices": [
            {"id": "lin_trust_to_deep", "text": "린과 함께 갱도 심부의 진실을 확인한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01", "FLG_CLUE_03"]},
            {"id": "lin_trust_to_mine", "text": "부족한 실종 기록을 광산에서 마저 확인한다", "next": "mine_gate", "requires_missing_flags": ["FLG_CLUE_01"]},
            {"id": "lin_trust_to_marta", "text": "마르타에게 오래된 약속의 마지막 구절을 묻는다", "next": "marta_memory_confirm", "requires_missing_flags": ["FLG_CLUE_03"]},
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
            {"id": "marta_to_deep", "text": "마르타의 전설을 단서 삼아 갱도 심부로 향한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01"]},
            {"id": "marta_find_tobi", "text": "토비를 찾아 함께 갱도 표식을 확인한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01"], "hidden_flags": ["STORY_TOBI_LULLABY"]},
            {"id": "marta_to_mine_records", "text": "전설과 맞물릴 실종 기록을 광산에서 확인한다", "next": "mine_gate", "requires_missing_flags": ["FLG_CLUE_01"]},
        ],
    },
    "marta_ledger_confirm": {
        "title": "마르타 - 봉우리 표식의 뜻",
        "location": "산기슭 오두막",
        "event": "EVT_MARTA_LEGEND",
        "flag": "FLG_CLUE_03",
        "text": (
            "GM: 산기슭 오두막에서 마르타는 낡은 등잔을 켭니다. 당신이 장부의 봉우리 표식을 내밀자, "
            "그녀의 손가락이 종이 위에서 오래 멈춥니다.\n"
            "마르타: \"이건 길 표시가 아니야. 오래전엔 둥지에 바치는 물건과 사람을 구분하던 표식이었지. "
            "그런데 누군가 그 낡은 표식을 장사 장부에 다시 붙였구나.\"\n"
            "GM: 마르타는 장부의 시간과 명부의 숫자를 하나씩 짚어 갑니다. 공식 실종자, 무표식 짐칸, "
            "영정 거래량이 같은 밤마다 함께 움직였습니다.\n"
            "마르타: \"제국은 감추려고 했고, 린은 그 감춤을 이용했어. 산의 분노와 인간의 겁이 부딪치면, "
            "그 틈에서 가장 비싼 물건이 태어나니까.\"\n"
            "GM: 불빛은 봉우리 쪽으로만 길게 눕습니다. 이제 봉우리의 그림자는 전설이 아니라, 누군가가 "
            "계산해 둔 다음 충돌 지점처럼 보입니다."
        ),
        "choices": [
            {"id": "marta_ledger_to_deep", "text": "표식이 가리키는 갱도 심부로 향한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01"]},
            {"id": "marta_ledger_find_tobi", "text": "토비를 찾아 함께 갱도 표식을 확인한다", "next": "deep_mine", "requires_flags": ["FLG_CLUE_01"], "hidden_flags": ["STORY_TOBI_LULLABY"]},
            {"id": "marta_ledger_to_mine", "text": "장부와 맞물릴 실종 기록을 광산에서 더 확인한다", "next": "mine_gate", "requires_missing_flags": ["FLG_CLUE_01"]},
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
            {"id": "peak_promise", "text": "채굴 중단을 약속하고 영석 반환을 받아들인다", "next": "normal_epilogue", "true_next": "true_epilogue", "hidden_next": "hidden_epilogue", "flag": "FLG_KARGAS_ALLY"},
            {"id": "peak_negotiate", "text": "마을 생존을 조건으로 카르가스와 휴전을 협상한다", "next": "normal_epilogue", "true_next": "true_epilogue", "hidden_next": "hidden_epilogue", "flag": "FLG_KARGAS_ALLY"},
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
    "true_epilogue": {
        "title": "트루 엔딩 - 누구도 죽지 않은 새벽",
        "location": "마을 광장",
        "event": "EVT_EPILOGUE",
        "ending": True,
        "text": (
            "GM: 린이 카르가스와 인간의 공포를 서로에게 겨누게 하려는 순간, 당신은 장부와 어긋난 말들을 "
            "봉우리의 바람 앞에 펼칩니다. 거짓이 무너지는 소리는 조용하지만, 카르가스의 분노는 처음으로 "
            "의심과 침묵으로 바뀝니다.\n"
            "카르가스: \"작은 인간아. 네가 가져온 것은 약속이 아니라 증거로구나.\"\n"
            "GM: 채굴 중단은 약탈의 끝이 되고, 재끝 마을과 드래그니카 사이에는 영정을 나누되 산을 깨우지 "
            "않는 교류 협정이 세워집니다. 가일은 명부를 내려놓고, 마르타는 오래된 의례의 마지막 구절을 "
            "끝까지 읊으며, 토비는 형의 자장가를 슬프지 않게 마저 부릅니다. 린은 패가 깨진 자리에서 "
            "잠깐 진짜 표정을 보인 뒤 안개 속으로 사라집니다. 전쟁의 불씨는 피어오르기도 전에 꺼지고, "
            "재끝 마을에는 누구도 죽지 않은 단 하나의 새벽이 밝습니다."
        ),
        "choices": [],
    },
    "hidden_epilogue": {
        "title": "히든 엔딩 - 잊힌 이름의 새벽",
        "location": "봉우리",
        "event": "EVT_EPILOGUE",
        "ending": True,
        "text": (
            "GM: 봉우리의 바람 앞에서 린은 더 이상 웃지 않습니다. 당신이 되찾은 자장가와 오래된 약속을 "
            "카르가스에게 들려주자, 잿빛 비늘 아래의 분노가 처음으로 이름을 얻습니다.\n"
            "린: \"내가 숨긴 건 죄만이 아니었어요. 당신이 잊은 이름, 그리고 우리가 지키지 못한 약속도 "
            "함께 숨겼죠.\"\n"
            "카르가스: \"작은 인간아. 너는 돌아온 것이로구나. 잊힌 문장의 마지막 음절처럼.\"\n"
            "GM: 영정의 근원과 당신의 기억은 같은 상처에서 갈라져 있었습니다. 린은 패를 내려놓고, "
            "마르타는 오래된 의례를 끝까지 잇고, 토비의 자장가는 더 이상 죽은 이를 부르는 노래가 아니게 됩니다.\n"
            "GM: 재끝 마을의 안개는 완전히 사라지지 않습니다. 하지만 이제 그 안개는 길을 잃게 만드는 것이 "
            "아니라, 돌아올 이름을 잠시 품어 주는 새벽의 숨결처럼 남습니다."
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


def _choice_has_all_flags(choice: dict, flags: dict, key: str) -> bool:
    required = choice.get(key) or []
    return all(flags.get(flag) for flag in required)


def _choice_has_any_flag(choice: dict, flags: dict, key: str) -> bool:
    blocked = choice.get(key) or []
    return any(flags.get(flag) for flag in blocked)


def _choice_available(choice: dict, flags: dict) -> bool:
    if not _choice_has_all_flags(choice, flags, "requires_flags"):
        return False
    if _choice_has_any_flag(choice, flags, "requires_missing_flags"):
        return False
    if _choice_has_any_flag(choice, flags, "hidden_flags"):
        return False
    return True


def _public_scene(scene_id: str, flags: dict | None = None) -> dict:
    scene = deepcopy(SCENES[scene_id])
    flags = flags or {}
    public_choices = []
    for choice in scene.get("choices", []):
        if not _choice_available(choice, flags):
            continue
        next_scene_id = _resolve_next_scene_id(choice, flags)
        next_scene = SCENES.get(next_scene_id, {})
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
    scene = _public_scene(scene_id, state["flags"])
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
    if scene.get("story_flag"):
        flags[scene["story_flag"]] = True
    for value in scene.get("set_flags") or []:
        flags[value] = True
    for value in choice.get("set_flags") or []:
        flags[value] = True
    if choice.get("flag"):
        flags[choice["flag"]] = True
    if choice.get("good_flag"):
        flags[choice["good_flag"]] = True
        notes.append("숨겨진 의도를 조금 더 선명하게 짚어냈습니다.")
    if scene.get("item"):
        inventory = _get_session_story_state(session_id)["inventory"]
        items = inventory.get("items")
        already_has_item = isinstance(items, list) and scene["item"] in items
        progression.give_item(session_id, scene["item"])
        if not already_has_item:
            notes.append(f"{scene['item']}{_object_particle(scene['item'])} 확보했습니다.")
    return notes


def _object_particle(text: str) -> str:
    value = (text or "").strip()
    if not value:
        return "을"
    last = value[-1]
    code = ord(last)
    if 0xAC00 <= code <= 0xD7A3:
        return "을" if (code - 0xAC00) % 28 else "를"
    return "을"


def _resolve_next_scene_id(choice: dict, flags: dict) -> str:
    if (
        choice.get("hidden_next")
        and flags.get("FLG_LIN_ALLY")
        and flags.get("FLG_MEMORY_RECOVERED")
    ):
        return choice["hidden_next"]
    if choice.get("true_next") and flags.get("FLG_LIN_PLOT_SEEN"):
        return choice["true_next"]
    return choice["next"]


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
    choice = next((c for c in scene.get("choices", []) if c["id"] == choice_id and _choice_available(c, flags)), None)
    if not choice:
        raise ValueError(f"unknown choice for current scene: {choice_id}")

    next_scene_id = _resolve_next_scene_id(choice, flags)
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
        "choices": _public_scene(next_scene_id, flags)["choices"],
        "roll": None if no_roll else {"value": roll, "tier": tier, "note": roll_note},
        "scene": _public_scene(next_scene_id, flags),
    }
