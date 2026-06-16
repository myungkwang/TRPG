import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// 아이템 GLB 뷰어. 사용자 조작 불가(회전/줌/이동 전부 차단).
//   spin=true  → 자동으로 천천히 회전(상세보기용)
//   spin=false → 고정 정지(인벤토리/장비 아이콘용)
//   orient = 모델별 보정 { rotation:[x,y,z](라디안), zoom(거리배수·작을수록 크게), offsetY }
//     · 누워서 나오는 모델은 rotation 으로 세운다. 예) 눕힌 검: rotation:[Math.PI/2,0,0]
export default function ItemModel3D({ path, fallback, className = 'weapon3d', spin = true, orient = null }) {
  const hostRef = useRef(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !path) return undefined

    setLoaded(false)
    let disposed = false
    let model = null
    let frame = 0
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10000)
    // WebGL 컨텍스트 생성 실패(한도 초과 등) 시 앱 전체가 흰화면으로 죽지 않도록 방어.
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch (e) {
      setLoaded(false)
      return undefined   // → fallback(이모지)만 표시
    }
    const clock = new THREE.Clock()
    const pivot = new THREE.Group()       // 방향보정된 모델을 담고, 이 그룹을 y축으로 돌린다
    scene.add(pivot)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    // 컨텍스트 소실 시: 렌더 중단 + 폴백 표시(앱 크래시 방지)
    renderer.domElement.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault()
      disposed = true
      cancelAnimationFrame(frame)
      setLoaded(false)
    })

    scene.add(new THREE.HemisphereLight(0xfff2d0, 0x20140f, 2.8))
    const key = new THREE.DirectionalLight(0xffffff, 3.4)
    key.position.set(4, 5, 6)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xd6b35f, 1.8)
    rim.position.set(-5, 2, -4)
    scene.add(rim)

    const resize = () => {
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const frameModel = () => {
      // 1) 모델별 방향 보정(누운 모델 세우기 등)
      if (orient?.rotation) {
        model.rotation.set(orient.rotation[0] || 0, orient.rotation[1] || 0, orient.rotation[2] || 0)
      }
      // 2) 보정된 상태의 중심을 pivot 원점으로 이동
      let box = new THREE.Box3().setFromObject(model)
      const center = new THREE.Vector3()
      const size = new THREE.Vector3()
      box.getCenter(center)
      model.position.sub(center)
      // 3) pivot 전체 크기로 카메라 거리 산정(고정 — 조작 없음)
      box = new THREE.Box3().setFromObject(pivot)
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const zoom = orient?.zoom || 1
      const dist = (maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * 1.45 * zoom
      const oy = orient?.offsetY || 0
      camera.position.set(maxDim * 0.25, maxDim * 0.18 + oy, dist)
      camera.lookAt(0, oy, 0)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    new GLTFLoader().load(
      path,
      (gltf) => {
        if (disposed) return
        model = gltf.scene
        model.traverse((obj) => {
          if (!obj.isMesh) return
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.filter(Boolean).forEach((mat) => {
            mat.side = THREE.DoubleSide
            mat.needsUpdate = true
          })
        })
        pivot.add(model)
        frameModel()
        setLoaded(true)
      },
      undefined,
      () => {
        if (!disposed) setLoaded(false)
      },
    )

    const tick = () => {
      if (disposed) return
      frame = requestAnimationFrame(tick)
      const dt = clock.getDelta()
      if (spin && model) pivot.rotation.y += dt * 0.45
      try {
        renderer.render(scene, camera)
      } catch (e) {
        disposed = true
        cancelAnimationFrame(frame)
      }
    }
    tick()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.dispose()
      renderer.forceContextLoss?.()   // GPU 컨텍스트 즉시 해제(누적 방지)
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
    }
  }, [path, spin, orient])

  return (
    <div className={className}>
      <div ref={hostRef} className="weapon3d-canvas" />
      {!loaded && <div className="weapon3d-fallback">{fallback}</div>}
    </div>
  )
}
