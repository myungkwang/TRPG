// 아이템 3D 썸네일 — 단 하나의 공용 WebGL 렌더러로 각 모델을 1회만 그려
// PNG(dataURL)로 캐싱한다. 인벤토리/장비처럼 작은 고정 아이콘이 많아도
// WebGL 컨텍스트는 1개만 쓰므로 컨텍스트 한도 초과(흰화면)가 발생하지 않는다.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SIZE = 256
let renderer = null
let scene = null
let camera = null
const cache = new Map()       // key(path|orient) -> dataURL | Promise<dataURL>
const sceneCache = new Map()  // path -> Promise<THREE.Object3D> (원본, clone해서 사용)
const loader = new GLTFLoader()

function ensureRenderer() {
  if (renderer) return true
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setSize(SIZE, SIZE)
    renderer.setPixelRatio(1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xfff2d0, 0x20140f, 2.8))
    const key = new THREE.DirectionalLight(0xffffff, 3.4)
    key.position.set(4, 5, 6); scene.add(key)
    const rim = new THREE.DirectionalLight(0xd6b35f, 1.8)
    rim.position.set(-5, 2, -4); scene.add(rim)
    camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10000)
  } catch (e) {
    renderer = null
    return false
  }
  return true
}

function loadSource(path) {
  if (!sceneCache.has(path)) {
    sceneCache.set(path, new Promise((resolve, reject) => {
      loader.load(path, (g) => {
        g.scene.traverse((o) => {
          if (!o.isMesh) return
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.filter(Boolean).forEach((m) => { m.side = THREE.DoubleSide })
        })
        resolve(g.scene)
      }, undefined, reject)
    }))
  }
  return sceneCache.get(path)
}

async function render(path, orient) {
  if (!ensureRenderer()) return null
  const source = await loadSource(path)
  const model = source.clone(true)            // geometry/material은 공유(원본 보존)
  if (orient?.rotation) {
    model.rotation.set(orient.rotation[0] || 0, orient.rotation[1] || 0, orient.rotation[2] || 0)
  }
  const pivot = new THREE.Group()
  pivot.add(model)
  scene.add(pivot)

  let box = new THREE.Box3().setFromObject(model)
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  model.position.sub(center)
  box = new THREE.Box3().setFromObject(pivot)
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const zoom = orient?.zoom || 1
  const dist = (maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * 1.45 * zoom
  const oy = orient?.offsetY || 0
  camera.position.set(maxDim * 0.25, maxDim * 0.18 + oy, dist)
  camera.lookAt(0, oy, 0)

  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  scene.remove(pivot)                          // clone은 GC (공유 리소스는 dispose 안 함)
  return url
}

export function getItemThumb(path, orient) {
  if (!path) return Promise.resolve(null)
  const key = path + '|' + JSON.stringify(orient || null)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const p = render(path, orient)
    .then((url) => { cache.set(key, url); return url })
    .catch(() => null)
  cache.set(key, p)
  return p
}
