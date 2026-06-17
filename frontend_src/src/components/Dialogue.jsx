import React, { useEffect, useRef, useState } from 'react'
import { SPEAKERS, FLAVOR_CHOICE, CHOICES } from '../data.js'
import D12 from './D12.jsx'
import Character3D, { detectEmotion } from './Character3D.jsx'
import ParallaxBackground from './ParallaxBackground.jsx'
import EvalPanel from './EvalPanel.jsx'
import { apiChat, apiChatStream, apiTTS, apiTTSStream, apiDebugEnding, apiStoryChoice, apiGenerateBackground } from '../api.js'
import { PERSONAS, getPersona } from '../personas.js'
import { applyBgmVolume, applyMasterVolume, applySpeechVolume } from '../audioSettings.js'
import { loadSettings, subscribeSettings } from '../settings.js'

const CHAT_SIZE_KEY = 'trpg_chat_section_size'
const DEFAULT_CHAT_SIZE = { stacked: 42, split: 40 }
const CHAT_SIZE_LIMITS = {
  stacked: { min: 28, max: 66 },
  split: { min: 30, max: 58 },
}
const PANEL_SIZE_KEY = 'trpg_chat_panel_sizes'
const DEFAULT_PANEL_SIZES = {
  stacked: { choices: 25.4, avatar: 24.6 },
  split: { avatar: 30, choices: 30 },
}
const PANEL_SIZE_LIMITS = {
  stacked: {
    choices: { min: 16, max: 42 },
    avatar: { min: 16, max: 42 },
    dialogueMin: 28,
  },
  split: {
    avatar: { min: 18, max: 45 },
    choices: { min: 18, max: 42 },
    dialogueMin: 24,
  },
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeChatSize(raw) {
  return {
    stacked: clampNumber(Number(raw?.stacked ?? DEFAULT_CHAT_SIZE.stacked), CHAT_SIZE_LIMITS.stacked.min, CHAT_SIZE_LIMITS.stacked.max),
    split: clampNumber(Number(raw?.split ?? DEFAULT_CHAT_SIZE.split), CHAT_SIZE_LIMITS.split.min, CHAT_SIZE_LIMITS.split.max),
  }
}

function loadChatSize() {
  try {
    return normalizeChatSize(JSON.parse(localStorage.getItem(CHAT_SIZE_KEY) || '{}'))
  } catch {
    return DEFAULT_CHAT_SIZE
  }
}

function saveChatSize(next) {
  try {
    localStorage.setItem(CHAT_SIZE_KEY, JSON.stringify(normalizeChatSize(next)))
  } catch {
    // Ignore storage failures; resizing should still work for the current screen.
  }
}

function normalizePanelMode(raw, mode) {
  const defaults = DEFAULT_PANEL_SIZES[mode]
  const limits = PANEL_SIZE_LIMITS[mode]
  const result = {}
  for (const key of Object.keys(defaults)) {
    result[key] = clampNumber(Number(raw?.[key] ?? defaults[key]), limits[key].min, limits[key].max)
  }

  const keys = Object.keys(defaults)
  const maxOuter = 100 - limits.dialogueMin
  const outerTotal = keys.reduce((sum, key) => sum + result[key], 0)
  if (outerTotal > maxOuter) {
    const minTotal = keys.reduce((sum, key) => sum + limits[key].min, 0)
    const flexibleTotal = Math.max(1, outerTotal - minTotal)
    const targetFlexible = Math.max(0, maxOuter - minTotal)
    for (const key of keys) {
      const flexible = result[key] - limits[key].min
      result[key] = Math.round((limits[key].min + (flexible / flexibleTotal) * targetFlexible) * 10) / 10
    }
  }

  return result
}

function normalizePanelSizes(raw) {
  return {
    stacked: normalizePanelMode(raw?.stacked, 'stacked'),
    split: normalizePanelMode(raw?.split, 'split'),
  }
}

function clampPanelModeValue(current, mode, key, value) {
  const limits = PANEL_SIZE_LIMITS[mode]
  const otherKey = Object.keys(current).find(candidate => candidate !== key)
  const otherValue = current[otherKey]
  const maxByDialogue = 100 - limits.dialogueMin - otherValue
  return Math.round(clampNumber(value, limits[key].min, Math.min(limits[key].max, maxByDialogue)) * 10) / 10
}

function loadPanelSizes() {
  try {
    return normalizePanelSizes(JSON.parse(localStorage.getItem(PANEL_SIZE_KEY) || '{}'))
  } catch {
    return DEFAULT_PANEL_SIZES
  }
}

function savePanelSizes(next) {
  try {
    localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(normalizePanelSizes(next)))
  } catch {
    // Keep resizing usable even when storage is unavailable.
  }
}

const LOCATION_BGMS = [
  {
    aliases: ['카르가스전투', '카르가스', '봉우리', 'boss'],
    path: '/static/audio/bgm/ashes-of-kargas.mp3',
    volume: 0.34,
  },
  {
    aliases: ['진료소', '진료실', '의무실', 'clinic', 'hospital'],
    path: '/static/audio/bgm/clinic.wav',
    volume: 0.24,
  },
  {
    aliases: ['재끝마을', '재끝', '잿빛마을', '잿빛', '마을광장', 'village', 'jaekkeut'],
    path: '/static/audio/bgm/jaekkeut-village.mp3',
    volume: 0.3,
  },
  {
    aliases: ['갱도', '갱도사무소', '광산', 'mine', 'mineshaft'],
    path: '/static/audio/bgm/crystal-mine.mp3',
    volume: 0.28,
  },
]
const USE_BROWSER_TTS = false
// CosyVoice stream chunks start quickly, but small chunks can make voices unstable.
// Keep stable phrase-level wav playback as the default for more natural delivery.
const USE_SERVER_TTS_STREAM = false
const SERVER_TTS_STREAM_INITIAL_BUFFER = 2
const SERVER_TTS_STREAM_MAX_INITIAL_WAIT_MS = 900

const NPC_DIALOGUE_TEST_LINES = [
  { speaker: 'doctor', text: '린, 환자의 반응이 안정적입니다. 하지만 기억은 아직 흐릿한 것 같군요.' },
  { speaker: 'lin', text: '그럼 제가 몇 가지를 물어볼게요. 손님, 여관에서 본 표식은 기억나시나요?' },
  { speaker: 'gail', text: '표식보다 중요한 건 광산 쪽 움직임입니다. 남은 인력으로도 채굴을 계속해야 하니까요.' },
  { speaker: 'tobi', text: '저도 같이 갈래요. 형이 남긴 표식이라면 제가 알아볼 수 있을지도 몰라요!' },
  { speaker: 'doctor', text: '가일, 서두르지 마십시오. 이 사람의 상태를 먼저 확인해야 합니다.' },
  { speaker: 'lin', text: '두 분 다 잠깐만요. 지금은 손님이 따라올 수 있게 천천히 말하는 게 좋겠어요.' },
]

const SHORT_TTS_TEST_LINES = [
  { speaker: 'doctor', text: '니가 날 알어' },
  { speaker: 'doctor', text: '나와 함께 포커 게임 할래' },
  { speaker: 'lin', text: '월요일 날씨' },
  { speaker: 'lin', text: '게임 찾아줘' },
  { speaker: 'tobi', text: '내일 아침 여덟 시 알람해줘' },
  { speaker: 'tobi', text: '적절한 시기의 난방 수준' },
]

const NPC_TEST_SPEAKERS = ['doctor', 'lin', 'gail', 'tobi']
const NPC_TEST_STAGE_X = {
  doctor: -420,
  lin: -140,
  gail: 140,
  tobi: 420,
}

const STORY_ENSEMBLES = {
  tavern_clerk: [
    { speaker: 'tavern_clerk', x: 0 },
  ],
  tavern_both: [
    { speaker: 'lin', x: -190 },
    { speaker: 'tavern_clerk', x: 190 },
  ],
  tavern_lin: [
    { speaker: 'lin', x: 0 },
  ],
}

// 41본 NPC 골격(가일·마르타·토비·점원 공용)에 맞게 Mixamo에서 다시 구운 애니.
// 파일명은 공유 애니와 동일하게 두고, 폴더만 /npc/ 로 분리한다.
// (가일에 구운 .glb 들을 static/animations/npc/ 에 넣으면 4명 모두 적용됨)
const NPC_ANIMS = {
  idle: '/static/animations/npc/weight_shift.glb',
  talk: '/static/animations/npc/acknowledging.glb',
  happy: '/static/animations/npc/acknowledging.glb',
  angry: '/static/animations/npc/acknowledging.glb',
  thinking: '/static/animations/npc/acknowledging.glb',
  deny: '/static/animations/npc/acknowledging.glb',
  sigh: '/static/animations/npc/acknowledging.glb',
  cocky: '/static/animations/npc/acknowledging.glb',
  yes: '/static/animations/npc/acknowledging.glb',
  strong_yes: '/static/animations/npc/acknowledging.glb',
  long_yes: '/static/animations/npc/acknowledging.glb',
  sarcastic: '/static/animations/npc/acknowledging.glb',
  look_away: '/static/animations/npc/acknowledging.glb',
  dismiss: '/static/animations/npc/acknowledging.glb',
  annoyed: '/static/animations/npc/acknowledging.glb',
}

const TAVERN_LIN_SCENES = new Set([
  'tavern_rin',
  'tavern_miner_followup',
  'rin_contradiction',
  'lin_trust_trial',
])

export const CHARACTER_MODELS = [
  {
    speaker: 'gm',
    personaId: 'gm',
    name: SPEAKERS.gm?.name || 'GM',
    modelPath: '/static/models/GM_v3_27.glb',
    modelScale: 0.75,
    modelOffset: [0, -130, 0],
    animations: {
      idle: '/static/animations/npc/gm_acknowledging.glb',
      talk: '/static/animations/npc/gm_acknowledging.glb',
    },
    motionIntensity: 0.6,
    hideTeeth: true,  // GM_v3_27 안쪽 입(Teeth Flesh) 서브메시가 idle 애니 때 입 앞으로 튀어 '갈색 공'으로 보임 → 숨김
  },
  {
    speaker: 'lin',
    personaId: 'lin',
    name: PERSONAS.lin.name,
    modelPath: '/static/models/Lin_09_TextureFixed.glb',
    modelScale: 0.82,
    modelOffset: [0, -120, 0],
    preferEmbeddedAnimations: true,
    motionIntensity: 0.9,
    lipGain: 1.1,   // Lin은 viseme 셰이프가 약해 입 강도를 키운다(GM 대비 oo/ee/oh가 작음)
  },
  {
    speaker: 'gail',
    personaId: 'gail',
    name: PERSONAS.gail.name,
    modelPath: '/static/models/Gail_17_textureFixed.glb',
    modelScale: 0.90,
    modelOffset: [0, 0, 0],
    framingScale: 0.82,
    animations: NPC_ANIMS,
    disableProceduralMotion: true,
    attachTeethToHead: true,   // 가일은 별도 이빨 메시(Low_Teeth*)를 head본에 attach → 얼굴 따라감
  },
  {
    speaker: 'marta',
    personaId: 'marta',
    name: PERSONAS.marta.name,
    modelPath: '/static/models/Marta_13_FinFixed.glb',
    modelScale: 0.75,
    modelOffset: [0, 40, 0],
    animations: NPC_ANIMS,
    disableProceduralMotion: true,
    attachTeethToHead: true,   // 마르타는 별도 이빨 메시를 head본에 attach → 얼굴 따라감
  },
  {
    speaker: 'tobi',
    personaId: 'tobi',
    name: PERSONAS.tobi.name,
    modelPath: '/static/models/Tobi_13.glb',
    modelScale: 0.75,
    modelOffset: [0, 40, 0],
    animations: NPC_ANIMS,
    disableProceduralMotion: true,
    attachTeethToHead: true,   // 토비는 별도 이빨 메시를 head본에 attach → 얼굴 따라감
  },
  {
    speaker: 'doctor',
    personaId: 'doctor',
    name: PERSONAS.doctor.name,
    modelPath: '/static/models/Doctor_09_textureFixed.glb',
    modelScale: 0.75,
    modelOffset: [0, 40, 0],
    preferEmbeddedAnimations: true,
    motionIntensity: 0.45,
    attachTeethToHead: true,   // 의사도 별도 이빨 메시를 head본에 attach → 얼굴 따라감
  },
  {
    speaker: 'kargas',
    personaId: 'kargas',
    name: PERSONAS.kargas.name,
    modelPath: '/static/models/Kargas_18.glb',
    modelScale: 0.6,
    modelOffset: [0, 80, 0],
  },
  {
    speaker: 'miner',
    personaId: 'miner',
    name: PERSONAS.miner.name,
    modelPath: '/static/models/광부.glb',
    modelScale: 0.22,
    modelOffset: [0, 70, 0],
    motionIntensity: 0.55,
  },
  {
    speaker: 'tavern_clerk',
    personaId: 'tavern_clerk',
    name: PERSONAS.tavern_clerk.name,
    modelPath: '/static/models/Waitress_01.glb',
    modelScale: 0.80,
    modelOffset: [0, 40, 0],
    animations: NPC_ANIMS,
    disableProceduralMotion: true,
    motionIntensity: 0.55,
  },
  // --- 임시: 입모양(ShapeKey) 테스트용. 모델검사에서 확인 후 제거할 것 ---
  {
    speaker: 'shapekey_test',
    personaId: 'gm',
    name: '입모양 테스트',
    modelPath: '/static/models/GM_v3_17.glb',
    modelScale: 0.75,
    modelOffset: [0, -130, 0],
    preferEmbeddedAnimations: true,
    motionIntensity: 0,
  },
]

// 팔 꺾임 검사용: 각 버튼이 특정 제스처 스타일(buildMotionProfile/detectGestureStyle)을
// 유발하는 샘플 대사. 절차적 모션(window.playLinProcedural)으로 재생해 팔 본 회전을 관찰.
const INSPECT_GESTURES = [
  { label: 'idle', emotion: 'idle' },
  { label: '말하기', text: '그러니까 말하자면, 이렇게 된 겁니다.', emotion: 'talk' },
  { label: '가리키기', text: '저기 보십시오. 저쪽을 확인해야 합니다.', emotion: 'talk' },
  { label: '명령/분노', text: '당장 멈춰! 위험하다, 물러서!', emotion: 'angry' },
  { label: '환영', text: '어서 오십시오! 정말 반갑군요.', emotion: 'happy' },
  { label: '질문', text: '그게 정말입니까? 어떻게 된 거죠?', emotion: 'thinking' },
  { label: '부정', text: '아니요, 그건 절대 안 됩니다.', emotion: 'deny' },
  { label: '놀람', text: '뭐? 설마, 믿을 수 없어!', emotion: 'angry' },
  { label: '생각', text: '잠깐, 그 단서를 다시 생각해 보죠.', emotion: 'thinking' },
]

const LOCATION_BACKGROUNDS = [
  { aliases: ['진료소', '진료실', '의무실', 'clinic', 'hospital'], path: '/static/backgrounds/clinic-new.png' },
  { aliases: ['여관', '주점', '여우길', 'tavern', 'inn'], path: '/static/backgrounds/inn.png' },
  { aliases: ['정재소', '정제소', 'refinery'], path: '/static/backgrounds/refinery-new.png' },
  { aliases: ['주둔소', '영석공사', '가일', 'garrison'], path: '/static/backgrounds/garrison.png' },
  { aliases: ['봉우리', '정상', '둥지', '카르가스', 'peak'], path: '/static/backgrounds/peak.png' },
  { aliases: ['오두막', '산기슭', '마르타', 'hut', 'cabin'], path: '/static/backgrounds/hut.png' },
  { aliases: ['갱도', '갱도사무소', '광산입구', '갱도입구', '광산', 'mine', 'mineshaft'], path: '/static/backgrounds/mine.png' },
  { aliases: ['광장', 'square'], path: '/static/backgrounds/square.png' },
]

// 장소별 이펙트 프로필 — 자동 글로우 색 + 파티클(색·양·상승). AI 생성 이미지에도 그대로 적용.
const FX_PROFILES = [
  { kw: ['대장간', '풀무', 'forge'], glow: 1.4, glowTint: [1.0, 0.55, 0.25], pColor: 'rgba(255,165,70,0.95)', pCount: 160, pRise: 0.0016 },
  { kw: ['교단', '성소', 'cult'], glow: 1.15, glowTint: [0.7, 0.8, 1.0], pColor: 'rgba(210,225,255,0.85)', pCount: 280, pRise: 0.0004 },
  { kw: ['갱도', '심부', '광산', '폐광', '수직갱', '정제소', 'mine', 'refinery'], glow: 1.0, glowTint: [0.4, 0.7, 1.0], pColor: 'rgba(120,200,255,0.9)', pCount: 240, pRise: 0.0006 },
  { kw: ['암시장', 'market'], glow: 1.2, glowTint: [1.0, 0.75, 0.4], pColor: 'rgba(255,200,120,0.9)', pCount: 220, pRise: 0.0007 },
  { kw: ['봉우리', '카르가스', 'peak'], glow: 1.0, glowTint: [0.6, 0.75, 1.0], pColor: 'rgba(180,210,255,0.85)', pCount: 200, pRise: 0.0003 },
  { kw: ['진료소', 'clinic', '여관', 'inn', '오두막', 'hut'], glow: 1.1, glowTint: [1.0, 0.8, 0.5], pColor: 'rgba(255,210,150,0.8)', pCount: 180, pRise: 0.0005 },
]
const DEFAULT_FX = { glow: 1.0, glowTint: [0.9, 0.9, 1.0], pColor: 'rgba(220,228,245,0.85)', pCount: 220, pRise: 0.0005 }
const getFx = (loc) => {
  const n = String(loc || '').replace(/\s+/g, '').toLowerCase()
  if (!n) return DEFAULT_FX
  return FX_PROFILES.find(p => p.kw.some(k => n.includes(k.replace(/\s+/g, '').toLowerCase()))) || DEFAULT_FX
}

const getLocationBackground = (location) => {
  const normalized = String(location || '').replace(/\s+/g, '').toLowerCase()
  if (!normalized) return null
  return LOCATION_BACKGROUNDS.find(bg =>
    bg.aliases.some(alias => normalized.includes(alias.replace(/\s+/g, '').toLowerCase())),
  )?.path || null
}

const getLocationBgm = (source) => {
  const normalized = String(source || '').replace(/\s+/g, '').toLowerCase()
  if (!normalized) return null
  return LOCATION_BGMS.find(bgm =>
    bgm.aliases.some(alias => normalized.includes(alias.replace(/\s+/g, '').toLowerCase())),
  ) || null
}

const playWhenAllowed = (audio) => {
  let cleanup = () => {}
  const retry = () => {
    audio.play()
      .then(cleanup)
      .catch(() => {})
  }

  audio.play().catch(() => {
    window.addEventListener('pointerdown', retry, { once: true })
    window.addEventListener('keydown', retry, { once: true })
    window.addEventListener('touchstart', retry, { once: true })
    cleanup = () => {
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
      window.removeEventListener('touchstart', retry)
    }
  })

  return () => cleanup()
}

const getMapResultLocation = (kind) => {
  const normalized = String(kind || '').replace(/\s+/g, '').toLowerCase()
  if (!normalized) return null
  if (['진료소', 'clinic'].some(key => normalized.includes(key))) return '진료소'
  if (['여관', 'tavern'].some(key => normalized.includes(key))) return '여관'
  if (['정제소', 'refinery', 'shop', '거래', '상점'].some(key => normalized.includes(key))) return '정제소'
  if (['갱도심부', 'deep'].some(key => normalized.includes(key))) return '갱도 심부'
  if (['갱도', '광산', 'mine', 'battle', '전투'].some(key => normalized.includes(key))) return '광산'
  if (['마을광장', 'village', 'event', '이벤트'].some(key => normalized.includes(key))) return '마을 광장'
  if (['산기슭오두막', '오두막', 'marta'].some(key => normalized.includes(key))) return '산기슭 오두막'
  if (['봉우리', 'peak', 'boss'].some(key => normalized.includes(key))) return '봉우리'
  if (['잊힌기억', 'memory', '미지', 'mystery'].some(key => normalized.includes(key))) return '여관'
  return null
}
const toUiLog = (history = []) => {
  if (!history || history.length === 0) return []
  return history.flatMap((item) => {
    if (item.role !== 'assistant') {
      return [{
        who: 'player',
        text: item.content || '',
        speak: Boolean(item.speak),
      }]
    }

    const segments = normalizeStorySegments(item.segments, item.content || '', item.speaker || 'gm')
    return segments.map(segment => ({
      who: segment.speaker,
      text: segment.text,
      speak: false,
    }))
  })
}

const getLastNpcSpeaker = (log) => {
  const lastNpc = [...log].reverse().find(m => m.who !== 'player' && CHARACTER_MODELS.some(c => c.speaker === m.who))
  return lastNpc?.who || CHARACTER_MODELS[0].speaker
}

const getLastStageNpcSpeaker = (log) => {
  const lastNpc = [...log].reverse().find(m => (
    m.who !== 'player'
    && m.who !== 'gm'
    && CHARACTER_MODELS.some(c => c.speaker === m.who)
  ))
  return lastNpc?.who || null
}

const getCharacter = (speaker) => CHARACTER_MODELS.find(c => c.speaker === speaker) || CHARACTER_MODELS[0]

const getPersonaForSpeaker = (speaker) => {
  const character = getCharacter(speaker)
  return getPersona(character.personaId) || getPersona(speaker) || PERSONAS.doctor
}

const SPEAKER_UI_PALETTE = {
  gm: {
    nameColor: '#f3c47d',
    borderColor: '#9a6230',
    bubbleBg: 'linear-gradient(180deg,rgba(47,29,14,.9),rgba(15,10,7,.96))',
    glow: 'rgba(205,134,62,.38)',
  },
  player: {
    nameColor: '#f0c879',
    borderColor: '#b47735',
    bubbleBg: 'linear-gradient(180deg,rgba(51,31,12,.9),rgba(15,10,7,.97))',
    glow: 'rgba(230,158,74,.42)',
  },
  doctor: {
    nameColor: '#7ee4d7',
    borderColor: '#3c9d91',
    bubbleBg: 'linear-gradient(180deg,rgba(16,45,42,.88),rgba(7,19,18,.96))',
    glow: 'rgba(69,206,190,.36)',
  },
  lin: {
    nameColor: '#ff91b3',
    borderColor: '#b34a6a',
    bubbleBg: 'linear-gradient(180deg,rgba(54,17,31,.9),rgba(18,8,13,.97))',
    glow: 'rgba(222,80,124,.38)',
  },
  gail: {
    nameColor: '#f0b15e',
    borderColor: '#a56a2f',
    bubbleBg: 'linear-gradient(180deg,rgba(53,34,15,.9),rgba(18,12,7,.97))',
    glow: 'rgba(213,133,49,.36)',
  },
  marta: {
    nameColor: '#a9dfbc',
    borderColor: '#5b9a70',
    bubbleBg: 'linear-gradient(180deg,rgba(21,44,30,.88),rgba(8,18,13,.97))',
    glow: 'rgba(112,203,139,.34)',
  },
  tobi: {
    nameColor: '#ffd36c',
    borderColor: '#b78930',
    bubbleBg: 'linear-gradient(180deg,rgba(58,42,12,.9),rgba(19,14,6,.97))',
    glow: 'rgba(245,190,64,.38)',
  },
  kargas: {
    nameColor: '#b6c5ff',
    borderColor: '#6f7eb3',
    bubbleBg: 'linear-gradient(180deg,rgba(24,29,51,.9),rgba(8,10,18,.98))',
    glow: 'rgba(120,145,235,.35)',
  },
  miner: {
    nameColor: '#d2b27c',
    borderColor: '#8c6d3b',
    bubbleBg: 'linear-gradient(180deg,rgba(44,35,18,.88),rgba(15,12,7,.97))',
    glow: 'rgba(174,132,62,.32)',
  },
  nurse: {
    nameColor: '#9de4e0',
    borderColor: '#5e9f9c',
    bubbleBg: 'linear-gradient(180deg,rgba(21,46,45,.88),rgba(8,18,18,.97))',
    glow: 'rgba(111,211,205,.34)',
  },
  tavern_clerk: {
    nameColor: '#e4aa83',
    borderColor: '#a56f50',
    bubbleBg: 'linear-gradient(180deg,rgba(50,31,23,.88),rgba(17,11,9,.97))',
    glow: 'rgba(218,143,96,.34)',
  },
}

const getSpeakerPresentation = (speaker) => {
  if (speaker === 'player') {
    return { ...SPEAKERS.player, ...(SPEAKER_UI_PALETTE.player || {}) }
  }
  if (speaker === 'gm') {
    return { ...SPEAKERS.gm, ...(SPEAKER_UI_PALETTE.gm || {}) }
  }

  const persona = getPersonaForSpeaker(speaker)
  const palette = SPEAKER_UI_PALETTE[speaker] || SPEAKER_UI_PALETTE[persona?.id] || {}
  return {
    name: persona?.name || SPEAKERS[speaker]?.name || speaker,
    color: persona?.color || SPEAKERS[speaker]?.color || '#7d858d',
    tint: persona?.color
      ? `${persona.color}2e`
      : (SPEAKERS[speaker]?.tint || 'rgba(125,133,141,0.16)'),
    ...palette,
  }
}

const getTtsInstructions = (persona, emotion) => {
  const base = persona?.tts?.instructions || ''
  const extra = emotion ? (persona?.tts?.byEmotion?.[emotion] || '') : ''
  return `${base} ${extra}`.trim()
}

// 감정 기반 애니 제외 대상: 카르가스·광부는 발화해도 항상 'talk' 모션만.
const EMOTION_ANIM_EXCLUDED = new Set(['kargas', 'miner'])

// 텍스트에서 인라인 톤 지시문 (괄호/대괄호) 추출.
// 반환: { cleanText: 지시문 제거된 발화 텍스트, toneHint: 지시문들을 합친 문자열 }
const extractToneHint = (text) => {
  const hints = []
  const clean = String(text || '')
    .replace(/[(\[（【][^)\]）】]{1,60}[)\]）】]/g, (m) => {
      hints.push(m.slice(1, -1).trim())
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { cleanText: clean, toneHint: hints.join(', ') }
}

let currentAudio = null
let currentUtterance = null
let speechRunId = 0
let _onGmSpeakChange = null
// GM 팝업 카메라 값은 모듈 상수로 고정한다. 인라인 배열로 넘기면 매 렌더 새 참조가 되어
// Character3D effect(deps: cameraPosition/cameraTarget)가 재실행 → 모델이 매번 재로드되고
// 립싱크 상태/등록이 날아가 "두 번째 발화부터 입이 멈추는" 버그가 난다.
const GM_POPUP_CAMERA_POS = [0, 160, 420]
const GM_POPUP_CAMERA_TARGET = [0, 160, 0]

const estimateSpeechDuration = (text) => {
  const length = Array.from(String(text || '')).length
  return Math.min(5.5, Math.max(1.2, length * 0.085))
}

const prepareTtsSegment = (segment) => {
  const persona = getPersonaForSpeaker(segment.speaker)
  const { cleanText, toneHint } = extractToneHint(segment.text)
  const spokenText = cleanText || segment.text
  const ttsInstructions = toneHint
    ? `${getTtsInstructions(persona)} ${toneHint}`.trim()
    : getTtsInstructions(persona)

  // 지시어(톤힌트) 우선, 없으면 발화 텍스트에서 감정 추론 → 애니 emotion 키.
  // 카르가스·광부는 제외(항상 talk).
  const emotion = EMOTION_ANIM_EXCLUDED.has(segment.speaker)
    ? 'talk'
    : detectEmotion(toneHint || spokenText)

  return {
    segment,
    persona,
    spokenText,
    emotion,
    cleanSegment: { ...segment, text: spokenText },
    ttsInstructions,
    fallbackDuration: estimateSpeechDuration(spokenText),
  }
}

const requestServerTts = async (prepared) => {
  const data = await apiTTS(prepared.spokenText, {
    speaker: prepared.segment.speaker || prepared.persona.id,
    voice: prepared.persona.tts?.voice,
    instructions: prepared.ttsInstructions,
  })
  return { ...prepared, data }
}

const playAudioUrl = async (data, spokenText, runId, options = {}) => {
  if (runId !== speechRunId) return

  const audio = new Audio(data.audio_url)
  audio.preload = 'auto'
  const stopAudioVolume = applyMasterVolume(audio, 1)
  currentAudio = audio

  audio.onplay = () => {
    if (options.startPerformance !== false) {
      window.playLinPerformance?.(spokenText, options.emotion || data.emotion || 'talk', audio.duration)
    }
    window.startLinLipSync?.(audio, spokenText)
  }

  try {
    await new Promise((resolve, reject) => {
      audio.onended = resolve
      audio.onerror = reject
      audio.onpause = () => {
        if (runId !== speechRunId) resolve()
      }
      audio.play().catch(reject)
    })
  } finally {
    window.stopLinLipSync?.()
    stopAudioVolume()
    if (currentAudio === audio) currentAudio = null
  }
}

function createServerTtsStreamState(prepared) {
  const { segment, spokenText, fallbackDuration } = prepared
  const chunks = []
  let streamClosed = false
  let streamError = null
  let firstChunkAt = 0
  let wake = null
  const controller = new AbortController()

  const notify = () => {
    if (!wake) return
    const resolve = wake
    wake = null
    resolve()
  }

  const waitForChunk = () => new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (wake === done) wake = null
      resolve()
    }, 100)
    const done = () => {
      clearTimeout(timeout)
      resolve()
    }
    wake = done
  })
  const producer = apiTTSStream(prepared.spokenText, {
    speaker: segment.speaker || prepared.persona.id,
    voice: prepared.persona.tts?.voice,
    instructions: prepared.ttsInstructions,
  }, (eventName, payload) => {
    if (eventName === 'chunk' && payload?.audio_url) {
      if (!firstChunkAt) firstChunkAt = performance.now()
      chunks.push(payload)
      notify()
    }
  }, { signal: controller.signal }).catch(error => {
    streamError = error
    notify()
  }).finally(() => {
    streamClosed = true
    notify()
  })

  return {
    segment,
    spokenText,
    fallbackDuration,
    chunks,
    controller,
    producer,
    waitForChunk,
    get streamClosed() { return streamClosed },
    get streamError() { return streamError },
    get firstChunkAt() { return firstChunkAt },
  }
}

async function playServerTtsStream(prepared, runId, state = null) {
  const streamState = state || createServerTtsStreamState(prepared)
  const { spokenText, fallbackDuration, chunks, controller, producer, waitForChunk } = streamState

  let playedChunks = 0
  let performanceStarted = false

  while (runId === speechRunId && (!streamState.streamClosed || chunks.length)) {
    if (!chunks.length) {
      if (streamState.streamError) throw streamState.streamError
      await waitForChunk()
      continue
    }

    if (
      playedChunks === 0
      && !streamState.streamClosed
      && chunks.length < SERVER_TTS_STREAM_INITIAL_BUFFER
      && (!streamState.firstChunkAt || performance.now() - streamState.firstChunkAt < SERVER_TTS_STREAM_MAX_INITIAL_WAIT_MS)
    ) {
      await waitForChunk()
      continue
    }

    const chunk = chunks.shift()
    await playAudioUrl(chunk, spokenText, runId, {
      startPerformance: !performanceStarted,
      emotion: prepared.emotion,
    })
    performanceStarted = true
    playedChunks += 1
  }

  if (runId !== speechRunId) {
    controller.abort()
    return
  }

  await producer
  if (streamState.streamError) throw streamState.streamError
  if (!playedChunks) {
    window.playLinPerformance?.(spokenText, prepared.emotion || 'talk', fallbackDuration)
    window.startLinFallbackLipSync?.(spokenText, fallbackDuration)
    await new Promise(resolve => setTimeout(resolve, fallbackDuration * 1000))
    window.stopLinLipSync?.()
  }
}

const createTtsPrefetcher = (preparedSegments) => {
  const promises = new Map()
  const queueTts = (prepared) => requestServerTts(prepared).catch(error => ({ ...prepared, error }))

  const ensure = (index) => {
    if (USE_BROWSER_TTS || index < 0 || index >= preparedSegments.length) return null
    if (!promises.has(index)) {
      promises.set(index, queueTts(preparedSegments[index]))
    }
    return promises.get(index)
  }

  const warm = (startIndex) => {
    if (USE_BROWSER_TTS) return
    const end = Math.min(preparedSegments.length, startIndex + TTS_PREFETCH_AHEAD)
    for (let index = startIndex; index < end; index += 1) ensure(index)
  }

  return { ensure, warm }
}

const getBrowserVoice = () => {
  if (!('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices?.() || []
  return voices.find(voice => /^ko[-_]?KR/i.test(voice.lang))
    || voices.find(voice => /^ko/i.test(voice.lang))
    || voices[0]
    || null
}

const getBrowserVoiceParams = (speaker) => {
  switch (speaker) {
    case 'lin':
      return { pitch: 1.18, rate: 1.06 }
    case 'tobi':
      return { pitch: 1.28, rate: 1.1 }
    case 'gail':
      return { pitch: 0.88, rate: 0.95 }
    case 'doctor':
      return { pitch: 0.96, rate: 0.92 }
    case 'kargas':
      return { pitch: 0.72, rate: 0.82 }
    default:
      return { pitch: 0.9, rate: 0.94 }
  }
}

const cancelBrowserSpeech = () => {
  if (!('speechSynthesis' in window)) return
  if (currentUtterance) {
    window.speechSynthesis.cancel()
    currentUtterance = null
  }
}

const speakWithBrowserTts = (segment, fallbackDuration) => new Promise((resolve, reject) => {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    reject(new Error('Browser speech synthesis is not available.'))
    return
  }

  cancelBrowserSpeech()

  const utterance = new SpeechSynthesisUtterance(segment.text)
  utterance.lang = 'ko-KR'
  applySpeechVolume(utterance, 1)
  const voice = getBrowserVoice()
  if (voice) utterance.voice = voice

  const params = getBrowserVoiceParams(segment.speaker)
  utterance.pitch = params.pitch
  utterance.rate = params.rate

  currentUtterance = utterance
  let settled = false
  const done = () => {
    if (settled) return
    settled = true
    if (currentUtterance === utterance) currentUtterance = null
    window.stopLinLipSync?.()
    resolve()
  }

  const browserEmotion = EMOTION_ANIM_EXCLUDED.has(segment.speaker)
    ? 'talk'
    : detectEmotion(segment.text)
  utterance.onstart = () => {
    window.playLinPerformance?.(segment.text, browserEmotion, fallbackDuration)
    window.startLinFallbackLipSync?.(segment.text, fallbackDuration)
  }
  utterance.onend = done
  utterance.onerror = (event) => {
    if (currentUtterance === utterance) currentUtterance = null
    window.stopLinLipSync?.()
    reject(new Error(event.error || 'Browser speech synthesis failed.'))
  }

  window.speechSynthesis.speak(utterance)
})

const SPEAKER_LABELS = [
  ['린 주점 점원', 'tavern_clerk'],
  ['주점 점원', 'tavern_clerk'],
  ['린', 'lin'],
  ['마르타', 'marta'],
  ['카르가스', 'kargas'],
  ['여우 린', 'lin'],
  ['린', 'lin'],
  ['GM', 'gm'],
  ['진행자', 'gm'],
  ['의사', 'doctor'],
  ['가일', 'gail'],
  ['마르타', 'marta'],
  ['토비', 'tobi'],
  ['카르가스', 'kargas'],
  ['광부', 'miner'],
  ['간호사', 'nurse'],
  ['린 주점 점원', 'tavern_clerk'],
  ['주점 점원', 'tavern_clerk'],
]

const normalizeSpeakerLabel = (label) => {
  const compact = String(label || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const found = SPEAKER_LABELS.find(([name]) => name.toLowerCase() === compact)
  return found?.[1] || 'gm'
}

const QUOTE_PAIRS = { '"': '"', "'": "'", '\u201c': '\u201d', '\u2018': '\u2019' }

const stripOuterQuotes = (value) => {
  const text = String(value || '').trim()
  const close = QUOTE_PAIRS[text[0]]
  if (!close || !text.endsWith(close) || text.length < 2) return text
  return text.slice(1, -1).trim()
}

const consumeLeadingQuote = (value) => {
  const original = String(value || '')
  const leading = original.match(/^\s*/)
  const offset = leading?.[0]?.length || 0
  const text = original.slice(offset)
  const close = QUOTE_PAIRS[text[0]]
  if (!close) return null

  const end = text.indexOf(close, 1)
  if (end < 0) return null

  return {
    quoted: text.slice(1, end).trim(),
    rest: text.slice(end + 1).trim(),
  }
}

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const inferSpeakerFromContext = (context, fallbackSpeaker = 'gm') => {
  const tail = String(context || '').slice(-140)
  let best = null

  SPEAKER_LABELS.forEach(([label, speaker]) => {
    if (speaker === 'gm') return

    const compactLabel = escapeRegExp(label).replace(/\s+/g, '\\s*')
    const pattern = new RegExp(`${compactLabel}(?:이|가|은|는|도|에게|께서|의)?`, 'g')
    let match = null
    let next = pattern.exec(tail)
    while (next) {
      match = next
      next = pattern.exec(tail)
    }

    if (match && (!best || match.index > best.index)) {
      best = { index: match.index, speaker }
    }
  })

  return best?.speaker || fallbackSpeaker
}

const splitSegmentSentences = (segment) => {
  const text = String(segment.text || '').trim()
  if (!text) return []

  const parts = text
    .split(/(?<=[.!?。！？]|[가-힣]\.)(?=\s+)/g)
    .map(part => part.trim())
    .filter(Boolean)

  return (parts.length ? parts : [text]).map(part => ({
    ...segment,
    text: part,
  }))
}

const splitSegmentsIntoSentences = (segments) => {
  const parts = segments.flatMap(splitSegmentSentences)

  return parts.map((segment, index) => {
    if (segment.speaker !== 'gm' || index === 0) return segment

    if (/^(당신(?:은|이|에게|을|를)?|그는|그녀는|그들(?:은)?|주변|장소|공기|분위기|여관|진료소|광산|갱도|정제소)/.test(segment.text)) {
      return { ...segment, speaker: 'gm' }
    }

    const previous = parts[index - 1]?.text || ''
    const inferred = inferSpeakerFromContext(previous, 'gm')
    const previousIntroducesSpeech = /(묻|말|대답|속삭|웃으며|미소|건네|목소리)/.test(previous)
    const looksLikeDialogue = /[?？]$|(?:요|까|나요|습니까)[.!?。！？]?$/.test(segment.text)

    if (inferred !== 'gm' && previousIntroducesSpeech && looksLikeDialogue) {
      return { ...segment, speaker: inferred }
    }

    return segment
  })
}

const mergeShortSpeechSegments = (segments) => {
  const merged = []

  segments.forEach((segment) => {
    const text = String(segment.text || '').trim()
    if (!text) return

    const previous = merged[merged.length - 1]
    const textLength = Array.from(text).length
    const previousLength = previous ? Array.from(previous.text).length : 0
    const shortText = textLength < TTS_MIN_CHARS_PER_REQUEST
    const shortPrevious = previousLength < TTS_MIN_CHARS_PER_REQUEST
    const mergeableLength = previousLength + textLength + 1 <= TTS_MAX_CHARS_PER_REQUEST
    if (previous && previous.speaker === segment.speaker && mergeableLength && (shortText || shortPrevious)) {
      previous.text = `${previous.text} ${text}`.trim()
      return
    }

    merged.push({ ...segment, text })
  })

  return merged
}

const TTS_MIN_CHARS_PER_REQUEST = 24
const TTS_MAX_CHARS_PER_REQUEST = 96
const TTS_PREFETCH_AHEAD = 4

const splitTextIntoTtsChunks = (text, maxChars = TTS_MAX_CHARS_PER_REQUEST) => {
  const source = String(text || '').trim()
  const chars = Array.from(source)
  if (chars.length <= maxChars) return source ? [source] : []

  const chunks = []
  let start = 0
  const sentenceBreakChars = ['.', '!', '?', '。', '！', '？']
  const softBreakChars = [',', '，', ';', '；', ':', '：', ' ']

  const findLastBreak = (value, marks) => marks.reduce((best, mark) => {
    const index = value.lastIndexOf(mark)
    return index > best ? index : best
  }, -1)

  while (start < chars.length) {
    let end = Math.min(start + maxChars, chars.length)
    if (end < chars.length) {
      const windowText = chars.slice(start, end).join('')
      let cut = findLastBreak(windowText, sentenceBreakChars)
      if (cut < Math.floor(maxChars * 0.45)) {
        cut = findLastBreak(windowText, softBreakChars)
      }
      if (cut >= Math.floor(maxChars * 0.45)) {
        end = start + cut + 1
      }
    }

    const chunk = chars.slice(start, end).join('').trim()
    if (chunk) chunks.push(chunk)
    start = end
    while (start < chars.length && /\s/.test(chars[start])) start += 1
  }

  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1]
    const previous = chunks[chunks.length - 2]
    if (
      Array.from(last).length < TTS_MIN_CHARS_PER_REQUEST
      && Array.from(previous).length + Array.from(last).length + 1 <= TTS_MAX_CHARS_PER_REQUEST + 12
    ) {
      chunks.splice(chunks.length - 2, 2, `${previous} ${last}`.trim())
    }
  }

  return chunks
}

const splitLongTtsSegments = (segments) => segments.flatMap(segment => (
  splitTextIntoTtsChunks(segment.text).map(chunk => ({ ...segment, text: chunk }))
))

const splitAttributedQuotes = (text, fallbackSpeaker = 'gm') => {
  const source = String(text || '').trim()
  const segments = []
  const pushSegment = (speaker, value) => {
    const spoken = stripOuterQuotes(value)
    if (spoken) segments.push({ speaker, text: spoken })
  }
  let cursor = 0

  for (let i = 0; i < source.length; i += 1) {
    const close = QUOTE_PAIRS[source[i]]
    if (!close) continue

    const end = source.indexOf(close, i + 1)
    if (end < 0) continue

    const before = source.slice(cursor, i)
    const speaker = inferSpeakerFromContext(source.slice(0, i), fallbackSpeaker)
    pushSegment(fallbackSpeaker, before)
    pushSegment(speaker, source.slice(i + 1, end))
    cursor = end + 1
    i = end
  }

  pushSegment(fallbackSpeaker, source.slice(cursor))
  return splitSegmentsIntoSentences(segments.length ? segments : [{ speaker: fallbackSpeaker, text: source }])
}

const splitSpeechSegments = (text, fallbackSpeaker = 'gm') => {
  const source = String(text || '').trim()
  if (!source) return []

  const labelPattern = /(여우\s*린|린|GM|진행자|의사|가일|마르타|토비|카르가스|광부|간호사|린\s*주점\s*점원|주점\s*점원|점원)\s*[:：]\s*/g
  const cleanLabelPattern = /(린\s*주점\s*점원|주점\s*점원|린|GM|진행자|의사|게일|마르타|토비|카르가스|광부|간호사)\s*[:：]\s*/g
  const matches = [...source.matchAll(cleanLabelPattern), ...source.matchAll(labelPattern)]
    .sort((a, b) => a.index - b.index)
  if (!matches.length) return splitAttributedQuotes(source, fallbackSpeaker)

  const segments = []
  const pushSegment = (speaker, value) => {
    const spoken = stripOuterQuotes(value)
    if (spoken) segments.push({ speaker, text: spoken })
  }

  if (matches[0].index > 0) {
    pushSegment(fallbackSpeaker, source.slice(0, matches[0].index))
  }

  matches.forEach((match, index) => {
    const speaker = normalizeSpeakerLabel(match[1])
    const start = match.index + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index : source.length
    const chunk = source.slice(start, end).trim()
    const quoted = consumeLeadingQuote(chunk)

    if (quoted?.quoted) {
      pushSegment(speaker, quoted.quoted)
      splitAttributedQuotes(quoted.rest, fallbackSpeaker).forEach(segment => pushSegment(segment.speaker, segment.text))
    } else {
      splitAttributedQuotes(chunk, speaker).forEach(segment => pushSegment(segment.speaker, segment.text))
    }
  })

  return splitSegmentsIntoSentences(segments.length ? segments : [{ speaker: fallbackSpeaker, text: source }])
}

const normalizeStorySegments = (segments, fallbackText = '', fallbackSpeaker = 'gm') => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return splitSpeechSegments(fallbackText, fallbackSpeaker)
  }

  const normalized = segments
    .flatMap(segment => {
      const text = String(segment.text || '').trim()
      if (!text) return []

      if ((!segment.speaker || segment.speaker === 'gm') && segment.role === 'gm') {
        return splitSpeechSegments(text, fallbackSpeaker)
      }

      return [{
        speaker: segment.speaker || (segment.role === 'gm' ? 'gm' : fallbackSpeaker),
        text,
      }]
    })
    .filter(segment => segment.text)

  return splitSegmentsIntoSentences(normalized.length ? normalized : [{ speaker: fallbackSpeaker, text: fallbackText }])
}
const stopSpeaking = () => {
  speechRunId++
  _onGmSpeakChange?.(false)
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
  cancelBrowserSpeech()
  // 인터럽트 시 아바타도 같이 정리: 입모양 리셋 + 제스처 모션 정지 → 깜빡/렉 방지
  window.stopLinLipSync?.()
  window.stopLinPerformance?.()
}

async function speakNpc(text, speaker = 'gm', options = {}) {
  const runId = ++speechRunId
  let revealedCount = 0

  try {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      currentAudio = null
    }
    cancelBrowserSpeech()

    const segments = splitLongTtsSegments(mergeShortSpeechSegments(normalizeStorySegments(options.segments, text, speaker)))
    const preparedSegments = segments.map(prepareTtsSegment)
    const prefetcher = createTtsPrefetcher(preparedSegments)
    prefetcher.warm(0)
    console.log('TTS SEGMENTS:', segments)

    for (let index = 0; index < preparedSegments.length; index += 1) {
      if (runId !== speechRunId) return

      const prepared = preparedSegments[index]
      const { segment, spokenText, cleanSegment, fallbackDuration } = prepared
      let segmentRevealed = false
      const revealSegment = () => {
        if (segmentRevealed || runId !== speechRunId) return
        segmentRevealed = true
        _onGmSpeakChange?.(segment.speaker === 'gm')
        options.onSegmentStart?.(segment)
        revealedCount += 1
      }

      if (USE_BROWSER_TTS) {
        revealSegment()
        if (runId !== speechRunId) return
        try {
          await speakWithBrowserTts(cleanSegment, fallbackDuration)

          if (runId !== speechRunId) return
          await new Promise(resolve => setTimeout(resolve, 80))
          continue
        } catch (browserTtsErr) {
          console.warn('Browser TTS fallback to server:', segment.speaker, browserTtsErr)
        }
      }

      try {
        const ttsPromise = prefetcher.ensure(index) || requestServerTts(prepared).catch(error => ({ ...prepared, error }))
        prefetcher.warm(index + 1)
        const ttsResult = await ttsPromise
        if (ttsResult.error) throw ttsResult.error
        if (runId !== speechRunId) return

        const data = ttsResult.data
        console.log('TTS RESPONSE:', data)

        if (runId !== speechRunId) return
        revealSegment()
        if (runId !== speechRunId) return

        const audio = new Audio(data.audio_url)
        audio.preload = 'auto'
        const stopAudioVolume = applyMasterVolume(audio, 1)
        currentAudio = audio

        audio.onplay = () => {
          window.playLinPerformance?.(spokenText, prepared.emotion || data.emotion || 'talk', audio.duration)
          window.startLinLipSync?.(audio, spokenText)
        }

        await new Promise((resolve, reject) => {
          audio.onended = resolve
          audio.onerror = reject
          audio.play().catch(reject)
        })

        window.stopLinLipSync?.()
        stopAudioVolume()
        if (currentAudio === audio) currentAudio = null

        if (runId !== speechRunId) return
        await new Promise(resolve => setTimeout(resolve, 20))
      } catch (segmentErr) {
        console.warn('TTS segment error:', segment.speaker, segmentErr)
        window.stopLinLipSync?.()
        if (currentAudio) {
          currentAudio.pause()
          currentAudio = null
        }
        revealSegment()
        if (runId !== speechRunId) return
        try {
          await speakWithBrowserTts(cleanSegment, fallbackDuration)
          if (runId !== speechRunId) return
          await new Promise(resolve => setTimeout(resolve, 120))
          continue
        } catch (browserFallbackErr) {
          console.warn('Browser TTS fallback failed:', segment.speaker, browserFallbackErr)
        }
        window.playLinPerformance?.(spokenText, prepared.emotion || 'talk', fallbackDuration)
        window.startLinFallbackLipSync?.(spokenText, fallbackDuration)
        await new Promise(resolve => setTimeout(resolve, fallbackDuration * 1000))
        window.stopLinLipSync?.()
        await new Promise(resolve => setTimeout(resolve, 120))
      }
    }

    window.playLinAnimation?.('idle')
  } catch (err) {
    console.warn('TTS error:', err)
    window.stopLinLipSync?.()
    window.playLinAnimation?.('idle')
    options.onFallback?.(splitSpeechSegments(text, speaker).slice(revealedCount))
    window.playLinEmotion?.(text)
  } finally {
    _onGmSpeakChange?.(false)
  }
}

async function playPreparedTtsItem(prepared, ttsPromise, runId, options = {}, ttsStream = null) {
  const { segment, spokenText, cleanSegment, fallbackDuration } = prepared
  if (runId !== speechRunId) return

  let segmentRevealed = false
  const revealSegment = () => {
    if (segmentRevealed || runId !== speechRunId) return
    segmentRevealed = true
    _onGmSpeakChange?.(segment.speaker === 'gm')
    options.onSegmentStart?.(segment)
  }

  if (USE_BROWSER_TTS) {
    revealSegment()
    if (runId !== speechRunId) return
    await speakWithBrowserTts(cleanSegment, fallbackDuration)
    return
  }

  try {
    if (USE_SERVER_TTS_STREAM && (ttsStream || !ttsPromise)) {
      revealSegment()
      if (runId !== speechRunId) return
      await playServerTtsStream(prepared, runId, ttsStream)
      return
    }

    const ttsResult = await (ttsPromise || requestServerTts(prepared).catch(error => ({ ...prepared, error })))
    if (ttsResult.error) throw ttsResult.error
    if (runId !== speechRunId) return

    const data = ttsResult.data
    revealSegment()
    if (runId !== speechRunId) return
    await playAudioUrl(data, spokenText, runId, { emotion: prepared.emotion })
  } catch (segmentErr) {
    console.warn('Streaming TTS segment error:', segment.speaker, segmentErr)
    window.stopLinLipSync?.()
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    revealSegment()
    if (runId !== speechRunId) return
    try {
      await speakWithBrowserTts(cleanSegment, fallbackDuration)
    } catch (browserFallbackErr) {
      console.warn('Browser TTS fallback failed:', segment.speaker, browserFallbackErr)
      window.playLinPerformance?.(spokenText, prepared.emotion || 'talk', fallbackDuration)
      window.startLinFallbackLipSync?.(spokenText, fallbackDuration)
      await new Promise(resolve => setTimeout(resolve, fallbackDuration * 1000))
      window.stopLinLipSync?.()
    }
  }
}

function createStreamingTtsQueue(runId, options = {}) {
  const items = []
  let closed = false
  let wake = null

  const notify = () => {
    if (!wake) return
    const resolve = wake
    wake = null
    resolve()
  }

  const waitForWork = () => new Promise(resolve => { wake = resolve })

  const done = (async () => {
    while (runId === speechRunId && (!closed || items.length)) {
      if (!items.length) {
        await waitForWork()
        continue
      }

      const item = items.shift()
      await playPreparedTtsItem(item.prepared, item.ttsPromise, runId, options, item.ttsStream)
      if (runId !== speechRunId) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    _onGmSpeakChange?.(false)
    window.playLinAnimation?.('idle')
  })()

  return {
    enqueue(segment) {
      const normalized = {
        role: segment.role || (segment.speaker === 'gm' ? 'gm' : 'npc'),
        speaker: segment.speaker || 'gm',
        text: String(segment.text || '').trim(),
      }
      if (!normalized.text) return

      const pieces = splitLongTtsSegments(mergeShortSpeechSegments(normalizeStorySegments([normalized], normalized.text, normalized.speaker)))
      pieces.forEach((piece) => {
        const prepared = prepareTtsSegment(piece)
        const ttsStream = !USE_BROWSER_TTS && USE_SERVER_TTS_STREAM
          ? createServerTtsStreamState(prepared)
          : null
        const ttsPromise = USE_BROWSER_TTS
          || USE_SERVER_TTS_STREAM
          ? null
          : requestServerTts(prepared).catch(error => ({ ...prepared, error }))
        items.push({ prepared, ttsPromise, ttsStream })
      })
      notify()
    },
    close() {
      closed = true
      notify()
    },
    done,
  }
}

export default function Dialogue({
  session,
  story,
  history,
  onHistoryChange,
  onSessionChange,
  onStoryChange,
  onEnding,
  runMapStep,
}) {
  const [log, setLog] = useState(() => toUiLog(history))
  const [input, setInput] = useState('')
  const [choiceMode, setChoiceMode] = useState(false)
  const [choicesCollapsed, setChoicesCollapsed] = useState(false)
  const [activeSpeaker, setActiveSpeaker] = useState(() => getLastNpcSpeaker(toUiLog(history)))
  const [stageNpcSpeaker, setStageNpcSpeaker] = useState(() => getLastStageNpcSpeaker(toUiLog(history)))
  const [stageLocation, setStageLocation] = useState(null)
  const [judge, setJudge] = useState(null)
  const [judgeResult, setJudgeResult] = useState(null)
  const [sending, setSending] = useState(false)
  const [choices, setChoices] = useState([])
  const [npcTestRunning, setNpcTestRunning] = useState(false)
  const [shortTtsTestRunning, setShortTtsTestRunning] = useState(false)
  const [gmSpeaking, setGmSpeaking] = useState(false)
  const [inspectMode, setInspectMode] = useState(false)
  const [inspectIndex, setInspectIndex] = useState(0)
  const [evalOpen, setEvalOpen] = useState(false)   // 정량검사 패널(모델검사 옆 버튼)
  // 캐릭터 GLB를 미리 받아 둔다(특히 31MB 가일 등). 발화 시점엔 이미 브라우저 캐시에 있어
  // "첫 발화에서 모델 로드가 늦어 입이 안 움직이는" 레이스를 줄인다.
  useEffect(() => {
    CHARACTER_MODELS.forEach((m) => {
      if (m.modelPath) fetch(m.modelPath).catch(() => {})
    })
  }, [])
  // 모델검사 패널 위치(px). null이면 CSS 기본(우측 도킹). 드래그로 이동 가능.
  const [inspectPanelPos, setInspectPanelPos] = useState(null)
  const inspectDragRef = useRef(null)
  const startInspectDrag = (e) => {
    const panel = e.currentTarget.closest('.inspect-panel')
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    inspectDragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    const onMove = (ev) => {
      const d = inspectDragRef.current
      if (!d) return
      const x = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - d.dx))
      const y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - d.dy))
      setInspectPanelPos({ x, y })
    }
    const onUp = () => {
      inspectDragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const [tavernCastMode, setTavernCastMode] = useState('clerk')
  const tavernCastModeRef = useRef('clerk')
  const logRef = useRef(null)
  const judgeRef = useRef(null)
  const judgeTimerRef = useRef(null)
  const mappingRef = useRef(false)
  const spokenRef = useRef(new Set())
  const locationBgmRef = useRef({ path: null, audio: null })
  const holdChoicesRef = useRef(false)
  const storyChoicesRef = useRef([])
  const pendingEndingRef = useRef(null)
  const tavernSegmentRef = useRef(0)
  const sceneContext = {
    storyId: story?.id || '',
    location: stageLocation || story?.location || session?.location || '',
  }
  const isTavernLinScene = TAVERN_LIN_SCENES.has(story?.id)
  const rememberStageNpc = (speaker) => {
    if (!speaker || speaker === 'gm' || speaker === 'player') return
    if (CHARACTER_MODELS.some(c => c.speaker === speaker)) {
      setStageNpcSpeaker(speaker)
    }
  }

  const setTavernMode = (mode) => {
    tavernCastModeRef.current = mode
    setTavernCastMode(mode)
  }

  const updateTavernCastMode = (segment) => {
    if (!isTavernLinScene) return
    const text = String(segment?.text || '')
    const speaker = segment?.speaker || ''
    if (story?.id !== 'tavern_rin') {
      if (speaker === 'tavern_clerk' || text.includes('점원')) {
        setTavernMode('clerk')
      } else {
        setTavernMode('lin')
      }
      return
    }
    if (text.includes('점원이 물러나자') || text.includes('당신 쪽으로 천천히 다가옵니다')) {
      setTavernMode('lin')
      return
    }
    if (tavernCastModeRef.current === 'lin') {
      setTavernMode('lin')
      return
    }
    if (
      text.includes('당신의 목적') ||
      text.includes('낮게 보고') ||
      text.includes('주인님') ||
      text.includes('어떻게 할까요') ||
      text.includes('내가 직접 상대') ||
      text.includes('다른 일') ||
      text.includes('일 봐')
    ) {
      setTavernMode('both')
      return
    }
    if (speaker === 'lin') {
      setTavernMode('both')
      return
    }
    setTavernMode('clerk')
  }

  const updateTavernCastModeByStep = () => {
    if (!isTavernLinScene) return
    if (story?.id !== 'tavern_rin') {
      setTavernMode('lin')
      return
    }
    const index = tavernSegmentRef.current
    tavernSegmentRef.current += 1
    if (index <= 1) {
      setTavernMode('clerk')
    } else if (index <= 4) {
      setTavernMode('both')
    } else {
      setTavernMode('lin')
    }
  }

  const normalizeChoices = (value) => {
    if (!Array.isArray(value)) return []
    return value
      .map((choice, index) => {
        if (typeof choice === 'string') return { id: `roll-${index}`, text: choice, kind: 'roll' }
        if (choice && typeof choice === 'object') return { ...choice, kind: choice.kind || 'story' }
        return null
      })
      .filter(Boolean)
  }

  const getChoiceText = (choice) => typeof choice === 'string' ? choice : choice?.text

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  const getChoiceMapDest = (choice) => {
    const source = `${choice?.id || ''} ${choice?.text || ''}`.toLowerCase()
    if (/clinic|nurse|진료소|간호사/.test(source)) return 'clinic'
    if (/ledger|장부|정제소|암시장|표식/.test(source)) return 'refinery'
    if (/marta|마르타|오두막|전설/.test(source)) return 'marta'
    if (/memory|자장가|기억|약속|tobi|토비/.test(source)) return 'memory'
    if (/deep|심부|갱도/.test(source)) return 'deep'
    if (/peak|kargas|boss|봉우리|카르가스|엔딩/.test(source)) return 'peak'
    if (/mine|miner|광산|광부|명부|운송/.test(source)) return 'mine'
    if (/night|watch|마을|광장|밤|관찰/.test(source)) return 'village'
    if (/tavern|rin|lin|여관|린/.test(source)) return 'tavern'
    return 'mystery'
  }

  const withoutRollLog = (text) => String(text || '').replace(/^GM:\s*D12 result.*(?:\r?\n|$)/m, '').trim()

  const fallbackChoicesForExplicitQuestion = (text) => {
    const source = String(text || '')
    const asksFirstRoute = /린을\s*찾아가|여관의\s*린|여관.*린/.test(source)
      && /광산\s*쪽|광산.*상황|광산으로/.test(source)
      && /겠습니까|습니까|까요|\?/.test(source)
    if (asksFirstRoute) return normalizeChoices([
      { id: 'clinic_to_tavern', text: '여관에서 린과 마을 소문을 거래한다', kind: 'story' },
      { id: 'clinic_to_mine', text: '광산 쪽 상황을 직접 살핀다', kind: 'story' },
    ])

    const asksRinNextAction = /다음\s*행동|행동을\s*선택|어떤\s*정보|정보를\s*제공|다른\s*질문/.test(source)
      && /린|여관|주점|소문/.test(source)
    if (asksRinNextAction) return normalizeChoices([
      { id: 'rin_follow_hint', text: '린에게 광부 실종 소문의 출처를 묻는다', kind: 'story' },
      { id: 'rin_press_plot', text: '린이 숨기는 의도를 떠본다', kind: 'story' },
      { id: 'rin_to_mine', text: '여관을 나와 광산에서 직접 확인한다', kind: 'story' },
    ])

    return []
  }

  const getRollTier = (value) => {
    if (value <= 4) return { key: 'bad', label: 'Bad', className: 'fail' }
    if (value <= 8) return { key: 'normal', label: 'Normal', className: 'normal' }
    return { key: 'good', label: 'Good', className: 'success' }
  }

  useEffect(() => {
    rememberStageNpc(activeSpeaker)
  }, [activeSpeaker])

  useEffect(() => {
    const last = history?.[history.length - 1]
    const speaker = last?.role === 'assistant' ? (last.speaker || 'gm') : 'player'
    const key = `${history?.length || 0}:${speaker}:${last?.content || ''}`

    if (last?.role === 'assistant' && last?.speak && !spokenRef.current.has(key)) {
      const previousLog = toUiLog(history.slice(0, -1))
      setLog(previousLog)
      setActiveSpeaker(getLastNpcSpeaker(previousLog))
      const previousStageNpc = getLastStageNpcSpeaker(previousLog)
      if (previousStageNpc) setStageNpcSpeaker(previousStageNpc)
      spokenRef.current.add(key)
      holdChoicesRef.current = true
      setChoices([])
      setTimeout(async () => {
        try {
          await speakNpc(last.content || '', speaker, {
            segments: normalizeStorySegments(last.segments, last.content || '', speaker),
            onSegmentStart: (segment) => {
              updateTavernCastMode(segment)
              setActiveSpeaker(segment.speaker)
              rememberStageNpc(segment.speaker)
              setLog(prev => [...prev, { who: segment.speaker, text: segment.text, speak: false }])
            },
            onFallback: (segments) => {
              const fallbackStageNpc = getLastStageNpcSpeaker(segments.map(segment => ({ who: segment.speaker })))
              if (fallbackStageNpc) setStageNpcSpeaker(fallbackStageNpc)
              setLog(prev => [
                ...prev,
                ...segments.map(segment => ({ who: segment.speaker, text: segment.text, speak: false })),
              ])
            },
          })
        } finally {
          holdChoicesRef.current = false
          setChoices(storyChoicesRef.current)
          if (pendingEndingRef.current) {
            const ending = pendingEndingRef.current
            pendingEndingRef.current = null
            onEnding?.(ending)
          }
        }
      }, 250)
      return
    }

    const next = toUiLog(history)
    setLog(next)
    setActiveSpeaker(getLastNpcSpeaker(next))
    const nextStageNpc = getLastStageNpcSpeaker(next)
    if (nextStageNpc) setStageNpcSpeaker(nextStageNpc)
  }, [history])

  useEffect(() => {
    const nextChoices = normalizeChoices(story?.choices || [])
    storyChoicesRef.current = nextChoices
    if (!holdChoicesRef.current) setChoices(nextChoices)
    setChoicesCollapsed(false)
  }, [story?.id, story?.choices])

  useEffect(() => {
    if (isTavernLinScene) {
      tavernSegmentRef.current = 0
      setTavernMode(story?.id === 'tavern_rin' ? 'clerk' : 'lin')
    } else {
      setActiveSpeaker('gm')
    }
  }, [story?.id, isTavernLinScene])

  const push = (who, text, options = {}) => {
    if (who !== 'player' && CHARACTER_MODELS.some(c => c.speaker === who)) {
      setActiveSpeaker(who)
      rememberStageNpc(who)
    }

    if (onHistoryChange) {
      const role = who === 'player' ? 'user' : 'assistant'
      onHistoryChange(prev => [...prev, {
        role,
        speaker: who,
        content: text,
        segments: options.segments,
        speak: Boolean(options.speak),
      }])
    } else {
      const next = who === 'player'
        ? [{ who, text, speak: Boolean(options.speak) }]
        : splitSpeechSegments(text, who).map(segment => ({ who: segment.speaker, text: segment.text, speak: false }))
      if (who !== 'player' && options.speak) {
        speakNpc(text, who, {
          segments: options.segments,
          onSegmentStart: (segment) => {
            setActiveSpeaker(segment.speaker)
            rememberStageNpc(segment.speaker)
            setLog(l => [...l, { who: segment.speaker, text: segment.text, speak: false }])
          },
          onFallback: (segments) => {
            setLog(l => [
              ...l,
              ...segments.map(segment => ({ who: segment.speaker, text: segment.text, speak: false })),
            ])
          },
        })
      } else {
        setLog(l => [...l, ...next])
      }
    }
  }

  const advanceOnMap = (dest, opts = {}) => {
    if (!runMapStep || mappingRef.current) return
    mappingRef.current = true
    runMapStep(dest).then(({ ending, aborted, kind }) => {
      mappingRef.current = false
      if (aborted) return
      if (opts.silent) return
      const nextLocation = getMapResultLocation(kind)
      if (nextLocation) setStageLocation(nextLocation)
      if (ending) {
        push('gm', '안갯속 길의 끝. 봉우리의 둥지가 모습을 드러낸다. (엔딩 노드 도달)', { speak: true })
        return
      }
      push('gm', `안개를 헤치고 '${kind}' 발판에 닿았다. 다시 이야기가 이어진다.`, { speak: true })
    })
  }

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log, choiceMode])

  useEffect(() => () => stopSpeaking(), [])
  useEffect(() => () => clearTimeout(judgeTimerRef.current), [])
  useEffect(() => {
    _onGmSpeakChange = setGmSpeaking
    return () => { _onGmSpeakChange = null }
  }, [])

  // --- 팔 꺾임 검사용 모델 뷰어 ---
  const stepInspect = (dir) => setInspectIndex(i =>
    (i + dir + CHARACTER_MODELS.length) % CHARACTER_MODELS.length)

  const triggerInspectGesture = (gesture) => {
    if (!gesture.text) {
      window.playLinAnimation?.('idle', { loop: true })
      return
    }
    window.playLinProcedural?.(gesture.text, gesture.emotion, 4)
  }

  useEffect(() => {
    if (!inspectMode) return undefined
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' || e.key === '[') { e.preventDefault(); stepInspect(-1) }
      else if (e.key === 'ArrowRight' || e.key === ']') { e.preventDefault(); stepInspect(1) }
      else if (e.key === 'Escape') setInspectMode(false)
      else if (e.key === ' ' || e.key.toLowerCase() === 'g') {
        e.preventDefault()
        triggerInspectGesture(INSPECT_GESTURES[1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inspectMode])

  const triggerJudge = (dc = 11, stat = '지각', opts = {}) => {
    judgeRef.current = {
      dc, stat, after: opts.after,
      onSuccess: opts.onSuccess || 'shop', onFail: opts.onFail || 'event', success: null,
      mode: opts.mode, resolve: opts.resolve, result: null,
    }
    setJudge({ dc, stat })
    setJudgeResult(null)
  }

  const rollForStoryChoice = () => new Promise(resolve => {
    triggerJudge(9, 'D12', { mode: 'story', resolve })
  })

  const handleRollDone = (result) => {
    const dc = judgeRef.current?.dc ?? 0
    const success = result >= dc
    if (judgeRef.current) judgeRef.current.success = success
    if (judgeRef.current) judgeRef.current.result = result
    setJudgeResult({ result, success })
    clearTimeout(judgeTimerRef.current)
    if (judgeRef.current?.mode === 'story') {
      judgeTimerRef.current = setTimeout(() => doCloseJudge(), 1200)
      return
    }
    judgeTimerRef.current = setTimeout(() => doCloseJudge(), 3000)
  }

  const doCloseJudge = () => {
    clearTimeout(judgeTimerRef.current)
    const ref = judgeRef.current || {}
    judgeRef.current = null
    setJudge(null)
    setJudgeResult(null)
    if (ref.mode === 'story') {
      ref.resolve?.(ref.result)
      return
    }
    if (ref.after) ref.after()
    else if (ref.stat) push('gm', `${ref.stat} 판정 ${ref.success ? '성공' : '실패'} - 길이 갈라진다.`, { speak: true })
    const dest = ref.success ? ref.onSuccess : ref.onFail
    advanceOnMap(dest)
  }

  const closeJudgeModal = () => {
    if (!judgeResult) return
    doCloseJudge()
  }

  const runNpcDialogueTest = async () => {
    if (npcTestRunning || shortTtsTestRunning) return
    setNpcTestRunning(true)
    setChoiceMode(false)
    setLog(prev => [
      ...prev,
      { who: 'gm', text: '[NPC 대화 테스트 시작]', speak: false },
    ])

    try {
      for (const line of NPC_DIALOGUE_TEST_LINES) {
        // eslint-disable-next-line no-await-in-loop
        await speakNpc(line.text, line.speaker, {
          onSegmentStart: (segment) => {
            setActiveSpeaker(segment.speaker)
            setLog(prev => [...prev, { who: segment.speaker, text: segment.text, speak: false }])
          },
          onFallback: (segments) => {
            setLog(prev => [
              ...prev,
              ...segments.map(segment => ({ who: segment.speaker, text: segment.text, speak: false })),
            ])
          },
        })
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 220))
      }
    } finally {
      setNpcTestRunning(false)
    }
  }

  const runShortTtsTest = async () => {
    if (npcTestRunning || shortTtsTestRunning) return
    setShortTtsTestRunning(true)
    setChoiceMode(false)
    setLog(prev => [
      ...prev,
      { who: 'gm', text: '[짧은 TTS 테스트 시작]', speak: false },
    ])

    try {
      for (const line of SHORT_TTS_TEST_LINES) {
        // eslint-disable-next-line no-await-in-loop
        await speakNpc(line.text, line.speaker, {
          onSegmentStart: (segment) => {
            setActiveSpeaker(segment.speaker)
            setLog(prev => [...prev, { who: segment.speaker, text: segment.text, speak: false }])
          },
          onFallback: (segments) => {
            setLog(prev => [
              ...prev,
              ...segments.map(segment => ({ who: segment.speaker, text: segment.text, speak: false })),
            ])
          },
        })
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 220))
      }
    } finally {
      setShortTtsTestRunning(false)
    }
  }

  const sendText = async (raw) => {
    const text = String(raw || '').trim()
    if (!text || sending || bgLoading) return   // AI 배경 생성 중엔 대화 진행 차단

    stopSpeaking()
    push('player', text)
    setInput('')
    setChoices([])
    setChoiceMode(false)

    if (!session?.id) {
      push('gm', '타이틀에서 새 게임을 시작해 주세요.', { speak: false })
      return
    }

    setSending(true)
    try {
      const prevLoc = session?.location
      const streamRunId = ++speechRunId
      const streamedSegments = []
      let receivedStreamSegment = false

      holdChoicesRef.current = true

      const revealResponse = (data, segments, streamed = false) => {
        onSessionChange?.(data.session)
        if (data.story) onStoryChange?.(data.story)

        // GM이 이번 대화로 위치를 옮겼으면(세션 location 변경) 인트로/씬의 stage·story 고정을 풀어 새 배경 반영
        const newLoc = data.session?.location
        if (newLoc && newLoc !== prevLoc) {
          setStageLocation(null)
          if (story?.location && story.location !== newLoc) onStoryChange?.(null)
        }

        const finalSegments = normalizeStorySegments(
          segments || data.segments,
          data.answer,
          'gm',
        )
        const finalChoices = normalizeChoices(data.choices)
        const reveal = {
          answer: data.answer,
          segments: finalSegments,
          choices: finalChoices,
        }

        // 비고정 장소로 배경이 새로 '생성'될 예정이면 GM 대사+음성을 보류 → 생성 완료 후 함께 공개
        const willGen = newLoc && !getLocationBackground(newLoc)
          && !genBg[newLoc] && !bgTriedRef.current.has(newLoc)
        if (willGen) {
          pendingRevealRef.current = reveal
          holdChoicesRef.current = false
          return
        }

        storyChoicesRef.current = finalChoices
        if (streamed && finalSegments.length) {
          const streamingTts = createStreamingTtsQueue(streamRunId, {
            onSegmentStart: (segment) => {
              updateTavernCastMode(segment)
              setActiveSpeaker(segment.speaker || 'gm')
              setLog(prev => [...prev, { who: segment.speaker || 'gm', text: segment.text, speak: false }])
            },
          })
          finalSegments.forEach(segment => {
            updateTavernCastMode(segment)
            streamingTts.enqueue(segment)
          })
          streamingTts.close()
          streamingTts.done.catch(error => console.warn('Streaming TTS queue failed:', error))
          if (onHistoryChange) {
            onHistoryChange(prev => [...prev, {
              role: 'assistant',
              speaker: 'gm',
              content: data.answer,
              segments: finalSegments,
              speak: false,
            }])
          }
        } else {
          push('gm', data.answer, {
            speak: true,
            segments: finalSegments,
          })
        }

        holdChoicesRef.current = false
        setChoices(storyChoicesRef.current)
      }

      // 1:1 대화 상대: 화면 속 NPC(activeSpeaker)가 GM이 아니면 focus로 보내 GM 가로채기를 막는다.
      const focusNpc = activeSpeaker && activeSpeaker !== 'gm' ? activeSpeaker : null

      let finalData = null
      try {
        finalData = await apiChatStream(session.id, text, (eventName, payload) => {
          if (eventName !== 'segment') return
          const segment = payload.segment || {}
          const normalized = {
            role: segment.role || (segment.speaker === 'gm' ? 'gm' : 'npc'),
            speaker: segment.speaker || 'gm',
            text: String(segment.text || '').trim(),
          }
          if (!normalized.text) return

          receivedStreamSegment = true
          streamedSegments.push(normalized)
        }, focusNpc)
      } catch (streamErr) {
        console.warn('Streaming chat failed; falling back to non-stream chat:', streamErr)
      }

      if (!finalData) {
        finalData = await apiChat(session.id, text, focusNpc)
        revealResponse(finalData, finalData.segments, false)
        return
      }

      revealResponse(
        finalData,
        finalData.segments || streamedSegments,
        receivedStreamSegment,
      )
    } catch (err) {
      holdChoicesRef.current = false
      push('gm', `오류: ${err.message}`, { speak: false })
    } finally {
      holdChoicesRef.current = false
      setSending(false)
    }
  }

  const send = () => sendText(input)

  const [endingJumping, setEndingJumping] = useState(false)
  const jumpEnding = async (kind) => {
    if (!session?.id || endingJumping) return
    stopSpeaking()
    setEndingJumping(true)
    setSending(true)
    setChoices([])
    push('gm', `(테스트) '${kind}' 엔딩을 생성하는 중입니다… 잠시만 기다려 주세요.`, { speak: false })
    try {
      const data = await apiDebugEnding(session.id, kind)
      onSessionChange?.(data.session)
      if (data.ending) onEnding?.(data.ending)
    } catch (err) {
      push('gm', `엔딩 테스트 오류: ${err.message}`, { speak: false })
    } finally {
      setEndingJumping(false)
      setSending(false)
    }
  }

  const pickChoice = (c) => {
    push('player', `[선택] ${c.text}`)
    setChoiceMode(false)
    if (c.judge) {
      triggerJudge(c.dc, c.stat)
    } else {
      setTimeout(() => {
        push('lin', '그래요, 거래는 늘 환영이죠.', { speak: true })
        advanceOnMap()
      }, 450)
    }
  }

  const chooseVisibleChoice = async (choice) => {
    const normalized = normalizeChoices([choice])[0]
    if (!normalized || sending) return

    if (normalized.kind !== 'story') {
      sendText(normalized.text)
      return
    }

    stopSpeaking()
    holdChoicesRef.current = true
    setSending(true)
    setChoices([])
    setChoiceMode(false)
    push('player', `[선택] ${normalized.text}`)

    let revealAfterSpeech = false
    try {
      await wait(650)
      const roll = normalized.no_roll ? undefined : await rollForStoryChoice()
      if (!normalized.no_roll && !roll) {
        setChoices(storyChoicesRef.current)
        return
      }

      const mapResult = runMapStep
        ? await runMapStep(getChoiceMapDest(normalized))
        : { aborted: false }
      if (mapResult?.aborted) {
        setChoices(storyChoicesRef.current)
        return
      }

      const data = await apiStoryChoice(session.id, normalized.id, roll)
      onSessionChange?.(data.session, data.scene)
      onStoryChange?.(data.scene)
      if (data.scene?.location) setStageLocation(data.scene.location)
      if (data.ending_reached) pendingEndingRef.current = data.ending_reached
      if (data.roll?.note) {
        push('gm', `D12 ${data.roll.value} - ${data.roll.note}`, { speak: false })
      }
      const spokenAnswer = withoutRollLog(data.answer)
      push('gm', spokenAnswer, {
        speak: true,
        segments: normalizeStorySegments(null, spokenAnswer, 'gm'),
      })
      const nextChoices = normalizeChoices(data.choices)
      storyChoicesRef.current = nextChoices
      revealAfterSpeech = true
    } catch (err) {
      push('gm', `오류: ${err.message}`, { speak: false })
      holdChoicesRef.current = false
      setChoices(storyChoicesRef.current)
    } finally {
      if (!revealAfterSpeech) holdChoicesRef.current = false
      setSending(false)
    }
  }

  const activeCharacter = CHARACTER_MODELS.find(c => c.speaker === activeSpeaker) || CHARACTER_MODELS[0]
  const gmCharacter = CHARACTER_MODELS.find(c => c.speaker === 'gm') || CHARACTER_MODELS[0]
  const stageNpcCharacter = CHARACTER_MODELS.find(c => c.speaker === stageNpcSpeaker)
  const inspectCharacter = CHARACTER_MODELS[inspectIndex] || CHARACTER_MODELS[0]
  const npcTestCharacters = NPC_TEST_SPEAKERS
    .map(speaker => CHARACTER_MODELS.find(c => c.speaker === speaker))
    .filter(Boolean)
  const stagedNpcTestCharacters = npcTestCharacters
    .filter(character => character.speaker !== activeSpeaker)
    .concat(npcTestCharacters.filter(character => character.speaker === activeSpeaker))
  const testStageRunning = npcTestRunning || shortTtsTestRunning
  const storyEnsemble = isTavernLinScene
    ? (STORY_ENSEMBLES[`tavern_${tavernCastMode}`] || [])
    : []
  const stagedStoryCharacters = storyEnsemble
    .map(entry => ({
      ...entry,
      character: CHARACTER_MODELS.find(c => c.speaker === entry.speaker),
    }))
    .filter(entry => entry.character)
  const [appSettings, setAppSettings] = useState(() => loadSettings())   // 레이아웃은 설정 패널에서 토글
  useEffect(() => subscribeSettings(setAppSettings), [])
  const layoutMode = appSettings.layout === 'split' ? 'split' : 'stacked'
  const splitLayout = layoutMode === 'split'
  const [chatSize, setChatSize] = useState(() => loadChatSize())
  const [panelSizes, setPanelSizes] = useState(() => loadPanelSizes())

  const resetChatSize = () => {
    setChatSize(DEFAULT_CHAT_SIZE)
    saveChatSize(DEFAULT_CHAT_SIZE)
  }

  const resetPanelSizes = () => {
    const next = normalizePanelSizes(DEFAULT_PANEL_SIZES)
    setPanelSizes(next)
    savePanelSizes(next)
  }

  const startChatResize = (e) => {
    e.preventDefault()
    e.stopPropagation()

    const mode = splitLayout && window.innerWidth > 900 ? 'split' : 'stacked'
    const startX = e.clientX
    const startY = e.clientY
    const startValue = chatSize[mode]
    const limits = CHAT_SIZE_LIMITS[mode]
    let nextSize = chatSize

    document.body.classList.add('resizing-chat')

    const onMove = (ev) => {
      const delta = mode === 'split'
        ? ((startX - ev.clientX) / Math.max(1, window.innerWidth)) * 100
        : ((startY - ev.clientY) / Math.max(1, window.innerHeight)) * 100
      const value = Math.round(clampNumber(startValue + delta, limits.min, limits.max) * 10) / 10
      nextSize = normalizeChatSize({ ...nextSize, [mode]: value })
      setChatSize(nextSize)
    }

    const onUp = () => {
      document.body.classList.remove('resizing-chat')
      saveChatSize(nextSize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const startPanelResize = (boundary, e) => {
    e.preventDefault()
    e.stopPropagation()

    const section = e.currentTarget.closest('.chat-section')
    const rect = section?.getBoundingClientRect()
    const flexDirection = section ? window.getComputedStyle(section).flexDirection : (splitLayout ? 'column' : 'row')
    const mode = flexDirection.includes('column') ? 'split' : 'stacked'
    const mainSize = Math.max(1, mode === 'split' ? (rect?.height || window.innerHeight) : (rect?.width || window.innerWidth))
    const startX = e.clientX
    const startY = e.clientY
    const startSizes = panelSizes
    const startModeSizes = startSizes[mode]
    let nextSizes = startSizes

    document.body.classList.add('resizing-panel', mode === 'split' ? 'resizing-panel-vertical' : 'resizing-panel-horizontal')

    const onMove = (ev) => {
      const delta = mode === 'split'
        ? ((ev.clientY - startY) / mainSize) * 100
        : ((ev.clientX - startX) / mainSize) * 100
      const nextModeSizes = { ...startModeSizes }

      if (mode === 'stacked') {
        if (boundary === 'choices-dialogue') {
          nextModeSizes.choices = clampPanelModeValue(startModeSizes, mode, 'choices', startModeSizes.choices + delta)
        } else {
          nextModeSizes.avatar = clampPanelModeValue(startModeSizes, mode, 'avatar', startModeSizes.avatar - delta)
        }
      } else if (boundary === 'dialogue-avatar') {
        nextModeSizes.avatar = clampPanelModeValue(startModeSizes, mode, 'avatar', startModeSizes.avatar + delta)
      } else {
        nextModeSizes.choices = clampPanelModeValue(startModeSizes, mode, 'choices', startModeSizes.choices - delta)
      }

      nextSizes = normalizePanelSizes({ ...startSizes, [mode]: nextModeSizes })
      setPanelSizes(nextSizes)
    }

    const onUp = () => {
      document.body.classList.remove('resizing-panel', 'resizing-panel-vertical', 'resizing-panel-horizontal')
      savePanelSizes(nextSizes)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // 배경: 핵심 장소=고정 이미지, 그 외=AI 즉석 생성(+gen 깊이맵으로 2.5D)
  const [genBg, setGenBg] = useState({})
  const [bgLoading, setBgLoading] = useState(false)
  const bgTriedRef = useRef(new Set())
  const pendingRevealRef = useRef(null)   // 배경 생성 중 보류한 GM 대사(생성 후 음성과 함께 공개)
  // 배경은 '실제 게임 위치'를 따른다. story.location(멈춰있는 인트로 씬)은 배경 결정에서 제외 —
  // 안 그러면 자유 이동해도 인트로 씬 위치(진료소)가 계속 덮어 AI 배경 생성이 안 됨.
  const curLoc = stageLocation || session?.location
  const locationBackground = getLocationBackground(curLoc) || (curLoc ? genBg[curLoc] : null) || null
  const missionTitle = story?.title || story?.objective || story?.name || curLoc || '잃어버린 단서를 추적한다'
  const missionPlace = curLoc || '현재 위치 미상'
  const companionName = gmCharacter.name || SPEAKERS.gm?.name || 'GM'
  const companionRole = gmSpeaking || activeSpeaker === 'gm' ? '서술자 · 세계 안내자' : '상황을 관찰하는 동행자'
  useEffect(() => {
    if (!curLoc || !session?.id) return
    if (getLocationBackground(curLoc)) return            // 고정 배경 있으면 생성 안 함
    if (genBg[curLoc] || bgTriedRef.current.has(curLoc)) return
    bgTriedRef.current.add(curLoc)
    setBgLoading(true)
    apiGenerateBackground(session.id, curLoc)
      .then(d => { if (d.url) setGenBg(p => ({ ...p, [curLoc]: d.url })) })
      .catch(() => {})
      .finally(() => {
        setBgLoading(false)
        const pr = pendingRevealRef.current   // 보류해 둔 GM 대사를 이제 음성과 함께 공개
        if (pr) {
          pendingRevealRef.current = null
          push('gm', pr.answer, { speak: true, segments: pr.segments })
          storyChoicesRef.current = pr.choices
        }
      })
  }, [curLoc, session?.id])
  const locationBgm = getLocationBgm([
    sceneContext.storyId,
    stageLocation || story?.location || session?.location,
    (session?.stage?.index ?? 0) >= 4 ? '카르가스 전투' : '',
  ].join(' '))

  useEffect(() => {
    const current = locationBgmRef.current
    if (current.audio && current.path !== locationBgm?.path) {
      current.audio.pause()
      current.audio.currentTime = 0
      locationBgmRef.current = { path: null, audio: null }
    }

    if (!locationBgm) return undefined

    if (!locationBgmRef.current.audio) {
      const audio = new Audio(locationBgm.path)
      audio.loop = true
      locationBgmRef.current = { path: locationBgm.path, audio }
    }

    const audio = locationBgmRef.current.audio
    const stopVolume = applyBgmVolume(audio, locationBgm.volume)
    const stopRetry = playWhenAllowed(audio)

    return () => {
      stopVolume()
      stopRetry()
      audio.pause()
    }
  }, [locationBgm?.path, locationBgm?.volume])

  const dialogueStyle = {
    '--chat-stacked-height': `${chatSize.stacked}vh`,
    '--chat-split-width': `${chatSize.split}%`,
    '--panel-stacked-choices': `${panelSizes.stacked.choices}%`,
    '--panel-stacked-avatar': `${panelSizes.stacked.avatar}%`,
    '--panel-split-avatar': `${panelSizes.split.avatar}%`,
    '--panel-split-choices': `${panelSizes.split.choices}%`,
    ...(locationBackground ? { '--location-bg': `url("${locationBackground}")` } : {}),
  }

  return (
    <div
      className={`dialogue layout-${layoutMode}${splitLayout ? ' layout-split' : ''}${locationBackground ? ' has-location-bg' : ''}`}
      style={dialogueStyle}
    >
      {locationBackground && <ParallaxBackground image={locationBackground} fx={getFx(curLoc)} />}
      {bgLoading && (
        <div className="bg-gen-loading">
          <div className="bg-gen-spinner" />
          <div className="bg-gen-title">AI가 새 장소를 그리는 중…</div>
          <div className="bg-gen-sub">잠시만 기다려 주세요</div>
        </div>
      )}
      <div className="bg-embers" />

      {judge && (
        <div className="dice-modal-overlay" onClick={closeJudgeModal}>
          <div className="dice-modal">
            <button className="dice-modal-close" onClick={closeJudgeModal}>×</button>
            <div className="dice-modal-title">{judge.stat} 판정 · DC {judge.dc}</div>
            <D12 size={130} autoRoll={{ dc: judge.dc }} onDone={handleRollDone} />
            {judgeResult && (
              <>
                <div className={`dice-modal-result ${judgeResult.success ? 'success' : 'fail'}`}>
                  {judgeResult.success ? '성공!' : '실패'}
                </div>
                <div className="dice-modal-roll-num">
                  {judgeResult.result} / DC {judge.dc}
                </div>
                <div className="dice-modal-hint">클릭하거나 3초 뒤 자동으로 닫힙니다</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="vn-stage">
        <div className="stage-tools">
          <button onClick={() => setChoiceMode(v => !v)}>선택지</button>
          <button onClick={() => triggerJudge(11, '지각')}>판정</button>
          <button onClick={() => advanceOnMap()}>지도</button>
          <button onClick={runNpcDialogueTest} disabled={testStageRunning}>
            {npcTestRunning ? '대화중' : 'NPC 테스트'}
          </button>
          <button onClick={runShortTtsTest} disabled={testStageRunning}>
            {shortTtsTestRunning ? 'TTS중' : '짧은TTS'}
          </button>
          {['노멀', '트루', '히든', '베드'].map(k => (
            <button key={k} onClick={() => jumpEnding(k)} disabled={endingJumping || !session?.id}
              title={`${k} 엔딩으로 즉시 점프 (테스트)`}>
              {endingJumping ? '…' : `▶${k}`}
            </button>
          ))}
          <button onClick={() => setInspectMode(v => !v)}
            title="NPC 모델을 하나씩 불러와 팔 꺾임을 점검 ([ ] 이동, G 제스처, Esc 종료)">
            {inspectMode ? '검사종료' : '모델검사'}
          </button>
          <button onClick={() => setEvalOpen(true)}
            title="NPC별 대화품질(G-Eval)·발음(CER)·립싱크를 측정해 그래프로 표시">
            정량검사
          </button>
        </div>
        {evalOpen && <EvalPanel onClose={() => setEvalOpen(false)} />}
        {inspectMode ? (
          <div className="char-center inspect-stage" data-speaker={inspectCharacter.speaker}>
            <Character3D
              key={`inspect-${inspectCharacter.speaker}`}
              modelPath={inspectCharacter.modelPath}
              hideTeeth={inspectCharacter.hideTeeth}
              modelRotation={inspectCharacter.modelRotation}
              modelScale={inspectCharacter.modelScale}
              modelOffset={inspectCharacter.modelOffset}
              framingOffsetY={inspectCharacter.framingOffsetY}
              framingScale={inspectCharacter.framingScale}
              preferEmbeddedAnimations={inspectCharacter.preferEmbeddedAnimations}
              animations={inspectCharacter.animations}
              motionIntensity={inspectCharacter.motionIntensity}
            />
            <div
              className="inspect-panel"
              style={inspectPanelPos
                ? { left: inspectPanelPos.x, top: inspectPanelPos.y, right: 'auto', transform: 'none' }
                : undefined}
            >
              <div className="inspect-title inspect-drag-handle" onPointerDown={startInspectDrag} title="드래그해서 이동">
                ⠿ 모델 검사 {inspectIndex + 1}/{CHARACTER_MODELS.length} · {inspectCharacter.name}
              </div>
              <div className="inspect-path">{inspectCharacter.modelPath}</div>
              <div className="inspect-nav">
                <button onClick={() => stepInspect(-1)}>◀ 이전 [</button>
                <button onClick={() => stepInspect(1)}>다음 ] ▶</button>
                <button onClick={() => setInspectMode(false)}>닫기 Esc</button>
              </div>
              <div className="inspect-gestures">
                {INSPECT_GESTURES.map(gesture => (
                  <button key={gesture.label} onClick={() => triggerInspectGesture(gesture)}>
                    {gesture.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : testStageRunning ? (
          <div className="char-ensemble">
            {stagedNpcTestCharacters.map((character) => {
              const active = character.speaker === activeSpeaker
              return (
                <div
                  key={character.speaker}
                  className={`char-slot${active ? ' active' : ''}`}
                  data-speaker={character.speaker}
                  style={{ '--slot-x': `${NPC_TEST_STAGE_X[character.speaker] || 0}px` }}
                >
                  <Character3D
                    modelPath={character.modelPath}
                    lipGain={character.lipGain}
                    hideTeeth={character.hideTeeth}
                    attachTeethToHead={character.attachTeethToHead}
                    modelRotation={character.modelRotation}
                    modelScale={character.modelScale}
                    modelOffset={character.modelOffset}
                    framingOffsetY={character.framingOffsetY}
                    framingScale={character.framingScale}
                    preferEmbeddedAnimations={character.preferEmbeddedAnimations}
                    animations={character.animations}
                    disableProceduralMotion={character.disableProceduralMotion}
                    motionIntensity={active ? character.motionIntensity : 0.12}
                    registerGlobalControls={active}
                  />
                </div>
              )
            })}
          </div>
        ) : stagedStoryCharacters.length > 0 ? (
          <div className="char-ensemble story-ensemble">
            {stagedStoryCharacters.map(({ character, x }) => {
              const active = character.speaker === activeSpeaker
              return (
                <div
                  key={character.speaker}
                  className={`char-slot${active ? ' active' : ''}`}
                  data-speaker={character.speaker}
                  style={{ '--slot-x': `${x}px` }}
                >
                  <Character3D
                    modelPath={character.modelPath}
                    lipGain={character.lipGain}
                    hideTeeth={character.hideTeeth}
                    attachTeethToHead={character.attachTeethToHead}
                    modelRotation={character.modelRotation}
                    modelScale={character.modelScale}
                    modelOffset={character.modelOffset}
                    framingOffsetY={character.framingOffsetY}
                    framingScale={character.framingScale}
                    preferEmbeddedAnimations={character.preferEmbeddedAnimations}
                    animations={character.animations}
                    disableProceduralMotion={character.disableProceduralMotion}
                    motionIntensity={active ? character.motionIntensity : 0.12}
                    registerGlobalControls={active}
                  />
                </div>
              )
            })}
          </div>
        ) : stageNpcCharacter && (
          <div
            className={`char-center persistent-npc${activeSpeaker === stageNpcCharacter.speaker ? ' active' : ''}`}
            data-speaker={stageNpcCharacter.speaker}
          >
            <Character3D
              key={stageNpcCharacter.speaker}
              registerGlobalControls={activeSpeaker === stageNpcCharacter.speaker}
              modelPath={stageNpcCharacter.modelPath}
              lipGain={stageNpcCharacter.lipGain}
              hideTeeth={stageNpcCharacter.hideTeeth}
              attachTeethToHead={stageNpcCharacter.attachTeethToHead}
              modelRotation={stageNpcCharacter.modelRotation}
              modelScale={stageNpcCharacter.modelScale}
              modelOffset={stageNpcCharacter.modelOffset}
              framingOffsetY={stageNpcCharacter.framingOffsetY}
              framingScale={stageNpcCharacter.framingScale}
              preferEmbeddedAnimations={stageNpcCharacter.preferEmbeddedAnimations}
              animations={stageNpcCharacter.animations}
              disableProceduralMotion={stageNpcCharacter.disableProceduralMotion}
              motionIntensity={activeSpeaker === stageNpcCharacter.speaker ? stageNpcCharacter.motionIntensity : 0.18}
            />
          </div>
        )}
      </div>

      <div className="chat-section">
        <button
          type="button"
          className="chat-resize-handle"
          onPointerDown={startChatResize}
          onDoubleClick={resetChatSize}
          aria-label={splitLayout ? '대화창 너비 조절' : '대화창 높이 조절'}
          title={splitLayout ? '드래그: 대화창 너비 조절 / 더블클릭: 초기화' : '드래그: 대화창 높이 조절 / 더블클릭: 초기화'}
        >
          <span />
        </button>
        <div className="chat-deco" aria-hidden="true">
          <div className="steam-stack stack-left">
            <span />
            <span />
            <span />
          </div>
          <div className="steam-stack stack-right">
            <span />
            <span />
            <span />
          </div>
          <div className="gear-cluster gear-left">
            <span className="sp-gear gear-xl" />
            <span className="sp-gear gear-sm reverse" />
          </div>
          <div className="gear-cluster gear-right">
            <span className="sp-gear gear-md reverse" />
            <span className="sp-gear gear-xs" />
          </div>
          <span className="blue-gauge gauge-left" />
          <span className="blue-gauge gauge-right" />
        </div>
        <div className={`sp-panel sp-avatar${gmSpeaking || activeSpeaker === 'gm' ? ' speaking' : ''}`}>
          <div className="sp-panel-title avatar-panel-title">
            <span>게임 마스터</span>
          </div>
          <div className={`gm-face-popup${gmSpeaking || activeSpeaker === 'gm' ? ' speaking' : ''}`}>
            <Character3D
              key="gm-popup"
              registerGlobalControls={gmSpeaking || activeSpeaker === 'gm'}
              modelPath={gmCharacter.modelPath}
              lipGain={gmCharacter.lipGain}
              hideTeeth={gmCharacter.hideTeeth}
              attachTeethToHead={gmCharacter.attachTeethToHead}
              modelRotation={gmCharacter.modelRotation}
              modelScale={gmCharacter.modelScale}
              modelOffset={gmCharacter.modelOffset}
              animations={gmCharacter.animations}
              motionIntensity={gmSpeaking || activeSpeaker === 'gm' ? gmCharacter.motionIntensity : 0.18}
              cameraPosition={GM_POPUP_CAMERA_POS}
              cameraTarget={GM_POPUP_CAMERA_TARGET}
              cameraFov={25}
            />
          </div>
          <div className="avatar-nameplate">
            <div className="avatar-name">{companionName}</div>
            <div className="avatar-role">{companionRole}</div>
            <div className="avatar-meter" aria-hidden="true"><span /></div>
            <p>선택은 언제든 기록되고, 톱니는 조용히 다음 장면을 돌립니다.</p>
          </div>
        </div>

        <button
          type="button"
          className="panel-resize-handle panel-resize-dialogue-avatar"
          onPointerDown={(e) => startPanelResize('dialogue-avatar', e)}
          onDoubleClick={resetPanelSizes}
          aria-label={splitLayout ? '아바타창과 대화 로그 높이 조절' : '대화 로그와 아바타창 너비 조절'}
          title={splitLayout ? '드래그: 아바타창/대화 로그 높이 조절 / 더블클릭: 기본 비율' : '드래그: 대화 로그/아바타창 너비 조절 / 더블클릭: 기본 비율'}
        >
          <span />
        </button>

        <div className="sp-panel sp-dialogue">
          <div className="sp-panel-title dialogue-panel-title">
            <span>대화 로그</span>
          </div>
          <div className="dialogue-console-banner">
            {missionPlace}에서 이어지는 기록
          </div>
        <div className="chatlog" ref={logRef}>
          {log.map((m, i) => {
            const sp = getSpeakerPresentation(m.who)
            const side = m.who === 'player' ? 'right' : 'left'
            const messageStyle = {
              '--speaker-color': sp.color,
              '--speaker-name-color': sp.nameColor || sp.color,
              '--bubble-border-color': sp.borderColor || sp.color,
              '--bubble-background': sp.bubbleBg || sp.tint,
              '--bubble-glow-color': sp.glow || `${sp.color}55`,
            }
            return (
              <div key={`${i}-${m.text.slice(0, 8)}`} className={`msg ${side}`} style={messageStyle}>
                <div className="role">{sp.name}</div>
                <div className="bubble">{m.text}</div>
              </div>
            )
          })}
        </div>
          <div className="inputbar">
            <input
              value={input}
              disabled={sending || bgLoading || !session?.id}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={bgLoading ? 'AI가 새 장소를 그리는 중… 잠시만 기다려 주세요'
                : (session?.id ? '메시지를 입력하세요' : '타이틀에서 게임을 시작해 주세요')}
            />
            <button
              className="send"
              onClick={send}
              disabled={sending || bgLoading || !session?.id}
              aria-label="메시지 보내기"
              title="메시지 보내기"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4.4 11.8 19.7 4.7l-5.5 15.1-3.1-6.1-6.7-1.9Z" />
                <path d="m11.1 13.7 8.6-9" />
              </svg>
            </button>
          </div>
        </div>

        <button
          type="button"
          className="panel-resize-handle panel-resize-choices-dialogue"
          onPointerDown={(e) => startPanelResize('choices-dialogue', e)}
          onDoubleClick={resetPanelSizes}
          aria-label={splitLayout ? '대화 로그와 임무 선택창 높이 조절' : '임무 선택창과 대화 로그 너비 조절'}
          title={splitLayout ? '드래그: 대화 로그/임무 선택창 높이 조절 / 더블클릭: 기본 비율' : '드래그: 임무 선택창/대화 로그 너비 조절 / 더블클릭: 기본 비율'}
        >
          <span />
        </button>

        <div className="sp-panel sp-choices">
        <div className="sp-panel-title choices-panel-title">
          <span>임무 & 선택</span>
        </div>
        <div className="mission-console-card">
          <div className="mission-kicker">진행 중 임무</div>
          <div className="mission-current">
            <span className="mission-index">01</span>
            <span>{missionTitle}</span>
          </div>
          <div className="mission-hint">대화를 선택하세요</div>
        </div>
        {choiceMode && choicesCollapsed && (
          <div className="choice-minibar">
            <button type="button" className="choice-restore" onClick={() => setChoicesCollapsed(false)}>선택지 펼치기</button>
          </div>
        )}

        {choiceMode && !choicesCollapsed && (
          <div className="choice-block">
            <div className="choice-head">
              <div className="choice-flavor">{FLAVOR_CHOICE}</div>
              <button type="button" className="choice-minimize" onClick={() => setChoicesCollapsed(true)} title="선택지 접기">접기</button>
            </div>
            {CHOICES.map(c => (
              <button key={c.id}
                className={'choice-row' + (c.tag && c.tag.includes('위험') ? ' danger' : '')}
                onClick={() => pickChoice(c)}>
                <span className="cn">{c.id}</span>
                <span>{c.text}</span>
                {c.tag && <span className="ctag">{c.tag}</span>}
              </button>
            ))}
            <div className="choice-note">입력창에 직접 써서 다른 행동을 해도 됩니다.</div>
          </div>
        )}

          {choices.length > 0 && !sending && choicesCollapsed && (
            <div className="choice-minibar">
              <button type="button" className="choice-restore" onClick={() => setChoicesCollapsed(false)}>선택지
  펼치기</button>
            </div>
          )}

          {choices.length > 0 && !sending && !choicesCollapsed && !bgLoading && (
          <div className="choice-block">
            <div className="choice-head">
              <div className="choice-flavor">{FLAVOR_CHOICE}</div>
              <button type="button" className="choice-minimize" onClick={() => setChoicesCollapsed(true)} title="선택지 접기">접기</button>
            </div>
            {choices.map((c, i) => {
              const text = getChoiceText(c)
              return (
                <button key={c.id || `${i}-${text.slice(0, 8)}`}
                  className="choice-row"
                  onClick={() => chooseVisibleChoice(c)}>
                  <span className="cn">{i + 1}</span>
                  <span>{text}</span>
                </button>
              )
            })}
            <div className="choice-note">또는 아래 입력창에 자유롭게 행동을 적어도 됩니다.</div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
