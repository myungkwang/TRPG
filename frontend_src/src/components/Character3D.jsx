import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const DEFAULT_MODEL_PATH = '/static/models/gm_model.glb'

// 카메라는 모델 바운딩 박스를 기준으로 자동 프레이밍됩니다(frameObject 참고).
// 아래 값은 모델 로드 전 초기값일 뿐이며, 로드 후 자동으로 덮어써집니다.
const CAMERA_POSITION = [0, 400, 900] // 초기 카메라 위치 [x, y, z]
const CAMERA_TARGET = [0, 400, 0] // 초기 바라보는 지점 [x, y, z]
// 전신 위아래 여백 배수. 1.0이면 딱 맞고, 키울수록 캐릭터가 작게(여백 크게) 보입니다.
const FRAME_MARGIN = 1.15
// 화면에서 캐릭터를 위/아래로 옮기는 값. 양수면 화면에서 아래로 내려갑니다.
const VERTICAL_OFFSET = 0
const DEFAULT_ANIMATIONS = {
  idle: '/static/animations/weight_shift.glb',
  talk: '/static/animations/acknowledging.glb',
  happy: '/static/animations/happy_hand_gesture.glb',
  angry: '/static/animations/angry_gesture.glb',
  thinking: '/static/animations/thoughtful_head_shake.glb',
  deny: '/static/animations/shaking_head_no.glb',
  sigh: '/static/animations/relieved_sigh.glb',
  cocky: '/static/animations/being_cocky.glb',
}

function firstClipFrom(animations, name) {
  if (!animations || animations.length === 0) return null
  const clip = animations[0].clone()
  clip.name = name
  return clip
}

function normalizeModel(object) {
  object.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = true
    child.receiveShadow = true
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.filter(Boolean).forEach((mat) => {
      mat.side = THREE.DoubleSide
      if (!mat.map && mat.color) mat.color.multiplyScalar(1.15)
    })
  })
}

function detectEmotion(text) {
  const s = String(text || '')
  if (/분노|화나|격노|위협|공격|전투|짜증|불쾌/.test(s)) return 'angry'
  if (/기쁨|반갑|성공|좋아|환영|미소/.test(s)) return 'happy'
  if (/생각|고민|침묵|추리|의심|관찰/.test(s)) return 'thinking'
  if (/아니|거절|불가능|실패|못/.test(s)) return 'deny'
  if (/한숨|안도|지치|긴장/.test(s)) return 'sigh'
  if (/비웃|능청|거만|도발/.test(s)) return 'cocky'
  return 'talk'
}

export default function Character3D({ modelPath = DEFAULT_MODEL_PATH, animations = DEFAULT_ANIMATIONS }) {
  const hostRef = useRef(null)
  const [status, setStatus] = useState('Loading 3D model...')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    let disposed = false
    let renderer
    let scene
    let camera
    let controls
    let model
    let mixer
    let currentAction
    let animationFrame = 0
    const clock = new THREE.Clock()
    const clips = new Map()
    const loader = new FBXLoader()
    const gltfLoader = new GLTFLoader()

    // GLB/GLTF and FBX have different loaders and result shapes. Normalize both to { root, animations }.
    const loadModel = (path) => new Promise((resolve, reject) => {
      const isGltf = /\.gl(b|tf)$/i.test(path)
      if (isGltf) {
        gltfLoader.load(
          path,
          (gltf) => resolve({ root: gltf.scene, animations: gltf.animations || [] }),
          (event) => onModelProgress(event),
          reject,
        )
      } else {
        loader.load(
          path,
          (object) => resolve({ root: object, animations: object.animations || [] }),
          (event) => onModelProgress(event),
          reject,
        )
      }
    })

    const onModelProgress = (event) => {
      if (!event.total) return
      const pct = Math.round((event.loaded / event.total) * 100)
      setSafeStatus(`Loading 3D model... ${pct}%`)
    }

    const setSafeStatus = (text) => {
      if (!disposed) setStatus(text)
    }

    const resize = () => {
      if (!renderer || !camera) return
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    // 모델 로드 후 frameObject가 계산해 채웁니다. 그 전까진 초기값 사용.
    let viewPosition = [...CAMERA_POSITION]
    let viewTarget = [...CAMERA_TARGET]

    const resetCamera = () => {
      if (!camera || !controls) return
      camera.position.set(...viewPosition)
      controls.target.set(...viewTarget)
      controls.update()
    }

    const frameObject = (object) => {
      // 1) Normalize scale so the model is a consistent height regardless of source units.
      let box = new THREE.Box3().setFromObject(object)
      const size = new THREE.Vector3()
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      object.scale.setScalar(500 / maxDim)

      // 2) Recompute after scaling and rest the model's feet on y=0, centered on x/z.
      box = new THREE.Box3().setFromObject(object)
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)
      object.position.x -= center.x
      object.position.z -= center.z
      object.position.y -= box.min.y

      // 3) Fit the camera to the model's actual bounding box so the whole body is
      //    framed and centered regardless of the model's real proportions.
      box = new THREE.Box3().setFromObject(object)
      box.getSize(size)
      box.getCenter(center)
      // Fit by HEIGHT only. Width-fit divides by camera.aspect, which can be a bogus
      // value if the canvas hasn't been laid out yet — that blows the distance up and
      // makes the model render tiny. Standing characters are height-dominant anyway.
      const fov = THREE.MathUtils.degToRad(camera.fov)
      const fitHeight = size.y / 2 / Math.tan(fov / 2)
      const dist = fitHeight * FRAME_MARGIN
      const targetY = center.y + VERTICAL_OFFSET
      viewPosition = [center.x, targetY, dist]
      viewTarget = [center.x, targetY, 0]

      resetCamera()
    }

    const playAnimation = (name = 'talk', options = {}) => {
      if (!mixer) return
      const clip = clips.get(name) || clips.get('talk') || clips.get('idle') || clips.get('embedded')
      if (!clip) return

      const action = mixer.clipAction(clip)
      action.reset()
      action.enabled = true
      action.setEffectiveWeight(1)

      if (options.loop || name === 'idle') {
        action.setLoop(THREE.LoopRepeat, Infinity)
        action.clampWhenFinished = false
      } else {
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
      }

      if (currentAction && currentAction !== action) {
        currentAction.crossFadeTo(action, options.fade ?? 0.25, false)
      }

      action.play()
      currentAction = action

      if (name !== 'idle') {
        const backToIdle = (event) => {
          if (event.action === action) {
            mixer.removeEventListener('finished', backToIdle)
            playAnimation('idle', { loop: true, fade: 0.35 })
          }
        }
        mixer.addEventListener('finished', backToIdle)
      }
    }

    const loadAnimation = (name, path) => new Promise((resolve) => {
      const isGltf = /\.gl(b|tf)$/i.test(path)
      const onLoaded = (animations) => {
        const clip = firstClipFrom(animations, name)
        if (clip) clips.set(name, clip)
        resolve(Boolean(clip))
      }
      if (isGltf) {
        gltfLoader.load(path, (gltf) => onLoaded(gltf.animations), undefined, () => resolve(false))
      } else {
        loader.load(path, (object) => onLoaded(object.animations), undefined, () => resolve(false))
      }
    })

    const revealModel = () => {
      if (model && !model.visible) {
        model.visible = true
        // Render once with the idle pose applied before showing, avoiding a T-pose flash.
        mixer?.update(0)
      }
    }

    const loadAnimations = async () => {
      // Load idle first so we can start it (and reveal the model) before the rest stream in.
      const entries = Object.entries(animations).sort(([a]) => (a === 'idle' ? -1 : 0))
      let ok = 0
      for (const [name, path] of entries) {
        // Loading sequentially keeps the browser responsive with several FBX files.
        // eslint-disable-next-line no-await-in-loop
        if (await loadAnimation(name, path)) ok += 1
        if (name === 'idle' && clips.has('idle')) {
          playAnimation('idle', { loop: true, fade: 0 })
          revealModel()
        }
        setSafeStatus(`Loading animations... ${ok}/${entries.length}`)
      }
      // Fallback in case there was no idle clip at all.
      revealModel()
      if (!currentAction) playAnimation('idle', { loop: true, fade: 0.2 })
      setSafeStatus(`3D ready (${ok} animations)`)
    }

    scene = new THREE.Scene()
    scene.background = null

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000)
    camera.position.set(...CAMERA_POSITION)

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    // GLB uses PBR (metallic/roughness) materials that render black without an environment
    // to reflect. A generated room environment gives them realistic, colorful shading.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTexture

    scene.add(new THREE.HemisphereLight(0xfff2d0, 0x312018, 2.4))

    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(180, 260, 140)
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xd6b35f, 1.3)
    fill.position.set(-180, 120, -160)
    scene.add(fill)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = true
    controls.enableZoom = true
    controls.target.set(...CAMERA_TARGET)

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    loadModel(modelPath)
      .then(async ({ root, animations: embeddedClips }) => {
        if (disposed) return
        model = root
        normalizeModel(model)
        model.visible = false // Keep hidden until the idle pose is applied (prevents a T-pose flash).
        scene.add(model)
        frameObject(model)
        mixer = new THREE.AnimationMixer(model)

        if (embeddedClips?.length) {
          const embedded = embeddedClips[0]
          embedded.name = 'embedded'
          clips.set('embedded', embedded)
        }

        await loadAnimations()
      })
      .catch(() => setSafeStatus('3D model load failed'))

    const tick = () => {
      if (disposed) return
      animationFrame = requestAnimationFrame(tick)
      mixer?.update(clock.getDelta())
      controls?.update()
      renderer?.render(scene, camera)
    }
    tick()

    window.playLinAnimation = playAnimation
    window.playLinEmotion = (textOrEmotion) => {
      const direct = clips.has(textOrEmotion) ? textOrEmotion : detectEmotion(textOrEmotion)
      playAnimation(direct)
    }

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      if (window.playLinAnimation === playAnimation) delete window.playLinAnimation
      if (window.playLinEmotion) delete window.playLinEmotion
      controls?.dispose()
      envTexture?.dispose()
      pmrem?.dispose()
      renderer?.dispose()
      if (renderer?.domElement?.parentNode === host) host.removeChild(renderer.domElement)
    }
  }, [modelPath, animations])

  return (
    <div className="character3d">
      <div ref={hostRef} className="character3d-canvas" />
      <div className="character3d-status">{status}</div>
    </div>
  )
}
