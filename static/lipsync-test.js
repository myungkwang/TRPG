import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const viewer = document.querySelector("#viewer");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);
camera.position.set(0, 1.2, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2));

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(2, 4, 3);
scene.add(light);

let model = null;
let lipTimer = null;

function setMorph(name, value) {
  if (!model) return;

  model.traverse((obj) => {
    if (!obj.isMesh || !obj.morphTargetDictionary) return;

    const index = obj.morphTargetDictionary[name];

    if (index !== undefined) {
      obj.morphTargetInfluences[index] = value;
      console.log(`${name} = ${value}`);
    }
  });
}

function resetMorphs() {
  if (!model) return;

  model.traverse((obj) => {
    if (!obj.isMesh || !obj.morphTargetInfluences) return;
    obj.morphTargetInfluences.fill(0);
  });
}

window.debugMorph = () => {
  model?.traverse((obj) => {
    if (!obj.isMesh) return;
    console.log("mesh:", obj.name);
    console.log("morphTargetDictionary:", obj.morphTargetDictionary);
    console.log("morphTargetInfluences:", obj.morphTargetInfluences);
  });
};

window.testJaw = () => {
  resetMorphs();
  setMorph("JawOpen", 1);
};

window.testAA = () => {
  resetMorphs();
  setMorph("aa_viseme", 1);
};

window.startLipSync = () => {
  if (lipTimer) clearInterval(lipTimer);

  lipTimer = setInterval(() => {
    resetMorphs();

    const names = ["JawOpen", "aa_viseme", "eh_viseme", "ee_viseme", "oh_viseme"];
    const name = names[Math.floor(Math.random() * names.length)];
    const value = 0.3 + Math.random() * 0.7;

    setMorph(name, value);
  }, 100);
};

window.stopLipSync = () => {
  if (lipTimer) clearInterval(lipTimer);
  lipTimer = null;
  resetMorphs();
};

new GLTFLoader().load(
  "/static/models/ShapeKey_05.glb",
  (gltf) => {
    model = gltf.scene;
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    model.position.sub(center);

    const scale = 2 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);

    debugMorph();
  },
  undefined,
  (err) => {
    console.error("GLB load error:", err);
  }
);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();