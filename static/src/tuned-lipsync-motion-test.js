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
let morphMeshes = [];
let currentAudio = null;
let currentMotionClipName = null;

let lipTimer = null;
let lipRaf = null;
let audioContext = null;
let analyser = null;
let audioSource = null;
let smoothedMouth = 0;
let currentVisemeTimeline = [];

const clock = new THREE.Clock();
const animations = new Map();
const externalMotions = new Map();

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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text || "서버 응답을 해석할 수 없습니다." };
  }
  if (!response.ok) throw new Error(data?.detail || "요청 실패");
  return data;
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
  const safeValue = Math.min(1, Math.max(0, value));
  let applied = false;
  for (const mesh of morphMeshes) {
    const index = mesh.morphTargetDictionary?.[name];
    if (index !== undefined) {
      mesh.morphTargetInfluences[index] = safeValue;
      applied = true;
    }
  }
  if (!applied) console.warn("Morph not found:", name);
}

function pulseMorph(name) {
  stopAll(false);
  resetMorphs();
  setMorph(name, 1.0);
  setStatus(`Morph 테스트: ${name}`);
  setTimeout(() => {
    resetMorphs();
    setStatus("Morph 초기화");
  }, 900);
}

function guessVisemeFromChar(ch) {
  if (/[아야하카타파바사자차라나마]/.test(ch)) return "aa_viseme";
  if (/[에애예얘헤케테페베세제체레네메]/.test(ch)) return "eh_viseme";
  if (/[이히키티피비시지치리니미]/.test(ch)) return "ee_viseme";
  if (/[오요우유호효후휴코쿄쿠큐토투포푸보부소수조주초추로루노누모무]/.test(ch)) return "oh_viseme";
  if (/[ae]/i.test(ch)) return "aa_viseme";
  if (/[ei]/i.test(ch)) return "ee_viseme";
  if (/[ou]/i.test(ch)) return "oh_viseme";
  return "JawOpen";
}

function makeVisemeTimeline(text, duration) {
  const chars = String(text).replace(/\s+/g, "").split("").filter(Boolean);
  if (!chars.length || !duration || !Number.isFinite(duration)) return [];
  const step = duration / chars.length;
  return chars.map((ch, index) => ({ time: index * step, viseme: guessVisemeFromChar(ch) }));
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

function applyTunedMouth(mouth, viseme, mode) {
  resetMorphs();

  // 너무 작은 소리는 입을 닫아 둔다.
  if (mouth < 0.035) return;

  // 현재 모델은 Shape Key가 5개뿐이라 JawOpen 중심이 가장 안정적이다.
  const jaw = Math.min(0.68, mouth * 0.72);
  setMorph("JawOpen", jaw);

  if (mode !== "volumeText") return;

  // 텍스트 Viseme는 아주 약하게만 섞는다. 강하게 주면 한글 TTS에서 더 어색해진다.
  if (viseme && viseme !== "JawOpen") {
    setMorph(viseme, Math.min(0.28, mouth * 0.22));
  }
}

function startTunedAudioLipSync(audio, text = "", mode = "volumeText") {
  stopTunedAudioLipSync(false);
  stopRandomLipSync(false);

  smoothedMouth = 0;
  currentVisemeTimeline = makeVisemeTimeline(text, audio.duration || 1);

  audioContext = new AudioContext();
  audioSource = audioContext.createMediaElementSource(audio);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.74;
  audioSource.connect(analyser);
  analyser.connect(audioContext.destination);

  const timeData = new Uint8Array(analyser.fftSize);

  function update() {
    analyser.getByteTimeDomainData(timeData);

    let sumSquares = 0;
    for (const value of timeData) {
      const centered = (value - 128) / 128;
      sumSquares += centered * centered;
    }

    const rms = Math.sqrt(sumSquares / timeData.length);

    // 안정적인 기본값: 잡음은 컷하고, 큰 소리도 과하게 벌어지지 않게 제한한다.
    const noiseGate = 0.014;
    const normalized = Math.max(0, rms - noiseGate) / 0.13;
    const target = Math.min(1, normalized);

    // 열릴 때는 빠르게, 닫힐 때는 조금 부드럽게.
    const attack = 0.34;
    const release = 0.18;
    const factor = target > smoothedMouth ? attack : release;
    smoothedMouth += (target - smoothedMouth) * factor;

    // 과한 튐을 줄이기 위해 출력 범위를 완만하게 제한한다.
    const mouth = Math.min(0.9, Math.pow(smoothedMouth * 1.25, 0.9));
    const viseme = getCurrentViseme(audio.currentTime);
    applyTunedMouth(mouth, viseme, mode);

    lipRaf = requestAnimationFrame(update);
  }

  update();
  setStatus(mode === "volumeText" ? "튜닝 립싱크 실행 중: 음량 + 텍스트 Viseme" : "튜닝 립싱크 실행 중: 음량 기반만");
}

function stopTunedAudioLipSync(updateStatus = true) {
  if (lipRaf) {
    cancelAnimationFrame(lipRaf);
    lipRaf = null;
  }
  resetMorphs();
  currentVisemeTimeline = [];
  smoothedMouth = 0;

  if (audioSource) {
    try { audioSource.disconnect(); } catch {}
    audioSource = null;
  }
  if (analyser) {
    try { analyser.disconnect(); } catch {}
    analyser = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  if (updateStatus) setStatus("튜닝 립싱크 정지");
}

function startRandomLipSync() {
  stopRandomLipSync(false);
  stopTunedAudioLipSync(false);
  lipTimer = setInterval(() => {
    resetMorphs();
    const name = MORPH_NAMES[Math.floor(Math.random() * MORPH_NAMES.length)];
    const value = 0.25 + Math.random() * 0.75;
    setMorph(name, value);
  }, 90);
  setStatus("랜덤 립싱크 실행 중...");
}

function stopRandomLipSync(updateStatus = true) {
  if (lipTimer) clearInterval(lipTimer);
  lipTimer = null;
  resetMorphs();
  if (updateStatus) setStatus("랜덤 립싱크 정지");
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

function playClip(clip, label, loop = false) {
  if (!mixer || !clip) return;
  const action = mixer.clipAction(clip);
  action.reset();
  action.enabled = true;
  action.setEffectiveWeight(1);
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = !loop;
  if (currentAction && currentAction !== action) {
    currentAction.fadeOut(0.18);
    action.fadeIn(0.18);
  }
  action.play();
  currentAction = action;
  setStatus(`전신 애니메이션 재생: ${label}`);
}

function playAnimation(name) {
  const clip = animations.get(name) || [...animations.values()][0];
  playClip(clip, name, false);
}

async function loadMotionClip(url, name = "external_motion") {
  if (externalMotions.has(url)) return externalMotions.get(url);
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  const clip = gltf.animations?.[0]?.clone();
  if (!clip) throw new Error(`모션 파일에 애니메이션이 없습니다: ${url}`);
  clip.name = name;
  externalMotions.set(url, clip);
  return clip;
}

async function requestTextToMotion() {
  const prompt = document.querySelector("#motionPrompt").value.trim();
  if (!prompt) return;

  try {
    setStatus("Text-to-Motion 요청 중...");
    const data = await fetchJson("/api/text-to-motion", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ prompt }),
    });

    const clip = await loadMotionClip(data.motion_url, data.motion_key);
    currentMotionClipName = data.motion_url;
    playClip(clip, `${data.motion_key} / ${data.mode}`, false);
    setStatus(`Text-to-Motion 결과\nmode: ${data.mode}\nmotion: ${data.motion_key}\nurl: ${data.motion_url}\n${data.note || ""}`);
  } catch (err) {
    console.warn(err);
    setStatus(`Text-to-Motion 오류: ${err.message}`);
  }
}

async function playLastMotion() {
  if (!currentMotionClipName) {
    setStatus("아직 로드된 Text-to-Motion 모션이 없습니다.");
    return;
  }
  const clip = await loadMotionClip(currentMotionClipName);
  playClip(clip, currentMotionClipName, false);
}

async function playTTS() {
  const text = document.querySelector("#ttsText").value.trim();
  const mode = document.querySelector("#lipMode").value;
  if (!text) return;

  try {
    stopAll(false);
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "TTS 실패");

    const audio = new Audio();
    audio.src = data.audio_url;
    currentAudio = audio;

    audio.onplay = () => startTunedAudioLipSync(audio, text, mode);
    audio.ontimeupdate = () => {
      if (!audio.duration) return;
      if (audio.duration - audio.currentTime <= 0.10) stopTunedAudioLipSync(false);
    };
    audio.onended = () => {
      stopTunedAudioLipSync();
      currentAudio = null;
    };
    audio.onerror = () => {
      stopTunedAudioLipSync();
      currentAudio = null;
    };

    await audio.play();
  } catch (err) {
    console.warn(err);
    stopTunedAudioLipSync();
    setStatus(`TTS 오류: ${err.message}\n로그인 토큰 또는 /api/tts를 확인하세요.`);
  }
}

function fakeSpeech() {
  stopAll(false);
  startRandomLipSync();
  const firstAnim = [...animations.keys()][0];
  if (firstAnim) playAnimation(firstAnim);
  setTimeout(() => stopRandomLipSync(), 4000);
}

function stopAll(updateStatus = true) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  stopTunedAudioLipSync(false);
  stopRandomLipSync(false);
  if (updateStatus) setStatus("전체 정지");
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
  document.querySelector("#ttsBtn").addEventListener("click", playTTS);
  document.querySelector("#fakeSpeechBtn").addEventListener("click", fakeSpeech);
  document.querySelector("#stopAllBtn").addEventListener("click", () => stopAll());
  document.querySelector("#motionSuggestBtn").addEventListener("click", requestTextToMotion);
  document.querySelector("#playLastMotionBtn").addEventListener("click", playLastMotion);
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
  console.log("=== EXTERNAL MOTIONS ===");
  for (const [url, clip] of externalMotions.entries()) console.log(url, clip);
  setStatus(`Morph Mesh ${morphMeshes.length}개 / 내장 Animation ${animations.size}개 / 외부 Motion ${externalMotions.size}개 확인 완료. 콘솔을 확인하세요.`);
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
      window.__gmTunedTest = {
        model,
        mixer,
        morphMeshes,
        animations,
        externalMotions,
        setMorph,
        resetMorphs,
        startTunedAudioLipSync,
        stopTunedAudioLipSync,
        playAnimation,
        loadMotionClip,
      };
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
