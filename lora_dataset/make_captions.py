# -*- coding: utf-8 -*-
"""
LoRA 캡션 생성기 — 증기와 비늘 스타일 LoRA (steamscale_style)

사용법:
  1. 확정한 고해상도 PNG를 lora_dataset/img/ 에 넣는다.
     파일명에 아래 LOCATIONS 의 키워드가 들어가게 한다.
     예) peak_01.png, forge_a.png, mineshaft_final.png, cult_interior.png ...
  2. python make_captions.py
  3. img/ 안에 각 이미지와 같은 이름의 .txt 캡션이 생긴다 (kohya 형식).

규칙:
  - 모든 캡션은 TRIGGER 로 시작 (스타일을 이 단어에 묶기 위함).
  - 그 뒤 장소별 내용 + 공통 스타일 앵커.
  - 키워드가 안 잡히면 GENERIC 캡션 + 경고 출력 → 직접 보정.
"""
import os, sys

TRIGGER = "steamscale_style"

STYLE_ANCHOR = ("dark atmospheric painterly game concept art, hand-painted, "
                "semi-realistic stylized, foggy 1800s steampunk eastern-fantasy, "
                "dark muted ashen palette, pale-blue spirit-stone glow, deep shadows, dim")

# 파일명 키워드 -> 장소별 내용 캡션
LOCATIONS = {
    "clinic":    "a dim village clinic interior, wooden cots and shelves of remedies",
    "inn":       "a worn village inn common room, wooden tables and a hearth",
    "mineshaft": "an abandoned collapsed underground mine gallery, broken timber frames, "
                 "rusted chains and mine-cart rails, glowing spirit-stone veins in dark stone",
    "minedeep":  "the deep inner gallery of an active mine, dark tunnels braced with timber, "
                 "lantern-lit rock walls and glowing pale-blue spirit-stone veins, ore carts and rails",
    "mine":      "a foggy mine entrance carved into a mountainside, timber-framed adit, ore carts and rails",
    "refinery":  "a grimy spirit-essence refinery interior, brass pipes vats and steam",
    "peak":      "a foggy summit arena, a flat glowing arcane magic circle on the ground, "
                 "dragon skull and ribcage bones, spiky rock spires, moonlight",
    "forge":     "a warm cramped blacksmith forge, a glowing furnace and a large bellows, "
                 "anvil hammers and steampunk parts",
    "garrison":  "an austere imperial military command post interior, crimson banners, "
                 "maps and spirit-stone fixtures, stone and iron",
    "cult":      "the vast interior of a grand gothic ash-cult cathedral, towering pointed arches "
                 "and ribbed vaults, a dragon-motif altar, ash braziers with ember and blue glow",
    "market":    "a narrow back-alley night bazaar packed with covered stalls, smuggled crates, "
                 "hanging lanterns and caged spirit-stone shards",
    "square":    "a foggy cobblestone village square, half-timber houses, a looming misty mountain",
    "cabin":     "a lonely mountainside cabin in fog, weathered wood and a stone chimney",
}

GENERIC = "a foggy steampunk fantasy location"

def caption_for(filename: str):
    base = os.path.splitext(filename)[0].lower()
    for key, desc in LOCATIONS.items():
        if key in base:
            return f"{TRIGGER}, {desc}, {STYLE_ANCHOR}", key
    return f"{TRIGGER}, {GENERIC}, {STYLE_ANCHOR}", None

def main():
    img_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
    if not os.path.isdir(img_dir):
        print(f"[!] img 폴더 없음: {img_dir}"); sys.exit(1)
    exts = (".png", ".jpg", ".jpeg", ".webp")
    imgs = [f for f in os.listdir(img_dir) if f.lower().endswith(exts)]
    if not imgs:
        print(f"[!] img/ 에 이미지가 없습니다. 확정 PNG를 넣고 다시 실행하세요."); sys.exit(0)
    miss = 0
    for f in sorted(imgs):
        cap, key = caption_for(f)
        txt = os.path.join(img_dir, os.path.splitext(f)[0] + ".txt")
        with open(txt, "w", encoding="utf-8") as fp:
            fp.write(cap)
        if key is None:
            miss += 1
            print(f"  [?] {f}  -> GENERIC (파일명에 장소 키워드 없음, 캡션 직접 보정 권장)")
        else:
            print(f"  [ok] {f}  -> {key}")
    print(f"\n완료: {len(imgs)}개 캡션 작성, 미매칭 {miss}개. 트리거='{TRIGGER}'")

if __name__ == "__main__":
    main()
