import React, { useEffect, useRef, useState } from 'react'
import { apiEvalRun, apiEvalStatus } from '../api.js'

const STAGE_LABEL = {
  start: '준비 중',
  loading_whisper: 'Whisper 음성모델 로딩 중',
  evaluating: '평가 중',
  rendering_charts: '그래프 생성 중',
  done: '완료',
}

const TARGET = {
  geval: 4.0,   // ≥
  cer: 0.10,    // ≤
  corr: 0.7,    // ≥
}

function verdict(value, target, lowerBetter = false) {
  if (value == null) return '—'
  if (lowerBetter) return value <= target ? '✅' : '⚠️'
  return value >= target ? '✅' : '⚠️'
}

function fmt(v, digits = 2) {
  return v == null ? '—' : Number(v).toFixed(digits)
}

export default function EvalPanel({ onClose }) {
  const [job, setJob] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [fps, setFps] = useState(null)
  const jobIdRef = useRef(null)
  const pollRef = useRef(null)

  // 라이브 FPS — 패널 열려 있는 동안 계속 측정(시스템 지표).
  useEffect(() => {
    let raf
    let last = performance.now()
    const samples = []
    const tick = (now) => {
      const dt = now - last
      last = now
      if (dt > 0) {
        samples.push(1000 / dt)
        if (samples.length > 60) samples.shift()
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length
        setFps(Math.round(avg))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => () => clearInterval(pollRef.current), [])

  const start = async () => {
    setError('')
    setJob(null)
    setRunning(true)
    try {
      const { job_id } = await apiEvalRun()
      jobIdRef.current = job_id
      clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const status = await apiEvalStatus(job_id)
          setJob(status)
          if (status.status === 'done' || status.status === 'error') {
            clearInterval(pollRef.current)
            setRunning(false)
            if (status.status === 'error') setError(status.error || '평가 실패')
          }
        } catch (e) {
          clearInterval(pollRef.current)
          setRunning(false)
          setError(e.message || '상태 조회 실패')
        }
      }, 2000)
    } catch (e) {
      setRunning(false)
      setError(e.message || '평가 시작 실패')
    }
  }

  const downloadJson = () => {
    if (!job) return
    const blob = new Blob([JSON.stringify(job, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `npc_eval_${jobIdRef.current?.slice(0, 8) || 'result'}.json`
    a.click()
  }

  const results = job?.results || []
  const charts = job?.charts || {}
  const summary = job?.summary
  const completion = job?.completion
  const pct = job?.total ? Math.round((job.progress / job.total) * 100) : 0

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel eval-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>📊 NPC 정량검사</h2>
          <button className="panel-x" onClick={onClose}>✕</button>
        </div>

        <div className="eval-toolbar">
          <button className="eval-run-btn" onClick={start} disabled={running}>
            {running ? '평가 중…' : '정식 평가 시작'}
          </button>
          <span className="eval-fps">화면 FPS: <b>{fps ?? '—'}</b> {verdict(fps, 30)}</span>
          {job && !running && <button className="eval-dl-btn" onClick={downloadJson}>JSON 저장</button>}
        </div>

        <p className="eval-hint">
          대상: GM · 린 · 의사 · 가일 · 마르타 · 토비 — 각 NPC의 대화 품질(G-Eval)·발음(CER)·립싱크를 측정합니다.
          평가는 백그라운드로 진행되어 게임을 멈추지 않습니다. (GPT-4o·Whisper 사용, 수십 초 소요)
        </p>

        {error && <div className="eval-error">⚠ {error}</div>}

        {running && (
          <div className="eval-progress">
            <div className="eval-bar"><div className="eval-bar-fill" style={{ width: `${pct}%` }} /></div>
            <div className="eval-progress-text">
              {STAGE_LABEL[job?.stage] || job?.stage || '시작'} · {job?.progress || 0}/{job?.total || 6}
              {job?.current ? ` · 현재: ${job.current}` : ''}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="eval-table-wrap">
            <table className="eval-table">
              <thead>
                <tr>
                  <th>NPC</th>
                  <th>일관성</th><th>유용성</th><th>자연스러움</th>
                  <th>CER</th><th>립싱크 상관</th><th>지연(ms)</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.key}>
                    <td className="eval-npc">{r.name}</td>
                    <td>{fmt(r.g_eval?.consistency)} {verdict(r.g_eval?.consistency, TARGET.geval)}</td>
                    <td>{fmt(r.g_eval?.usefulness)} {verdict(r.g_eval?.usefulness, TARGET.geval)}</td>
                    <td>{fmt(r.g_eval?.naturalness)} {verdict(r.g_eval?.naturalness, TARGET.geval)}</td>
                    <td>{fmt(r.speech?.CER, 3)} {verdict(r.speech?.CER, TARGET.cer, true)}</td>
                    <td>{fmt(r.lipsync?.correlation, 3)} {verdict(r.lipsync?.correlation, TARGET.corr)}</td>
                    <td>{r.lipsync?.lag_ms == null ? '—' : r.lipsync.lag_ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {summary && (
          <div className="eval-summary">
            <span>평균 일관성 <b>{fmt(summary.consistency_avg)}</b></span>
            <span>평균 CER <b>{fmt(summary.CER_avg, 3)}</b></span>
            <span>평균 립싱크 <b>{fmt(summary.lipsync_corr_avg, 3)}</b></span>
            {completion?.rate_pct != null && <span>완료율 <b>{completion.rate_pct}%</b> {verdict(completion.rate_pct, 80)}</span>}
          </div>
        )}

        {Object.keys(charts).length > 0 && (
          <div className="eval-charts">
            {charts.g_eval && <img src={charts.g_eval} alt="G-Eval per NPC" />}
            {charts.cer && <img src={charts.cer} alt="CER per NPC" />}
            {charts.lipsync && <img src={charts.lipsync} alt="Lip-sync per NPC" />}
          </div>
        )}
      </div>
    </div>
  )
}
