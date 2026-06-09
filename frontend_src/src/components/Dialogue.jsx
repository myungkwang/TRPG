import React, { useEffect, useRef, useState } from 'react'
import { SPEAKERS, SPEAKER_KEY, FLAVOR_CHOICE, CHOICES } from '../data.js'
import D12 from './D12.jsx'
import Character3D from './Character3D.jsx'
import { apiChat, apiTTS } from '../api.js'

const CHARACTER_MODELS = [
  { speaker: 'gm', name: 'GM', modelPath: '/static/models/gm_model.glb' },
  { speaker: 'lin', name: '린', modelPath: '/static/models/gm_model.glb' },
]

const toUiLog = (history = []) => history.map((item) => ({
  // who(화자)가 있으면 그대로 쓰고, 없으면 role로 추론 (assistant→gm)
  who: item.who || (item.role === 'assistant' ? 'gm' : 'player'),
  text: item.content || '',
  speak: Boolean(item.speak),
}))

// 백엔드 segment({role, speaker}) → 말풍선 화자 키
const segToWho = (seg) =>
  seg.role === 'npc' ? (SPEAKER_KEY[seg.speaker] || 'gm') : 'gm'

const getLastNpcSpeaker = (log) => {
  const lastNpc = [...log].reverse().find((m) => m.who !== 'player' && CHARACTER_MODELS.some((c) => c.speaker === m.who))
  return lastNpc?.who || CHARACTER_MODELS[0].speaker
}

let currentAudio = null

async function speakGM(text) {
  try {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      currentAudio = null
    }

    window.playLinAnimation?.('talk')

    const data = await apiTTS(text)
    const audio = new Audio(data.audio_url)
    currentAudio = audio

    audio.onplay = () => window.playLinAnimation?.('talk')
    audio.onended = () => {
      window.playLinAnimation?.('idle')
      if (currentAudio === audio) currentAudio = null
    }
    audio.onerror = () => {
      window.playLinAnimation?.('idle')
      if (currentAudio === audio) currentAudio = null
    }

    await audio.play()
  } catch (err) {
    console.warn('TTS error:', err)
    window.playLinEmotion?.(text)
  }
}

export default function Dialogue({ session, history, onHistoryChange, onSessionChange, onTriggerMap }) {
  const [log, setLog] = useState(() => toUiLog(history))
  const [input, setInput] = useState('')
  const [choiceMode, setChoiceMode] = useState(false)
  const [activeSpeaker, setActiveSpeaker] = useState(() => getLastNpcSpeaker(toUiLog(history)))
  const [judge, setJudge] = useState(null)
  const [judgeResult, setJudgeResult] = useState(null)
  const [sending, setSending] = useState(false)
  const logRef = useRef(null)
  const judgeRef = useRef(null)
  const judgeTimerRef = useRef(null)
  const spokenRef = useRef(new Set())

  useEffect(() => {
    const next = toUiLog(history)
    setLog(next)
    setActiveSpeaker(getLastNpcSpeaker(next))

    const last = next[next.length - 1]
    const key = `${next.length}:${last?.text || ''}`
    if (last?.who !== 'player' && last?.speak && !spokenRef.current.has(key)) {
      spokenRef.current.add(key)
      setTimeout(() => {
        window.playLinEmotion?.(last.text)
        speakGM(last.text)
      }, 250)
    }
  }, [history])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log, choiceMode])

  useEffect(() => () => clearTimeout(judgeTimerRef.current), [])

  const appendMessage = (who, text, options = {}) => {
    const role = who === 'player' ? 'user' : 'assistant'
    onHistoryChange((prev) => [...prev, { role, content: text, who, speak: Boolean(options.speak) }])
  }

  const triggerJudge = (dc = 11, stat = '지각', after) => {
    judgeRef.current = { dc, stat, after }
    setJudge({ dc, stat })
    setJudgeResult(null)
  }

  const handleRollDone = (result) => {
    const dc = judgeRef.current?.dc ?? 0
    const success = result >= dc
    setJudgeResult({ result, success })
    clearTimeout(judgeTimerRef.current)
    judgeTimerRef.current = setTimeout(() => doCloseJudge(), 3000)
  }

  const doCloseJudge = () => {
    clearTimeout(judgeTimerRef.current)
    const { after, stat } = judgeRef.current || {}
    judgeRef.current = null
    setJudge(null)
    setJudgeResult(null)
    if (after) after()
    else if (stat) appendMessage('gm', `${stat} 판정이 끝났다. 결과에 따라 이야기가 갈라진다.`, { speak: true })
  }

  const closeJudgeModal = () => {
    if (!judgeResult) return
    doCloseJudge()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || !session?.id || sending) return

    appendMessage('player', text)
    setInput('')
    setChoiceMode(false)
    setSending(true)

    try {
      const data = await apiChat(session.id, text)
      onSessionChange(data.session)
      // 화자별 세그먼트로 말풍선을 나눠 추가 (GM=시스템/서술, 의사·린 등=각자 말풍선)
      const segs = (data.segments && data.segments.length)
        ? data.segments
        : [{ role: 'gm', speaker: null, text: data.answer }]
      segs.forEach((seg, i) => {
        appendMessage(segToWho(seg), seg.text, { speak: i === segs.length - 1 })
      })
    } catch (err) {
      appendMessage('gm', `오류: ${err.message}`, { speak: false })
    } finally {
      setSending(false)
    }
  }

  const pickChoice = (choice) => {
    appendMessage('player', `[선택] ${choice.text}`)
    setChoiceMode(false)
    if (choice.judge) {
      triggerJudge(choice.dc, choice.stat)
    } else {
      appendMessage('gm', '선택이 기록되었다. GM이 그 결과를 이야기 속에 반영한다.', { speak: true })
    }
  }

  const activeCharacter = CHARACTER_MODELS.find((c) => c.speaker === activeSpeaker) || CHARACTER_MODELS[0]

  return (
    <div className="dialogue">
      <div className="bg-embers" />

      {judge && (
        <div className="dice-modal-overlay" onClick={closeJudgeModal}>
          <div className="dice-modal">
            <button className="dice-modal-close" onClick={closeJudgeModal}>✕</button>
            <div className="dice-modal-title">{judge.stat} 판정 · DC {judge.dc}</div>
            <D12 size={130} autoRoll={{ dc: judge.dc }} onDone={handleRollDone} />
            {judgeResult && (
              <>
                <div className={`dice-modal-result ${judgeResult.success ? 'success' : 'fail'}`}>
                  {judgeResult.success ? '성공!' : '실패'}
                </div>
                <div className="dice-modal-roll-num">{judgeResult.result} / DC {judge.dc}</div>
                <div className="dice-modal-hint">클릭하거나 3초 후 자동으로 닫힙니다</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="vn-stage">
        <div className="stage-tools">
          <button onClick={() => setChoiceMode((v) => !v)}>선택지</button>
          <button onClick={() => triggerJudge(11, '지각')}>판정</button>
          <button onClick={onTriggerMap}>🗺 지도</button>
        </div>
        <div className="char-center">
          <Character3D key={activeCharacter.speaker} modelPath={activeCharacter.modelPath} />
        </div>
      </div>

      <div className="chat-section">
        <div className="chatlog" ref={logRef}>
          {log.length === 0 && (
            <div className="msg left">
              <div className="role" style={{ color: SPEAKERS.gm.color }}>GM</div>
              <div className="bubble" style={{ borderColor: SPEAKERS.gm.color, background: SPEAKERS.gm.tint }}>
                타이틀 화면에서 게임 시작을 눌러 이야기를 시작하세요.
              </div>
            </div>
          )}

          {log.map((m, i) => {
            const speaker = SPEAKERS[m.who] || SPEAKERS.gm
            const side = m.who === 'player' ? 'right' : 'left'
            return (
              <div key={`${i}-${m.text.slice(0, 8)}`} className={`msg ${side}`}>
                <div className="role" style={{ color: speaker.color }}>{speaker.name}</div>
                <div className="bubble" style={{
                  borderColor: speaker.color,
                  background: speaker.tint,
                  boxShadow: `inset ${side === 'right' ? '-3px' : '3px'} 0 0 ${speaker.color}, 0 3px 10px #0005`,
                }}>{m.text}</div>
              </div>
            )
          })}
        </div>

        {choiceMode && (
          <div className="choice-block">
            <div className="choice-flavor">{FLAVOR_CHOICE}</div>
            {CHOICES.map((choice) => (
              <button key={choice.id}
                className={'choice-row' + (choice.tag && choice.tag.includes('위험') ? ' danger' : '')}
                onClick={() => pickChoice(choice)}>
                <span className="cn">{choice.id}</span>
                <span>{choice.text}</span>
                {choice.tag && <span className="ctag">{choice.tag}</span>}
              </button>
            ))}
            <div className="choice-note">※ 입력창에 직접 써서 다른 행동을 하거나 그냥 넘길 수도 있습니다.</div>
          </div>
        )}

        <div className="inputbar">
          <input
            value={input}
            disabled={sending || !session?.id}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && send()}
            placeholder={session?.id ? '메세지를 입력하세요' : '타이틀에서 게임 시작을 눌러주세요'}
          />
          <button className="send" onClick={send} disabled={sending || !session?.id}>➤</button>
        </div>
      </div>
    </div>
  )
}
