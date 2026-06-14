import React, { useEffect, useRef, useState } from 'react'
import { SPEAKERS, FLAVOR_CHOICE, CHOICES } from '../data.js'
import D12 from './D12.jsx'
import Character3D from './Character3D.jsx'
import ParallaxBackground from './ParallaxBackground.jsx'
import { apiChat, apiTTS, apiDebugEnding, apiStoryChoice, apiGenerateBackground } from '../api.js'
import { PERSONAS, getPersona } from '../personas.js'
import { applyBgmVolume, applyMasterVolume, applySpeechVolume } from '../audioSettings.js'
import { loadSettings, subscribeSettings } from '../settings.js'

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
  idle: '/static/animations/npc/acknowledging.glb',
  talk: '/static/animations/npc/acknowledging.glb',
  happy: '/static/animations/npc/happy_hand_gesture.glb',
  angry: '/static/animations/npc/angry_gesture.glb',
  thinking: '/static/animations/npc/thoughtful_head_shake.glb',
  deny: '/static/animations/npc/shaking_head_no.glb',
  sigh: '/static/animations/npc/relieved_sigh.glb',
  cocky: '/static/animations/npc/being_cocky.glb',
  yes: '/static/animations/npc/head_nod_yes.glb',
  strong_yes: '/static/animations/npc/hard_head_nod.glb',
  long_yes: '/static/animations/npc/lengthy_head_nod.glb',
  sarcastic: '/static/animations/npc/sarcastic_head_nod.glb',
  look_away: '/static/animations/npc/look_away_gesture.glb',
  dismiss: '/static/animations/npc/dismissing_gesture.glb',
  annoyed: '/static/animations/npc/annoyed_head_shake.glb',
}

const TAVERN_LIN_SCENES = new Set([
  'tavern_rin',
  'tavern_miner_followup',
  'rin_contradiction',
  'lin_trust_trial',
])

const CHARACTER_MODELS = [
  {
    speaker: 'gm',
    personaId: 'gm',
    name: SPEAKERS.gm?.name || 'GM',
    modelPath: '/static/models/GM_v3_Standing W_Briefcase Idle_01.glb',
    modelScale: 0.75,
    modelOffset: [0, -130, 0],
    animations: { idle: '/static/animations/npc/gm_acknowledging.glb' },
    motionIntensity: 0.6,
  },
  {
    speaker: 'lin',
    personaId: 'lin',
    name: PERSONAS.lin.name,
    modelPath: '/static/models/Lin_ack_shrtleg_decntarm.glb',
    modelScale: 0.82,
    modelOffset: [0, -120, 0],
    preferEmbeddedAnimations: true,
    motionIntensity: 0.9,
  },
  {
    speaker: 'gail',
    personaId: 'gail',
    name: PERSONAS.gail.name,
    modelPath: '/static/models/Gail_07_textureShading_01.glb',
    modelScale: 0.75,
    modelOffset: [0, 40, 0],
    animations: NPC_ANIMS,
  },
  {
    speaker: 'marta',
    personaId: 'marta',
    name: PERSONAS.marta.name,
    modelPath: '/static/models/Marta_01.glb',
    modelScale: 0.75,
    modelOffset: [0, 40, 0],
    animations: NPC_ANIMS,
  },
  {
    speaker: 'tobi',
    personaId: 'tobi',
    name: PERSONAS.tobi.name,
    modelPath: '/static/models/Tobi_01.glb',
    modelScale: 0.75,
    modelOffset: [0, 40, 0],
    animations: NPC_ANIMS,
  },
  {
    speaker: 'doctor',
    personaId: 'doctor',
    name: PERSONAS.doctor.name,
    modelPath: '/static/models/Doctor_04_tracksDevided.glb',
    modelScale: 0.75,
    modelOffset: [0, -120, 0],
    preferEmbeddedAnimations: true,
    motionIntensity: 0.45,
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
    modelRotation: [-Math.PI / 2, Math.PI, Math.PI],
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
    motionIntensity: 0.55,
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

const getCharacter = (speaker) => CHARACTER_MODELS.find(c => c.speaker === speaker) || CHARACTER_MODELS[0]

const getPersonaForSpeaker = (speaker) => {
  const character = getCharacter(speaker)
  return getPersona(character.personaId) || getPersona(speaker) || PERSONAS.doctor
}

const getSpeakerPresentation = (speaker) => {
  if (speaker === 'player') return SPEAKERS.player
  if (speaker === 'gm') return SPEAKERS.gm

  const persona = getPersonaForSpeaker(speaker)
  return {
    name: persona?.name || SPEAKERS[speaker]?.name || speaker,
    color: persona?.color || SPEAKERS[speaker]?.color || '#7d858d',
    tint: persona?.color
      ? `${persona.color}2e`
      : (SPEAKERS[speaker]?.tint || 'rgba(125,133,141,0.16)'),
  }
}

const getTtsInstructions = (persona, emotion) => {
  const base = persona?.tts?.instructions || ''
  const extra = emotion ? (persona?.tts?.byEmotion?.[emotion] || '') : ''
  return `${base} ${extra}`.trim()
}

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

const estimateSpeechDuration = (text) => {
  const length = Array.from(String(text || '')).length
  return Math.min(5.5, Math.max(1.2, length * 0.085))
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

  utterance.onstart = () => {
    window.playLinPerformance?.(segment.text, 'talk', fallbackDuration)
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
    const shortText = Array.from(text).length < 8
    if (previous && previous.speaker === segment.speaker && (shortText || Array.from(previous.text).length < 8)) {
      previous.text = `${previous.text} ${text}`.trim()
      return
    }

    merged.push({ ...segment, text })
  })

  return merged
}

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
    .map(segment => ({
      speaker: segment.speaker || (segment.role === 'gm' ? 'gm' : fallbackSpeaker),
      text: String(segment.text || '').trim(),
    }))
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

    const segments = mergeShortSpeechSegments(normalizeStorySegments(options.segments, text, speaker))
    console.log('TTS SEGMENTS:', segments)

    for (const segment of segments) {
      if (runId !== speechRunId) return

      _onGmSpeakChange?.(segment.speaker === 'gm')

      const persona = getPersonaForSpeaker(segment.speaker)
      const { cleanText, toneHint } = extractToneHint(segment.text)
      const spokenText = cleanText || segment.text
      const ttsInstructions = toneHint
        ? `${getTtsInstructions(persona)} ${toneHint}`.trim()
        : getTtsInstructions(persona)
      const cleanSegment = { ...segment, text: spokenText }
      const fallbackDuration = estimateSpeechDuration(spokenText)
      options.onSegmentStart?.(segment)
      revealedCount += 1
      await new Promise(resolve => setTimeout(resolve, 60))
      if (runId !== speechRunId) return

      if (USE_BROWSER_TTS) {
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
        const data = await apiTTS(spokenText, {
          speaker: persona.id,
          voice: persona.tts?.voice,
          instructions: ttsInstructions,
        })
        console.log('TTS RESPONSE:', data)

        if (runId !== speechRunId) return

        const audio = new Audio(data.audio_url)
        const stopAudioVolume = applyMasterVolume(audio, 1)
        currentAudio = audio

        audio.onplay = () => {
          window.playLinPerformance?.(spokenText, data.emotion, audio.duration)
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
        await new Promise(resolve => setTimeout(resolve, 80))
      } catch (segmentErr) {
        console.warn('TTS segment error:', segment.speaker, segmentErr)
        window.stopLinLipSync?.()
        if (currentAudio) {
          currentAudio.pause()
          currentAudio = null
        }
        try {
          await speakWithBrowserTts(cleanSegment, fallbackDuration)
          if (runId !== speechRunId) return
          await new Promise(resolve => setTimeout(resolve, 120))
          continue
        } catch (browserFallbackErr) {
          console.warn('Browser TTS fallback failed:', segment.speaker, browserFallbackErr)
        }
        window.playLinPerformance?.(spokenText, 'talk', fallbackDuration)
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
    const last = history?.[history.length - 1]
    const speaker = last?.role === 'assistant' ? (last.speaker || 'gm') : 'player'
    const key = `${history?.length || 0}:${speaker}:${last?.content || ''}`

    if (last?.role === 'assistant' && last?.speak && !spokenRef.current.has(key)) {
      const previousLog = toUiLog(history.slice(0, -1))
      setLog(previousLog)
      setActiveSpeaker(getLastNpcSpeaker(previousLog))
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
              setLog(prev => [...prev, { who: segment.speaker, text: segment.text, speak: false }])
            },
            onFallback: (segments) => {
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
      const data = await apiChat(session.id, text)
      onSessionChange?.(data.session)
      if (data.story) onStoryChange?.(data.story)
      // GM이 이번 대화로 위치를 옮겼으면(세션 location 변경) 인트로/씬의 stage·story 고정을 풀어 새 배경 반영
      const newLoc = data.session?.location
      if (newLoc && newLoc !== prevLoc) {
        setStageLocation(null)
        if (story?.location && story.location !== newLoc) onStoryChange?.(null)
      }
      push('gm', data.answer, {
        speak: true,
        segments: normalizeStorySegments(data.segments, data.answer, 'gm'),
      })
      storyChoicesRef.current = normalizeChoices(data.choices)
    } catch (err) {
      push('gm', `오류: ${err.message}`, { speak: false })
    } finally {
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
  const splitLayout = appSettings.layout === 'split'

  // 배경: 핵심 장소=고정 이미지, 그 외=AI 즉석 생성(+gen 깊이맵으로 2.5D)
  const [genBg, setGenBg] = useState({})
  const [bgLoading, setBgLoading] = useState(false)
  const bgTriedRef = useRef(new Set())
  // 배경은 '실제 게임 위치'를 따른다. story.location(멈춰있는 인트로 씬)은 배경 결정에서 제외 —
  // 안 그러면 자유 이동해도 인트로 씬 위치(진료소)가 계속 덮어 AI 배경 생성이 안 됨.
  const curLoc = stageLocation || session?.location
  const locationBackground = getLocationBackground(curLoc) || (curLoc ? genBg[curLoc] : null) || null
  useEffect(() => {
    if (!curLoc || !session?.id) return
    if (getLocationBackground(curLoc)) return            // 고정 배경 있으면 생성 안 함
    if (genBg[curLoc] || bgTriedRef.current.has(curLoc)) return
    bgTriedRef.current.add(curLoc)
    setBgLoading(true)
    apiGenerateBackground(session.id, curLoc)
      .then(d => { if (d.url) setGenBg(p => ({ ...p, [curLoc]: d.url })) })
      .catch(() => {})
      .finally(() => setBgLoading(false))
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

  return (
    <div
      className={`dialogue${splitLayout ? ' layout-split' : ''}${locationBackground ? ' has-location-bg' : ''}`}
      style={locationBackground ? { '--location-bg': `url("${locationBackground}")` } : undefined}
    >
      {locationBackground && <ParallaxBackground image={locationBackground} fx={getFx(curLoc)} />}
      {bgLoading && <div className="bg-gen-loading">새로운 장소의 풍경을 그리는 중…</div>}
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
        </div>
        {inspectMode ? (
          <div className="char-center inspect-stage" data-speaker={inspectCharacter.speaker}>
            <Character3D
              key={`inspect-${inspectCharacter.speaker}`}
              modelPath={inspectCharacter.modelPath}
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
                    modelRotation={character.modelRotation}
                    modelScale={character.modelScale}
                    modelOffset={character.modelOffset}
                    framingOffsetY={character.framingOffsetY}
                    framingScale={character.framingScale}
                    preferEmbeddedAnimations={character.preferEmbeddedAnimations}
                    animations={character.animations}
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
                    modelRotation={character.modelRotation}
                    modelScale={character.modelScale}
                    modelOffset={character.modelOffset}
                    framingOffsetY={character.framingOffsetY}
                    framingScale={character.framingScale}
                    preferEmbeddedAnimations={character.preferEmbeddedAnimations}
                    animations={character.animations}
                    motionIntensity={active ? character.motionIntensity : 0.12}
                    registerGlobalControls={active}
                  />
                </div>
              )
            })}
          </div>
        ) : activeSpeaker !== 'gm' && (
          <div className="char-center">
            <Character3D
              key={activeCharacter.speaker}
              modelPath={activeCharacter.modelPath}
              modelRotation={activeCharacter.modelRotation}
              modelScale={activeCharacter.modelScale}
              modelOffset={activeCharacter.modelOffset}
              framingOffsetY={activeCharacter.framingOffsetY}
              framingScale={activeCharacter.framingScale}
              preferEmbeddedAnimations={activeCharacter.preferEmbeddedAnimations}
              animations={activeCharacter.animations}
              motionIntensity={activeCharacter.motionIntensity}
            />
          </div>
        )}

        {gmSpeaking && (
          <div className="gm-face-popup">
            <Character3D
              key="gm-popup"
              modelPath={CHARACTER_MODELS[0].modelPath}
              modelRotation={CHARACTER_MODELS[0].modelRotation}
              modelScale={CHARACTER_MODELS[0].modelScale}
              modelOffset={CHARACTER_MODELS[0].modelOffset}
              animations={CHARACTER_MODELS[0].animations}
              motionIntensity={CHARACTER_MODELS[0].motionIntensity}
              cameraPosition={[0, 160, 420]}
              cameraTarget={[0, 160, 0]}
              cameraFov={25}
            />
          </div>
        )}
      </div>

      <div className="chat-section">
        <div className="chat-topbar">
          <span>{stageLocation || session?.location || '대화'}</span>
        </div>
        <div className="chatlog" ref={logRef}>
          {log.map((m, i) => {
            const sp = getSpeakerPresentation(m.who)
            const side = m.who === 'player' ? 'right' : 'left'
            return (
              <div key={`${i}-${m.text.slice(0, 8)}`} className={`msg ${side}`}>
                <div className="role" style={{ color: sp.color }}>{sp.name}</div>
                <div className="bubble" style={{
                  borderColor: sp.color, background: sp.tint,
                  boxShadow: `inset ${side === 'right' ? '-3px' : '3px'} 0 0 ${sp.color}, 0 3px 10px #0005`,
                }}>{m.text}</div>
              </div>
            )
          })}
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

        <div className="inputbar">
          <input
            value={input}
            disabled={sending || bgLoading || !session?.id}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={bgLoading ? 'AI가 새 장소를 그리는 중… 잠시만 기다려 주세요'
              : (session?.id ? '메시지를 입력하세요' : '타이틀에서 게임을 시작해 주세요')}
          />
          <button className="send" onClick={send} disabled={sending || bgLoading || !session?.id}>▶</button>
        </div>
      </div>
    </div>
  )
}
