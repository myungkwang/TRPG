import React, { useEffect, useRef, useState } from 'react'
import { SPEAKERS, FLAVOR_CHOICE, CHOICES } from '../data.js'
import D12 from './D12.jsx'
import Character3D from './Character3D.jsx'
import { apiChat, apiTTS, apiDebugEnding, apiGenerateBackground } from '../api.js'
import { PERSONAS, getPersona } from '../personas.js'

const CRYSTAL_MINE_BGM = '/static/audio/bgm/crystal-mine.mp3'

const NPC_DIALOGUE_TEST_LINES = [
  { speaker: 'doctor', text: '린, 환자의 반응이 안정적입니다. 하지만 기억은 아직 흐릿한 것 같군요.' },
  { speaker: 'lin', text: '그럼 제가 몇 가지를 물어볼게요. 손님, 여관에서 본 표식은 기억나시나요?' },
  { speaker: 'gail', text: '표식보다 중요한 건 광산 쪽 움직임입니다. 남은 인력으로도 채굴을 계속해야 하니까요.' },
  { speaker: 'doctor', text: '가일, 서두르지 마십시오. 이 사람의 상태를 먼저 확인해야 합니다.' },
  { speaker: 'lin', text: '두 분 다 잠깐만요. 지금은 손님이 따라올 수 있게 천천히 말하는 게 좋겠어요.' },
]

const CHARACTER_MODELS = [
  {
    speaker: 'gm',
    personaId: 'doctor',
    name: PERSONAS.doctor.name,
    modelPath: '/static/models/GM_Base_WithShapeKeys_04.glb',
    modelScale: 1,
    modelOffset: [0, 0, 0],
  },
  {
    speaker: 'lin',
    personaId: 'lin',
    name: PERSONAS.lin.name,
    modelPath: '/static/models/GM_Base_WithShapeKeys_04.glb',
    modelScale: 1,
    modelOffset: [0, 0, 0],
  },
  {
    speaker: 'gail',
    personaId: 'gail',
    name: PERSONAS.gail.name,
    modelPath: '/static/models/Gail_05.glb',
    modelRotation: [-Math.PI / 2, Math.PI, Math.PI],
    modelScale: 0.25,
    modelOffset: [0, 80, 0],
  },
  {
    speaker: 'marta',
    personaId: 'marta',
    name: PERSONAS.marta.name,
    modelPath: '/static/models/GM_Base_WithShapeKeys_04.glb',
    modelScale: 1,
    modelOffset: [0, 0, 0],
  },
  {
    speaker: 'tobi',
    personaId: 'tobi',
    name: PERSONAS.tobi.name,
    modelPath: '/static/models/GM_Base_WithShapeKeys_04.glb',
    modelScale: 1,
    modelOffset: [0, 0, 0],
  },
  {
    speaker: 'doctor',
    personaId: 'doctor',
    name: PERSONAS.doctor.name,
    modelPath: '/static/models/GM_Base_WithShapeKeys_04.glb',
    modelScale: 1,
    modelOffset: [0, 0, 0],
  },
  {
    speaker: 'kargas',
    personaId: 'kargas',
    name: PERSONAS.kargas.name,
    modelPath: '/static/models/GM_Base_WithShapeKeys_04.glb',
    modelScale: 1,
    modelOffset: [0, 0, 0],
  },
]

// 핵심 장소(주요 NPC 거점)만 고정 배경. 그 외 모든 장소는 AI 자동생성.
const LOCATION_BACKGROUNDS = [
  { aliases: ['진료소', '진료실', '의무실', 'clinic'], path: '/static/backgrounds/clinic.png' },
  { aliases: ['여관', '주점', '여우길', 'tavern', 'inn'], path: '/static/backgrounds/inn.png' },
  { aliases: ['주둔소', '영석공사', '가일', 'garrison'], path: '/static/backgrounds/garrison.png' },
  { aliases: ['봉우리', '정상', '둥지', '카르가스', 'peak'], path: '/static/backgrounds/peak.png' },
  { aliases: ['오두막', '산기슭', '마르타', 'hut', 'cabin'], path: '/static/backgrounds/hut.png' },
  { aliases: ['광산입구', '갱도입구', 'mine'], path: '/static/backgrounds/mine.png' },
  { aliases: ['광장', 'square'], path: '/static/backgrounds/square.png' },
]

const getLocationBackground = (location) => {
  const normalized = String(location || '').replace(/\s+/g, '').toLowerCase()
  if (!normalized) return null
  return LOCATION_BACKGROUNDS.find(bg =>
    bg.aliases.some(alias => normalized.includes(alias.replace(/\s+/g, '').toLowerCase())),
  )?.path || null
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

    return splitSpeechSegments(item.content || '', item.speaker || 'gm').map(segment => ({
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

let currentAudio = null
let speechRunId = 0
const VOICE_RATE = 1.35   // 음성 재생 속도(템포). 음정은 preservesPitch로 유지.

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
// 진행 중인 TTS를 즉시 끊는다(플레이어가 말 도중 끼어들 때).
function stopSpeaking() {
  speechRunId += 1                 // 돌고 있는 speakNpc 루프를 무효화
  const a = currentAudio
  currentAudio = null
  if (a) {
    a.pause()
    // 재생을 기다리던 Promise가 멈추지 않도록 ended를 강제로 발생시켜 루프를 깔끔히 종료
    try { a.dispatchEvent(new Event('ended')) } catch { /* noop */ }
  }
  window.stopLinLipSync?.()
  window.playLinAnimation?.('idle')
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

    const segments = splitSpeechSegments(text, speaker)
    console.log('TTS SEGMENTS:', segments)

    for (const segment of segments) {
      if (runId !== speechRunId) return

      try {
        const persona = getPersonaForSpeaker(segment.speaker)
        const data = await apiTTS(segment.text, {
          speaker: persona.id,
          voice: persona.tts?.voice,
          instructions: getTtsInstructions(persona),
        })
        console.log('TTS RESPONSE:', data)

        if (runId !== speechRunId) return

        const audio = new Audio(data.audio_url)
        // 음성 자체를 빠르게 — 템포만 올리고 음정은 유지(자연스러운 빠른 말).
        audio.preservesPitch = true
        audio.mozPreservesPitch = true
        audio.webkitPreservesPitch = true
        audio.playbackRate = VOICE_RATE
        currentAudio = audio
        options.onSegmentStart?.(segment)
        revealedCount += 1

        audio.onplay = () => {
          window.playLinPerformance?.(segment.text, data.emotion, audio.duration)
          window.startLinLipSync?.(audio, segment.text)
        }

        await new Promise((resolve, reject) => {
          audio.onended = resolve
          audio.onerror = reject
          audio.play().catch(reject)
        })

        window.stopLinLipSync?.()
        if (currentAudio === audio) currentAudio = null

        if (runId !== speechRunId) return
        await new Promise(resolve => setTimeout(resolve, 40))
      } catch (segmentErr) {
        console.warn('TTS segment error:', segment.speaker, segmentErr)
        window.stopLinLipSync?.()
        if (currentAudio) {
          currentAudio.pause()
          currentAudio = null
        }
        options.onSegmentStart?.(segment)
        revealedCount += 1
        await new Promise(resolve => setTimeout(resolve, 180))
      }
    }

    window.playLinAnimation?.('idle')
  } catch (err) {
    console.warn('TTS error:', err)
    window.stopLinLipSync?.()
    window.playLinAnimation?.('idle')
    options.onFallback?.(splitSpeechSegments(text, speaker).slice(revealedCount))
    window.playLinEmotion?.(text)
  }
}

export default function Dialogue({ session, history, onHistoryChange, onSessionChange, onEnding, runMapStep }) {
  const [log, setLog] = useState(() => toUiLog(history))
  const [input, setInput] = useState('')
  const [choices, setChoices] = useState([])
  const [choiceMode, setChoiceMode] = useState(false)
  const [activeSpeaker, setActiveSpeaker] = useState(() => getLastNpcSpeaker(toUiLog(history)))
  const [genBg, setGenBg] = useState({})        // 장소 → 생성된 배경 url
  const [bgLoading, setBgLoading] = useState(false)
  const bgTriedRef = useRef(new Set())
  const pendingRevealRef = useRef(null)   // 배경 생성 중일 때 보류해 둔 GM 대사(생성 후 공개)
  const [judge, setJudge] = useState(null)
  const [judgeResult, setJudgeResult] = useState(null)
  const [sending, setSending] = useState(false)
  const [npcTestRunning, setNpcTestRunning] = useState(false)
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
      // 텍스트는 음성과 함께(세그먼트 단위로) 노출한다.
      speakNpc(last.content || '', speaker, {
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
      onHistoryChange(prev => [...prev, { role, speaker: who, content: text, speak: Boolean(options.speak) }])
    } else {
      const next = who === 'player'
        ? [{ who, text, speak: Boolean(options.speak) }]
        : splitSpeechSegments(text, who).map(segment => ({ who: segment.speaker, text: segment.text, speak: false }))
      if (who !== 'player' && options.speak) {
        speakNpc(text, who, {
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

  // 말판은 '시각적 진행 표시'일 뿐 — 장소/배경/나레이션은 모두 스토리(set_location)가 정한다.
  // 여기선 캔드 메시지·장소 강제 없이 말판만 한 칸 움직인다.
  const advanceOnMap = (dest) => {
    if (!runMapStep || mappingRef.current) return
    mappingRef.current = true
    runMapStep(dest).then(() => { mappingRef.current = false })
  }

  // AI가 스토리 이벤트로 스테이지를 진행시키면(visit_event) 말판이 자동으로 한 칸 전진한다.
  // 첫 동기화(로드/이어하기)는 건너뛰고, 실제 진행으로 단계가 오를 때만 작동.
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

  // 게임 화면을 떠나면(타이틀 이동 등) 진행 중인 음성을 멈춘다 — 음성은 게임 중에만.
  useEffect(() => () => stopSpeaking(), [])

  useEffect(() => () => clearTimeout(judgeTimerRef.current), [])

  const triggerJudge = (dc = 11, stat = '지각', opts = {}) => {
    judgeRef.current = { dc, stat, after: opts.after, choiceText: opts.choiceText || null, success: null }
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
    if (ref.after) { ref.after(); return }
    // 판정 결과를 GM에게 넘겨 이야기를 자연스럽게 잇는다 (말판/캔드 메시지 없음)
    const outcome = ref.success ? '성공' : '실패'
    const prefix = ref.choiceText ? `${ref.choiceText} ` : ''
    sendText(`${prefix}(${ref.stat} 판정 ${outcome})`)
  }

  const closeJudgeModal = () => {
    if (!judgeResult) return
    doCloseJudge()
  }

  const runNpcDialogueTest = async () => {
    if (npcTestRunning) return
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

  const sendText = async (raw) => {
    const text = String(raw || '').trim()
    if (!text || sending) return

    stopSpeaking()        // AI가 말하는 중이면 즉시 끊고 플레이어 입력을 받는다
    push('player', text)
    setInput('')
    setChoices([])         // 새 입력 → 이전 선택지 제거
    setChoiceMode(false)

    if (!session?.id) {
      push('gm', '타이틀에서 새 게임을 시작해 주세요.', { speak: false })
      return
    }

    setSending(true)
    try {
      const data = await apiChat(session.id, text)
      onSessionChange?.(data.session)
      const newLoc = data.session?.location
      const choicesArr = Array.isArray(data.choices) ? data.choices : []
      // 이 응답으로 비고정 장소 배경이 새로 '생성'될 예정이면, 생성이 끝난 뒤 대사를 공개한다.
      const willGenerate = newLoc && !getLocationBackground(newLoc)
        && !genBg[newLoc] && !bgTriedRef.current.has(newLoc)
      if (willGenerate) {
        pendingRevealRef.current = { answer: data.answer, choices: choicesArr }
      } else {
        push('gm', data.answer, { speak: true })
        setChoices(choicesArr)
      }
    } catch (err) {
      push('gm', `오류: ${err.message}`, { speak: false })
    } finally {
      setSending(false)
    }
  }

  const send = () => sendText(input)

  // [테스트 전용] 원하는 엔딩으로 즉시 점프. 세션 갱신 → App이 엔딩 오버레이를 띄운다.
  const [endingJumping, setEndingJumping] = useState(false)
  const jumpEnding = async (kind) => {
    if (!session?.id || endingJumping) return
    setEndingJumping(true)
    push('gm', `(테스트) '${kind}' 엔딩을 생성하는 중입니다… 잠시만 기다려 주세요.`, { speak: false })
    try {
      const data = await apiDebugEnding(session.id, kind)
      onSessionChange?.(data.session)   // progress=100 + ending_locked 반영
      if (data.ending) onEnding?.(data.ending)   // 점프는 즉시 공개(반복 테스트도 매번 뜸)
    } catch (err) {
      push('gm', `엔딩 테스트 오류: ${err.message}`, { speak: false })
    } finally {
      setEndingJumping(false)
    }
  }

  const pickChoice = (c) => {
    setChoiceMode(false)
    if (c.judge) {
      push('player', `[선택] ${c.text}`)
      triggerJudge(c.dc, c.stat, { choiceText: c.text })
    } else {
      // 선택지를 그대로 GM에게 보내 이야기를 잇는다 (캔드 대사·말판 강제 없음)
      sendText(c.text)
    }
  }

  const activeCharacter = CHARACTER_MODELS.find(c => c.speaker === activeSpeaker) || CHARACTER_MODELS[0]
  const curLocation = session?.location   // 장소는 오직 스토리(set_location)가 결정
  const fixedBackground = getLocationBackground(curLocation)
  // 주요 장소엔 고정 배경, 그 외엔 AI가 생성한 배경(genBg)을 쓴다.
  const locationBackground = fixedBackground || (curLocation ? genBg[curLocation] : null) || null
  const isMineLocation = locationBackground?.includes('/mine.png')

  // 고정 배경이 없는 장소로 이동하면 배경을 즉석 생성(로딩 화면 표시). 같은 장소는 1회만.
  useEffect(() => {
    if (!curLocation || !session?.id) return
    if (getLocationBackground(curLocation)) return       // 주요 장소 = 고정 배경
    if (genBg[curLocation] || bgTriedRef.current.has(curLocation)) return
    bgTriedRef.current.add(curLocation)
    setBgLoading(true)
    apiGenerateBackground(session.id, curLocation)
      .then(d => { if (d.url) setGenBg(prev => ({ ...prev, [curLocation]: d.url })) })
      .catch(() => {})
      .finally(() => {
        setBgLoading(false)
        // 배경이 준비됐으니 보류해 둔 GM 대사를 이제 공개·재생한다.
        const pr = pendingRevealRef.current
        if (pr) {
          pendingRevealRef.current = null
          push('gm', pr.answer, { speak: true })
          setChoices(pr.choices)
        }
      })
  }, [curLocation])

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

      {bgLoading && (
        <div className="bg-loading">
          <div className="bg-loading-spinner" />
          <div className="bg-loading-text">AI가 로딩 중입니다…</div>
          <div className="bg-loading-sub">새로운 장소의 풍경을 그리는 중</div>
        </div>
      )}

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
          <button onClick={() => triggerJudge(11, '지각')}>판정</button>
          <button onClick={() => advanceOnMap()}>지도</button>
          <button onClick={runNpcDialogueTest} disabled={npcTestRunning}>
            {npcTestRunning ? '대화중' : 'NPC 테스트'}
          </button>
          {/* 테스트 전용: 엔딩 즉시 점프 */}
          {['노멀', '트루', '히든', '베드'].map(k => (
            <button key={k} onClick={() => jumpEnding(k)} disabled={endingJumping || !session?.id}
              title={`${k} 엔딩으로 즉시 점프 (테스트)`}>
              {endingJumping ? '…' : `▶${k}`}
            </button>
          ))}
        </div>
        <div className="char-center">
          <Character3D
            key={activeCharacter.speaker}
            modelPath={activeCharacter.modelPath}
            modelRotation={activeCharacter.modelRotation}
            modelScale={activeCharacter.modelScale}
            modelOffset={activeCharacter.modelOffset}
          />
        </div>
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

        {choices.length > 0 && !sending && (
          <div className="choice-block">
            <div className="choice-flavor">{FLAVOR_CHOICE}</div>
            {choices.map((raw, i) => {
              const c = typeof raw === 'string' ? { text: raw, judge: false } : (raw || { text: '', judge: false })
              return (
                <button key={`${i}-${(c.text || '').slice(0, 8)}`}
                  className={`choice-row${c.judge ? ' choice-judge' : ''}`}
                  onClick={() => pickChoice(c)}>
                  <span className="cn">{i + 1}</span>
                  <span>{c.judge ? `🎲 ${c.text}` : c.text}</span>
                </button>
              )
            })}
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
