import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const viewer = document.querySelector("#modelViewer");
const modelStatus = document.querySelector("#modelStatus");
const resetBtn = document.querySelector("#resetModelBtn");
const animButtons = document.querySelectorAll("[data-anim]");

//const MODEL_PATH = "/static/models/gm_model.glb";
const MODEL_PATH = "/static/models/ShapeKey_05.glb";
const ANIMATIONS = {
  idle: "/static/animations/weight_shift.glb",
  talk: "/static/animations/acknowledging.glb",
  happy: "/static/animations/happy_hand_gesture.glb",
  angry: "/static/animations/angry_gesture.glb",
  thinking: "/static/animations/thoughtful_head_shake.glb",
  deny: "/static/animations/shaking_head_no.glb",
  sigh: "/static/animations/relieved_sigh.glb",
  cocky: "/static/animations/being_cocky.glb",
  yes: "/static/animations/head_nod_yes.glb",
  strong_yes: "/static/animations/hard_head_nod.glb",
  long_yes: "/static/animations/lengthy_head_nod.glb",
  sarcastic: "/static/animations/sarcastic_head_nod.glb",
  look_away: "/static/animations/look_away_gesture.glb",
  dismiss: "/static/animations/dismissing_gesture.glb",
  annoyed: "/static/animations/annoyed_head_shake.glb",
};

let renderer;
let scene;
let camera;
let controls;
let model;
let mixer;
let currentAction;

const clock = new THREE.Clock();
const animationClips = new Map();

function setStatus(text) {
  if (modelStatus) modelStatus.textContent = text;
}

function initScene() {
  if (!viewer) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1510);

  camera = new THREE.PerspectiveCamera(
    45,
    Math.max(viewer.clientWidth, 1) / Math.max(viewer.clientHeight, 1),
    0.1,
    5000
  );
  camera.position.set(0, 130, 260);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(Math.max(viewer.clientWidth, 1), Math.max(viewer.clientHeight, 1));
  viewer.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xfff2d0, 0x312018, 2.2));

  const key = new THREE.DirectionalLight(0xffffff, 3.0);
  key.position.set(180, 260, 140);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xd6b35f, 1.4);
  fill.position.set(-180, 120, -160);
  scene.add(fill);

  const grid = new THREE.GridHelper(240, 24, 0xd6b35f, 0x5b4730);
  grid.position.y = -0.5;
  scene.add(grid);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 80, 0);

  window.addEventListener("resize", onResize);
  resetBtn?.addEventListener("click", resetCamera);
  animButtons.forEach((btn) => {
    btn.addEventListener("click", () => playAnimation(btn.dataset.anim));
  });

  animate();
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  object.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 160 / maxDim;
  object.scale.setScalar(scale);

  const scaledHeight = size.y * scale;
  object.position.y += scaledHeight / 2;

  resetCamera();
}

function resetCamera() {
  if (!camera || !controls) return;
  camera.position.set(0, 130, 260);
  controls.target.set(0, 80, 0);
  controls.update();
}

function normalizeModel(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      const materials = Array.isArray(child.material) ? child.material : [child.material];

      materials.forEach((mat) => {
        if (!mat) return;
        mat.side = THREE.DoubleSide;
        mat.needsUpdate = true;
      });
    }
  });
}

async function loadAnimation(name, path) {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => {
        if (!gltf.animations || gltf.animations.length === 0) {
          console.warn(`[3D] animation not found: ${name}`);
          resolve(null);
          return;
        }

        const clip = gltf.animations[0].clone();
        clip.name = name;
        animationClips.set(name, clip);

        console.log(`[3D] animation loaded: ${name}`, clip);
        resolve(clip);
      },
      undefined,
      reject
    );
  });
}

async function loadAnimations() {
  const entries = Object.entries(ANIMATIONS);
  let ok = 0;

  for (const [name, path] of entries) {
    try {
      const clip = await loadAnimation(name, path);
      if (clip) ok += 1;
      setStatus(`애니메이션 로딩 중... ${ok}/${entries.length}`);
    } catch (err) {
      console.warn(`[3D] animation load failed: ${name}`, err);
    }
  }

  setStatus(`GM 모델 로드 완료 / 애니메이션 ${ok}개 준비`);
  playAnimation("idle", { loop: true, fade: 0.2 });
}

function loadGlbModel() {
  const loader = new GLTFLoader();
  setStatus("GM 모델 로딩 중...");

  loader.load(
    MODEL_PATH,
    async (gltf) => {
      model = gltf.scene;

      normalizeModel(model);
      scene.add(model);
      frameObject(model);

      mixer = new THREE.AnimationMixer(model);

      await loadAnimations();
    },
    (event) => {
      if (event.total) {
        const pct = Math.round((event.loaded / event.total) * 100);
        setStatus(`GM 모델 로딩 중... ${pct}%`);
      }
    },
    (error) => {
      console.error(error);
      setStatus("GM 모델 로드 실패: /static/models/gm_model.glb 경로를 확인하세요.");
    }
  );
}

function playAnimation(name = "talk", options = {}) {
  if (!mixer) return;

  const clip = animationClips.get(name) || animationClips.get("talk") || animationClips.get("idle");

  if (!clip) {
    setStatus(`애니메이션 없음: ${name}`);
    console.warn("available animations:", [...animationClips.keys()]);
    return;
  }

  const fade = options.fade ?? 0.25;
  const action = mixer.clipAction(clip);

  action.reset();
  action.enabled = true;
  action.setEffectiveWeight(1);

  if (options.loop || name === "idle") {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  } else {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }

  if (currentAction && currentAction !== action) {
    currentAction.fadeOut(fade);
    action.fadeIn(fade);
  }

  action.play();
  currentAction = action;

  if (name !== "idle") {
    const backToIdle = (event) => {
      if (event.action === action) {
        mixer.removeEventListener("finished", backToIdle);
        playAnimation("idle", { loop: true, fade: 0.35 });
      }
    };
    mixer.addEventListener("finished", backToIdle);
  }

  setStatus(`애니메이션 재생: ${name}`);
}

function detectEmotion(text) {
  const s = String(text || "");

  if (/분노|화가|격노|위협|공격|전투|적대|분개|불쾌/.test(s)) return "angry";
  if (/짜증|귀찮|성가|불만/.test(s)) return "annoyed";
  if (/기쁘|웃|반갑|다행|좋아|성공|환영|미소/.test(s)) return "happy";
  if (/생각|고민|침묵|추리|살핀|관찰|단서|의심/.test(s)) return "thinking";
  if (/아니|거절|불가능|실패|틀렸|안 된다|못한다/.test(s)) return "deny";
  if (/한숨|안도|지친|피곤|긴장.*풀/.test(s)) return "sigh";
  if (/비웃|능청|거만|도발|얕보/.test(s)) return "cocky";
  if (/그래|맞다|좋습니다|동의|수긍|확인/.test(s)) return "yes";
  if (/비꼼|냉소|빈정/.test(s)) return "sarcastic";
  if (/무시|꺼져|상관없/.test(s)) return "dismiss";
  if (/외면|시선|피하/.test(s)) return "look_away";

  return "talk";
}

window.playNpcAnimation = playAnimation;

window.playNpcEmotion = (textOrEmotion) => {
  const direct = animationClips.has(textOrEmotion)
    ? textOrEmotion
    : detectEmotion(textOrEmotion);

  playAnimation(direct);
};

window.__debug3d = () => {
  const modelBones = [];

  model?.traverse((obj) => {
    if (obj.isBone) modelBones.push(obj.name);
  });

  console.log("=== MODEL BONES ===");
  console.log(modelBones);

  console.log("=== ANIMATION CLIPS ===");
  for (const [name, clip] of animationClips.entries()) {
    console.log(name, clip);
  }
};

window.__getAnim = (name) => {
  const clip = animationClips.get(name);

  if (!clip) {
    console.log("없는 애니메이션:", name);
    console.log("사용 가능:", [...animationClips.keys()]);
    return null;
  }

  console.log("name:", clip.name);
  console.log("duration:", clip.duration);
  console.log("tracks:", clip.tracks.length);
  console.log("first track:", clip.tracks[0]?.name);
  console.log("first times length:", clip.tracks[0]?.times?.length);
  console.log("first values sample:", Array.from(clip.tracks[0]?.values?.slice(0, 12) || []));

  return clip;
};

function onResize() {
  if (!viewer || !camera || !renderer) return;

  camera.aspect = Math.max(viewer.clientWidth, 1) / Math.max(viewer.clientHeight, 1);
  camera.updateProjectionMatrix();

  renderer.setSize(Math.max(viewer.clientWidth, 1), Math.max(viewer.clientHeight, 1));
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  mixer?.update(delta);
  controls?.update();
  renderer?.render(scene, camera);
}
window.__debugMorph = () => {
  model.traverse((obj) => {
    if (!obj.isMesh) return;

    console.log("mesh:", obj.name);

    console.log(
      "morphTargetDictionary",
      obj.morphTargetDictionary
    );

    console.log(
      "morphTargetInfluences",
      obj.morphTargetInfluences
    );
  });
};
initScene();
loadGlbModel();