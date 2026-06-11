import React, { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { playSfx } from '../audioSettings.js'
import { getRendererPixelRatio, subscribeSettings } from '../settings.js'

// 면에 새길 숫자 텍스처
function numberTexture(n) {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, s, s)
  ctx.font = 'bold 168px "Gowun Batang", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 10
  ctx.strokeStyle = 'rgba(255,238,200,0.55)'
  ctx.strokeText(String(n), s / 2, s / 2 + 10)
  ctx.fillStyle = '#2a1a08'
  ctx.fillText(String(n), s / 2, s / 2 + 10)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}

// three.js 정십이면체(d12) 주사위. 굴리면 자유회전 후 감속, 결정된 면이 정면(수직)으로 정렬.
export default function Dice3D({ size = 60, apiRef, autoRoll = false, clickToRoll = true, onResult, onRollStart }) {
  const mountRef = useRef(null)
  const ctrlRef = useRef({ roll: null })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(getRendererPixelRatio())
    renderer.setSize(size, size)
    renderer.domElement.style.display = 'block'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
    cam.position.set(0, 0, 5.6)

    scene.add(new THREE.AmbientLight(0xffffff, 0.66))
    const key = new THREE.DirectionalLight(0xffe9c4, 1.15); key.position.set(2.5, 4, 5); scene.add(key)
    const rim = new THREE.DirectionalLight(0x9bb0ff, 0.35); rim.position.set(-3, -1, -2); scene.add(rim)

    const group = new THREE.Group()
    scene.add(group)

    const R = 1.45
    const bodyGeo = new THREE.DodecahedronGeometry(R)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb38b3e, metalness: 0.4, roughness: 0.42 })
    group.add(new THREE.Mesh(bodyGeo, bodyMat))
    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(bodyGeo, 1),
      new THREE.LineBasicMaterial({ color: 0x3a2710 })
    ))

    // 실제 지오메트리에서 12면의 법선/내접반지름을 추출 → 숫자 평면을 면에 정확히 배치
    const pos = bodyGeo.attributes.position
    const triCount = pos.count / 3
    const faces = []
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3()
    const AB = new THREE.Vector3(), AC = new THREE.Vector3(), N = new THREE.Vector3()
    for (let t = 0; t < triCount; t++) {
      A.fromBufferAttribute(pos, t * 3); B.fromBufferAttribute(pos, t * 3 + 1); C.fromBufferAttribute(pos, t * 3 + 2)
      AB.subVectors(B, A); AC.subVectors(C, A); N.crossVectors(AB, AC).normalize()
      if (!faces.some(f => f.normal.dot(N) > 0.99)) faces.push({ normal: N.clone(), ri: Math.abs(A.dot(N)) })
    }

    const Z = new THREE.Vector3(0, 0, 1)
    const faceQ = faces.map((f, i) => {
      const q = new THREE.Quaternion().setFromUnitVectors(Z, f.normal)
      const tex = numberTexture(i + 1)
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
      const ps = f.ri * 0.62
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(ps, ps), mat)
      plane.position.copy(f.normal).multiplyScalar(f.ri + 0.015)
      plane.quaternion.copy(q)
      group.add(plane)
      return q
    })

    // 시작: 한 면을 정면으로
    group.quaternion.copy(faceQ[0].clone().invert())
    renderer.render(scene, cam)
    const unsubscribeQuality = subscribeSettings(() => {
      renderer.setPixelRatio(getRendererPixelRatio())
      renderer.setSize(size, size)
      renderer.render(scene, cam)
    })

    let raf = 0
    let rolling = false

    const roll = (opts = {}) => {
      if (rolling) return
      playSfx('roll', 1)
      rolling = true
      if (onRollStart) onRollStart()
      const idx = Math.floor(Math.random() * faceQ.length)
      const target = faceQ[idx].clone().invert()
      const randAxis = () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      let axis = randAxis()
      let nextSwap = 0.16                        // 회전축을 주기적으로 바꿔 여러 방향으로 텀블
      let omega = 17 + Math.random() * 7        // 초기 각속도(rad/s)
      const settleStart = 0.85                   // 이 시점부터 결과면으로 정렬
      const total = 1.7
      const dq = new THREE.Quaternion()
      const t0 = performance.now()
      let last = t0
      let settleFromQ = null

      const frame = (now) => {
        const dt = Math.min((now - last) / 1000, 0.05); last = now
        const el = (now - t0) / 1000
        if (el < settleStart) {
          if (el > nextSwap) { axis = randAxis(); nextSwap = el + 0.13 + Math.random() * 0.14 }
          omega *= 0.992
          dq.setFromAxisAngle(axis, omega * dt)
          group.quaternion.premultiply(dq).normalize()
        } else {
          if (!settleFromQ) settleFromQ = group.quaternion.clone()
          const k = Math.min((el - settleStart) / (total - settleStart), 1)
          const ke = 1 - Math.pow(1 - k, 3)     // easeOutCubic
          group.quaternion.copy(settleFromQ).slerp(target, ke)
          if (k >= 1) {
            group.quaternion.copy(target)
            renderer.render(scene, cam)
            rolling = false
            raf = 0
            if (onResult) onResult(idx + 1, opts)
            return
          }
        }
        renderer.render(scene, cam)
        raf = requestAnimationFrame(frame)
      }
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
    }

    ctrlRef.current.roll = roll
    if (apiRef) apiRef.current = { roll }

    let autoT = 0
    if (autoRoll) autoT = setTimeout(() => roll(), 200)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(autoT)
      unsubscribeQuality()
      bodyGeo.dispose(); bodyMat.dispose()
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) { o.material.map?.dispose(); o.material.dispose() }
      })
      renderer.dispose()
      renderer.forceContextLoss?.()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [size])

  return (
    <div
      ref={mountRef}
      className={'d3d' + (clickToRoll ? ' clickable' : '')}
      style={{ width: size, height: size }}
      onClick={clickToRoll ? () => ctrlRef.current.roll && ctrlRef.current.roll() : undefined}
      title={clickToRoll ? '클릭해서 굴리기' : undefined}
    />
  )
}
