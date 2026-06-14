import bpy, sys, os

# args after "--"
argv = sys.argv[sys.argv.index("--") + 1:]
src = argv[0]
dst = argv[1]
want = argv[2] if len(argv) > 2 else "Looking Through Files Low"

# 빈 씬으로 시작
bpy.ops.wm.read_factory_settings(use_empty=True)

# glb 가져오기
bpy.ops.import_scene.gltf(filepath=src)

actions = list(bpy.data.actions)
names = [a.name for a in actions]
print("[extract] 액션 목록:", names)

# 원하는 클립 고르기 (없으면 run/walk/death 아닌 첫 클립)
def pick():
    for a in actions:
        if a.name == want:
            return a
    bad = ("run", "walk", "death", "fast")
    for a in actions:
        if not any(b in a.name.lower() for b in bad):
            return a
    return actions[0] if actions else None

keep = pick()
if keep is None:
    print("[extract] 액션 없음! 중단")
    sys.exit(1)
print("[extract] 선택된 클립:", keep.name)

# 선택한 것만 남기고 나머지 액션 삭제
for a in actions:
    if a is not keep:
        bpy.data.actions.remove(a)

# 루트 이동(Hips location) 트랙 제거 -> 캐릭터가 제자리에 고정 (화면 밖으로 안 나감)
# Blender 4.3-/5.x 양쪽 지원: 구버전은 action.fcurves, 신버전은 layers/strips/channelbags
def fcurve_containers(action):
    if hasattr(action, 'fcurves') and len(action.fcurves):
        yield action.fcurves
    if hasattr(action, 'layers'):
        for layer in action.layers:
            for strip in layer.strips:
                cbags = getattr(strip, 'channelbags', None)
                if cbags:
                    for cb in cbags:
                        yield cb.fcurves

removed = 0
for cont in fcurve_containers(keep):
    for fc in list(cont):
        if 'Hips' in fc.data_path and fc.data_path.endswith('.location'):
            cont.remove(fc)
            removed += 1
print("[extract] Hips location fcurve 제거:", removed)

# 아마추어에 선택 액션을 활성으로 지정
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        if not obj.animation_data:
            obj.animation_data_create()
        obj.animation_data.action = keep

# 메시는 필요 없음(애니는 뼈대만). 메시 오브젝트 삭제 -> 용량 대폭 감소
for obj in list(bpy.data.objects):
    if obj.type != 'ARMATURE':
        bpy.data.objects.remove(obj, do_unlink=True)

os.makedirs(os.path.dirname(dst), exist_ok=True)

# glb로 내보내기 (애니 포함)
bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='ACTIONS',
    use_selection=False,
)
print("[extract] 완료 ->", dst)
