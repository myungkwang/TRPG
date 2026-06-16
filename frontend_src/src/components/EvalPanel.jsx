import React, { useEffect, useRef, useState } from 'react'
import { apiEvalRun, apiEvalStatus, apiEvalLipsync } from '../api.js'
import Character3D from './Character3D.jsx'
import { CHARACTER_MODELS } from './Dialogue.jsx'

// 주의: Dialogue.jsx ↔ EvalPanel.jsx 순환 import라, 모듈 평가 시점이 아니라
// 렌더(런타임) 시점에 매핑을 만든다(그때는 CHARACTER_MODELS가 초기화됨).
const modelBySpeaker = () => Object.fromEntries((CHARACTER_MODELS || []).map((m) => [m.speaker, m]))

const STAGE_LABEL = {
  start: '준비 중',
  loading_whisper: 'Whisper 음성모델 로딩 중',
  evaluating: '평가 중',
  rendering_charts: '그래프 생성 중',
  done: '대화·음성 평가 완료',
}

const TARGET = { geval: 4.0, cer: 0.10, corr: 0.7 }

function verdict(value, target, lowerBetter = false) {
  if (value == null) return '—'
  if (lowerBetter) return value <= target ? '✅' : '⚠️'
  return value >= target ? '✅' : '⚠️'
}
function fmt(v, digits = 2) {
  return v == null ? '—' : Number(v).toFixed(digits)
}

// --- 립싱크 실측 계산: 실제 3D 입 morph(renderedMouth) vs 오디오 입벌림(audioMouth) ---
function pearson(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 4) return null
  let sa = 0, sb = 0
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i] }
  const ma = sa / n, mb = sb / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y }
  if (da < 1e-9 || db < 1e-9) return 0
  return num / Math.sqrt(da * db)
}
// rendered를 ±maxShift 프레임 이동시키며 상관 최대가 되는 지연을 찾는다(+ = 입이 소리보다 늦음).
function bestLagCorr(audio, rendered, dtMs, maxShift = 18) {
  let best = 0, bestC = -2
  for (let s = -maxShift; s <= maxShift; s++) {
    const a = [], r = []
    for (let i = 0; i < audio.length; i++) {
      const j = i + s
      if (j < 0 || j >= rendered.length) continue
      a.push(audio[i]); r.push(rendered[j])
    }
    const c = pearson(a, r)
    if (c != null && c > bestC) { bestC = c; best = s }
  }
  return { corr: bestC <= -2 ? 0 : bestC, lagMs: Math.round(best * dtMs) }
}
function computeLipMetrics(frames, hasShapeKey) {
  if (!hasShapeKey || !frames || frames.length < 4) {
    return { correlation: 0, lag_ms: null, has_shapekey: !!hasShapeKey, frames: frames?.length || 0 }
  }
  const audio = frames.map((f) => f.audioMouth)
  const rendered = frames.map((f) => f.renderedMouth)
  const span = frames[frames.length - 1].t - frames[0].t
  const dtMs = span > 0 ? (span / (frames.length - 1)) * 1000 : 16.7
  const { corr, lagMs } = bestLagCorr(audio, rendered, dtMs)
  return { correlation: +corr.toFixed(4), lag_ms: lagMs, has_shapekey: true, frames: frames.length }
}

export default function EvalPanel({ onClose }) {
  const [job, setJob] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [fps, setFps] = useState(null)
  const [phase, setPhase] = useState('idle')      // idle|backend|lipsync|done
  const [sweepIndex, setSweepIndex] = useState(-1)
  const [sweepNote, setSweepNote] = useState('')
  const jobIdRef = useRef(null)
  const pollRef = useRef(null)
  const apiRef = useRef(null)
  const lipResultsRef = useRef([])
  const measuredRef = useRef(false)
  const MODEL_BY_SPEAKER = modelBySpeaker()

  // 라이브 FPS
  useEffect(() => {
    let raf, last = performance.now()
    const samples = []
    const tick = (now) => {
      const dt = now - last; last = now
      if (dt > 0) {
        samples.push(1000 / dt)
        if (samples.length > 60) samples.shift()
        setFps(Math.round(samples.reduce((a, b) => a + b, 0) / samples.length))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => () => clearInterval(pollRef.current), [])

  // 백엔드 잡(대화·음성) 완료 → 립싱크 실측 스윕 시작
  useEffect(() => {
    if (phase === 'backend' && job?.status === 'done') {
      lipResultsRef.current = []
      setPhase('lipsync')
      setSweepIndex(0)
    }
  }, [phase, job?.status])

  const sweepList = (job?.results || []).filter((r) => MODEL_BY_SPEAKER[r.key])

  // 각 NPC 측정: 모델 로드되면 해당 음성을 실제 모델에 물려 입 morph를 녹화
  const measureCurrent = async () => {
    if (measuredRef.current) return
    measuredRef.current = true
    const r = sweepList[sweepIndex]
    const api = apiRef.current
    if (!r || !api) { advance({ key: r?.key, correlation: 0, lag_ms: null, has_shapekey: false, frames: 0 }); return }
    setSweepNote(`${r.name} 모델 입모양 측정 중…`)
    const audio = new Audio(r.audio_url)
    audio.preload = 'auto'
    let done = false
    let guard = 0
    const finish = () => {
      if (done) return
      done = true
      if (guard) clearTimeout(guard)
      let metrics = { correlation: 0, lag_ms: null, has_shapekey: false, frames: 0 }
      try {
        const rec = api.endLipRecord?.() || { frames: [], hasShapeKey: false }
        metrics = computeLipMetrics(rec.frames, rec.hasShapeKey)
      } catch { /* noop */ }
      try { api.stopAudioLipSync?.() } catch { /* noop */ }
      try { audio.pause() } catch { /* noop */ }
      advance({ key: r.key, ...metrics })
    }
    // 게임과 동일: 오디오가 '실제로 재생을 시작한 뒤' 립싱크/녹화를 건다.
    // (paused 상태에서 startAudioLipSync를 부르면 RAF 루프가 첫 프레임에 return해 프레임이 0개가 됨)
    audio.onplay = () => {
      try {
        api.beginLipRecord?.()
        api.startAudioLipSync?.(audio, r.line || '')
      } catch { /* noop */ }
    }
    audio.addEventListener('ended', finish)
    audio.addEventListener('error', finish)
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) {
        if (guard) clearTimeout(guard)
        guard = setTimeout(finish, audio.duration * 1000 + 1500)
      }
    })
    guard = setTimeout(finish, 20000)  // 메타데이터/재생이 멈추는 경우 대비
    try {
      await audio.play()
    } catch {
      finish()
    }
  }

  const advance = (result) => {
    lipResultsRef.current = [...lipResultsRef.current, result]
    measuredRef.current = false
    if (sweepIndex + 1 < sweepList.length) {
      setSweepIndex(sweepIndex + 1)
    } else {
      postLipsync(lipResultsRef.current)
    }
  }

  const postLipsync = async (results) => {
    setSweepNote('립싱크 결과 집계 중…')
    setSweepIndex(-1)
    try {
      const resp = await apiEvalLipsync(jobIdRef.current, results)
      // 서버가 돌려준 요약/차트로 갱신 + 표의 lipsync 채우기
      setJob((prev) => {
        if (!prev) return prev
        const byKey = Object.fromEntries(results.map((x) => [x.key, x]))
        const merged = (prev.results || []).map((row) => byKey[row.key]
          ? { ...row, lipsync: { ...byKey[row.key], pass: byKey[row.key].has_shapekey && byKey[row.key].correlation >= 0.7 && Math.abs(byKey[row.key].lag_ms ?? 999) <= 100 } }
          : row)
        return { ...prev, results: merged, charts: resp.charts || prev.charts, summary: resp.summary || prev.summary }
      })
    } catch (e) {
      setError(e.message || '립싱크 집계 실패')
    }
    setPhase('done')
    setSweepNote('')
  }

  const start = async () => {
    setError(''); setJob(null); setRunning(true); setPhase('backend')
    lipResultsRef.current = []; measuredRef.current = false; setSweepIndex(-1)
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
            if (status.status === 'error') { setError(status.error || '평가 실패'); setPhase('idle') }
          }
        } catch (e) {
          clearInterval(pollRef.current); setRunning(false)
          setError(e.message || '상태 조회 실패'); setPhase('idle')
        }
      }, 2000)
    } catch (e) {
      setRunning(false); setPhase('idle'); setError(e.message || '평가 시작 실패')
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
  const busy = running || phase === 'lipsync'
  const sweeping = phase === 'lipsync' && sweepIndex >= 0 && sweepList[sweepIndex]
  const sweepModel = sweeping ? MODEL_BY_SPEAKER[sweepList[sweepIndex].key] : null

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel eval-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>📊 NPC 정량검사</h2>
          <button className="panel-x" onClick={onClose}>✕</button>
        </div>

        <div className="eval-toolbar">
          <button className="eval-run-btn" onClick={start} disabled={busy}>
            {busy ? '평가 중…' : '정식 평가 시작'}
          </button>
          <span className="eval-fps">화면 FPS: <b>{fps ?? '—'}</b> {verdict(fps, 30)}</span>
          {job && !busy && <button className="eval-dl-btn" onClick={downloadJson}>JSON 저장</button>}
        </div>

        <p className="eval-hint">
          대상: GM · 린 · 의사 · 가일 · 마르타 · 토비 — 대화품질(G-Eval)·발음(CER)은 서버에서,
          <b> 립싱크는 실제 3D 모델 입 morph를 직접 측정</b>합니다(입 shape key 없는 모델은 자동으로 낮게 나옵니다).
          측정 중 각 NPC 음성이 잠깐 재생됩니다.
        </p>

        {error && <div className="eval-error">⚠ {error}</div>}

        {(running || phase === 'lipsync') && (
          <div className="eval-progress">
            <div className="eval-bar">
              <div className="eval-bar-fill" style={{
                width: phase === 'lipsync'
                  ? `${Math.round(((sweepIndex < 0 ? sweepList.length : sweepIndex) / Math.max(1, sweepList.length)) * 100)}%`
                  : `${pct}%`,
              }} />
            </div>
            <div className="eval-progress-text">
              {phase === 'lipsync'
                ? (sweepNote || `립싱크 실측 ${Math.min(sweepIndex + 1, sweepList.length)}/${sweepList.length}`)
                : `${STAGE_LABEL[job?.stage] || job?.stage || '시작'} · ${job?.progress || 0}/${job?.total || 6}${job?.current ? ` · 현재: ${job.current}` : ''}`}
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
                {results.map((r) => {
                  const lip = r.lipsync || {}
                  const hasKey = lip.has_shapekey
                  const lipCell = lip.status === 'pending_client'
                    ? '측정대기'
                    : hasKey === false
                      ? 'shape key 없음 ⚠️'
                      : `${fmt(lip.correlation, 3)} ${verdict(lip.correlation, TARGET.corr)}`
                  return (
                    <tr key={r.key}>
                      <td className="eval-npc">{r.name}</td>
                      <td>{fmt(r.g_eval?.consistency)} {verdict(r.g_eval?.consistency, TARGET.geval)}</td>
                      <td>{fmt(r.g_eval?.usefulness)} {verdict(r.g_eval?.usefulness, TARGET.geval)}</td>
                      <td>{fmt(r.g_eval?.naturalness)} {verdict(r.g_eval?.naturalness, TARGET.geval)}</td>
                      <td>{fmt(r.speech?.CER, 3)} {verdict(r.speech?.CER, TARGET.cer, true)}</td>
                      <td>{lipCell}</td>
                      <td>{hasKey === false ? '—' : (lip.lag_ms == null ? '—' : lip.lag_ms)}</td>
                    </tr>
                  )
                })}
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

        {/* 립싱크 실측용 숨김 3D 무대 — 현재 측정 중인 NPC 모델만 마운트 */}
        {sweeping && sweepModel && (
          <div className="eval-hidden-stage" aria-hidden="true">
            <Character3D
              key={`eval-${sweepList[sweepIndex].key}`}
              apiRef={apiRef}
              registerGlobalControls={false}
              onModelReady={measureCurrent}
              modelPath={sweepModel.modelPath}
              modelRotation={sweepModel.modelRotation}
              modelScale={sweepModel.modelScale}
              modelOffset={sweepModel.modelOffset}
              framingScale={sweepModel.framingScale}
              framingOffsetY={sweepModel.framingOffsetY}
              preferEmbeddedAnimations={sweepModel.preferEmbeddedAnimations}
              animations={sweepModel.animations}
              motionIntensity={sweepModel.motionIntensity}
              hideTeeth={sweepModel.hideTeeth}
              disableProceduralMotion={sweepModel.disableProceduralMotion}
              lipGain={sweepModel.lipGain}
            />
          </div>
        )}
      </div>
    </div>
  )
}
