import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Lipsync } from "/static/vendor/wawa-lipsync.es.js";

const MODEL_PATH = "/static/models/GM_Base_WithShapeKeys_04.glb";
const MORPH_NAMES = ["JawOpen", "aa_viseme", "eh_viseme", "ee_viseme", "oh_viseme"];

const viewer = document.querySelector("#viewer");
const statusEl = document.querySelector("#status");
const visemeNowEl = document.querySelector("#visemeNow");
const ttsTextEl = document.querySelector("#ttsText");

let scene;
let camera;
let renderer;
let controls;
let model;
let morphMeshes = [];
let currentAudio = null;
let lipsyncManager = null;
let wawaRaf = null;
let lastViseme = "-";

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
  camera.position.set(0, 1.25, 3.2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  viewer.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.0, 0);
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
    if (obj.morphTargetDictionary && obj.morphTargetInfluences) {
      morphMeshes.push(obj);
      console.log("[Morph Mesh]", obj.name, obj.morphTargetDictionary);
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
      mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
      applied = true;
    }
  }
  return applied;
}

function applyWawaViseme(viseme) {
  resetMorphs();
  const v = String(viseme || "viseme_sil");
  lastViseme = v;
  visemeNowEl.textContent = v;

  // wawa-lipsync output only. No custom volume analysis, no text timeline, no random lip sync.
  switch (v) {
    case "viseme_sil":
      break;
    case "viseme_aa":
      setMorph("JawOpen", 0.68);
      setMorph("aa_viseme", 0.95);
      break;
    case "viseme_E":
      setMorph("JawOpen", 0.48);
      setMorph("eh_viseme", 0.9);
      break;
    case "viseme_I":
      setMorph("JawOpen", 0.36);
      setMorph("ee_viseme", 0.85);
      break;
    case "viseme_O":
    case "viseme_U":
      setMorph("JawOpen", 0.52);
      setMorph("oh_viseme", 0.9);
      break;
    // The current model has only JawOpen + vowel visemes, so consonant visemes are represented with a small jaw movement.
    case "viseme_PP":
    case "viseme_FF":
    case "viseme_TH":
    case "viseme_DD":
    case "viseme_kk":
    case "viseme_CH":
    case "viseme_SS":
    case "viseme_nn":
    case "viseme_RR":
    default:
      setMorph("JawOpen", 0.22);
      break;
  }
}

function stopWawaOnly(updateStatus = true) {
  if (wawaRaf) {
    cancelAnimationFrame(wawaRaf);
    wawaRaf = null;
  }
  resetMorphs();
  visemeNowEl.textContent = "-";
  lipsyncManager = null;
  if (updateStatus) setStatus("wawa-only 립싱크 정지");
}

function startWawaOnly(audio) {
  stopWawaOnly(false);
  lipsyncManager = new Lipsync({ fftSize: 2048, historySize: 10 });
  lipsyncManager.connectAudio(audio);

  const update = () => {
    if (!lipsyncManager || !currentAudio || currentAudio.paused || currentAudio.ended) {
      stopWawaOnly(false);
      return;
    }

    lipsyncManager.processAudio();
    applyWawaViseme(lipsyncManager.viseme);
    wawaRaf = requestAnimationFrame(update);
  };

  update();
  setStatus("wawa-only 립싱크 실행 중...");
}

async function playTTSWawaOnly() {
  const text = ttsTextEl.value.trim();
  if (!text) return;

  try {
    stopAll(false);
    setStatus("TTS 생성 중... 음성이 시작되면 wawa-only 립싱크가 시작됩니다.");

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
      startWawaOnly(audio);
    };

    audio.ontimeupdate = () => {
      if (!audio.duration) return;
      if (audio.duration - audio.currentTime <= 0.08) {
        stopWawaOnly(false);
      }
    };

    audio.onended = () => {
      stopWawaOnly();
      currentAudio = null;
    };

    audio.onerror = () => {
      stopWawaOnly();
      currentAudio = null;
      setStatus("오디오 재생 오류");
    };

    await audio.play();
  } catch (err) {
    console.warn(err);
    stopAll(false);
    setStatus(`TTS/wawa-only 오류: ${err.message}`);
  }
}

function stopAll(updateStatus = true) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  stopWawaOnly(false);
  if (updateStatus) setStatus("정지 완료");
}

function debugState() {
  console.log("=== WAWA-ONLY DEBUG ===");
  console.log("morphMeshes:", morphMeshes.length);
  for (const mesh of morphMeshes) {
    console.log("mesh:", mesh.name);
    console.log("dictionary:", mesh.morphTargetDictionary);
    console.log("influences:", mesh.morphTargetInfluences);
  }
  console.log("lastViseme:", lastViseme);
  setStatus(`Morph Mesh ${morphMeshes.length}개 확인 완료. 콘솔을 확인하세요.`);
}

function testJaw() {
  resetMorphs();
  setMorph("JawOpen", 1.0);
  setTimeout(() => resetMorphs(), 900);
}

function setupButtons() {
  document.querySelector("#ttsBtn").addEventListener("click", playTTSWawaOnly);
  document.querySelector("#stopBtn").addEventListener("click", () => stopAll());
  document.querySelector("#debugBtn").addEventListener("click", debugState);
  document.querySelector("#jawBtn").addEventListener("click", testJaw);
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
      setupButtons();
      setStatus(`로드 완료\nMorph Mesh: ${morphMeshes.length}\nShape Keys: ${MORPH_NAMES.join(", ")}\n방식: wawa-lipsync only`);
      window.__wawaOnlyTest = { model, morphMeshes, setMorph, resetMorphs, startWawaOnly, stopWawaOnly, applyWawaViseme };
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
  controls?.update();
  renderer?.render(scene, camera);
}

initScene();
loadModel();
