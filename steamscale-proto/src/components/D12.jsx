import React, { useState, useRef } from 'react'
import Dice3D from './Dice3D.jsx'

// 판정 주사위: 인벤토리와 동일한 d12(정십이면체) 모델 사용.
// roll({dc}) 또는 autoRoll={{dc}} 로 굴리고, 착지한 면 숫자로 성공/실패 판정.
export default function D12({ apiRef, size = 58, autoRoll = null, onDone }) {
  const [rolling, setRolling] = useState(false)
  const [info, setInfo] = useState(null) // {dc, success}
  const ref = useRef()
  const dc = useRef(autoRoll ? autoRoll.dc : null)

  const handleResult = (value) => {
    setRolling(false)
    if (dc.current != null) setInfo({ dc: dc.current, success: value >= dc.current })
    if (onDone) onDone(value)
  }
  if (apiRef) apiRef.current = {
    roll: (opts = {}) => { dc.current = opts.dc != null ? opts.dc : dc.current; setInfo(null); ref.current.roll() },
  }

  return (
    <div className="d12wrap">
      <Dice3D
        apiRef={ref}
        size={size}
        clickToRoll={false}
        autoRoll={!!autoRoll}
        onRollStart={() => { setRolling(true); setInfo(null) }}
        onResult={handleResult}
      />
      <div className="d12-label">
        {rolling ? '판정 중…' : info ? (info.success ? `성공! (DC${info.dc})` : `실패 (DC${info.dc})`) : '판정 주사위'}
      </div>
    </div>
  )
}
