import React, { useEffect, useRef, useState } from 'react'
import { SPEAKERS, FLAVOR_CHOICE, CHOICES } from '../data.js'
import D12 from './D12.jsx'
import Character3D from './Character3D.jsx'
import { apiChat, apiTTS, apiDebugEnding } from '../api.js'
import { PERSONAS, getPersona } from '../personas.js'

const CRYSTAL_MINE_BGM = '/static/audio/bgm/crystal-mine.mp3'
const USE_BROWSER_TTS = false

const NPC_DIALOGUE_TEST_LINES = [
  { speaker: 'doctor', text: '린, 환자의 반응이 안정적입니다. 하지만 기억은 아직 흐릿한 것 같군요.' },
  { speaker: 'lin', text: '그럼 제가 몇 가지를 물어볼게요. 손님, 여관에서 본 표식은 기억나시나요?' },
  { speaker: 'gail', text: '표식보다 중요한 건 광산 쪽 움직임입니다. 남은 인력으로도 채굴을 계속해야 하니까요.' },
  { speaker: 'tobi', text: '저도 같이 갈래요. 형이 남긴 표식이라면 제가 알아볼 수 있을지도 몰라요!' },
  { speaker: 'doctor', text: '가일, 서두르지 마십시오. 이 사람의 상태를 먼저 확인해야 합니다.' },
  { speaker: 'lin', text: '두 분 다 잠깐만요. 지금은 손님이 따라올 수 있게 천천히 말하는 게 좋겠어요.' },
]

<<<<<<< HEAD
=======
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

>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
const CHARACTER_MODELS = [
  {
    speaker: 'gm',
    personaId: 'doctor',
    name: PERSONAS.doctor.name,
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
<<<<<<< HEAD
    modelScale: 0.75,
    modelOffset: [0, -120, 0],
    preferEmbeddedAnimations: true,
=======
    modelScale: 0.82,
    modelOffset: [0, -120, 0],
    preferEmbeddedAnimations: true,
    motionIntensity: 0.9,
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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
<<<<<<< HEAD
    modelPath: '/static/models/static/models/Tobi_01.glb',
=======
    modelPath: '/static/models/Marta_01.glb',
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
    modelScale: 0.75,
    modelOffset: [0, 80, 0],
  },
  {
    speaker: 'tobi',
    personaId: 'tobi',
    name: PERSONAS.tobi.name,
    modelPath: '/static/models/Tobi_01.glb',
    modelRotation: [-Math.PI / 2, Math.PI, Math.PI],
<<<<<<< HEAD
    modelScale: 0.45,
    modelOffset: [0, 80, 0],
=======
    modelScale: 0.15,
    modelOffset: [0, 60, 0],
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
  },
  {
    speaker: 'doctor',
    personaId: 'doctor',
    name: PERSONAS.doctor.name,
    modelPath: '/static/models/Doctor_04_tracksDevided.glb',
    modelScale: 0.75,
    modelOffset: [0, -120, 0],
    preferEmbeddedAnimations: true,
<<<<<<< HEAD
    motionIntensity: 2.5,
=======
    motionIntensity: 0.45,
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
  },
  {
    speaker: 'kargas',
    personaId: 'kargas',
    name: PERSONAS.kargas.name,
    modelPath: '/static/models/GM_Base_WithShapeKeys_04.glb',
    modelScale: 0.75,
    modelOffset: [0, 80, 0],
  },
]

const LOCATION_BACKGROUNDS = [
  { aliases: ['진료소', '진료실', '의무실', 'clinic', 'hospital'], path: '/static/backgrounds/clinic.png' },
  { aliases: ['여관', 'tavern', 'inn'], path: '/static/backgrounds/inn.png' },
  { aliases: ['정제소', 'refinery'], path: '/static/backgrounds/refinery.png' },
  { aliases: ['갱도', '갱도사무소', '광산', 'mine', 'mineshaft'], path: '/static/backgrounds/mine.png' },
]

const getLocationBackground = (location) => {
  const normalized = String(location || '').replace(/\s+/g, '').toLowerCase()
  if (!normalized) return null
  return LOCATION_BACKGROUNDS.find(bg =>
    bg.aliases.some(alias => normalized.includes(alias.replace(/\s+/g, '').toLowerCase())),
  )?.path || null
}

const getMapResultLocation = (kind) => {
  const normalized = String(kind || '').replace(/\s+/g, '').toLowerCase()
  if (!normalized) return null
  if (['shop', '거래', '상점', '정제소'].some(key => normalized.includes(key))) return '정제소'
  if (['battle', '전투', '갱도', '광산', 'boss'].some(key => normalized.includes(key))) return '갱도'
  if (['event', '이벤트', '여관', 'mystery', '미지'].some(key => normalized.includes(key))) return '여관'
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

<<<<<<< HEAD
    return splitSpeechSegments(item.content || '', item.speaker || 'gm').map(segment => ({
=======
    const segments = normalizeStorySegments(item.segments, item.content || '', item.speaker || 'gm')
    return segments.map(segment => ({
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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
<<<<<<< HEAD
  const original = String(text || '').trim()
  const clean = original
=======
  const clean = String(text || '')
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
    .replace(/[(\[（【][^)\]）】]{1,60}[)\]）】]/g, (m) => {
      hints.push(m.slice(1, -1).trim())
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
<<<<<<< HEAD
  if (!clean && original) {
    return { cleanText: original, toneHint: '' }
  }
=======
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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
<<<<<<< HEAD
  return segments.flatMap(splitSegmentSentences)
=======
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
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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

  const labelPattern = /(여우\s*린|린|GM|진행자|의사|가일|마르타|토비|카르가스)\s*[:：]\s*/g
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
<<<<<<< HEAD
=======

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
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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

<<<<<<< HEAD
    const segments = mergeShortSpeechSegments(splitSpeechSegments(text, speaker))
=======
    const segments = mergeShortSpeechSegments(normalizeStorySegments(options.segments, text, speaker))
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
    console.log('TTS SEGMENTS:', segments)

    for (const segment of segments) {
      if (runId !== speechRunId) return

<<<<<<< HEAD
      const persona = getPersonaForSpeaker(segment.speaker)
      const { cleanText, toneHint } = extractToneHint(segment.text)
      const spokenText = cleanText || segment.text
      options.onSegmentStart?.(segment)
      revealedCount += 1

      _onGmSpeakChange?.(segment.speaker === 'gm')

=======
      _onGmSpeakChange?.(segment.speaker === 'gm')

      const persona = getPersonaForSpeaker(segment.speaker)
      const { cleanText, toneHint } = extractToneHint(segment.text)
      const spokenText = cleanText || segment.text
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
      const ttsInstructions = toneHint
        ? `${getTtsInstructions(persona)} ${toneHint}`.trim()
        : getTtsInstructions(persona)
      const cleanSegment = { ...segment, text: spokenText }
      const fallbackDuration = estimateSpeechDuration(spokenText)
<<<<<<< HEAD
=======
      options.onSegmentStart?.(segment)
      revealedCount += 1
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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
<<<<<<< HEAD
=======
        try {
          await speakWithBrowserTts(cleanSegment, fallbackDuration)
          if (runId !== speechRunId) return
          await new Promise(resolve => setTimeout(resolve, 120))
          continue
        } catch (browserFallbackErr) {
          console.warn('Browser TTS fallback failed:', segment.speaker, browserFallbackErr)
        }
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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

export default function Dialogue({ session, history, onHistoryChange, onSessionChange, onEnding, runMapStep }) {
  const [log, setLog] = useState(() => toUiLog(history))
  const [input, setInput] = useState('')
  const [choiceMode, setChoiceMode] = useState(false)
  const [activeSpeaker, setActiveSpeaker] = useState(() => getLastNpcSpeaker(toUiLog(history)))
  const [stageLocation, setStageLocation] = useState(null)
  const [judge, setJudge] = useState(null)
  const [judgeResult, setJudgeResult] = useState(null)
  const [sending, setSending] = useState(false)
  const [choices, setChoices] = useState([])
  const [npcTestRunning, setNpcTestRunning] = useState(false)
<<<<<<< HEAD
=======
  const [shortTtsTestRunning, setShortTtsTestRunning] = useState(false)
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
  const [gmSpeaking, setGmSpeaking] = useState(false)
  const logRef = useRef(null)
  const judgeRef = useRef(null)
  const judgeTimerRef = useRef(null)
  const mappingRef = useRef(false)
  const spokenRef = useRef(new Set())
  const mineBgmRef = useRef(null)

  useEffect(() => {
    const last = history?.[history.length - 1]
    const speaker = last?.role === 'assistant' ? (last.speaker || 'gm') : 'player'
    const key = `${history?.length || 0}:${speaker}:${last?.content || ''}`

    if (last?.role === 'assistant' && last?.speak && !spokenRef.current.has(key)) {
      const previousLog = toUiLog(history.slice(0, -1))
      setLog(previousLog)
      setActiveSpeaker(getLastNpcSpeaker(previousLog))
      spokenRef.current.add(key)
      setTimeout(() => {
        speakNpc(last.content || '', speaker, {
<<<<<<< HEAD
=======
          segments: normalizeStorySegments(last.segments, last.content || '', speaker),
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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
      }, 250)
      return
    }

    const next = toUiLog(history)
    setLog(next)
    setActiveSpeaker(getLastNpcSpeaker(next))
  }, [history])

  const push = (who, text, options = {}) => {
    if (who !== 'player' && CHARACTER_MODELS.some(c => c.speaker === who)) {
      setActiveSpeaker(who)
    }

    if (onHistoryChange) {
      const role = who === 'player' ? 'user' : 'assistant'
<<<<<<< HEAD
      onHistoryChange(prev => [...prev, { role, speaker: who, content: text, speak: Boolean(options.speak) }])
=======
      onHistoryChange(prev => [...prev, {
        role,
        speaker: who,
        content: text,
        segments: options.segments,
        speak: Boolean(options.speak),
      }])
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
    } else {
      const next = who === 'player'
        ? [{ who, text, speak: Boolean(options.speak) }]
        : splitSpeechSegments(text, who).map(segment => ({ who: segment.speaker, text: segment.text, speak: false }))
      if (who !== 'player' && options.speak) {
        speakNpc(text, who, {
<<<<<<< HEAD
=======
          segments: options.segments,
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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
      dc, stat, after: opts.after,
      onSuccess: opts.onSuccess || 'shop', onFail: opts.onFail || 'event', success: null,
    }
    setJudge({ dc, stat })
    setJudgeResult(null)
  }

  const handleRollDone = (result) => {
    const dc = judgeRef.current?.dc ?? 0
    const success = result >= dc
    if (judgeRef.current) judgeRef.current.success = success
    setJudgeResult({ result, success })
    clearTimeout(judgeTimerRef.current)
    judgeTimerRef.current = setTimeout(() => doCloseJudge(), 3000)
  }

  const doCloseJudge = () => {
    clearTimeout(judgeTimerRef.current)
    const ref = judgeRef.current || {}
    judgeRef.current = null
    setJudge(null)
    setJudgeResult(null)
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
<<<<<<< HEAD
    if (npcTestRunning) return
=======
    if (npcTestRunning || shortTtsTestRunning) return
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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

<<<<<<< HEAD
=======
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

>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
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
      onSessionChange?.(data.session)
<<<<<<< HEAD
      push('gm', data.answer, { speak: true })
=======
      push('gm', data.answer, {
        speak: true,
        segments: normalizeStorySegments(data.segments, data.answer, 'gm'),
      })
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
      setChoices(Array.isArray(data.choices) ? data.choices : [])
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

  const activeCharacter = CHARACTER_MODELS.find(c => c.speaker === activeSpeaker) || CHARACTER_MODELS[0]
<<<<<<< HEAD
=======
  const npcTestCharacters = NPC_TEST_SPEAKERS
    .map(speaker => CHARACTER_MODELS.find(c => c.speaker === speaker))
    .filter(Boolean)
  const stagedNpcTestCharacters = npcTestCharacters
    .filter(character => character.speaker !== activeSpeaker)
    .concat(npcTestCharacters.filter(character => character.speaker === activeSpeaker))
  const testStageRunning = npcTestRunning || shortTtsTestRunning
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
  const locationBackground = getLocationBackground(stageLocation || session?.location)
  const isMineLocation = locationBackground?.includes('/mine.png')

  useEffect(() => {
    if (!mineBgmRef.current) {
      const audio = new Audio(CRYSTAL_MINE_BGM)
      audio.loop = true
      audio.volume = 0.28
      mineBgmRef.current = audio
    }

    const audio = mineBgmRef.current
    if (isMineLocation) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
      audio.currentTime = 0
    }

    return () => {
      audio.pause()
    }
  }, [isMineLocation])

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
<<<<<<< HEAD
          <button onClick={runNpcDialogueTest} disabled={npcTestRunning}>
            {npcTestRunning ? '대화중' : 'NPC 테스트'}
          </button>
=======
          <button onClick={runNpcDialogueTest} disabled={testStageRunning}>
            {npcTestRunning ? '대화중' : 'NPC 테스트'}
          </button>
          <button onClick={runShortTtsTest} disabled={testStageRunning}>
            {shortTtsTestRunning ? 'TTS중' : '짧은TTS'}
          </button>
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
          {['노멀', '트루', '히든', '베드'].map(k => (
            <button key={k} onClick={() => jumpEnding(k)} disabled={endingJumping || !session?.id}
              title={`${k} 엔딩으로 즉시 점프 (테스트)`}>
              {endingJumping ? '…' : `▶${k}`}
            </button>
          ))}
        </div>
<<<<<<< HEAD
        {activeSpeaker !== 'gm' && (
=======
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
        ) : activeSpeaker !== 'gm' && (
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
          <div className="char-center">
            <Character3D
              key={activeCharacter.speaker}
              modelPath={activeCharacter.modelPath}
              modelRotation={activeCharacter.modelRotation}
              modelScale={activeCharacter.modelScale}
              modelOffset={activeCharacter.modelOffset}
<<<<<<< HEAD
=======
              framingOffsetY={activeCharacter.framingOffsetY}
              framingScale={activeCharacter.framingScale}
>>>>>>> 5ca47c3bd24137f2af35ea7ae01aa357f40ec0e5
              preferEmbeddedAnimations={activeCharacter.preferEmbeddedAnimations}
              motionIntensity={activeCharacter.motionIntensity}
            />
          </div>
        )}

        {gmSpeaking && (
          <div className="gm-face-popup">
            <Character3D
              key="gm-popup"
              modelPath={CHARACTER_MODELS[0].modelPath}
              modelScale={CHARACTER_MODELS[0].modelScale}
              modelOffset={CHARACTER_MODELS[0].modelOffset}
              motionIntensity={CHARACTER_MODELS[0].motionIntensity}
              cameraPosition={[0, 830, 150]}
              cameraTarget={[0, 820, 0]}
              cameraFov={25}
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
              <button key={`${i}-${c.slice(0, 8)}`}
                className="choice-row"
                onClick={() => sendText(c)}>
                <span className="cn">{i + 1}</span>
                <span>{c}</span>
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
