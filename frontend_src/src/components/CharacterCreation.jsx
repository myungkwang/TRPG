import React, { useEffect, useMemo, useState } from 'react'
import { apiCharacterConfirm, apiCharacterPreview, apiCharacterQuestions } from '../api.js'

const STAT_LABEL = {
  str: '힘',
  dex: '민첩',
  int_stat: '지능',
  cha: '매력',
}

const OPTION_HINTS = {
  주먹: '완력과 정면 돌파에 몸이 먼저 반응합니다.',
  손끝: '정밀한 손놀림과 빠른 반응이 살아납니다.',
  계산: '상황을 읽고 기계를 이해하는 감각이 선명합니다.',
  혀끝: '말과 기세로 사람을 움직이는 힘이 깨어납니다.',
  끓어오른다: '영석의 열이 몸 안에서 타오릅니다.',
  잔잔하다: '술식기계와 공명하기 좋은 안정된 반응입니다.',
  무감하다: '영석보다 몸과 도구를 믿는 길입니다.',
  '증기 갑주병': '중갑과 검을 들고 버티며 전진합니다.',
  '변경 탐사꾼': '가벼운 무장으로 낯선 길을 먼저 밟습니다.',
  메카닉: '도구와 장치를 고치고 해체하는 손입니다.',
  '영석 인파이터': '기계 건틀릿으로 가까운 거리에서 밀어붙입니다.',
  '영석 연금술사': '리볼버와 영정 총으로 영석 반응을 다룹니다.',
}

const INTRO_LINES = [
  {
    who: 'GM',
    text: '낯선 진료실에서 당신은 천천히 눈을 뜹니다. 공기에는 약품 냄새와 금속성 증기의 냄새가 섞여 있습니다. 흰 가운을 입은 의사가 당신을 조심스럽게 내려다봅니다.',
  },
  {
    who: '의사',
    text: '깨어나셨군요. 제 말이 들리십니까? 기억나는 것이 있습니까?',
  },
]

export default function CharacterCreation({ session, onDone, onCancel }) {
  const [questions, setQuestions] = useState([])
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const current = questions[step]
  const complete = questions.length > 0 && step >= questions.length

  useEffect(() => {
    let cancelled = false
    apiCharacterQuestions()
      .then(data => {
        if (!cancelled) setQuestions(data.questions || [])
      })
      .catch(e => setErr(e.message || '질문을 불러오지 못했습니다.'))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!questions.length) return undefined
    const timer = setTimeout(() => setPanelOpen(true), 1200)
    return () => clearTimeout(timer)
  }, [questions.length])

  useEffect(() => {
    if (!complete || !session?.id) return
    setLoading(true)
    setErr('')
    apiCharacterPreview(session.id, answers)
      .then(data => setPreview(data.character))
      .catch(e => setErr(e.message || '캐릭터 계산에 실패했습니다.'))
      .finally(() => setLoading(false))
  }, [complete, session?.id, answers])

  const transcript = useMemo(() => {
    const rows = [...INTRO_LINES]
    if (!panelOpen) return rows
    questions.slice(0, Math.min(step + 1, questions.length)).forEach((q, i) => {
      rows.push({ who: '의사', text: q.prompt })
      if (answers[q.id]) rows.push({ who: '당신', text: answers[q.id] })
      if (i < step && answers[q.id]) rows.push({ who: '의사', text: reactionFor(q.id, answers[q.id]) })
    })
    return rows
  }, [questions, step, answers, panelOpen])

  const answerCurrent = (value) => {
    if (!current) return
    const nextValue = String(value || '').trim()
    if (!nextValue) {
      setErr(current.id === 'name' ? '이름을 입력하거나 의사가 부를 이름을 정하세요.' : '답을 입력해 주세요.')
      return
    }
    setErr('')
    setAnswers(prev => ({ ...prev, [current.id]: nextValue }))
    setDraft('')
    setStep(prev => prev + 1)
  }

  const goBack = () => {
    if (step <= 0) return
    const prevQuestion = questions[step - 1]
    setStep(prev => prev - 1)
    setDraft(answers[prevQuestion.id] || '')
    setAnswers(prev => {
      const next = { ...prev }
      delete next[prevQuestion.id]
      return next
    })
    setPreview(null)
    setErr('')
  }

  const confirm = async () => {
    if (!session?.id || loading) return
    setLoading(true)
    setErr('')
    try {
      const data = await apiCharacterConfirm(session.id, answers)
      onDone?.(data)
    } catch (e) {
      setErr(e.message || '캐릭터 확정에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`creation-screen${panelOpen ? ' panel-open' : ''}`}>
      <div className="creation-bg" />
      <div className="creation-shell">
        <section className="creation-dialogue">
          <div className="creation-doctor">
            <span className="doctor-mark">+</span>
            <div>
              <b>재끝 진료소</b>
              <small>의사가 당신의 반응을 기록하고 있습니다.</small>
            </div>
          </div>
          <div className="creation-log">
            {transcript.map((line, i) => (
              <div key={`${line.who}-${i}`} className={`creation-line ${line.who === '당신' ? 'player' : ''}`}>
                <span>{line.who}</span>
                <p>{line.text}</p>
              </div>
            ))}
          </div>
        </section>

        {panelOpen && (
        <section className="creation-card">
          {!complete && current && (
            <>
              <div className="creation-step">{step + 1} / {questions.length}</div>
              <h2>{questionTitle(current.id)}</h2>
              <p className="creation-prompt">{current.prompt}</p>

              {current.free ? (
                <div className="creation-free">
                  <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') answerCurrent(draft) }}
                    placeholder={current.id === 'name' ? '예: 이호숙' : '예: 낡은 회중시계'}
                    autoFocus
                  />
                  <button onClick={() => answerCurrent(draft)}>답하기</button>
                </div>
              ) : (
                <div className="creation-options">
                  {current.options?.map(option => (
                    <button key={option} onClick={() => answerCurrent(option)}>
                      <b>{option}</b>
                      <span>{OPTION_HINTS[option] || '이 선택을 기록합니다.'}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {complete && (
            <>
              <div className="creation-step">확인</div>
              <h2>진단 결과</h2>
              {loading && <p className="creation-prompt">의사가 기록을 정리하고 있습니다.</p>}
              {preview && (
                <div className="creation-summary">
                  <div className="summary-name">{preview.player_name}</div>
                  <div className="summary-grid">
                    {Object.entries(preview.stats).map(([label, value]) => (
                      <div key={label}><span>{label}</span><b>{value}</b></div>
                    ))}
                  </div>
                  <div className="summary-row"><span>특화</span><b>{STAT_LABEL[preview.primary_stat] || preview.primary_stat}</b></div>
                  <div className="summary-row"><span>영석 반응</span><b>{preview.talent_grade}</b></div>
                  <div className="summary-row"><span>직업</span><b>{preview.job}</b></div>
                  <div className="summary-row"><span>위치</span><b>{preview.location}</b></div>
                  <div className="summary-items">
                    <span>시작 소지품</span>
                    <p>{preview.inventory?.items?.join(', ')}</p>
                  </div>
                </div>
              )}
              <div className="creation-actions">
                <button onClick={goBack}>수정</button>
                <button className="primary" onClick={confirm} disabled={loading || !preview}>확정</button>
              </div>
            </>
          )}

          {err && <div className="creation-error">{err}</div>}
          <div className="creation-foot">
            <button onClick={goBack} disabled={step <= 0 || loading}>이전</button>
            <button onClick={onCancel} disabled={loading}>타이틀</button>
          </div>
        </section>
        )}
      </div>
    </div>
  )
}

function questionTitle(id) {
  return {
    name: '이름',
    item: '소지품',
    sense: '몸이 기억하는 감각',
    talent: '영석 반응',
    job: '직업',
  }[id] || '질문'
}

function reactionFor(id, answer) {
  if (id === 'name') return `${answer}… 그렇게 기록해 두겠습니다.`
  if (id === 'item') return '그 물건이 기억을 붙잡는 단서가 될지도 모르겠군요.'
  if (id === 'sense') return '몸의 기억은 거짓말을 잘 하지 않습니다.'
  if (id === 'talent') return '영석 반응도 확인했습니다. 무리하지 마십시오.'
  if (id === 'job') return '손놀림은 남아 있군요. 이제 거의 끝났습니다.'
  return '좋습니다. 다음 질문으로 넘어가죠.'
}
