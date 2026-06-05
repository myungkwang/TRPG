import React, { useState, useRef, useEffect } from 'react'

// 12면체 주사위. roll({dc}) 호출 시 굴림(감속) → 결과 표시.
export default function D12({ apiRef, size = 58, autoRoll = null, onDone }) {
  const [face, setFace] = useState(autoRoll ? null : 12)
  const [rolling, setRolling] = useState(false)
  const [info, setInfo] = useState(null) // {dc, success}
  const timer = useRef(null)

  const roll = (opts = {}) => {
    setRolling(true); setInfo(null)
    let ticks = 0
    const maxTicks = 16
    clearTimeout(timer.current)
    const step = () => {
      setFace(1 + Math.floor(Math.random() * 12))
      ticks++
      if (ticks >= maxTicks) {
        const result = 1 + Math.floor(Math.random() * 12)
        setFace(result); setRolling(false)
        if (opts.dc != null) setInfo({ dc: opts.dc, success: result >= opts.dc })
        if (onDone) onDone(result)
        return
      }
      // 끝으로 갈수록 느려지게 (감속)
      const delay = ticks < 9 ? 120 : 120 + (ticks - 8) * 55
      timer.current = setTimeout(step, delay)
    }
    step()
  }
  if (apiRef) apiRef.current = { roll }

  useEffect(() => {
    if (autoRoll) { const t = setTimeout(() => roll(autoRoll), 120); return () => { clearTimeout(t); clearTimeout(timer.current) } }
    return () => clearTimeout(timer.current)
  }, [])

  return (
    <div className={'d12 ' + (rolling ? 'rolling' : '')}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-label="d12" className={rolling ? 'spin' : ''}>
        <polygon className="d12-body" points="50,6 80,20 95,52 78,86 50,96 22,86 5,52 20,20" />
        <polygon className="d12-inner" points="50,26 68,36 73,58 60,76 50,80 40,76 27,58 32,36" />
        <text x="50" y="64" textAnchor="middle" className="d12-num">{face ?? '12'}</text>
      </svg>
      <div className="d12-label">
        {rolling ? '판정 중…' : info ? (info.success ? `성공! (DC${info.dc})` : `실패 (DC${info.dc})`) : '판정 주사위'}
      </div>
    </div>
  )
}
