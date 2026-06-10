import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_PATH = "/static/models/GM_Base_WithShapeKeys_04.glb";
const MORPH_NAMES = ["JawOpen", "aa_viseme", "eh_viseme", "ee_viseme", "oh_viseme"];

const viewer = document.querySelector("#viewer");
const statusEl = document.querySelector("#status");
const morphButtons = document.querySelector("#morphButtons");
const animButtons = document.querySelector("#animButtons");

let scene;
let camera;
let renderer;
let controls;
let model;
let mixer;
let currentAction;
let lipTimer = null;
let currentAudio = null;
let morphMeshes = [];
let audioContext = null;
let analyser = null;
let lipRaf = null;
let audioSource = null;
let currentVisemeTimeline = [];
const clock = new THREE.Clock();
const animations = new Map();

function setStatus(text) {
  statusEl.textContent = text;
}

function getToken() {
  return localStorage.getItem("access_token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.set(0, 1.3, 3.2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  viewer.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.05, 0);
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1c12, 2.0));

  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(2, 4, 3);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffd49a, 1.0);
  fill.position.set(-3, 2, -2);
  scene.add(fill);

  const grid = new THREE.GridHelper(4, 20, 0x8d6a3c, 0x3b2a1c);
  grid.position.y = -0.02;
  scene.add(grid);

  window.addEventListener("resize", onResize);
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
  object.scale.setScalar(2.0 / maxDim);

  controls.target.set(0, 0.9, 0);
  camera.position.set(0, 1.2, 3.2);
  controls.update();
}

function collectMorphMeshes() {
  morphMeshes = [];
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const dict = obj.morphTargetDictionary;
    const influences = obj.morphTargetInfluences;
    if (dict && influences) {
      morphMeshes.push(obj);
      console.log("[Morph Mesh]", obj.name, dict);
    }
  });
}

function resetMorphs() {
  for (const mesh of morphMeshes) {
    mesh.morphTargetInfluences.fill(0);
  }
}

function setMorph(name, value) {
  let applied = false;
  for (const mesh of morphMeshes) {
    const index = mesh.morphTargetDictionary?.[name];
    if (index !== undefined) {
      mesh.morphTargetInfluences[index] = value;
      applied = true;
    }
  }
  if (!applied) console.warn("Morph not found:", name);
}

function pulseMorph(name) {
  resetMorphs();
  setMorph(name, 1.0);
  setStatus(`Morph 테스트: ${name}`);
  setTimeout(() => {
    resetMorphs();
    setStatus("Morph 초기화");
  }, 900);
}

function startLipSync() {
  stopLipSync(false);
  lipTimer = setInterval(() => {
    resetMorphs();
    const name = MORPH_NAMES[Math.floor(Math.random() * MORPH_NAMES.length)];
    const value = 0.25 + Math.random() * 0.75;
    setMorph(name, value);
  }, 90);
  setStatus("랜덤 립싱크 실행 중...");
}

function stopLipSync(updateStatus = true) {
  if (lipTimer) clearInterval(lipTimer);
  lipTimer = null;
  resetMorphs();
  if (updateStatus) setStatus("립싱크 정지");
}
function guessVisemeFromChar(ch) {
  if (/[아하카타파바사자차]/.test(ch)) return "aa_viseme";
  if (/[에애헤케테페베세제체]/.test(ch)) return "eh_viseme";
  if (/[이히키티피비시지치]/.test(ch)) return "ee_viseme";
  if (/[오우호후코쿠토투포푸보부소수조주초추]/.test(ch)) return "oh_viseme";
  if (/[ae]/i.test(ch)) return "aa_viseme";
  if (/[ei]/i.test(ch)) return "ee_viseme";
  if (/[ou]/i.test(ch)) return "oh_viseme";
  return "JawOpen";
}

function makeVisemeTimeline(text, duration) {
  const chars = String(text)
    .replace(/\s+/g, "")
    .split("")
    .filter(Boolean);

  if (!chars.length || !duration) return [];

  const step = duration / chars.length;

  return chars.map((ch, index) => ({
    time: index * step,
    viseme: guessVisemeFromChar(ch),
  }));
}

function getCurrentViseme(time) {
  if (!currentVisemeTimeline.length) return "JawOpen";

  let current = currentVisemeTimeline[0].viseme;

  for (const item of currentVisemeTimeline) {
    if (item.time <= time) current = item.viseme;
    else break;
  }

  return current;
}
function startAudioLipSync(audio, text = "") {
  stopAudioLipSync(false);
  stopLipSync(false);

  currentVisemeTimeline = makeVisemeTimeline(text, audio.duration || 1);

  audioContext = new AudioContext();
  audioSource = audioContext.createMediaElementSource(audio);
  analyser = audioContext.createAnalyser();

  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.65;

  audioSource.connect(analyser);
  analyser.connect(audioContext.destination);

  const data = new Uint8Array(analyser.frequencyBinCount);

  function update() {
    analyser.getByteFrequencyData(data);

    let sum = 0;
    for (const value of data) sum += value;

    const volume = sum / data.length / 255;
    const mouth = Math.min(1, Math.max(0, volume * 5.5));
    const viseme = getCurrentViseme(audio.currentTime);

    resetMorphs();

    if (mouth >= 0.04) {
      setMorph("JawOpen", mouth * 0.75);
      setMorph(viseme, mouth * 0.85);
    }

    lipRaf = requestAnimationFrame(update);
  }

  update();
  setStatus("텍스트 + 음량 기반 립싱크 실행 중...");
}

function stopAudioLipSync(updateStatus = true) {
  if (lipRaf) {
    cancelAnimationFrame(lipRaf);
    lipRaf = null;
  }

  resetMorphs();

  if (audioSource) {
    try {
      audioSource.disconnect();
    } catch {}
    audioSource = null;
  }

  if (analyser) {
    try {
      analyser.disconnect();
    } catch {}
    analyser = null;
  }

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  if (updateStatus) setStatus("음량 기반 립싱크 정지");
}
function registerAnimationClips(clips) {
  animations.clear();
  clips.forEach((clip, index) => {
    const label = clip.name || `animation_${index + 1}`;
    const uniqueName = `${index + 1}. ${label}`;
    animations.set(uniqueName, clip);
  });

  animButtons.innerHTML = "";
  if (animations.size === 0) {
    animButtons.innerHTML = "<p>내장 애니메이션이 없습니다.</p>";
    return;
  }

  for (const [name, clip] of animations.entries()) {
    const button = document.createElement("button");
    button.textContent = `${name} (${clip.duration.toFixed(2)}s)`;
    button.addEventListener("click", () => playAnimation(name));
    animButtons.appendChild(button);
  }
}

function playAnimation(name) {
  if (!mixer) return;
  const clip = animations.get(name) || [...animations.values()][0];
  if (!clip) return;

  const action = mixer.clipAction(clip);
  action.reset();
  action.enabled = true;
  action.setEffectiveWeight(1);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;

  if (currentAction && currentAction !== action) {
    currentAction.fadeOut(0.2);
    action.fadeIn(0.2);
  }

  action.play();
  currentAction = action;
  setStatus(`전신 애니메이션 재생: ${name}`);
}

async function playTTS() {
  const text = document.querySelector("#ttsText").value.trim();
  if (!text) return;

  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }

    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ text }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "TTS 실패");

    const audio = new Audio();
    audio.src = data.audio_url;
    currentAudio = audio;

    audio.onplay = () => {
      startWawaLipSync(audio);
    };

    audio.ontimeupdate = () => {
      if (!audio.duration) return;

      const remaining = audio.duration - audio.currentTime;

      if (remaining <= 0.12) {
        stopWawaLipSync(false);
      }
    };

    audio.onended = () => {
      stopWawaLipSync();
      currentAudio = null;
    };

    audio.onerror = () => {
      stopWawaLipSync();
      currentAudio = null;
    };

    await audio.play();

audio.ontimeupdate = () => {
  if (!audio.duration) return;

  const remaining = audio.duration - audio.currentTime;

  if (remaining <= 0.12) {
    stopAudioLipSync(false);
  }
};

audio.onended = () => {
  stopAudioLipSync();
  currentAudio = null;
};

audio.onerror = () => {
  stopAudioLipSync();
  currentAudio = null;
};

    await audio.play();
  } catch (err) {
    console.warn(err);
    stopAudioLipSync();
    stopLipSync();
    setStatus(`TTS 오류: ${err.message}\n/api/tts가 없다면 'TTS 없이 말하는 척'을 사용하세요.`);
  }
}

function fakeSpeech() {
  startLipSync();
  const firstAnim = [...animations.keys()][0];
  if (firstAnim) playAnimation(firstAnim);
  setTimeout(() => stopLipSync(), 4000);
}

function setupButtons() {
  morphButtons.innerHTML = "";
  for (const name of MORPH_NAMES) {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.addEventListener("click", () => pulseMorph(name));
    morphButtons.appendChild(btn);
  }

  document.querySelector("#debugMorphBtn").addEventListener("click", debugMorph);
  document.querySelector("#resetMorphBtn").addEventListener("click", resetMorphs);
  document.querySelector("#startLipBtn").addEventListener("click", startLipSync);
  document.querySelector("#stopLipBtn").addEventListener("click", stopLipSync);
  document.querySelector("#ttsBtn").addEventListener("click", playTTS);
  document.querySelector("#fakeSpeechBtn").addEventListener("click", fakeSpeech);
}

function debugMorph() {
  console.log("=== MORPH DEBUG ===");
  console.log("morphMeshes:", morphMeshes.length);
  for (const mesh of morphMeshes) {
    console.log("mesh:", mesh.name);
    console.log("dictionary:", mesh.morphTargetDictionary);
    console.log("influences:", mesh.morphTargetInfluences);
  }
  console.log("=== ANIMATIONS ===");
  for (const [name, clip] of animations.entries()) console.log(name, clip);
  setStatus(`Morph Mesh ${morphMeshes.length}개 / Animation ${animations.size}개 확인 완료. 콘솔을 확인하세요.`);
}

function loadModel() {
  const loader = new GLTFLoader();
  setStatus("GM_Base_WithShapeKeys_04.glb 로딩 중...");

  loader.load(
    MODEL_PATH,
    (gltf) => {
      model = gltf.scene;
      scene.add(model);
      frameObject(model);
      collectMorphMeshes();

      mixer = new THREE.AnimationMixer(model);
      registerAnimationClips(gltf.animations || []);

      setupButtons();
      setStatus(`로드 완료\nMorph Mesh: ${morphMeshes.length}\nAnimations: ${(gltf.animations || []).length}\nShape Keys: ${MORPH_NAMES.join(", ")}`);
      window.__gmTest = { model, mixer, morphMeshes, animations, setMorph, resetMorphs, startLipSync, stopLipSync, playAnimation };
    },
    (event) => {
      if (event.total) setStatus(`모델 로딩 중... ${Math.round((event.loaded / event.total) * 100)}%`);
    },
    (err) => {
      console.error(err);
      setStatus("모델 로드 실패. /static/models/GM_Base_WithShapeKeys_04.glb 경로를 확인하세요.");
    }
  );
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixer?.update(delta);
  controls?.update();
  renderer.render(scene, camera);
}

initScene();
loadModel();
