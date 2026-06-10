import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const DEFAULT_MODEL_PATH = '/static/models/GM_Base_WithShapeKeys_04.glb'
const DEFAULT_MODEL_ROTATION = [0, 0, 0]
const DEFAULT_MODEL_SCALE = 1
const DEFAULT_MODEL_OFFSET = [0, 0, 0]

// 移대찓?쇰뒗 紐⑤뜽 諛붿슫??諛뺤뒪瑜?湲곗??쇰줈 ?먮룞 ?꾨젅?대컢?⑸땲??frameObject 李멸퀬).
// ?꾨옒 媛믪? 紐⑤뜽 濡쒕뱶 ??珥덇린媛믪씪 肉먯씠硫? 濡쒕뱶 ???먮룞?쇰줈 ??뼱?⑥쭛?덈떎.
const CAMERA_POSITION = [0, 400, 900] // 珥덇린 移대찓???꾩튂 [x, y, z]
const CAMERA_TARGET = [0, 400, 0] // 珥덇린 諛붾씪蹂대뒗 吏??[x, y, z]
// ?꾩떊 ?꾩븘???щ갚 諛곗닔. 1.0?대㈃ ??留욊퀬, ?ㅼ슱?섎줉 罹먮┃?곌? ?묎쾶(?щ갚 ?ш쾶) 蹂댁엯?덈떎.
const FRAME_MARGIN = 0.6
// ?붾㈃?먯꽌 罹먮┃?곕? ???꾨옒濡???린??媛? ?묒닔硫??붾㈃?먯꽌 ?꾨옒濡??대젮媛묐땲??
const VERTICAL_OFFSET = 125
const DEFAULT_ANIMATIONS = {
  idle: '/static/animations/weight_shift.glb',
  talk: '/static/animations/acknowledging.glb',
  happy: '/static/animations/happy_hand_gesture.glb',
  angry: '/static/animations/angry_gesture.glb',
  thinking: '/static/animations/thoughtful_head_shake.glb',
  deny: '/static/animations/shaking_head_no.glb',
  sigh: '/static/animations/relieved_sigh.glb',
  cocky: '/static/animations/being_cocky.glb',
  yes: '/static/animations/head_nod_yes.glb',
  strong_yes: '/static/animations/hard_head_nod.glb',
  long_yes: '/static/animations/lengthy_head_nod.glb',
  sarcastic: '/static/animations/sarcastic_head_nod.glb',
  look_away: '/static/animations/look_away_gesture.glb',
  dismiss: '/static/animations/dismissing_gesture.glb',
  annoyed: '/static/animations/annoyed_head_shake.glb',
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

const EMOTION_ALIASES = {
  neutral: 'talk',
  relief: 'sigh',
  relieved: 'sigh',
  sad: 'sigh',
  sadness: 'sigh',
}

const HANGUL_BASE = 0xac00
const HANGUL_END = 0xd7a3
const JUNGSEONG_COUNT = 21
const JONGSEONG_COUNT = 28
const JUNGSEONG_TO_VISEME = [
  'aa_viseme', 'aa_viseme', 'aa_viseme', 'aa_viseme',
  'eh_viseme', 'eh_viseme', 'eh_viseme', 'eh_viseme',
  'oh_viseme', 'oh_viseme', 'oh_viseme', 'oh_viseme', 'oh_viseme',
  'oh_viseme', 'oh_viseme', 'oh_viseme',
  'ee_viseme', 'ee_viseme', 'ee_viseme',
  'ee_viseme', 'ee_viseme',
]

function smoothStep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function guessVisemeFromChar(char) {
  const code = char.charCodeAt(0)
  if (code >= HANGUL_BASE && code <= HANGUL_END) {
    const syllable = code - HANGUL_BASE
    const jung = Math.floor(syllable / JONGSEONG_COUNT) % JUNGSEONG_COUNT
    return JUNGSEONG_TO_VISEME[jung] || 'JawOpen'
  }

  if (/[aA]/.test(char)) return 'aa_viseme'
  if (/[eE]/.test(char)) return 'eh_viseme'
  if (/[iI]/.test(char)) return 'ee_viseme'
  if (/[oOuU]/.test(char)) return 'oh_viseme'
  return 'JawOpen'
}

function makeVisemeTimeline(text, duration) {
  const chars = Array.from(String(text || '').replace(/\s+/g, '')).filter(Boolean)
  if (!chars.length || !duration || !Number.isFinite(duration)) return []

  const step = duration / chars.length
  return chars.map((char, index) => ({
    time: index * step,
    step,
    viseme: guessVisemeFromChar(char),
  }))
}

function getVisemeWeights(timeline, time) {
  if (!timeline.length) return {}

  const step = timeline[0].step || 0.08
  const index = THREE.MathUtils.clamp(Math.floor(time / step), 0, timeline.length - 1)
  const current = timeline[index]
  const next = timeline[Math.min(index + 1, timeline.length - 1)]
  const local = (time - current.time) / step
  const blend = smoothStep(0.58, 0.96, local)
  const weights = {}

  weights[current.viseme] = (weights[current.viseme] || 0) + (1 - blend)
  if (next && next !== current) weights[next.viseme] = (weights[next.viseme] || 0) + blend

  return weights
}

function averageBand(freqData, sampleRate, fftSize, minHz, maxHz) {
  const binHz = sampleRate / fftSize
  const start = Math.max(1, Math.floor(minHz / binHz))
  const end = Math.min(freqData.length - 1, Math.ceil(maxHz / binHz))
  let sum = 0

  for (let i = start; i <= end; i += 1) sum += freqData[i]
  return sum / Math.max(1, end - start + 1) / 255
}

function getAudioVisemeWeights(freqData, sampleRate, fftSize, mouth) {
  const low = averageBand(freqData, sampleRate, fftSize, 250, 650)
  const lowMid = averageBand(freqData, sampleRate, fftSize, 650, 1100)
  const mid = averageBand(freqData, sampleRate, fftSize, 1100, 2200)
  const high = averageBand(freqData, sampleRate, fftSize, 2200, 4200)

  const scores = {
    aa_viseme: Math.max(0, lowMid * 1.15 + mouth * 0.16 - high * 0.10),
    eh_viseme: Math.max(0, mid * 1.05 + high * 0.20),
    ee_viseme: Math.max(0, high * 1.25 + mid * 0.30 - low * 0.15),
    oh_viseme: Math.max(0, low * 1.10 + lowMid * 0.42 - high * 0.18),
  }

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0)
  if (total <= 0.0001) return {}

  return Object.fromEntries(
    Object.entries(scores).map(([name, value]) => [name, value / total]),
  )
}

function blendVisemeWeights(audioWeights, textWeights) {
  const names = ['aa_viseme', 'eh_viseme', 'ee_viseme', 'oh_viseme']
  const weights = {}
  let total = 0
  const hasTextWeights = names.some((name) => (textWeights[name] || 0) > 0.01)
  const audioMix = hasTextWeights ? 0.08 : 1
  const textMix = hasTextWeights ? 0.92 : 0

  names.forEach((name) => {
    const value = (audioWeights[name] || 0) * audioMix + (textWeights[name] || 0) * textMix
    if (value > 0.01) {
      weights[name] = value
      total += value
    }
  })

  if (total <= 0.0001) return {}
  names.forEach((name) => {
    if (weights[name]) weights[name] /= total
  })
  return weights
}

function getRhythmTextVisemeWeights(sequence, cursor, carry) {
  if (!sequence.length) return {}

  const index = THREE.MathUtils.clamp(Math.floor(cursor), 0, sequence.length - 1)
  const current = sequence[index]?.viseme
  const next = sequence[Math.min(index + 1, sequence.length - 1)]?.viseme
  const blend = smoothStep(0.42, 0.92, carry)
  const weights = {}

  if (current && current !== 'JawOpen') weights[current] = (weights[current] || 0) + (1 - blend)
  if (next && next !== 'JawOpen') weights[next] = (weights[next] || 0) + blend

  return weights
}

const MOTION_EMOTION_KEYWORDS = [
  { anim: 'angry', keywords: ['angry', '분노', '화가', '화나', '격노', '위협', '공격', '전투', '죽여', '경고', '분개', '불쾌'] },
  { anim: 'annoyed', keywords: ['annoyed', '짜증', '귀찮', '불만', '성가', '답답'] },
  { anim: 'happy', keywords: ['happy', '기쁨', '반갑', '환영', '축하', '성공', '미소', '좋아', '좋군', '웃'] },
  { anim: 'thinking', keywords: ['thinking', '생각', '고민', '추리', '관찰', '단서', '의심', '비밀', '침묵', '잠깐'] },
  { anim: 'deny', keywords: ['deny', '아니', '거절', '불가능', '실패', '안 돼', '안돼', '못', '틀렸'] },
  { anim: 'sigh', keywords: ['relief', 'sad', 'sigh', '한숨', '안도', '슬픔', '피곤', '유감', '실망', '지쳤', '긴장'] },
  { anim: 'cocky', keywords: ['cocky', '비웃', '능청', '거만', '도발', '자신만만', '하찮'] },
]
function detectEmotion(text) {
  const s = String(text || '').toLowerCase()
  if (EMOTION_ALIASES[s]) return EMOTION_ALIASES[s]
  for (const item of MOTION_EMOTION_KEYWORDS) {
    if (item.keywords.some((kw) => s.includes(kw))) return item.anim
  }
  return 'talk'
}

function hasAny(text, keywords) {
  const s = String(text || '').toLowerCase()
  return keywords.some((kw) => s.includes(kw))
}

function detectGestureStyle(text, flags) {
  if (flags.angry || flags.emphatic) return 'command'
  if (flags.negative) return 'deny'
  if (flags.happy) return 'greet'
  if (flags.question) return 'question'
  if (flags.thoughtful) return 'thinking'
  if (flags.confident) return 'present'
  if (hasAny(text, ['여기', '저기', '저쪽', '이곳', '보십시오', '봐', '확인'])) return 'point'
  return 'explain'
}

function buildMotionProfile(text, emotion, duration = 0) {
  const seconds = Number.isFinite(duration) && duration > 0 ? duration : Math.max(2.2, String(text || '').length * 0.075)
  const direct = EMOTION_ALIASES[emotion] || emotion || detectEmotion(text)
  const question = /[?？]|(습니까|나요|까요)/.test(text)
  const emphatic = /[!！]|(빨리|당장|절대|위험|경고|공격|분노)/.test(text)
  const negative = hasAny(text, ['아니', '안 돼', '안돼', '거절', '못', '틀렸', '실패'])
  const thoughtful = question || hasAny(text, ['생각', '고민', '단서', '의심', '잠깐', '기억', '모르', '어쩌면'])
  const confident = hasAny(text, ['그래', '맞', '확인', '수긍', '좋습니다', '물론'])
  const sly = hasAny(text, ['비웃', '글쎄', '하찮', '농담', '능청', '비밀'])
  const happy = direct === 'happy' || hasAny(text, ['환영', '반갑', '좋아', '성공', '축하', '웃'])
  const angry = direct === 'angry' || emphatic
  const tired = direct === 'sigh' || hasAny(text, ['한숨', '안도', '피곤', '유감', '다행', '실망'])
  const gestureStyle = detectGestureStyle(text, {
    angry, confident, emphatic, happy, negative, question, thoughtful,
  })

  let intensity = 0.42
  if (happy || confident) intensity += 0.12
  if (angry) intensity += 0.22
  if (thoughtful) intensity += 0.08
  if (tired) intensity -= 0.08

  return {
    until: performance.now() + seconds * 1000,
    startedAt: performance.now(),
    duration: seconds,
    intensity: THREE.MathUtils.clamp(intensity, 0.26, 0.82),
    tempo: THREE.MathUtils.clamp(1.1 + String(text || '').length / 90, 0.9, 1.9),
    lean: angry ? 0.09 : tired ? -0.05 : confident ? 0.05 : 0.02,
    sway: negative ? -1 : sly ? 1 : 0,
    nod: confident ? 1 : question ? 0.25 : angry ? 0.45 : 0,
    shake: negative ? 1 : angry ? 0.35 : 0,
    shoulder: angry ? 0.55 : happy ? 0.38 : tired ? -0.2 : 0.2,
    handGesture: THREE.MathUtils.clamp((angry ? 1 : happy ? 0.9 : thoughtful ? 0.78 : confident ? 0.86 : 0.76), 0.56, 1),
    handSide: negative ? -1 : sly || question ? 1 : 0,
    gestureStyle,
    gestureSeed: Math.abs(Array.from(String(text || '')).reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 997,
    breathe: tired ? 1.25 : angry ? 0.9 : 1,
  }
}

export default function Character3D({
  modelPath = DEFAULT_MODEL_PATH,
  animations = DEFAULT_ANIMATIONS,
  modelRotation = DEFAULT_MODEL_ROTATION,
  modelScale = DEFAULT_MODEL_SCALE,
  modelOffset = DEFAULT_MODEL_OFFSET,
}) {
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
    let modelRoot
    let mixer
    let currentAction
    let animationFrame = 0
    let motionToken = 0
    let motionTimer = 0
    let motionProfile = null
    const motionBones = {
      head: null,
      neck: null,
      spine: null,
      chest: null,
      leftShoulder: null,
      rightShoulder: null,
      leftUpperArm: null,
      rightUpperArm: null,
      leftForeArm: null,
      rightForeArm: null,
      leftHand: null,
      rightHand: null,
    }
    const motionBoneBaseRotations = new Map()
    const clock = new THREE.Clock()
    const clips = new Map()
    const morphMeshes = []
    let lipRaf = 0
    let audioContext = null
    let audioSource = null
    let analyser = null
    let smoothedMouth = 0
    let visemeTimeline = []
    let speechCursor = 0
    let speechCarry = 0
    let lastLipClock = 0
    let lipMorphState = {
      JawOpen: 0,
      jawOpen: 0,
      aa_viseme: 0,
      eh_viseme: 0,
      ee_viseme: 0,
      oh_viseme: 0,
    }
    let smoothedVisemes = {
      aa_viseme: 0,
      eh_viseme: 0,
      ee_viseme: 0,
      oh_viseme: 0,
    }

    const collectMorphMeshes = (root) => {
      morphMeshes.length = 0
      root.traverse((obj) => {
        if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
          morphMeshes.push(obj)
          console.log('[Character3D Morph Mesh]', obj.name, obj.morphTargetDictionary)
        }
      })
    }

    const collectMotionBones = (root) => {
      Object.keys(motionBones).forEach((key) => { motionBones[key] = null })
      motionBoneBaseRotations.clear()
      root.traverse((obj) => {
        if (!obj.isBone) return
        const name = obj.name.toLowerCase()
        if (!motionBones.head && name.includes('head')) motionBones.head = obj
        else if (!motionBones.neck && name.includes('neck')) motionBones.neck = obj
        else if (!motionBones.chest && /(chest|upperchest|spine2)/.test(name)) motionBones.chest = obj
        else if (!motionBones.spine && /(spine|body|torso)/.test(name)) motionBones.spine = obj
        else if (!motionBones.leftShoulder && /(leftshoulder|shoulder_l|l_shoulder)/.test(name)) motionBones.leftShoulder = obj
        else if (!motionBones.rightShoulder && /(rightshoulder|shoulder_r|r_shoulder)/.test(name)) motionBones.rightShoulder = obj
        else if (!motionBones.leftUpperArm && /(leftarm|leftupperarm|upperarm_l|l_upperarm|arm_l)/.test(name)) motionBones.leftUpperArm = obj
        else if (!motionBones.rightUpperArm && /(rightarm|rightupperarm|upperarm_r|r_upperarm|arm_r)/.test(name)) motionBones.rightUpperArm = obj
        else if (!motionBones.leftForeArm && /(leftforearm|leftlowerarm|forearm_l|lowerarm_l|l_forearm)/.test(name)) motionBones.leftForeArm = obj
        else if (!motionBones.rightForeArm && /(rightforearm|rightlowerarm|forearm_r|lowerarm_r|r_forearm)/.test(name)) motionBones.rightForeArm = obj
        else if (!motionBones.leftHand && /(lefthand|hand_l|l_hand|wrist_l)/.test(name)) motionBones.leftHand = obj
        else if (!motionBones.rightHand && /(righthand|hand_r|r_hand|wrist_r)/.test(name)) motionBones.rightHand = obj
      })
      console.log('[Character3D Motion Bones]', Object.fromEntries(
        Object.entries(motionBones).map(([key, bone]) => [key, bone?.name || null]),
      ))
    }

    const captureMotionBoneBasePose = () => {
      motionBoneBaseRotations.clear()
      Object.values(motionBones).forEach((bone) => {
        if (bone) motionBoneBaseRotations.set(bone.uuid, bone.rotation.clone())
      })
    }

    const resetMotionBonesToBasePose = () => {
      Object.values(motionBones).forEach((bone) => {
        const base = bone && motionBoneBaseRotations.get(bone.uuid)
        if (base) bone.rotation.copy(base)
      })
    }

    const addBoneRotation = (bone, x = 0, y = 0, z = 0) => {
      if (!bone) return
      bone.rotation.x += x
      bone.rotation.y += y
      bone.rotation.z += z
    }

    const resetMorphs = () => {
      morphMeshes.forEach((mesh) => mesh.morphTargetInfluences.fill(0))
    }

    const setMorph = (name, value) => {
      morphMeshes.forEach((mesh) => {
        const index = mesh.morphTargetDictionary?.[name]
        if (index !== undefined) mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1)
      })
    }

    const resetLipState = () => {
      lipMorphState = {
        JawOpen: 0,
        jawOpen: 0,
        aa_viseme: 0,
        eh_viseme: 0,
        ee_viseme: 0,
        oh_viseme: 0,
      }
      smoothedVisemes = {
        aa_viseme: 0,
        eh_viseme: 0,
        ee_viseme: 0,
        oh_viseme: 0,
      }
    }

    const applyStableLipMorphs = (targets, amount = 1) => {
      Object.keys(lipMorphState).forEach((name) => {
        const targetValue = (targets[name] || 0) * amount
        const currentValue = lipMorphState[name]
        const factor = targetValue > currentValue ? 0.24 : 0.16
        lipMorphState[name] += (targetValue - currentValue) * factor
        if (Math.abs(lipMorphState[name]) < 0.004) lipMorphState[name] = 0
        setMorph(name, lipMorphState[name])
      })
    }

    const stopAudioLipSync = () => {
      if (lipRaf) cancelAnimationFrame(lipRaf)
      lipRaf = 0
      smoothedMouth = 0
      visemeTimeline = []
      speechCursor = 0
      speechCarry = 0
      lastLipClock = 0
      resetLipState()
      resetMorphs()
      if (audioSource) { try { audioSource.disconnect() } catch {} }
      if (analyser) { try { analyser.disconnect() } catch {} }
      if (audioContext) { audioContext.close().catch(() => {}) }
      audioSource = null
      analyser = null
      audioContext = null
    }

    const startAudioLipSync = (audio, text = '') => {
      stopAudioLipSync()
      if (!audio || morphMeshes.length === 0) return

      audioContext = new AudioContext()
      audioSource = audioContext.createMediaElementSource(audio)
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.72
      audioSource.connect(analyser)
      analyser.connect(audioContext.destination)

      const fallbackDuration = Math.max(1, Array.from(String(text || '')).length * 0.08)
      visemeTimeline = makeVisemeTimeline(text, Number.isFinite(audio.duration) ? audio.duration : fallbackDuration)
      const timeData = new Uint8Array(analyser.fftSize)
      const freqData = new Uint8Array(analyser.frequencyBinCount)
      lastLipClock = audioContext.currentTime

      const update = () => {
        if (!audio || audio.paused || audio.ended) return
        if (!visemeTimeline.length && Number.isFinite(audio.duration) && audio.duration > 0) {
          visemeTimeline = makeVisemeTimeline(text, audio.duration)
        }

        analyser.getByteTimeDomainData(timeData)
        analyser.getByteFrequencyData(freqData)
        let sumSquares = 0
        for (const value of timeData) {
          const centered = (value - 128) / 128
          sumSquares += centered * centered
        }

        const rms = Math.sqrt(sumSquares / timeData.length)
        const target = THREE.MathUtils.clamp((rms - 0.018) / 0.14, 0, 1)
        const factor = target > smoothedMouth ? 0.24 : 0.13
        smoothedMouth += (target - smoothedMouth) * factor

        const remaining = audio.duration ? audio.duration - audio.currentTime : 1
        const endFade = THREE.MathUtils.clamp(remaining / 0.16, 0, 1)
        const mouth = Math.min(0.72, Math.pow(smoothedMouth * 1.05, 0.95)) * endFade
        const now = audioContext.currentTime
        const dt = THREE.MathUtils.clamp(now - lastLipClock, 0, 0.05)
        lastLipClock = now

        if (mouth > 0.045 && visemeTimeline.length) {
          const spokenRate = 5.6 + mouth * 3.2
          speechCarry += dt * spokenRate * (0.55 + mouth * 0.45)
          speechCursor += Math.floor(speechCarry)
          speechCarry %= 1

          if (audio.duration && Number.isFinite(audio.duration)) {
            const expectedCursor = (audio.currentTime / audio.duration) * Math.max(0, visemeTimeline.length - 1)
            if (speechCursor < expectedCursor - 4) speechCursor += (expectedCursor - speechCursor) * 0.22
            if (speechCursor > expectedCursor + 6) speechCursor = expectedCursor + 6
          }

          speechCursor = THREE.MathUtils.clamp(speechCursor, 0, Math.max(0, visemeTimeline.length - 1))
        }

        const audioWeights = getAudioVisemeWeights(freqData, audioContext.sampleRate, analyser.fftSize, mouth)
        const textWeights = getRhythmTextVisemeWeights(visemeTimeline, speechCursor, speechCarry)
        const visemeWeights = blendVisemeWeights(audioWeights, textWeights)

        const lipTargets = {}
        if (mouth > 0.045) {
          const jaw = Math.min(0.46, 0.06 + mouth * 0.44)
          lipTargets.JawOpen = jaw
          lipTargets.jawOpen = jaw

          Object.keys(smoothedVisemes).forEach((name) => {
            const targetWeight = visemeWeights[name] || 0
            const factor = targetWeight > smoothedVisemes[name] ? 0.22 : 0.14
            smoothedVisemes[name] += (targetWeight - smoothedVisemes[name]) * factor
            const vowel = Math.min(0.74, (0.24 + mouth * 0.58) * smoothedVisemes[name])
            if (vowel > 0.02) lipTargets[name] = vowel
          })
        } else {
          Object.keys(smoothedVisemes).forEach((name) => {
            smoothedVisemes[name] *= 0.78
          })
        }
        applyStableLipMorphs(lipTargets)
        lipRaf = requestAnimationFrame(update)
      }
      update()
    }

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

    // 紐⑤뜽 濡쒕뱶 ??frameObject媛 怨꾩궛??梨꾩썎?덈떎. 洹??꾧퉴吏?珥덇린媛??ъ슜.
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
      object.position.x += modelOffset[0] || 0
      object.position.y += modelOffset[1] || 0
      object.position.z += modelOffset[2] || 0

      // 3) Fit the camera to the model's actual bounding box so the whole body is
      //    framed and centered regardless of the model's real proportions.
      box = new THREE.Box3().setFromObject(object)
      box.getSize(size)
      box.getCenter(center)
      // Fit by HEIGHT only. Width-fit divides by camera.aspect, which can be a bogus
      // value if the canvas hasn't been laid out yet ??that blows the distance up and
      // makes the model render tiny. Standing characters are height-dominant anyway.
      const fov = THREE.MathUtils.degToRad(camera.fov)
      const safeModelScale = Math.max(0.001, modelScale)
      const fitHeight = size.y / 2 / Math.tan(fov / 2)
      const dist = (fitHeight * FRAME_MARGIN) / safeModelScale
      const targetX = center.x + (modelOffset[0] || 0)
      const targetY = center.y + VERTICAL_OFFSET + (modelOffset[1] || 0)
      const targetZ = modelOffset[2] || 0
      viewPosition = [targetX, targetY, dist + targetZ]
      viewTarget = [targetX, targetY, targetZ]

      resetCamera()
    }

    const clearMotionQueue = () => {
      motionToken += 1
      if (motionTimer) clearTimeout(motionTimer)
      motionTimer = 0
      motionProfile = null
    }

    const startProceduralMotion = (text, options = {}) => {
      motionToken += 1
      if (motionTimer) clearTimeout(motionTimer)
      motionTimer = 0
      motionProfile = buildMotionProfile(text, options.emotion, options.duration)
      console.log('[Character3D Procedural Motion]', motionProfile)
    }

    const applyProceduralMotion = () => {
      if (!motionProfile || !model) return

      const now = performance.now()
      if (now > motionProfile.until) {
        motionProfile = null
        return
      }

      const elapsed = (now - motionProfile.startedAt) / 1000
      const remaining = Math.max(0, (motionProfile.until - now) / 1000)
      const fadeIn = THREE.MathUtils.clamp(elapsed / 0.28, 0, 1)
      const fadeOut = THREE.MathUtils.clamp(remaining / 0.35, 0, 1)
      const amount = motionProfile.intensity * Math.min(fadeIn, fadeOut)
      const tempo = motionProfile.tempo
      const basePosition = model.userData.basePosition
      const baseRotation = model.userData.baseRotation
      if (basePosition) model.position.copy(basePosition)
      if (baseRotation) model.rotation.copy(baseRotation)
      else model.rotation.set(...modelRotation)
      resetMotionBonesToBasePose()

      const breathe = Math.sin(elapsed * tempo * Math.PI * 2 * 0.42) * amount * 0.055 * motionProfile.breathe
      const sway = Math.sin(elapsed * tempo * Math.PI * 2 * 0.28) * amount * 0.095
      const nod = Math.sin(elapsed * tempo * Math.PI * 2 * 0.82) * amount * 0.13 * motionProfile.nod
      const shake = Math.sin(elapsed * tempo * Math.PI * 2 * 1.15) * amount * 0.12 * motionProfile.shake
      const shoulder = Math.sin(elapsed * tempo * Math.PI * 2 * 0.54) * amount * 0.08 * motionProfile.shoulder
      const gesturePhase = (motionProfile.gestureSeed || 0) * 0.013
      const gesturePulse = (0.55 + 0.45 * Math.sin(elapsed * tempo * Math.PI * 2 * 0.72 + gesturePhase)) * amount * motionProfile.handGesture
      const gestureBeat = Math.sin(elapsed * tempo * Math.PI * 2 * 1.08 + gesturePhase) * amount * motionProfile.handGesture
      const gestureSlow = Math.sin(elapsed * tempo * Math.PI * 2 * 0.36 + gesturePhase) * amount * motionProfile.handGesture
      const leftWeight = motionProfile.handSide <= 0 ? 1 : 0.35
      const rightWeight = motionProfile.handSide >= 0 ? 1 : 0.35
      const bob = Math.sin(elapsed * tempo * Math.PI * 2 * 0.5) * amount * 18
      const slide = Math.sin(elapsed * tempo * Math.PI * 2 * 0.24) * amount * 14

      model.position.y += bob
      model.position.x += slide * (motionProfile.sway || 1) * 0.35
      model.rotation.x += motionProfile.lean * amount * 1.8 + breathe
      model.rotation.z += (motionProfile.sway || 1) * sway * 0.9

      if (motionBones.spine) {
        motionBones.spine.rotation.x += motionProfile.lean * amount * 0.8 + breathe
        motionBones.spine.rotation.z += (motionProfile.sway || 1) * sway * 0.5
      }
      if (motionBones.chest) {
        motionBones.chest.rotation.x += motionProfile.lean * amount * 0.55 + breathe * 1.5
        motionBones.chest.rotation.z += (motionProfile.sway || 1) * sway * 0.65
      }
      if (motionBones.neck) {
        motionBones.neck.rotation.x += nod * 0.45
        motionBones.neck.rotation.y += shake * 0.45
      }
      if (motionBones.head) {
        motionBones.head.rotation.x += nod
        motionBones.head.rotation.y += shake
        motionBones.head.rotation.z += (motionProfile.sway || 1) * sway * 0.32
      }
      if (motionBones.leftShoulder) motionBones.leftShoulder.rotation.z += shoulder
      if (motionBones.rightShoulder) motionBones.rightShoulder.rotation.z -= shoulder

      switch (motionProfile.gestureStyle) {
        case 'question':
          addBoneRotation(motionBones.leftUpperArm, -0.2 * amount, 0.12 * gestureSlow, 0.34 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.34 * amount, -0.18 * gestureSlow, -0.54 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.12 * amount, 0.1 * gestureBeat, 0.16 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.38 * amount, 0.58 * amount - 0.16 * gestureBeat, -0.38 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.18 * gestureBeat, 0.16 * gesturePulse, 0.12 * gestureSlow)
          addBoneRotation(motionBones.rightHand, 0.34 * gestureBeat, 0.78 * amount - 0.2 * gesturePulse, 0.28 * amount - 0.3 * gestureSlow)
          break
        case 'point':
          addBoneRotation(motionBones.rightUpperArm, -0.72 * amount, -0.26 * amount, -0.36 * amount)
          addBoneRotation(motionBones.rightForeArm, -0.5 * amount, -0.08 * gestureBeat, -0.2 * gesturePulse)
          addBoneRotation(motionBones.rightHand, 0.08 * gestureBeat, -0.18 * amount, -0.08 * gestureSlow)
          addBoneRotation(motionBones.leftUpperArm, -0.16 * amount, 0.08 * gestureBeat, 0.18 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.08 * amount, 0, 0.1 * gestureSlow)
          break
        case 'deny':
          addBoneRotation(motionBones.leftUpperArm, -0.18 * amount, 0.08 * gestureBeat, 0.4 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.22 * amount, -0.08 * gestureBeat, -0.4 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.2 * amount, 0.2 * gestureBeat, 0.34 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.2 * amount, -0.2 * gestureBeat, -0.34 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.12 * gestureBeat, 0.32 * gesturePulse, 0.22 * gestureSlow)
          addBoneRotation(motionBones.rightHand, 0.12 * gestureBeat, -0.32 * gesturePulse, -0.22 * gestureSlow)
          break
        case 'greet':
          addBoneRotation(motionBones.rightUpperArm, -0.46 * amount, -0.18 * gestureSlow, -0.68 * amount)
          addBoneRotation(motionBones.rightForeArm, -0.62 * amount, 0.45 * amount - 0.12 * gestureBeat, -0.42 * gesturePulse)
          addBoneRotation(motionBones.rightHand, 0.5 * gestureBeat, 0.6 * amount - 0.3 * gesturePulse, 0.22 * amount - 0.28 * gestureBeat)
          addBoneRotation(motionBones.leftUpperArm, -0.2 * amount, 0.08 * gestureSlow, 0.22 * amount)
          break
        case 'command':
          addBoneRotation(motionBones.rightUpperArm, -0.82 * amount, -0.2 * gesturePulse, -0.28 * amount)
          addBoneRotation(motionBones.rightForeArm, -0.52 * amount, -0.12 * gestureBeat, -0.18 * gesturePulse)
          addBoneRotation(motionBones.rightHand, -0.1 * gestureBeat, -0.2 * amount, -0.08 * gestureSlow)
          addBoneRotation(motionBones.leftUpperArm, -0.16 * amount, 0.06 * gestureBeat, 0.2 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.1 * amount, 0, 0.08 * gestureSlow)
          break
        case 'thinking':
          addBoneRotation(motionBones.leftUpperArm, -0.28 * amount, 0.1 * gestureSlow, 0.3 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.18 * amount, -0.08 * gestureSlow, -0.18 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.34 * amount, 0.04 * gestureBeat, 0.16 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.1 * amount, -0.04 * gestureBeat, -0.1 * gestureSlow)
          addBoneRotation(motionBones.leftHand, 0.22 * gestureBeat, 0.12 * gesturePulse, 0.18 * gestureSlow)
          break
        case 'present':
          addBoneRotation(motionBones.leftUpperArm, -0.38 * amount, 0.14 * gestureSlow, 0.48 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.38 * amount, -0.14 * gestureSlow, -0.48 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.34 * amount, 0.18 * gestureBeat, 0.28 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.34 * amount, 0.62 * amount - 0.18 * gestureBeat, -0.28 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.2 * gestureBeat, 0.22 * gesturePulse, 0.22 * gestureSlow)
          addBoneRotation(motionBones.rightHand, 0.2 * gestureBeat, 0.76 * amount - 0.18 * gesturePulse, 0.34 * amount - 0.22 * gestureSlow)
          break
        default:
          addBoneRotation(motionBones.leftUpperArm, -0.34 * amount, 0.14 * gestureBeat, 0.36 * amount)
          addBoneRotation(motionBones.rightUpperArm, -2.65 * amount, -0.42 * gestureSlow, -2.05 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.22 * amount, 0.08 * gestureBeat, 0.2 * gestureSlow)
          addBoneRotation(motionBones.rightForeArm, -1.85 * amount, 1.05 * amount - 0.26 * gestureBeat, -0.74 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.18 * gestureBeat, 0.12 * gesturePulse, 0.18 * gestureSlow)
          addBoneRotation(motionBones.rightHand, 0.46 * gestureBeat, 1.2 * amount - 0.28 * gesturePulse, 0.55 * amount - 0.3 * gestureSlow)
      }
    }

    const playAnimation = (name = 'talk', options = {}) => {
      if (!mixer) return
      const clip = clips.get(name) || clips.get('talk') || clips.get('idle') || clips.get('embedded')
      if (!clip) return

      const action = mixer.clipAction(clip)
      action.reset()
      action.enabled = true
      action.setEffectiveWeight(1)
      action.setEffectiveTimeScale(options.timeScale ?? 1)

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

      if (name !== 'idle' && options.returnToIdle !== false) {
        const backToIdle = (event) => {
          if (event.action === action) {
            mixer.removeEventListener('finished', backToIdle)
            playAnimation('idle', { loop: true, fade: 0.35 })
          }
        }
        mixer.addEventListener('finished', backToIdle)
      }

      return { action, clip }
    }

    const playMotionSequence = (textOrEmotion, options = {}) => {
      startProceduralMotion(textOrEmotion, options)
    }

    const playDirectAnimation = (name = 'talk', options = {}) => {
      clearMotionQueue()
      return playAnimation(name, options)
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
        // Render once with the idle pose applied before showing, avoiding a T-pose flash.
        mixer?.update(0)
        captureMotionBoneBasePose()
        model.visible = true
      }
    }

    const loadAnimations = async () => {
      // Load idle first so we can start it (and reveal the model) before the rest stream in.
      const entries = Object.entries(animations)
        .filter(([name]) => name === 'idle')
        .sort(([a]) => (a === 'idle' ? -1 : 0))
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
      if (!currentAction) playAnimation('idle', { loop: true, fade: 0.2 })
      revealModel()
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
        modelRoot = root
        model = new THREE.Group()
        model.add(modelRoot)
        model.rotation.set(...modelRotation)
        normalizeModel(modelRoot)
        collectMorphMeshes(modelRoot)
        collectMotionBones(modelRoot)
        model.visible = false // Keep hidden until the idle pose is applied (prevents a T-pose flash).
        scene.add(model)
        frameObject(model)
        model.userData.basePosition = model.position.clone()
        model.userData.baseRotation = model.rotation.clone()
        mixer = new THREE.AnimationMixer(modelRoot)

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
      applyProceduralMotion()
      controls?.update()
      renderer?.render(scene, camera)
    }
    tick()

    window.playLinAnimation = playDirectAnimation
    window.playLinEmotion = (textOrEmotion) => {
      if (clips.has(textOrEmotion)) playDirectAnimation(textOrEmotion)
      else playMotionSequence(textOrEmotion)
    }
    window.playLinPerformance = (text, emotion, duration) => {
      playMotionSequence(text, { emotion, duration, endAnimation: 'idle' })
    }
    window.startLinLipSync = startAudioLipSync
    window.stopLinLipSync = stopAudioLipSync
    window.__debugLinMorph = () => {
      console.log('morphMeshes:', morphMeshes.length)
      morphMeshes.forEach((mesh) => console.log(mesh.name, mesh.morphTargetDictionary, mesh.morphTargetInfluences))
    }
    window.__testMorph = (name, value = 1) => {
      resetMorphs()
      setMorph(name, value)
      console.log('test morph:', name, value)
    }

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      clearMotionQueue()
      if (window.playLinAnimation === playDirectAnimation) delete window.playLinAnimation
      if (window.playLinEmotion) delete window.playLinEmotion
      if (window.playLinPerformance) delete window.playLinPerformance
      if (window.startLinLipSync === startAudioLipSync) delete window.startLinLipSync
      if (window.stopLinLipSync === stopAudioLipSync) delete window.stopLinLipSync
      if (window.__debugLinMorph) delete window.__debugLinMorph
      if (window.__testMorph) delete window.__testMorph
      stopAudioLipSync()
      controls?.dispose()
      envTexture?.dispose()
      pmrem?.dispose()
      renderer?.dispose()
      if (renderer?.domElement?.parentNode === host) host.removeChild(renderer.domElement)
    }
  }, [modelPath, animations, modelRotation, modelScale, modelOffset])

  return (
    <div className="character3d">
      <div ref={hostRef} className="character3d-canvas" />
    </div>
  )
}


