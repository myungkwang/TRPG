import React, { useState, useRef, useEffect } from 'react'
import { SPEAKERS, SEED_DIALOGUE, FLAVOR_CHOICE, CHOICES } from '../data.js'
import D12 from './D12.jsx'
import Character3D from './Character3D.jsx'

const CHARACTER_MODELS = [
  { speaker: 'gm', name: 'GM', modelPath: '/models/GM_Demo.fbx' },
  { speaker: 'lin', name: '린', modelPath: '/models/GM_Demo.fbx' },
  // { speaker: 'gail', name: '게일', modelPath: '/models/gail.fbx' },
]

const getLastNpcSpeaker = (log) => {
  const lastNpc = [...log].reverse().find(m => m.who !== 'player' && CHARACTER_MODELS.some(c => c.speaker === m.who))
  return lastNpc?.who || CHARACTER_MODELS[0].speaker
}

export default function Dialogue({ runMapStep }) {
  const [log, setLog] = useState(SEED_DIALOGUE)
  const [input, setInput] = useState('')
  const [choiceMode, setChoiceMode] = useState(false)
  const [activeSpeaker, setActiveSpeaker] = useState(() => getLastNpcSpeaker(SEED_DIALOGUE))
  const [judge, setJudge] = useState(null)          // {dc, stat}
  const [judgeResult, setJudgeResult] = useState(null)  // {result, success} 굴림 완료 후
  const logRef = useRef(null)
  const judgeRef = useRef(null)     // {dc, stat, after} — 클로저 탈출용
  const judgeTimerRef = useRef(null)
  const mappingRef = useRef(false)  // 지도 스텝 중복 방지

  // 행동/판정이 끝나면 → 결과(dest)로 정해진 발판으로 지도 한 걸음 → 복귀 후 대사를 잇는다
  const advanceOnMap = (dest) => {
    if (!runMapStep || mappingRef.current) return
    mappingRef.current = true
    runMapStep(dest).then(({ ending, aborted, kind }) => {
      mappingRef.current = false
      if (aborted) return
      if (ending) { push('gm', '…안갯속 길의 끝. 봉우리의 둥지가 모습을 드러낸다. (엔딩 노드 도달)'); return }
      push('gm', `안개를 헤치고 ‘${kind}’ 발판에 닿았다. 다시 이야기가 이어진다.`)
    })
  }

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log, choiceMode])

  useEffect(() => () => clearTimeout(judgeTimerRef.current), [])

  const push = (who, text) => {
    setLog(l => [...l, { who, text }])
    if (who !== 'player' && CHARACTER_MODELS.some(c => c.speaker === who)) {
      setActiveSpeaker(who)
      setTimeout(() => window.playLinEmotion?.(text), 250)
    }
  }

  // onSuccess/onFail = 판정 결과에 따라 이동할 발판 종류 키. 성공이면 onSuccess, 실패면 onFail로 자동 이동
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
    judgeTimerRef.current = setTimeout(() => doCloseJudge(), 3000)  // 결과 표시 3초 후 자동 닫힘
  }

  // 실제 닫기 (가드 없음) — 결과가 나온 뒤에만 호출됨
  const doCloseJudge = () => {
    clearTimeout(judgeTimerRef.current)
    const ref = judgeRef.current || {}
    judgeRef.current = null
    setJudge(null)
    setJudgeResult(null)
    if (ref.after) ref.after()
    else if (ref.stat) push('gm', `${ref.stat} 판정 ${ref.success ? '성공' : '실패'} — 길이 갈라진다.`)
    const dest = ref.success ? ref.onSuccess : ref.onFail   // 결과로 도착 발판 결정
    advanceOnMap(dest)
  }

  // 클릭으로 닫기 — 결과(성공/실패)가 나오기 전엔 무시
  const closeJudgeModal = () => {
    if (!judgeResult) return
    doCloseJudge()
  }

  const send = () => {
    const t = input.trim(); if (!t) return
    push('player', t); setInput('')
    setChoiceMode(false)
    setTimeout(() => { push('lin', '…재밌는 손님이네요. 조금 더 말해 보세요.'); advanceOnMap() }, 450)
  }

  const pickChoice = (c) => {
    push('player', `[선택] ${c.text}`)
    setChoiceMode(false)
    if (c.judge) {
      triggerJudge(c.dc, c.stat)   // 판정 → 모달 종료 시 doCloseJudge에서 지도 한 걸음
    } else {
      setTimeout(() => { push('lin', '그래요, 거래는 늘 환영이죠.'); advanceOnMap() }, 450)
    }
  }

  const activeCharacter = CHARACTER_MODELS.find(c => c.speaker === activeSpeaker) || CHARACTER_MODELS[0]

  return (
    <div className="dialogue">
      <div className="bg-embers" />

      {/* 주사위 판정 모달 — 화면 중앙 */}
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
                <div className="dice-modal-roll-num">
                  {judgeResult.result} / DC {judge.dc}
                </div>
                <div className="dice-modal-hint">클릭하거나 3초 후 자동으로 닫힙니다</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 상단 무대 — 대화 NPC(린) 중앙 */}
      <div className="vn-stage">
        {/* 임시 버튼: 추후 대화 흐름에 따라 자동 표시 */}
        <div className="stage-tools">
          <button onClick={() => setChoiceMode(v => !v)}>선택지</button>
          <button onClick={() => triggerJudge(11, '지각')}>판정</button>
          <button onClick={advanceOnMap}>🗺 지도</button>
        </div>
        <div className="char-center">
          <Character3D key={activeCharacter.speaker} modelPath={activeCharacter.modelPath} />
        </div>
      </div>

      {/* 하단 — 구분된 채팅 섹션 */}
      <div className="chat-section">
        <div className="chatlog" ref={logRef}>
          {log.map((m, i) => {
            const sp = SPEAKERS[m.who]
            const side = m.who === 'player' ? 'right' : 'left'
            return (
              <div key={i} className={`msg ${side}`}>
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
            <div className="choice-note">※ 입력창에 직접 써서 다른 행동을 하거나 그냥 넘길 수도 있습니다.</div>
          </div>
        )}

        <div className="inputbar">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="메세지를 입력하세요"
          />
          <button className="send" onClick={send}>➤</button>
        </div>
      </div>
    </div>
  )
}
