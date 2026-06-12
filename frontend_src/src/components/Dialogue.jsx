import React, { useEffect, useRef, useState } from 'react'
import { SPEAKERS, FLAVOR_CHOICE, CHOICES } from '../data.js'
import D12 from './D12.jsx'
import Character3D from './Character3D.jsx'
import { apiChat, apiTTS, apiDebugEnding, apiStoryCurrent, apiStoryChoice } from '../api.js'
import { PERSONAS, getPersona } from '../personas.js'

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

const DEFAULT_STAGE_SPEAKER = 'gm'

const CHARACTER_MODELS = [
  {
    speaker: 'gm',
    personaId: 'gm',
    name: SPEAKERS.gm?.name || 'GM',
    modelPath: '/static/models/ShapeKey_10_anim_05.glb',
    modelScale: 0.75,
    modelOffset: [0, 80, 0],
    motionIntensity: 4,
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
    modelPath: '/static/models/Gail_01.glb',
    modelRotation: [-Math.PI / 2, Math.PI, Math.PI],
    modelScale: 0.25,
    modelOffset: [0, 70, 0],
  },
  {
    speaker: 'marta',
    personaId: 'marta',
    name: PERSONAS.marta.name,
    modelPath: '/static/models/Marta_01.glb',
    modelRotation: [-Math.PI / 2, Math.PI, Math.PI],
    modelScale: 0.75,
    modelOffset: [0, 70, 0],
  },
  {
    speaker: 'tobi',
    personaId: 'tobi',
    name: PERSONAS.tobi.name,
    modelPath: '/static/models/Tobi_01.glb',
    modelRotation: [-Math.PI / 2, Math.PI, Math.PI],
    modelScale: 0.15,
    modelOffset: [0, 60, 0],
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
    modelScale: 0.72,
    modelOffset: [0, 80, 0],
  },
  {
    speaker: 'tavern_clerk',
    personaId: 'tavern_clerk',
    name: PERSONAS.tavern_clerk.name,
    modelPath: '/static/models/Waitress_01.glb',
    modelScale: 0.52,
    modelOffset: [0, -170, 0],
    framingOffsetY: 70,
    preferEmbeddedAnimations: true,
    motionIntensity: 0.55,
  },
]

const GM_TTS_PERSONA = {
  id: 'doctor',
  name: SPEAKERS.gm?.name || 'GM',
  color: SPEAKERS.gm?.color || '#7a4a2e',
  tts: {
    voice: 'echo',
    instructions: 'TRPG 게임 마스터. 장면을 차분하고 또렷하게 진행하며, 낮고 안정적인 해설 톤으로 말한다.',
  },
}

const LOCATION_BACKGROUNDS = [
  { aliases: ['진료소', '진료실', '의무실', 'clinic', 'hospital'], path: '/static/backgrounds/clinic-new.png' },
  { aliases: ['여관', '주점', 'tavern', 'inn'], path: '/static/backgrounds/inn-new.png' },
  { aliases: ['정재소', '정제소', 'refinery'], path: '/static/backgrounds/refinery-new.png' },
  { aliases: ['갱도', '갱도사무소', '광산', 'mine', 'mineshaft'], path: '/static/backgrounds/mine.png' },
]

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
  if (['shop', '거래', '상점', '정제소'].some(key => normalized.includes(key))) return '정제소'
  if (['battle', '전투', '갱도', '광산', 'boss'].some(key => normalized.includes(key))) return '갱도'
  if (['event', '이벤트', '여관', 'mystery', '미지'].some(key => normalized.includes(key))) return '여관'
  return null
}

const TAVERN_RIN_SCENES = new Set(['tavern_rin'])
const CLINIC_SCENES = new Set(['clinic_wake', 'clinic_nurse'])

const normalizeSpeakerKey = (speaker) => speaker || 'gm'

const inferStoryIdFromText = (text = '') => {
  const source = String(text || '')
  if (/진료소|진료\s*기록|진료실|의무실|무리하지\s*마십시오|기억이\s*돌아오지|단서가\s*남아|몸은\s*움직일/.test(source)) return 'clinic_wake'
  if (/여관|주점|마을의\s*비밀|소문|드디어\s*오셨|잘\s*오셨|반가운\s*손님|정보\s*거래/.test(source)) return 'tavern_rin'
  return ''
}

const sanitizeSceneSpeaker = (speaker, context = {}) => {
  const key = normalizeSpeakerKey(speaker)
  const sceneId = context.storyId || ''

  if (TAVERN_RIN_SCENES.has(sceneId) && key === 'doctor') return 'lin'
  if (CLINIC_SCENES.has(sceneId) && key === 'lin') return 'doctor'
  return key
}

const sanitizeSegmentsForContext = (segments, context = {}) => (
  segments.map(segment => ({
    ...segment,
    speaker: sanitizeSceneSpeaker(segment.speaker, context),
  }))
)

const toUiLog = (history = [], context = {}, sanitizeLatest = false) => {
  if (!history || history.length === 0) return []
  const latestAssistantIndex = sanitizeLatest
    ? history.map(item => item.role).lastIndexOf('assistant')
    : -1
  return history.flatMap((item, index) => {
    if (item.role !== 'assistant') {
      return [{
        who: 'player',
        text: item.content || '',
        speak: Boolean(item.speak),
      }]
    }

    const inferredStoryId = inferStoryIdFromText(item.content || '')
    const itemContext = {
      storyId: item.storyId || inferredStoryId || (index === latestAssistantIndex ? context.storyId : ''),
      location: item.location || (index === latestAssistantIndex ? context.location : ''),
    }
    const segments = sanitizeSegmentsForContext(
      normalizeStorySegments(item.segments, item.content || '', item.speaker || 'gm'),
      itemContext,
    )
    return segments.map(segment => ({
      who: segment.speaker,
      text: segment.text,
      speak: false,
    }))
  })
}

const getLastNpcSpeaker = (log) => {
  const lastNpc = [...log].reverse().find(m => m.who !== 'player' && CHARACTER_MODELS.some(c => c.speaker === m.who))
  return lastNpc?.who || DEFAULT_STAGE_SPEAKER
}

const inferStageSpeaker = (text = '', location = '') => {
  const source = `${text || ''}\n${location || ''}`
  if (/린\s*주점\s*점원|주점\s*점원|점원/.test(source)) return 'tavern_clerk'
  if (/린|여관|주점/.test(source)) return 'lin'
  if (/의사|진료소|진료실|의무실/.test(source)) return 'doctor'
  if (/가일/.test(source)) return 'gail'
  if (/마르타|오두막|전설/.test(source)) return 'marta'
  if (/토비/.test(source)) return 'tobi'
  if (/카르가스|봉우리/.test(source)) return 'kargas'
  return null
}

const getCharacter = (speaker) => CHARACTER_MODELS.find(c => c.speaker === speaker) || null

const getPersonaForSpeaker = (speaker) => {
  if (speaker === 'gm') return GM_TTS_PERSONA
  const direct = getPersona(speaker)
  if (direct) return direct
  const character = getCharacter(speaker)
  return getPersona(character?.personaId) || getPersona(speaker) || PERSONAS.doctor
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

const stripRollLineForNoRollChoice = (answer, data) => {
  if (data?.roll !== null) return answer
  return String(answer || '')
    .split('\n')
    .filter(line => !line.includes('D12'))
    .join('\n')
}

const stripRollSegmentsForNoRollChoice = (segments, data) => {
  if (data?.roll !== null || !Array.isArray(segments)) return segments
  return segments.filter(segment => !String(segment?.text || '').includes('D12'))
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
  utterance.volume = 1
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
  const matches = [...source.matchAll(labelPattern)]
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

export default function Dialogue({ session, story, history, onHistoryChange, onSessionChange, onStoryChange, onEnding, runMapStep }) {
  const initialContext = { storyId: story?.id || '', location: story?.location || session?.location || '' }
  const [log, setLog] = useState(() => toUiLog(history, initialContext, true))
  const [input, setInput] = useState('')
  const [choiceMode, setChoiceMode] = useState(false)
  const [activeSpeaker, setActiveSpeaker] = useState(() => getLastNpcSpeaker(toUiLog(history, initialContext, true)))
  const [stageLocation, setStageLocation] = useState(null)
  const [judge, setJudge] = useState(null)
  const [judgeResult, setJudgeResult] = useState(null)
  const [sending, setSending] = useState(false)
  const [choices, setChoices] = useState([])
  const [npcTestRunning, setNpcTestRunning] = useState(false)
  const [shortTtsTestRunning, setShortTtsTestRunning] = useState(false)
  const [gmSpeaking, setGmSpeaking] = useState(false)
  const logRef = useRef(null)
  const judgeRef = useRef(null)
  const judgeTimerRef = useRef(null)
  const mappingRef = useRef(false)
  const spokenRef = useRef(new Set())
  const locationBgmRef = useRef({ path: null, audio: null })
  const holdChoicesRef = useRef(false)
  const storyChoicesRef = useRef([])
  const sceneContext = {
    storyId: story?.id || '',
    location: stageLocation || story?.location || session?.location || '',
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
      const liveContext = {
        storyId: last.storyId || inferStoryIdFromText(last.content || '') || sceneContext.storyId,
        location: last.location || sceneContext.location,
      }
      const liveSegments = sanitizeSegmentsForContext(
        normalizeStorySegments(last.segments, last.content || '', speaker),
        liveContext,
      )
      const firstSpeaker = CHARACTER_MODELS.some(c => c.speaker === liveSegments[0]?.speaker)
        ? liveSegments[0].speaker
        : null
      setLog(previousLog)
      setChoices([])
      setActiveSpeaker(firstSpeaker)
      spokenRef.current.add(key)
      let choicesRevealed = false
      const revealChoices = () => {
        if (choicesRevealed) return
        choicesRevealed = true
        holdChoicesRef.current = false
        const explicit = normalizeChoices(last.choicesToReveal)
        const storyFallback = storyChoicesRef.current
        const questionFallback = fallbackChoicesForExplicitQuestion(last.content)
        const reveal = explicit.length ? explicit : (storyFallback.length ? storyFallback : questionFallback)
        setChoices(reveal)
      }
      setTimeout(() => {
        speakNpc(last.content || '', speaker, {
          segments: liveSegments,
          onSegmentStart: (segment) => {
            const displaySpeaker = sanitizeSceneSpeaker(segment.speaker, liveContext)
            if (displaySpeaker === 'gm') {
              setActiveSpeaker('gm')
            } else if (CHARACTER_MODELS.some(c => c.speaker === displaySpeaker)) {
              setActiveSpeaker(displaySpeaker)
            }
            setLog(prev => [...prev, { who: displaySpeaker, text: segment.text, speak: false }])
          },
          onFallback: (segments) => {
            setLog(prev => [
              ...prev,
              ...sanitizeSegmentsForContext(segments, liveContext)
                .map(segment => ({ who: segment.speaker, text: segment.text, speak: false })),
            ])
          },
        }).then(revealChoices)
      }, 250)
      return
    }

    const next = toUiLog(history, sceneContext, true)
    setLog(next)
    const lastAssistant = [...(history || [])].reverse().find(item => item.role === 'assistant')
    const lastSegments = lastAssistant
      ? sanitizeSegmentsForContext(
        normalizeStorySegments(lastAssistant.segments, lastAssistant.content || '', lastAssistant.speaker || 'gm'),
        {
          storyId: lastAssistant.storyId || inferStoryIdFromText(lastAssistant.content || '') || sceneContext.storyId,
          location: lastAssistant.location || sceneContext.location,
        },
      )
      : []
    const lastSegment = lastSegments[lastSegments.length - 1]
    const lastSpeaker = CHARACTER_MODELS.some(c => c.speaker === lastSegment?.speaker)
      ? lastSegment.speaker
      : null
    setActiveSpeaker(lastAssistant ? lastSpeaker : getLastNpcSpeaker(next))
    if (lastAssistant) {
      const questionFallback = fallbackChoicesForExplicitQuestion(lastAssistant.content)
      if (questionFallback.length) setChoices(questionFallback)
    }
  }, [history, sceneContext.storyId, sceneContext.location])

  useEffect(() => {
    if (holdChoicesRef.current) return
    const last = history?.[history.length - 1]
    if (last?.role === 'assistant' && last?.speak) return
    const storyChoices = normalizeChoices(story?.choices)
    const questionFallback = last?.role === 'assistant'
      ? fallbackChoicesForExplicitQuestion(last.content)
      : []
    storyChoicesRef.current = storyChoices
    setChoices(storyChoices.length ? storyChoices : questionFallback)
  }, [story?.id, story?.choices, history])

  useEffect(() => {
    storyChoicesRef.current = normalizeChoices(story?.choices)
  }, [story?.id, story?.choices])

  useEffect(() => {
    let cancelled = false
    if (!session?.id) {
      setChoices([])
      return () => { cancelled = true }
    }

    apiStoryCurrent(session.id)
      .then(data => {
        if (cancelled) return
        const nextStory = data?.story || null
        if (nextStory) onStoryChange?.(nextStory)
        const storyChoices = normalizeChoices(nextStory?.choices)
        const last = history?.[history.length - 1]
        const questionFallback = last?.role === 'assistant'
          ? fallbackChoicesForExplicitQuestion(last.content)
          : []
        storyChoicesRef.current = storyChoices
        if (!(last?.role === 'assistant' && last?.speak)) {
          setChoices(storyChoices.length ? storyChoices : questionFallback)
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [session?.id])

  const push = (who, text, options = {}) => {
    const targetContext = {
      storyId: options.storyId || sceneContext.storyId,
      location: options.location || sceneContext.location,
    }
    const displaySpeaker = sanitizeSceneSpeaker(who, targetContext)
    const displaySegments = who === 'player'
      ? []
      : sanitizeSegmentsForContext(
        normalizeStorySegments(options.segments, text, who),
        targetContext,
      )

    if (displaySpeaker !== 'player' && displaySpeaker !== 'gm' && CHARACTER_MODELS.some(c => c.speaker === displaySpeaker)) {
      setActiveSpeaker(displaySpeaker)
    } else if (displaySpeaker === 'gm') {
      setActiveSpeaker(null)
    }

    if (onHistoryChange) {
      const role = who === 'player' ? 'user' : 'assistant'
      onHistoryChange(prev => [...prev, {
        role,
        speaker: displaySpeaker,
        content: text,
        location: targetContext.location,
        storyId: targetContext.storyId,
        segments: who === 'player' ? options.segments : displaySegments,
        speak: Boolean(options.speak),
        choicesToReveal: options.choicesToReveal,
      }])
    } else {
      const next = who === 'player'
        ? [{ who, text, speak: Boolean(options.speak) }]
        : displaySegments.map(segment => ({ who: segment.speaker, text: segment.text, speak: false }))
      if (who !== 'player' && options.speak) {
        speakNpc(text, who, {
          segments: displaySegments,
          onSegmentStart: (segment) => {
            const segmentSpeaker = sanitizeSceneSpeaker(segment.speaker, targetContext)
            if (segmentSpeaker === 'gm') {
              setActiveSpeaker('gm')
            } else if (CHARACTER_MODELS.some(c => c.speaker === segmentSpeaker)) {
              setActiveSpeaker(segmentSpeaker)
            }
            setLog(l => [...l, { who: segmentSpeaker, text: segment.text, speak: false }])
          },
          onFallback: (segments) => {
            setLog(l => [
              ...l,
              ...sanitizeSegmentsForContext(segments, targetContext)
                .map(segment => ({ who: segment.speaker, text: segment.text, speak: false })),
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

  const prevStageRef = useRef(null)
  useEffect(() => {
    const idx = session?.stage?.index ?? 0
    if (prevStageRef.current === null) { prevStageRef.current = idx; return }
    if (idx > prevStageRef.current) {
      prevStageRef.current = idx
      const kind = idx >= 4 ? 'boss' : idx === 3 ? 'event' : 'battle'
      advanceOnMap(kind, { silent: true })
    }
  }, [session?.stage?.index])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log, choiceMode])

  useEffect(() => () => stopSpeaking(), [])
  useEffect(() => () => clearTimeout(judgeTimerRef.current), [])
  useEffect(() => {
    _onGmSpeakChange = setGmSpeaking
    return () => { _onGmSpeakChange = null }
  }, [])

  const triggerJudge = (dc = 11, stat = '지각', opts = {}) => {
    judgeRef.current = {
      dc, stat, after: opts.after, storyChoice: opts.storyChoice,
      onSuccess: opts.onSuccess || 'shop', onFail: opts.onFail || 'event', success: null,
    }
    setJudge({ dc, stat, storyChoice: opts.storyChoice })
    setJudgeResult(null)
  }

  const handleRollDone = (result) => {
    if (judgeRef.current?.storyChoice) {
      const tier = getRollTier(result)
      judgeRef.current.rollResult = result
      setJudgeResult({ result, success: tier.key !== 'bad', tier })
      clearTimeout(judgeTimerRef.current)
      judgeTimerRef.current = setTimeout(() => doCloseJudge(), 1400)
      return
    }

    const dc = judgeRef.current?.dc ?? 0
    const success = result >= dc
    if (judgeRef.current) judgeRef.current.success = success
    if (judgeRef.current) judgeRef.current.rollResult = result
    setJudgeResult({ result, success })
    clearTimeout(judgeTimerRef.current)
    judgeTimerRef.current = setTimeout(() => doCloseJudge(), 3000)
  }

  const doCloseJudge = async () => {
    clearTimeout(judgeTimerRef.current)
    const ref = judgeRef.current || {}
    const result = ref.rollResult ?? judgeResult?.result
    judgeRef.current = null
    setJudge(null)
    setJudgeResult(null)
    if (ref.storyChoice) {
      if (!session?.id || !result) return
      setSending(true)
      try {
        const tier = getRollTier(result)
        const choiceText = getChoiceText(ref.storyChoice)
        let data = null
        if (ref.storyChoice.kind === 'story') {
          try {
            data = await apiStoryChoice(session.id, ref.storyChoice.id, result)
          } catch (storyErr) {
            console.warn('Story choice API fallback to chat:', storyErr)
          }
        }
        if (!data) {
          data = await apiChat(
            session.id,
            `[선택] ${choiceText}\nD12 결과: ${result} (${tier.label}). 이 결과를 반영해 장면을 진행해 주세요. 전투는 아직 제외합니다.`,
          )
        }
        const nextStory = data.story || data.scene
        onSessionChange?.(data.session, nextStory)
        onStoryChange?.(nextStory)
        setStageLocation(nextStory?.location || data.session?.location || null)
        const responseChoices = normalizeChoices(data.choices)
        const storyChoices = normalizeChoices(nextStory?.choices)
        const revealChoices = responseChoices.length ? responseChoices : storyChoices
        holdChoicesRef.current = true
        const answerText = stripRollLineForNoRollChoice(data.answer, data)
        const answerSegments = stripRollSegmentsForNoRollChoice(data.segments, data)
        push('gm', answerText, {
          speak: true,
          segments: normalizeStorySegments(answerSegments, answerText, 'gm'),
          choicesToReveal: revealChoices,
          location: nextStory?.location || data.session?.location || null,
          storyId: nextStory?.id || null,
        })
        if (data.ending_reached) onEnding?.(data.ending_reached)
      } catch (err) {
        push('gm', `스토리 진행 오류: ${err.message}`, { speak: false })
      } finally {
        setSending(false)
      }
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
    if (!text || sending) return

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
      const data = await apiChat(session.id, text)
      const nextStory = data.story || data.scene
      onSessionChange?.(data.session, nextStory)
      onStoryChange?.(nextStory)
      setStageLocation(nextStory?.location || data.session?.location || null)
      const chatChoices = normalizeChoices(data.choices)
      const storyChoices = normalizeChoices(nextStory?.choices)
      const revealChoices = chatChoices.length ? chatChoices : storyChoices
      holdChoicesRef.current = true
      push('gm', data.answer, {
        speak: true,
        segments: normalizeStorySegments(data.segments, data.answer, 'gm'),
        choicesToReveal: revealChoices,
        location: nextStory?.location || data.session?.location || null,
        storyId: nextStory?.id || null,
      })
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

  const pickStoryChoice = async (choice) => {
    const text = getChoiceText(choice)
    if (!text || sending) return
    stopSpeaking()
    push('player', `[선택] ${text}`)
    setChoiceMode(false)
    setChoices([])
    if (choice.no_roll || choice.noRoll) {
      setSending(true)
      try {
        const data = await apiStoryChoice(session.id, choice.id, null)
        const nextStory = data.story || data.scene
        onSessionChange?.(data.session, nextStory)
        onStoryChange?.(nextStory)
        setStageLocation(nextStory?.location || data.session?.location || null)
        const responseChoices = normalizeChoices(data.choices)
        const storyChoices = normalizeChoices(nextStory?.choices)
        const revealChoices = responseChoices.length ? responseChoices : storyChoices
        const answerText = stripRollLineForNoRollChoice(data.answer, data)
        const answerSegments = stripRollSegmentsForNoRollChoice(data.segments, data)
        holdChoicesRef.current = true
        push('gm', answerText, {
          speak: true,
          segments: normalizeStorySegments(answerSegments, answerText, 'gm'),
          choicesToReveal: revealChoices,
          location: nextStory?.location || data.session?.location || null,
          storyId: nextStory?.id || null,
        })
        if (data.ending_reached) onEnding?.(data.ending_reached)
      } catch (err) {
        push('gm', `스토리 진행 오류: ${err.message}`, { speak: false })
      } finally {
        setSending(false)
      }
      return
    }
    triggerJudge(1, '분기 주사위', { storyChoice: choice })
  }

  const activeCharacter = CHARACTER_MODELS.find(c => c.speaker === activeSpeaker) || null
  const npcTestCharacters = NPC_TEST_SPEAKERS
    .map(speaker => CHARACTER_MODELS.find(c => c.speaker === speaker))
    .filter(Boolean)
  const stagedNpcTestCharacters = npcTestCharacters
    .filter(character => character.speaker !== activeSpeaker)
    .concat(npcTestCharacters.filter(character => character.speaker === activeSpeaker))
  const testStageRunning = npcTestRunning || shortTtsTestRunning
  const locationBackground = getLocationBackground(stageLocation || story?.location || session?.location)
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
      audio.volume = locationBgm.volume
      locationBgmRef.current = { path: locationBgm.path, audio }
    }

    const audio = locationBgmRef.current.audio
    audio.volume = locationBgm.volume
    const stopRetry = playWhenAllowed(audio)

    return () => {
      stopRetry()
      audio.pause()
    }
  }, [locationBgm?.path, locationBgm?.volume])

  return (
    <div
      className={`dialogue${locationBackground ? ' has-location-bg' : ''}`}
      style={locationBackground ? { '--location-bg': `url("${locationBackground}")` } : undefined}
    >
      <div className="bg-embers" />

      {judge && (
        <div className="dice-modal-overlay" onClick={closeJudgeModal}>
          <div className="dice-modal">
            <button className="dice-modal-close" onClick={closeJudgeModal}>×</button>
            <div className="dice-modal-title">
              {judge.storyChoice ? '선택 결과 판정 · D12' : `${judge.stat} 판정 · DC ${judge.dc}`}
            </div>
            <D12 size={130} autoRoll={{ dc: judge.dc }} onDone={handleRollDone} />
            {judgeResult && (
              <>
                <div className={`dice-modal-result ${judgeResult.tier?.className || (judgeResult.success ? 'success' : 'fail')}`}>
                  {judgeResult.tier?.label || (judgeResult.success ? '성공!' : '실패')}
                </div>
                <div className="dice-modal-roll-num">
                  {judge.storyChoice ? `${judgeResult.result} / 12` : `${judgeResult.result} / DC ${judge.dc}`}
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
        </div>
        {testStageRunning ? (
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
                    motionIntensity={active ? character.motionIntensity : 0.12}
                    registerGlobalControls={active}
                  />
                </div>
              )
            })}
          </div>
        ) : activeCharacter && activeCharacter.speaker === 'gm' ? (
          <div className="gm-stage-window">
            <div className="gm-stage-title">GM</div>
            <Character3D
              key={activeCharacter.speaker}
              modelPath={activeCharacter.modelPath}
              modelRotation={activeCharacter.modelRotation}
              modelScale={activeCharacter.modelScale}
              modelOffset={activeCharacter.modelOffset}
              framingOffsetY={activeCharacter.framingOffsetY}
              framingScale={activeCharacter.framingScale}
              preferEmbeddedAnimations={activeCharacter.preferEmbeddedAnimations}
              motionIntensity={activeCharacter.motionIntensity}
            />
          </div>
        ) : activeCharacter && (
          <div className="char-center" data-speaker={activeCharacter.speaker}>
            <Character3D
              key={activeCharacter.speaker}
              modelPath={activeCharacter.modelPath}
              modelRotation={activeCharacter.modelRotation}
              modelScale={activeCharacter.modelScale}
              modelOffset={activeCharacter.modelOffset}
              framingOffsetY={activeCharacter.framingOffsetY}
              framingScale={activeCharacter.framingScale}
              preferEmbeddedAnimations={activeCharacter.preferEmbeddedAnimations}
              motionIntensity={activeCharacter.motionIntensity}
            />
          </div>
        )}
      </div>

      <div className="chat-section">
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

        {choiceMode && (
          <div className="choice-block">
            <div className="choice-flavor">{FLAVOR_CHOICE}</div>
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

        {choices.length > 0 && !sending && (
          <div className="choice-block">
            <div className="choice-flavor">{FLAVOR_CHOICE}</div>
            {choices.map((c, i) => (
              <button key={`${i}-${getChoiceText(c).slice(0, 8)}`}
                className="choice-row"
                onClick={() => c.kind === 'story' ? pickStoryChoice(c) : sendText(getChoiceText(c))}>
                <span className="cn">{i + 1}</span>
                <span>{getChoiceText(c)}</span>
              </button>
            ))}
            <div className="choice-note">또는 아래 입력창에 자유롭게 행동을 적어도 됩니다.</div>
          </div>
        )}

        <div className="inputbar">
          <input
            value={input}
            disabled={sending || !session?.id}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={session?.id ? '메시지를 입력하세요' : '타이틀에서 게임을 시작해 주세요'}
          />
          <button className="send" onClick={send} disabled={sending || !session?.id}>▶</button>
        </div>
      </div>
    </div>
  )
}
