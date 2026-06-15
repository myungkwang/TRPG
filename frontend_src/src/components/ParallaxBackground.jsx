import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

// 2.5D 깊이 패럴랙스 배경 + 자동 글로우(밝은 영역 발광) + 장소별 파티클.
//  - image: 배경 png. 깊이맵은 같은 이름의 /depth/ 하위 경로에서 자동으로 찾는다(없으면 평면).
//  - fx: 장소별 이펙트 프로필 { glow, glowTint:[r,g,b], particle, pColor, pCount, pRise }
function depthUrlFor(image) {
  if (!image) return null
  const i = image.lastIndexOf('/')
  return i >= 0 ? `${image.slice(0, i)}/depth${image.slice(i)}` : null
}

const DEFAULT_FX = {
  glow: 1.0, glowTint: [1, 1, 1],
  particle: 'dust', pColor: 'rgba(220,228,245,0.9)', pCount: 110, pRise: 0.0005,
}

function softTexture(color) {
  const s = 64, cv = document.createElement('canvas')
  cv.width = cv.height = s
  const g = cv.getContext('2d')
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd; g.fillRect(0, 0, s, s)
  return new THREE.CanvasTexture(cv)
}

export default function ParallaxBackground({ image, fx, strength = 0.05, zoom = 1.1, vignette = 0.4 }) {
  const hostRef = useRef(null)
  const ctx = useRef(null)
  const fxRef = useRef({ ...DEFAULT_FX, ...(fx || {}) })
  fxRef.current = { ...DEFAULT_FX, ...(fx || {}) }

  // 1회: three 셋업 + 루프
  useEffect(() => {
    const host = hostRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(renderer.domElement)
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' })

    const scene = new THREE.Scene()
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
    const uniforms = {
      uImage: { value: null }, uDepth: { value: null }, uHasDepth: { value: 0 },
      uOffset: { value: new THREE.Vector2() }, uStrength: { value: strength },
      uZoom: { value: zoom }, uVignette: { value: vignette },
      uResolution: { value: new THREE.Vector2(1, 1) }, uImageRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uGlow: { value: 1.0 }, uGlowTint: { value: new THREE.Vector3(1, 1, 1) },
    }
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `precision highp float;
        uniform sampler2D uImage,uDepth; uniform float uHasDepth,uStrength,uZoom,uVignette,uTime,uGlow;
        uniform vec2 uOffset,uResolution,uImageRes; uniform vec3 uGlowTint; varying vec2 vUv;
        vec2 cover(vec2 uv){ float rr=uResolution.x/uResolution.y, ri=uImageRes.x/uImageRes.y;
          vec2 s = rr>ri ? vec2(1.0, ri/rr) : vec2(rr/ri, 1.0); return (uv-0.5)*s+0.5; }
        float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
        void main(){
          vec2 uv = cover(vUv); uv = (uv-0.5)/uZoom+0.5;
          float d = uHasDepth>0.5 ? texture2D(uDepth,uv).r : 0.5;
          vec2 suv = uv + uOffset*uStrength*(d-0.5);
          vec3 col = texture2D(uImage, suv).rgb;
          // 자동 글로우: 밝은 영역 발광 (불·창·등불). 2겹 샘플 + 미세 맥동으로 '살아있는 빛'.
          vec3 bloom = vec3(0.0);
          for(int i=0;i<16;i++){
            float a = float(i)*0.3927;
            vec2 dir = vec2(cos(a),sin(a));
            vec3 s1 = texture2D(uImage, suv + dir*0.006).rgb;
            vec3 s2 = texture2D(uImage, suv + dir*0.018).rgb;
            bloom += s1 * smoothstep(0.62, 1.0, luma(s1));
            bloom += s2 * smoothstep(0.66, 1.0, luma(s2)) * 0.5;
          }
          bloom *= (0.035 + 0.006*sin(uTime*1.7)) * uGlow;
          col += bloom * uGlowTint;
          // 깊이 기반 대기감(은은하게): 먼 곳만 살짝 어둡고 차갑게
          if(uHasDepth>0.5){
            col *= mix(0.78, 1.05, d);
            col = mix(col, col*vec3(0.88,0.93,1.04), (1.0-d)*0.18);
          }
          // 약한 시네마틱 대비 + 살짝 채도
          col = mix(col, col*col*(3.0-2.0*col), 0.16);
          float l = luma(col); col = mix(vec3(l), col, 1.07);
          // 비네팅 + 은은한 깜빡임
          float vig = smoothstep(1.30,0.30,length(vUv-0.5)*1.5);
          col *= mix(1.0-uVignette,1.0,vig);
          col *= 0.99 + 0.01*sin(uTime*1.3);
          gl_FragColor = vec4(clamp(col,0.0,1.0),1.0);
        }`,
    })
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))

    // 파티클 레이어 (장소별 색/상승)
    const PCOUNT = 20
    const pos = new Float32Array(PCOUNT * 3)
    const vel = []
    for (let i = 0; i < PCOUNT; i++) {
      pos[i * 3] = Math.random() * 2 - 1
      pos[i * 3 + 1] = Math.random() * 2 - 1
      pos[i * 3 + 2] = 0
      vel.push({ vx: (Math.random() - 0.5) * 0.0006, base: 0.5 + Math.random(), ph: Math.random() * 6.28 })
    }
    const pgeo = new THREE.BufferGeometry()
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pmat = new THREE.PointsMaterial({
      size: 9, sizeAttenuation: false,   // 직교 카메라 → 픽셀 단위 크기여야 보인다
      map: softTexture(fxRef.current.pColor), transparent: true,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, opacity: 0.95,
    })
    const points = new THREE.Points(pgeo, pmat)
    points.renderOrder = 2
    scene.add(points)

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1
      renderer.setSize(w, h, false); uniforms.uResolution.value.set(w, h)
    })
    ro.observe(host)

    let tx = 0, ty = 0, mx = 0, my = 0, t = 0, raf = 0
    const onMove = (e) => { tx = (e.clientX / window.innerWidth) * 2 - 1; ty = -((e.clientY / window.innerHeight) * 2 - 1) }
    window.addEventListener('pointermove', onMove)

    const tick = () => {
      t += 0.016; uniforms.uTime.value = t
      const f = fxRef.current
      uniforms.uGlow.value = f.glow
      uniforms.uGlowTint.value.set(f.glowTint[0], f.glowTint[1], f.glowTint[2])
      // 자동 흔들림 최소화(거의 정지). 일렁임 대신 마우스 움직임 위주로 반응.
      const ax = Math.sin(t * 0.22) * 0.06, ay = Math.cos(t * 0.18) * 0.035
      mx += ((tx + ax) - mx) * 0.04; my += ((ty + ay) - my) * 0.04
      uniforms.uOffset.value.set(mx, my)
      // 파티클 업데이트 (보이는 개수 = pCount, 색/상승은 프로필)
      const visible = Math.max(0, Math.min(PCOUNT, f.pCount | 0))
      points.geometry.setDrawRange(0, visible)
      points.material.color = new THREE.Color(1, 1, 1)
      const rise = f.pRise
      for (let i = 0; i < visible; i++) {
        const o = vel[i]
        pos[i * 3] += o.vx + Math.sin(t * 1.3 + o.ph) * 0.0004
        pos[i * 3 + 1] += rise * o.base
        if (pos[i * 3 + 1] > 1.05) pos[i * 3 + 1] = -1.05
        if (pos[i * 3] < -1.1) pos[i * 3] = 1.1
        if (pos[i * 3] > 1.1) pos[i * 3] = -1.1
      }
      pgeo.attributes.position.needsUpdate = true
      points.position.set(mx * 0.05, my * 0.05, 0)   // 파티클도 살짝 패럴랙스
      renderer.render(scene, cam)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    ctx.current = { renderer, uniforms, mat, pmat, points }
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('pointermove', onMove)
      uniforms.uImage.value?.dispose?.(); uniforms.uDepth.value?.dispose?.()
      pmat.map?.dispose?.(); pgeo.dispose(); pmat.dispose(); mat.dispose(); renderer.dispose()
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
      ctx.current = null
    }
  }, [])

  // image 바뀌면 텍스처 교체 (+ 깊이맵)
  useEffect(() => {
    const c = ctx.current
    if (!c || !image) return
    const loader = new THREE.TextureLoader()
    let alive = true
    loader.load(image, (tex) => {
      if (!alive) { tex.dispose(); return }
      tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearFilter
      c.uniforms.uImage.value?.dispose?.(); c.uniforms.uImage.value = tex
      const im = tex.image
      if (im) c.uniforms.uImageRes.value.set(im.naturalWidth || im.width, im.naturalHeight || im.height)
    })
    const dUrl = depthUrlFor(image)
    if (dUrl) {
      loader.load(dUrl,
        (dep) => { if (!alive) { dep.dispose(); return }
          dep.colorSpace = THREE.NoColorSpace; dep.minFilter = THREE.LinearFilter
          c.uniforms.uDepth.value?.dispose?.(); c.uniforms.uDepth.value = dep; c.uniforms.uHasDepth.value = 1 },
        undefined, () => { if (alive) c.uniforms.uHasDepth.value = 0 })
    } else { c.uniforms.uHasDepth.value = 0 }
    return () => { alive = false }
  }, [image])

  // fx의 파티클 색이 바뀌면 텍스처 교체
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    const f = { ...DEFAULT_FX, ...(fx || {}) }
    c.pmat.map?.dispose?.()
    c.pmat.map = softTexture(f.pColor)
    c.pmat.needsUpdate = true
  }, [fx?.pColor])

  return <div ref={hostRef} className="parallax-bg" />
}
