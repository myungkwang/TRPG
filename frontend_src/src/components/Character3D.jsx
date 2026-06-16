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

// 카메라는 모델 바운딩 박스를 기준으로 자동 프레이밍된다(frameObject 참고).
// 아래 값들은 모델 로드 전 초기값일 뿐이며, 로드 후 자동으로 덮어써진다.
const CAMERA_POSITION = [0, 400, 900] // 초기 카메라 위치 [x, y, z]
const CAMERA_TARGET = [0, 400, 0] // 초기 카메라가 바라보는 지점 [x, y, z]
// 캐릭터를 화면에 맞추는 여백 배수. 작을수록 카메라가 가까워져 더 크게 보인다.
const FRAME_MARGIN = 0.6
// 카메라 타깃을 위로 올려 캐릭터를 화면 아래쪽에 배치하는 값. 클수록 더 아래로 내려간다.
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
// 중성(21) → 입술 모양 viseme. ㅓ/ㅕ는 uh(어), ㅡ/ㅢ는 eu(으), ㅟ는 sh(쉬)로 분리한다.
// 순서: ㅏㅐㅑㅒ ㅓㅔㅕㅖ ㅗㅘㅙㅚ ㅛㅜㅝㅞ ㅟㅠㅡㅢ ㅣ
const JUNGSEONG_TO_VISEME = [
  'aa_viseme', 'eh_viseme', 'aa_viseme', 'eh_viseme',
  'uh_viseme', 'eh_viseme', 'uh_viseme', 'eh_viseme',
  'oh_viseme', 'oh_viseme', 'oo_viseme', 'oo_viseme',
  'oh_viseme', 'oo_viseme', 'oo_viseme', 'oo_viseme',
  'sh_viseme', 'oo_viseme', 'eu_viseme', 'eu_viseme',
  'ee_viseme',
]
// 양순음(입술을 다무는 자음) 인덱스. 초성: ㅁ6 ㅂ7 ㅃ8 ㅍ17 / 종성: ㅁ16 ㅂ17 ㅄ18 ㅍ26
const BILABIAL_CHO = new Set([6, 7, 8, 17])
const BILABIAL_JONG = new Set([16, 17, 18, 26])
// 치찰음(ㅅㅆㅈㅉㅊ) 인덱스. 입을 좁히는 모양이라 eu(으)로 근사한다.
// 초성: ㅅ9 ㅆ10 ㅈ12 ㅉ13 ㅊ14 / 종성: ㅅ19 ㅆ20 ㅈ22 ㅊ23
const SIBILANT_CHO = new Set([9, 10, 12, 13, 14])
const SIBILANT_JONG = new Set([19, 20, 22, 23])

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
  if (/[oO]/.test(char)) return 'oh_viseme'
  if (/[uU]/.test(char)) return 'oo_viseme'
  return 'JawOpen'
}

// 한글 한 글자를 초성/중성/종성으로 분해. 한글이 아니면 null.
function decomposeHangul(code) {
  if (code < HANGUL_BASE || code > HANGUL_END) return null
  const s = code - HANGUL_BASE
  return {
    cho: Math.floor(s / (JUNGSEONG_COUNT * JONGSEONG_COUNT)),
    jung: Math.floor(s / JONGSEONG_COUNT) % JUNGSEONG_COUNT,
    jong: s % JONGSEONG_COUNT, // 0 = 받침 없음
  }
}

// 한 글자 → viseme 이벤트열. 양순 초성/받침은 입을 다무는 폐쇄(close) 프레임으로 끼운다.
function syllableToVisemeEvents(char) {
  const d = decomposeHangul(char.charCodeAt(0))
  if (!d) return [{ viseme: guessVisemeFromChar(char), close: false }]

  const events = []
  // 초성: 양순음(ㅁㅂㅍ)은 입 다묾(폐쇄), 치찰음(ㅅㅈㅊ)은 입을 좁히는 eu로 근사.
  if (BILABIAL_CHO.has(d.cho)) events.push({ viseme: 'viseme_PP', close: true })
  else if (SIBILANT_CHO.has(d.cho)) events.push({ viseme: 'eu_viseme', close: false })
  events.push({ viseme: JUNGSEONG_TO_VISEME[d.jung] || 'aa_viseme', close: false })
  // 종성(받침): 양순음은 폐쇄, 치찰 받침은 eu로 입모양을 만든다.
  if (BILABIAL_JONG.has(d.jong)) events.push({ viseme: 'viseme_PP', close: true })
  else if (SIBILANT_JONG.has(d.jong)) events.push({ viseme: 'eu_viseme', close: false })
  return events
}

function makeVisemeTimeline(text, duration) {
  const chars = Array.from(String(text || '').replace(/\s+/g, '')).filter(Boolean)
  if (!chars.length || !duration || !Number.isFinite(duration)) return []

  // 자음 폐쇄는 짧게(0.4), 모음은 길게(1.0) 시간을 배분한다.
  const events = chars.flatMap(syllableToVisemeEvents)
  const totalWeight = events.reduce((sum, e) => sum + (e.close ? 0.4 : 1), 0) || 1
  let t = 0
  return events.map((e) => {
    const step = (duration / totalWeight) * (e.close ? 0.4 : 1)
    const frame = { time: t, step, viseme: e.viseme, close: !!e.close }
    t += step
    return frame
  })
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
    oo_viseme: Math.max(0, low * 1.18 + lowMid * 0.18 - mid * 0.10 - high * 0.24),
  }

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0)
  if (total <= 0.0001) return {}

  return Object.fromEntries(
    Object.entries(scores).map(([name, value]) => [name, value / total]),
  )
}

function blendVisemeWeights(audioWeights, textWeights) {
  const names = ['aa_viseme', 'eh_viseme', 'ee_viseme', 'oh_viseme', 'oo_viseme', 'eu_viseme', 'uh_viseme', 'sh_viseme']
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
  const cur = sequence[index]
  const nxt = sequence[Math.min(index + 1, sequence.length - 1)]
  const blend = smoothStep(0.42, 0.92, carry)
  const weights = {}

  // 폐쇄 프레임은 viseme_PP(입 다묾)로, 모음 프레임은 해당 viseme으로 누적한다.
  const add = (frame, amt) => {
    if (!frame || amt <= 0) return
    const key = frame.close ? 'viseme_PP' : frame.viseme
    if (key && key !== 'JawOpen') weights[key] = (weights[key] || 0) + amt
  }
  add(cur, 1 - blend)
  if (nxt !== cur) add(nxt, blend)

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
  if (flags.surprised) return 'surprise'
  if (flags.angry || flags.emphatic) return 'command'
  if (flags.negative) return 'deny'
  if (flags.happy) return 'greet'
  if (flags.pledge) return 'hand_to_chest'
  if (flags.wary) return 'cautious'
  if (flags.sly) return 'smug'
  if (flags.question) return 'question'
  if (flags.thoughtful) return 'thinking'
  if (flags.confident) return 'present'
  if (hasAny(text, ['여기', '저기', '저쪽', '이곳', '보십시오', '봐', '확인'])) return 'point'
  if (flags.openHand) return 'open_hand'
  if (flags.presenting) return 'present'
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
  const surprised = hasAny(text, ['뭐', '설마', '정말', '갑자기', '놀라', '어떻게', '말도 안', '믿을 수'])
  const pledge = hasAny(text, ['고맙', '미안', '부탁', '약속', '믿어', '맡겨', '괜찮', '도와'])
  const wary = hasAny(text, ['조심', '쉿', '낮게', '천천히', '위험해', '들키', '숨어', '기다려'])
  const gestureSeed = Math.abs(Array.from(String(text || '')).reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 997
  const neutralTalk = direct === 'talk' && !angry && !negative && !happy && !thoughtful && !confident && !surprised && !pledge && !wary && !sly
  const openHand = neutralTalk && (
    hasAny(text, ['그러니까', '말하자면', '예를 들면', '보시면', '이렇게', '자']) ||
    gestureSeed % 4 === 0
  )
  const presenting = neutralTalk && !openHand && gestureSeed % 4 === 1
  const gestureStyle = detectGestureStyle(text, {
    angry, confident, emphatic, happy, negative, openHand, pledge, presenting, question, sly, surprised, thoughtful, wary,
  })

  let intensity = 0.48
  if (happy || confident || pledge) intensity += 0.1
  if (angry || surprised) intensity += 0.2
  if (thoughtful || wary || sly) intensity += 0.08
  if (tired) intensity -= 0.05

  return {
    until: performance.now() + seconds * 1000,
    startedAt: performance.now(),
    duration: seconds,
    intensity: THREE.MathUtils.clamp(intensity, 0.36, 0.92),
    tempo: THREE.MathUtils.clamp(0.92 + String(text || '').length / 130, 0.82, 1.48),
    lean: angry ? 0.1 : surprised ? -0.08 : tired ? -0.05 : confident ? 0.055 : wary ? -0.035 : 0.025,
    sway: negative ? -1 : sly ? 1 : 0,
    nod: confident ? 0.95 : pledge ? 0.65 : question ? 0.32 : angry ? 0.46 : 0.22,
    shake: negative ? 0.9 : angry ? 0.36 : surprised ? 0.18 : 0,
    shoulder: surprised ? 0.65 : angry ? 0.55 : happy ? 0.42 : tired ? -0.18 : 0.24,
    handGesture: THREE.MathUtils.clamp((angry ? 1.05 : surprised ? 0.96 : happy ? 0.9 : thoughtful ? 0.78 : confident ? 0.86 : 0.82), 0.62, 1.08),
    handSide: negative ? -1 : sly || question ? 1 : 0,
    gestureStyle,
    gestureSeed,
    breathe: tired ? 1.25 : angry ? 0.9 : 1,
  }
}

export default function Character3D({
  modelPath = DEFAULT_MODEL_PATH,
  animations = DEFAULT_ANIMATIONS,
  modelRotation = DEFAULT_MODEL_ROTATION,
  modelScale = DEFAULT_MODEL_SCALE,
  modelOffset = DEFAULT_MODEL_OFFSET,
  preferEmbeddedAnimations = false,
  motionIntensity = 1,
  disableProceduralMotion = false,
  cameraPosition = null,
  cameraTarget = null,
  cameraFov = 50,
  framingOffsetY = 0,
  framingScale = 1,
  registerGlobalControls = false,
  lipGain = 1,
  hideTeeth = false,
}) {
  const hostRef = useRef(null)
  const lipApiRef = useRef(null)
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
      oo_viseme: 0,
      viseme_PP: 0,
      mouthClose: 0,
      mouthPucker: 0,
      mouthFunnel: 0,
      mouthSmile_L: 0,
      mouthSmile_R: 0,
    }
    let smoothedVisemes = {
      aa_viseme: 0,
      eh_viseme: 0,
      ee_viseme: 0,
      oh_viseme: 0,
      oo_viseme: 0,
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

    // 코드가 쓰는 표준 viseme 이름 ↔ 실제 모델 shape key 이름의 차이를 흡수한다.
    // - viseme_PP(양순음 입 다묾)는 모든 모델에서 mbp_viseme 로 들어가 있다.
    // - Lin 모델의 'ㅗ/오'는 Blender 중복명 때문에 oh_viseme.001 로 들어가 있다.
    // 후보를 앞에서부터 찾아 처음 존재하는 이름 하나에만 적용한다.
    const MORPH_ALIASES = {
      viseme_PP: ['viseme_PP', 'mbp_viseme'],
      oh_viseme: ['oh_viseme', 'oh_viseme.001'],
    }
    const setMorph = (name, value) => {
      const candidates = MORPH_ALIASES[name] || [name]
      morphMeshes.forEach((mesh) => {
        const dict = mesh.morphTargetDictionary
        if (!dict) return
        for (const n of candidates) {
          const index = dict[n]
          if (index !== undefined) {
            mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1)
            break
          }
        }
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
        oo_viseme: 0,
        eu_viseme: 0,
        uh_viseme: 0,
        sh_viseme: 0,
        viseme_PP: 0,
        mouthClose: 0,
        mouthPucker: 0,
        mouthFunnel: 0,
        mouthSmile_L: 0,
        mouthSmile_R: 0,
      }
      smoothedVisemes = {
        aa_viseme: 0,
        eh_viseme: 0,
        ee_viseme: 0,
        oh_viseme: 0,
        oo_viseme: 0,
        eu_viseme: 0,
        uh_viseme: 0,
        sh_viseme: 0,
      }
    }

    const CLOSURE_KEYS = new Set(['viseme_PP', 'mbp_viseme', 'mouthClose'])
    const applyStableLipMorphs = (targets, amount = 1) => {
      Object.keys(lipMorphState).forEach((name) => {
        const targetValue = (targets[name] || 0) * amount
        const currentValue = lipMorphState[name]
        // 입 다묾(폐쇄)은 또렷하게 보이도록 더 빠르게 붙였다 뗀다.
        const fast = CLOSURE_KEYS.has(name)
        const factor = targetValue > currentValue
          ? (fast ? 0.6 : 0.36)
          : (fast ? 0.45 : 0.26)
        lipMorphState[name] += (targetValue - currentValue) * factor
        if (Math.abs(lipMorphState[name]) < 0.004) lipMorphState[name] = 0
        setMorph(name, lipMorphState[name])
      })
    }

    // 양순음 폐쇄 강도를 입 다묾 shape(viseme_PP/mbp_viseme/mouthClose)로 변환한다.
    // 모델마다 폐쇄 shape 이름이 다르므로(GM_v3_17은 mbp_viseme) 호환 위해 모두 세팅한다.
    const closureTargets = (closeAmt) => {
      const t = {}
      if (closeAmt > 0.01) {
        t.viseme_PP = closeAmt
        t.mbp_viseme = closeAmt
        t.mouthClose = closeAmt * 0.9
      }
      return t
    }

    // 모음 가중치에서 입술의 둥글림(pucker/funnel)·좌우당김(smile)을 파생해 자연스러움을 더한다.
    const applyAuxShapes = (targets, gate = 1) => {
      const oo = targets.oo_viseme || 0
      const oh = targets.oh_viseme || 0
      const ee = targets.ee_viseme || 0
      const eh = targets.eh_viseme || 0
      const pucker = Math.min(0.72, oo * 1.0 + oh * 0.55) * gate
      const funnel = Math.min(0.55, oh * 0.7 + oo * 0.35) * gate
      const smile = Math.min(0.5, ee * 1.0 + eh * 0.45) * gate
      if (pucker > 0.02) targets.mouthPucker = pucker
      if (funnel > 0.02) targets.mouthFunnel = funnel
      if (smile > 0.02) { targets.mouthSmile_L = smile; targets.mouthSmile_R = smile }
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
      // 이 발화의 소스 노드만 분리한다. AudioContext/analyser는 닫지 않고 다음 발화에서 재사용한다.
      // (발화마다 new AudioContext + close 하면 두 번째 컨텍스트가 suspended/한도 문제로
      //  analyser 데이터를 못 받아 "두 번째 TTS부터 입이 안 움직이는" 버그가 났다.)
      if (audioSource) { try { audioSource.disconnect() } catch {} ; audioSource = null }
    }

    // AudioContext와 analyser를 인스턴스당 1개만 만들어 발화 간 재사용한다.
    // 매 발화 직전 호출해 suspended 상태면 resume 한다(자동재생 정책 대응).
    const ensureAudioGraph = () => {
      if (!audioContext) {
        const Ctor = window.AudioContext || window.webkitAudioContext
        audioContext = new Ctor()
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.72
        analyser.connect(audioContext.destination)
      }
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})
    }

    const startFallbackLipSync = (text = '', duration = 1.8) => {
      stopAudioLipSync()
      // morphMeshes가 아직 비어 있어도(모델 로드 중) 시작한다. 로드되면 루프가 이어받는다.

      const seconds = Math.max(0.8, Number.isFinite(duration) ? duration : Array.from(String(text || '')).length * 0.08)
      const startedAt = performance.now()
      visemeTimeline = makeVisemeTimeline(text, seconds)
      resetLipState()

      const update = () => {
        const elapsed = (performance.now() - startedAt) / 1000
        const remaining = seconds - elapsed
        if (remaining <= 0) {
          applyStableLipMorphs({})
          lipRaf = requestAnimationFrame(() => stopAudioLipSync())
          return
        }

        const pulse = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2 * 5.8)
        const phrase = 0.72 + 0.28 * Math.sin(elapsed * Math.PI * 2 * 1.35)
        const endFade = THREE.MathUtils.clamp(remaining / 0.18, 0, 1)
        const mouth = (0.16 + pulse * 0.32) * phrase * endFade
        const cursor = visemeTimeline.length
          ? (elapsed / seconds) * Math.max(0, visemeTimeline.length - 1)
          : 0
        const carry = cursor % 1
        const visemeWeights = getRhythmTextVisemeWeights(visemeTimeline, cursor, carry)
        // 양순음 폐쇄 구간엔 턱·모음을 닫는다(openGate).
        const closeAmt = visemeWeights.mbp_viseme || 0
        const openGate = 1 - closeAmt
        const lipTargets = closureTargets(closeAmt)
        const jaw = Math.min(0.48, mouth * 1.15) * openGate
        lipTargets.JawOpen = jaw

        Object.keys(smoothedVisemes).forEach((name) => {
          const targetWeight = visemeWeights[name] || 0
          const factor = targetWeight > smoothedVisemes[name] ? 0.34 : 0.22
          smoothedVisemes[name] += (targetWeight - smoothedVisemes[name]) * factor
          const vowel = Math.min(lipGain > 1 ? 0.95 : 0.72, (0.26 + mouth * 0.8) * smoothedVisemes[name] * lipGain) * openGate
          if (vowel > 0.02) lipTargets[name] = vowel
        })
        applyAuxShapes(lipTargets, openGate)

        applyStableLipMorphs(lipTargets)
        lipRaf = requestAnimationFrame(update)
      }

      update()
    }

    const startAudioLipSync = (audio, text = '') => {
      stopAudioLipSync()
      // 모델 GLB가 아직 로드 중이어도(morphMeshes 비어도) 포기하지 않는다.
      // analyser+RAF 루프는 시작해 두고, morphMeshes가 채워지는 순간부터 입이 이어붙는다.
      // (GM 팝업처럼 발화 시점에 18MB 모델을 막 로드하는 경우의 레이스 대응)
      if (!audio) return

      const fallbackDuration = Math.max(1, Array.from(String(text || '')).length * 0.08)
      ensureAudioGraph()
      try {
        audioSource = audioContext.createMediaElementSource(audio)
      } catch {
        // 같은 audio 요소로 이미 소스를 만든 경우 등. 분석은 못 하지만 오디오 재생엔 영향 없음.
        return
      }
      audioSource.connect(analyser)

      visemeTimeline = makeVisemeTimeline(text, Number.isFinite(audio.duration) ? audio.duration : fallbackDuration)
      const timeData = new Uint8Array(analyser.fftSize)
      const freqData = new Uint8Array(analyser.frequencyBinCount)
      lastLipClock = audioContext.currentTime

      // [평가용·립싱크 §5-B] window.__LIPSYNC_LOG__=true 일 때만 프레임별 입벌림 값을 기록한다.
      // window.__lipsyncDump('이름') 로 {fps, frames:[{t,mouth}]} JSON 을 내려받아 lipsync_eval.py 에 넣는다.
      if (typeof window !== 'undefined' && window.__LIPSYNC_LOG__) {
        window.__lipsyncFrames = []
        if (!window.__lipsyncDump) {
          window.__lipsyncDump = (name = 'lipsync') => {
            const frames = window.__lipsyncFrames || []
            const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0
            const fps = span > 0 ? (frames.length - 1) / span : 30
            const blob = new Blob([JSON.stringify({ name, fps, frames }, null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `${name}.json`
            a.click()
            return { name, fps, frames: frames.length }
          }
        }
      }

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
        const factor = target > smoothedMouth ? 0.36 : 0.22
        smoothedMouth += (target - smoothedMouth) * factor

        const remaining = audio.duration ? audio.duration - audio.currentTime : 1
        const endFade = THREE.MathUtils.clamp(remaining / 0.16, 0, 1)
        const mouth = Math.min(0.85, Math.pow(smoothedMouth * 1.05, 0.95)) * endFade
        const now = audioContext.currentTime
        const dt = THREE.MathUtils.clamp(now - lastLipClock, 0, 0.05)
        lastLipClock = now

        if (typeof window !== 'undefined' && window.__LIPSYNC_LOG__ && window.__lipsyncFrames) {
          window.__lipsyncFrames.push({ t: +audio.currentTime.toFixed(4), mouth: +mouth.toFixed(4) })
        }

        if (mouth > 0.045 && visemeTimeline.length) {
          const spokenRate = 5.6 + mouth * 3.2
          speechCarry += dt * spokenRate * (0.55 + mouth * 0.45)
          speechCursor += Math.floor(speechCarry)
          speechCarry %= 1

          if (audio.duration && Number.isFinite(audio.duration)) {
            const expectedCursor = (audio.currentTime / audio.duration) * Math.max(0, visemeTimeline.length - 1)
            // 매 프레임 오디오 재생 위치 쪽으로 끌어당겨 긴 문장에서 누적 드리프트를 막는다.
            // (예전엔 ±4~6 프레임 벗어날 때만 약하게 보정해, 긴 대사 후반부가 오디오와 어긋났다.)
            speechCursor += (expectedCursor - speechCursor) * 0.25
            if (Math.abs(speechCursor - expectedCursor) > 4) speechCursor = expectedCursor
          }

          speechCursor = THREE.MathUtils.clamp(speechCursor, 0, Math.max(0, visemeTimeline.length - 1))
        }

        const audioWeights = getAudioVisemeWeights(freqData, audioContext.sampleRate, analyser.fftSize, mouth)
        const textWeights = getRhythmTextVisemeWeights(visemeTimeline, speechCursor, speechCarry)
        const visemeWeights = blendVisemeWeights(audioWeights, textWeights)

        // 양순음(ㅁ/ㅂ/ㅍ) 폐쇄는 오디오 진폭과 무관하게 텍스트 기준으로 적용한다.
        const closeAmt = textWeights.viseme_PP || 0
        const openGate = 1 - closeAmt
        const lipTargets = closureTargets(closeAmt)
        if (mouth > 0.045) {
          // 턱 개방은 lipGain 영향을 받지 않는다(원래 강도 유지). lipGain은 모음/입술 모양에만 적용.
          const jaw = Math.min(0.55, 0.08 + mouth * 0.5) * openGate
          lipTargets.JawOpen = jaw

          Object.keys(smoothedVisemes).forEach((name) => {
            const targetWeight = visemeWeights[name] || 0
            const factor = targetWeight > smoothedVisemes[name] ? 0.34 : 0.22
            smoothedVisemes[name] += (targetWeight - smoothedVisemes[name]) * factor
            // 모델별 입 강도 보정(lipGain): viseme 셰이프가 약한 모델(예: Lin)을 키운다. GM/기본=1.
            const vowel = Math.min(lipGain > 1 ? 1.0 : 0.9, (0.3 + mouth * 0.7) * smoothedVisemes[name] * lipGain) * openGate
            if (vowel > 0.02) lipTargets[name] = vowel
          })
          applyAuxShapes(lipTargets, openGate)
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

    // 모델 로드 후 frameObject가 계산해 채운다. 그 전까지는 초기값을 사용.
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
      const safeModelScale = Math.max(0.001, modelScale)
      object.scale.setScalar((500 / maxDim) * safeModelScale)

      // 2) Recompute after scaling and rest the model's feet on y=0, centered on x/z.
      box = new THREE.Box3().setFromObject(object)
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)
      object.position.x -= center.x
      object.position.z -= center.z
      object.position.y -= box.min.y
      const offsetX = modelOffset[0] || 0
      const offsetY = modelOffset[1] || 0
      const offsetZ = modelOffset[2] || 0
      object.position.x += offsetX
      object.position.y += offsetY
      object.position.z += offsetZ

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
      const safeFramingScale = Math.max(0.1, framingScale || 1)
      const dist = (fitHeight * FRAME_MARGIN) / safeModelScale / safeFramingScale
      const targetX = center.x - offsetX
      const targetY = center.y - offsetY + VERTICAL_OFFSET + framingOffsetY
      const targetZ = center.z - offsetZ
      if (cameraPosition && cameraTarget) {
        // 팝업처럼 명시적 카메라를 준 경우: 자동 프레이밍으로 덮어쓰지 않고 그 값을 사용
        // (모델 스케일/위치 정규화는 위에서 그대로 적용됨)
        viewPosition = [...cameraPosition]
        viewTarget = [...cameraTarget]
      } else {
        viewPosition = [targetX, targetY, dist + targetZ]
        viewTarget = [targetX, targetY, targetZ]
      }

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
      if (disableProceduralMotion) {
        motionProfile = null
        return null
      }
      motionProfile = buildMotionProfile(text, options.emotion, options.duration)
      console.log('[Character3D Procedural Motion]', motionProfile)
      return motionProfile
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
      const fadeIn = smoothStep(0, 0.38, elapsed)
      const fadeOut = smoothStep(0, 0.5, remaining)
      const amount = motionProfile.intensity * Math.min(fadeIn, fadeOut) * motionIntensity
      const tempo = motionProfile.tempo
      const basePosition = model.userData.basePosition
      const baseRotation = model.userData.baseRotation
      if (basePosition) model.position.copy(basePosition)
      if (baseRotation) model.rotation.copy(baseRotation)
      else model.rotation.set(...modelRotation)
      resetMotionBonesToBasePose()

      const gesturePhase = (motionProfile.gestureSeed || 0) * 0.013
      const breathe = Math.sin(elapsed * tempo * Math.PI * 2 * 0.34) * amount * 0.06 * motionProfile.breathe
      const sway = Math.sin(elapsed * tempo * Math.PI * 2 * 0.22) * amount * 0.09
      const turn = Math.sin(elapsed * tempo * Math.PI * 2 * 0.31 + gesturePhase) * amount * 0.09
      const nod = Math.sin(elapsed * tempo * Math.PI * 2 * 0.58) * amount * 0.13 * motionProfile.nod
      const shake = Math.sin(elapsed * tempo * Math.PI * 2 * 0.82) * amount * 0.11 * motionProfile.shake
      const shoulder = Math.sin(elapsed * tempo * Math.PI * 2 * 0.42) * amount * 0.085 * motionProfile.shoulder
      const gesturePulse = (0.58 + 0.42 * Math.sin(elapsed * tempo * Math.PI * 2 * 0.46 + gesturePhase)) * amount * motionProfile.handGesture
      const gestureBeat = Math.sin(elapsed * tempo * Math.PI * 2 * 0.72 + gesturePhase) * amount * motionProfile.handGesture
      const gestureSlow = Math.sin(elapsed * tempo * Math.PI * 2 * 0.24 + gesturePhase) * amount * motionProfile.handGesture
      const leftWeight = motionProfile.handSide <= 0 ? 1 : 0.35
      const rightWeight = motionProfile.handSide >= 0 ? 1 : 0.35
      const bob = Math.sin(elapsed * tempo * Math.PI * 2 * 0.36) * amount * 13
      const slide = Math.sin(elapsed * tempo * Math.PI * 2 * 0.18) * amount * 11

      model.position.y += bob
      model.position.x += slide * (motionProfile.sway || 1) * 0.35
      model.rotation.x += motionProfile.lean * amount * 1.6 + breathe
      model.rotation.y += turn
      model.rotation.z += (motionProfile.sway || 1) * sway * 0.75

      if (motionBones.spine) {
        motionBones.spine.rotation.x += motionProfile.lean * amount * 0.75 + breathe
        motionBones.spine.rotation.y += turn * 0.55
        motionBones.spine.rotation.z += (motionProfile.sway || 1) * sway * 0.5
      }
      if (motionBones.chest) {
        motionBones.chest.rotation.x += motionProfile.lean * amount * 0.62 + breathe * 1.35
        motionBones.chest.rotation.y += turn * 0.7
        motionBones.chest.rotation.z += (motionProfile.sway || 1) * sway * 0.58
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

      const talkStyles = ['talk_beat', 'talk_left', 'open_hand', 'talk_both', 'present', 'explain']
      const conversational = ['open_hand', 'present', 'explain'].includes(motionProfile.gestureStyle)
      const phrasePeriod = 1.85
      const phraseIndex = Math.floor((elapsed + (motionProfile.gestureSeed % 17) * 0.07) / phrasePeriod)
      const phraseLocal = ((elapsed + (motionProfile.gestureSeed % 17) * 0.07) / phrasePeriod) % 1
      const phraseEase = smoothStep(0, 0.18, phraseLocal) * smoothStep(0, 0.18, 1 - phraseLocal)
      const effectiveGestureStyle = conversational
        ? talkStyles[(phraseIndex + motionProfile.gestureSeed) % talkStyles.length]
        : motionProfile.gestureStyle

      const baseGestureAmount = amount
      {
      const amount = conversational ? baseGestureAmount * (0.38 + phraseEase * 0.62) : baseGestureAmount
      switch (effectiveGestureStyle) {
        case 'surprise':
          addBoneRotation(motionBones.leftShoulder, -0.12 * amount, 0, 0.2 * amount)
          addBoneRotation(motionBones.rightShoulder, -0.12 * amount, 0, -0.2 * amount)
          addBoneRotation(motionBones.leftUpperArm, -0.72 * amount, 0.16 * gestureSlow, 0.64 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.72 * amount, -0.16 * gestureSlow, -0.64 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.42 * amount, 0.14 * gestureBeat, 0.28 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.42 * amount, -0.14 * gestureBeat, -0.28 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.22 * gestureBeat, 0.38 * amount, 0.18 * gestureSlow)
          addBoneRotation(motionBones.rightHand, 0.22 * gestureBeat, -0.38 * amount, -0.18 * gestureSlow)
          break
        case 'question':
          addBoneRotation(motionBones.leftUpperArm, -0.22 * amount, 0.1 * gestureSlow, 0.34 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.42 * amount, -0.16 * gestureSlow, -0.58 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.14 * amount, 0.08 * gestureBeat, 0.16 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.46 * amount, 0.58 * amount - 0.14 * gestureBeat, -0.38 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.22 * gestureBeat, 0.2 * gesturePulse, 0.16 * gestureSlow)
          addBoneRotation(motionBones.rightHand, 0.32 * gestureBeat, 0.78 * amount - 0.18 * gesturePulse, 0.28 * amount - 0.24 * gestureSlow)
          break
        case 'point':
          addBoneRotation(motionBones.rightUpperArm, -0.54 * amount, -0.18 * amount, -0.28 * amount)
          addBoneRotation(motionBones.rightForeArm, -0.36 * amount, -0.06 * gestureBeat, -0.14 * gesturePulse)
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
          addBoneRotation(motionBones.leftUpperArm, -0.38 * amount, 0.12 * gestureSlow, 0.42 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.14 * amount, -0.08 * gestureSlow, -0.14 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.62 * amount, 0.08 * gestureBeat, 0.28 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.08 * amount, -0.04 * gestureBeat, -0.08 * gestureSlow)
          addBoneRotation(motionBones.leftHand, 0.38 * gestureBeat, 0.32 * gesturePulse, 0.3 * gestureSlow)
          break
        case 'hand_to_chest':
          addBoneRotation(motionBones.leftUpperArm, -0.14 * amount, 0.06 * gestureSlow, 0.18 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.08 * amount, 0.03 * gestureBeat, 0.08 * gestureSlow)
          addBoneRotation(motionBones.rightUpperArm, -0.78 * amount, -0.22 * gestureSlow, -0.48 * amount)
          addBoneRotation(motionBones.rightForeArm, -1.08 * amount, 0.84 * amount - 0.08 * gestureBeat, -0.22 * gesturePulse)
          addBoneRotation(motionBones.rightHand, 0.18 * gestureBeat, 0.58 * amount - 0.08 * gesturePulse, 0.18 * amount)
          break
        case 'cautious':
          addBoneRotation(motionBones.leftUpperArm, -0.22 * amount, 0.08 * gestureSlow, 0.26 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.5 * amount, -0.12 * gestureSlow, -0.36 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.18 * amount, 0.08 * gestureBeat, 0.16 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.48 * amount, 0.36 * amount - 0.08 * gestureBeat, -0.2 * gesturePulse)
          addBoneRotation(motionBones.leftHand, -0.08 * gestureBeat, 0.14 * amount, 0.08 * gestureSlow)
          addBoneRotation(motionBones.rightHand, -0.12 * gestureBeat, 0.34 * amount, -0.12 * gestureSlow)
          break
        case 'smug':
          addBoneRotation(motionBones.leftUpperArm, -0.1 * amount, 0.08 * gestureSlow, 0.18 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.08 * amount, 0.04 * gestureBeat, 0.08 * gestureSlow)
          addBoneRotation(motionBones.rightUpperArm, -0.36 * amount, -0.18 * gestureSlow, -0.62 * amount)
          addBoneRotation(motionBones.rightForeArm, -0.5 * amount, 0.5 * amount - 0.12 * gestureBeat, -0.32 * gesturePulse)
          addBoneRotation(motionBones.rightHand, 0.12 * gestureBeat, 0.7 * amount - 0.16 * gesturePulse, 0.46 * amount - 0.12 * gestureSlow)
          break
        case 'present':
          addBoneRotation(motionBones.leftUpperArm, -0.28 * amount, 0.1 * gestureSlow, 0.34 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.28 * amount, -0.1 * gestureSlow, -0.34 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.24 * amount, 0.12 * gestureBeat, 0.18 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.24 * amount, 0.44 * amount - 0.12 * gestureBeat, -0.18 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.2 * gestureBeat, 0.22 * gesturePulse, 0.22 * gestureSlow)
          addBoneRotation(motionBones.rightHand, 0.16 * gestureBeat, 0.56 * amount - 0.12 * gesturePulse, 0.24 * amount - 0.16 * gestureSlow)
          break
        case 'talk_beat':
          addBoneRotation(motionBones.leftUpperArm, -0.12 * amount, 0.06 * gestureSlow, 0.16 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.08 * amount, 0.04 * gestureBeat, 0.08 * gestureSlow)
          addBoneRotation(motionBones.leftHand, 0.1 * gestureBeat, 0.06 * gesturePulse, 0.08 * gestureSlow)
          addBoneRotation(motionBones.rightUpperArm, -0.68 * amount, -0.16 * gestureSlow, -0.46 * amount)
          addBoneRotation(motionBones.rightForeArm, -0.58 * amount, 0.46 * amount - 0.3 * gestureBeat, -0.24 * gesturePulse)
          addBoneRotation(motionBones.rightHand, 0.42 * gestureBeat, 0.5 * amount - 0.18 * gesturePulse, 0.2 * amount - 0.18 * gestureSlow)
          break
        case 'talk_left':
          addBoneRotation(motionBones.leftUpperArm, -0.74 * amount, 0.18 * gestureSlow, 0.56 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.64 * amount, 0.5 * amount - 0.18 * gestureBeat, 0.28 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.28 * gestureBeat, 0.58 * amount - 0.14 * gesturePulse, 0.24 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.12 * amount, -0.04 * gestureSlow, -0.12 * amount)
          addBoneRotation(motionBones.rightForeArm, -0.08 * amount, -0.02 * gestureBeat, -0.06 * gestureSlow)
          break
        case 'talk_both':
          addBoneRotation(motionBones.leftUpperArm, -0.48 * amount, 0.16 * gestureSlow, 0.5 * amount)
          addBoneRotation(motionBones.rightUpperArm, -0.48 * amount, -0.16 * gestureSlow, -0.5 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.42 * amount, 0.34 * amount + 0.08 * gestureBeat, 0.26 * gesturePulse)
          addBoneRotation(motionBones.rightForeArm, -0.42 * amount, 0.34 * amount - 0.08 * gestureBeat, -0.26 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.18 * gestureBeat, 0.42 * amount, 0.18 * gestureSlow)
          addBoneRotation(motionBones.rightHand, 0.18 * gestureBeat, 0.42 * amount, -0.18 * gestureSlow)
          break
        case 'open_hand':
          addBoneRotation(motionBones.leftUpperArm, -0.08 * amount, 0.04 * gestureSlow, 0.12 * amount)
          addBoneRotation(motionBones.leftForeArm, -0.06 * amount, 0.03 * gestureBeat, 0.07 * gestureSlow)
          addBoneRotation(motionBones.leftHand, 0.07 * gestureBeat, 0.06 * gesturePulse, 0.05 * gestureSlow)
          addBoneRotation(motionBones.rightUpperArm, -1.26 * amount, -0.2 * gestureSlow, -1.02 * amount)
          addBoneRotation(motionBones.rightForeArm, -0.86 * amount, 0.66 * amount - 0.12 * gestureBeat, -0.38 * gesturePulse)
          addBoneRotation(motionBones.rightHand, 0.18 * gestureBeat, 0.72 * amount - 0.16 * gesturePulse, 0.36 * amount - 0.16 * gestureSlow)
          break
        default:
          addBoneRotation(motionBones.leftUpperArm, -0.16 * amount * leftWeight, 0.08 * gestureBeat, 0.18 * amount * leftWeight)
          addBoneRotation(motionBones.rightUpperArm, -0.56 * amount * rightWeight, -0.14 * gestureSlow, -0.42 * amount * rightWeight)
          addBoneRotation(motionBones.leftForeArm, -0.1 * amount * leftWeight, 0.05 * gestureBeat, 0.1 * gestureSlow)
          addBoneRotation(motionBones.rightForeArm, -0.46 * amount * rightWeight, 0.34 * amount - 0.08 * gestureBeat, -0.18 * gesturePulse)
          addBoneRotation(motionBones.leftHand, 0.1 * gestureBeat, 0.08 * gesturePulse, 0.1 * gestureSlow)
          addBoneRotation(motionBones.rightHand, 0.16 * gestureBeat, 0.38 * amount - 0.1 * gesturePulse, 0.18 * amount - 0.1 * gestureSlow)
      }
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
      const emotion = EMOTION_ALIASES[options.emotion] || options.emotion || detectEmotion(textOrEmotion)
      const preferred = clips.has(emotion) ? emotion : (clips.has('talk') ? 'talk' : null)
      const duration = Number.isFinite(options.duration) && options.duration > 0 ? options.duration : undefined

      if (preferred) {
        clearMotionQueue()
        const played = playAnimation(preferred, {
          fade: 0.32,
          returnToIdle: true,
          timeScale: duration && clips.get(preferred)?.duration
            ? THREE.MathUtils.clamp(clips.get(preferred).duration / duration, 0.72, 1.18)
            : 1,
        })
        return played
      }

      return disableProceduralMotion ? null : startProceduralMotion(textOrEmotion, options)
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
      if (preferEmbeddedAnimations && clips.has('idle')) {
        playAnimation('idle', { loop: true, fade: 0 })
        revealModel()
        setSafeStatus('3D ready (embedded animation)')
        return
      }

      // Load idle first so we can start it (and reveal the model) before the rest stream in.
      const entries = Object.entries(animations)
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

    camera = new THREE.PerspectiveCamera(cameraFov, 1, 0.1, 5000)
    camera.position.set(...(cameraPosition || CAMERA_POSITION))

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
    controls.target.set(...(cameraTarget || CAMERA_TARGET))

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
        // 이빨이 별도 메시인 모델(Gail/Lin: Low_Teeth*)은 hideTeeth로 그 메시만 숨긴다.
        // (단일 본체 메시에 이빨이 합쳐진 모델은 코드로 분리 불가 — 모델 수정 필요)
        if (hideTeeth) {
          modelRoot.traverse((obj) => {
            if (obj.isMesh && /teeth|tooth/i.test(obj.name || '')) obj.visible = false
          })
        }
        model.visible = false // Keep hidden until the idle pose is applied (prevents a T-pose flash).
        scene.add(model)
        frameObject(model)
        model.userData.basePosition = model.position.clone()
        model.userData.baseRotation = model.rotation.clone()
        mixer = new THREE.AnimationMixer(modelRoot)

        if (embeddedClips?.length) {
          if (preferEmbeddedAnimations) {
          const embeddedIdle = embeddedClips[0].clone()
          embeddedIdle.name = 'idle'
          clips.set('idle', embeddedIdle)
          }

          const embedded = embeddedClips[0].clone()
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
    // Debug-only: force the procedural arm/gesture pass directly, bypassing animation
    // clips, so the model inspector can reproduce the "arm bending" symptom on demand.
    window.playLinProcedural = (text, emotion, duration) =>
      startProceduralMotion(text || 'talk', { emotion, duration })
    // 전역 lip-sync 등록은 아래 별도 effect가 registerGlobalControls(발화 주체)일 때만 한다.
    // 여기서는 이 인스턴스의 lip-sync 함수만 ref로 보관한다.
    lipApiRef.current = { startAudioLipSync, startFallbackLipSync, stopAudioLipSync }
    window.__debugLinMorph = () => {
      console.log('morphMeshes:', morphMeshes.length)
      morphMeshes.forEach((mesh) => console.log(mesh.name, mesh.morphTargetDictionary, mesh.morphTargetInfluences))
    }
    window.__testMorph = (name, value = 1) => {
      resetMorphs()
      setMorph(name, value)
      console.log('test morph:', name, value)
    }
    // --- 임시 디버그: 팔 꺾임 원인 진단용 (확인 끝나면 제거) ---
    window.__lin = {
      // 모든 애니메이션 정지 + 메시를 원본 바인드 포즈로 되돌림 (외부 클립 영향 0)
      restPose() {
        clearMotionQueue()
        mixer?.stopAllAction()
        let n = 0
        modelRoot?.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.pose(); n += 1 } })
        console.log('[__lin] restPose 적용, skinnedMesh 개수:', n)
      },
      // 뼈대 선을 화면에 표시/숨김 토글
      showSkeleton() {
        if (this._skel) { scene.remove(this._skel); this._skel = null; console.log('[__lin] 골격 숨김'); return }
        this._skel = new THREE.SkeletonHelper(modelRoot)
        scene.add(this._skel)
        console.log('[__lin] 골격 표시 ON')
      },
      // 모델 본 이름 vs idle 클립 트랙 이름 비교
      names() {
        const bones = []
        modelRoot?.traverse((o) => { if (o.isBone) bones.push(o.name) })
        const clip = clips.get('idle')
        const tracks = clip ? clip.tracks.map((t) => t.name) : []
        console.log('[__lin] 모델 본', bones.length, '개:', bones)
        console.log('[__lin] idle 클립 트랙', tracks.length, '개:', tracks)
        const boneSet = new Set(bones)
        const missing = tracks
          .map((t) => t.split('.')[0])
          .filter((b) => !boneSet.has(b))
        console.log('[__lin] 클립에는 있는데 모델에는 없는 본:', [...new Set(missing)])
        return { bones, tracks }
      },
      // 팔 뼈의 "기준(rest) 자세" 각도(도)를 뽑음. 좋은 모델/나쁜 모델 비교용.
      armRest() {
        this.restPose()
        const keys = ['leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftForeArm', 'rightForeArm']
        const deg = (r) => +(r * 180 / Math.PI).toFixed(1)
        const out = {}
        keys.forEach((k) => {
          const b = motionBones[k]
          out[k] = b ? { 본: b.name, x: deg(b.rotation.x), y: deg(b.rotation.y), z: deg(b.rotation.z) } : '없음'
        })
        console.table(out)
        return out
      },
      // --- 실시간 위치/크기 맞추기: 중앙에 오게 한 뒤 출력된 값을 config에 박으면 됨 ---
      ny(d = 20) { // 세로 이동 (+위 / -아래)
        if (!model) return
        model.position.y += d
        if (model.userData.basePosition) model.userData.basePosition.y += d
        this._dy = (this._dy || 0) + d
        console.log('[__lin] modelOffset[1] =', (modelOffset?.[1] || 0) + this._dy)
      },
      nx(d = 20) { // 가로 이동 (+오른쪽 / -왼쪽)
        if (!model) return
        model.position.x += d
        if (model.userData.basePosition) model.userData.basePosition.x += d
        this._dx = (this._dx || 0) + d
        console.log('[__lin] modelOffset[0] =', (modelOffset?.[0] || 0) + this._dx)
      },
      zoom(f = 1.1) { // 크기 (>1 크게 / <1 작게)
        if (!camera || !controls) return
        camera.position.lerpVectors(controls.target, camera.position, 1 / f)
        controls.update()
        this._zf = (this._zf || 1) * f
        console.log('[__lin] framingScale =', ((framingScale || 1) * this._zf).toFixed(3))
      },
      where() {
        console.log('[__lin] modelOffset prop=', modelOffset, 'framingScale=', framingScale, 'model.pos=', model && model.position.toArray().map((v) => +v.toFixed(1)))
      },
      // 회전(세움) 조정: 도(°) 단위. 맞춘 뒤 출력된 modelRotation 라디안 값을 config에 박으면 됨.
      rot(axis, deg) {
        if (!model) return
        const rad = deg * Math.PI / 180
        model.rotation[axis] += rad
        if (model.userData.baseRotation) model.userData.baseRotation[axis] += rad
        const r = model.rotation
        console.log('[__lin] modelRotation =', [+r.x.toFixed(3), +r.y.toFixed(3), +r.z.toFixed(3)], '(라디안)')
      },
      rx(d = 15) { this.rot('x', d) }, // 앞뒤로 세우기/눕히기
      ry(d = 15) { this.rot('y', d) }, // 좌우 방향(바라보는 쪽)
      rz(d = 15) { this.rot('z', d) }, // 좌우로 기울이기
    }
    // --- 디버그 끝 ---

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      clearMotionQueue()
      if (window.playLinAnimation === playDirectAnimation) delete window.playLinAnimation
      if (window.playLinEmotion) delete window.playLinEmotion
      if (window.playLinPerformance) delete window.playLinPerformance
      if (window.playLinProcedural) delete window.playLinProcedural
      lipApiRef.current = null
      if (window.__debugLinMorph) delete window.__debugLinMorph
      if (window.__testMorph) delete window.__testMorph
      stopAudioLipSync()
      // 공유 AudioContext는 stopAudioLipSync가 닫지 않으므로 언마운트에서 정리한다.
      if (audioContext) { try { audioContext.close() } catch {} ; audioContext = null; analyser = null }
      controls?.dispose()
      // 모델의 지오메트리/머티리얼/텍스처까지 해제 (GPU 메모리·텍스처 누수 방지)
      modelRoot?.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : [])
        mats.forEach((mat) => {
          for (const value of Object.values(mat)) {
            if (value && value.isTexture) value.dispose()
          }
          mat.dispose()
        })
      })
      envTexture?.dispose()
      pmrem?.dispose()
      renderer?.dispose()
      // WebGL 컨텍스트 즉시 반환 — 안 하면 모델 갈아끼울 때마다 컨텍스트가 쌓여
      // 브라우저 한도를 넘기면 캐릭터가 흰색/검정으로 렌더된다.
      renderer?.forceContextLoss?.()
      if (renderer?.domElement?.parentNode === host) host.removeChild(renderer.domElement)
    }
  }, [
    modelPath,
    animations,
    modelRotation,
    modelScale,
    modelOffset,
    preferEmbeddedAnimations,
    motionIntensity,
    disableProceduralMotion,
    cameraPosition,
    cameraTarget,
    cameraFov,
    framingOffsetY,
    framingScale,
  ])

  // 전역 lip-sync(window.startLinLipSync 등)는 '발화 주체'인 인스턴스만 소유한다.
  // 과거엔 마운트되는 모든 Character3D가 무조건 window.* 를 덮어써서, 마지막에 마운트된
  // 모델이 lip-sync를 가로채고 정작 말하는 모델(GM 팝업 등)의 입은 안 움직였다.
  // registerGlobalControls=true 인 인스턴스만 등록하게 해 그 레이스를 없앤다.
  useEffect(() => {
    if (!registerGlobalControls) return undefined
    const api = lipApiRef.current
    if (!api) return undefined
    window.startLinLipSync = api.startAudioLipSync
    window.startLinFallbackLipSync = api.startFallbackLipSync
    window.stopLinLipSync = api.stopAudioLipSync
    return () => {
      if (window.startLinLipSync === api.startAudioLipSync) delete window.startLinLipSync
      if (window.startLinFallbackLipSync === api.startFallbackLipSync) delete window.startLinFallbackLipSync
      if (window.stopLinLipSync === api.stopAudioLipSync) delete window.stopLinLipSync
      api.stopAudioLipSync?.()
    }
  }, [registerGlobalControls, modelPath])

  return (
    <div className="character3d">
      <div ref={hostRef} className="character3d-canvas" />
    </div>
  )
}

