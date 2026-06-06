import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import MapScene from '../game/mapScene.js'

// 한 걸음(스텝) 단위로 동작: 현재 위치 → 갈림길 선택 → 이동 → onResult 로 복귀
export default function MapOverlay({ depth = 0, dest = null, onResult }) {
  const hostRef = useRef(null)
  const gameRef = useRef(null)
  const doneRef = useRef(false)

  const settle = (r) => { if (doneRef.current) return; doneRef.current = true; onResult(r) }

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: '#11161b',
      scale: { mode: Phaser.Scale.RESIZE, parent: hostRef.current },
    })
    game.scene.add('map', MapScene, true, { depth, dest, onDone: (r) => settle(r) })
    gameRef.current = game
    return () => { gameRef.current?.destroy(true); gameRef.current = null }
  }, [])

  return (
    <div className="map-overlay">
      <div className="map-host" ref={hostRef} />
      <div className="map-top">
        <button className="map-back" onClick={() => settle({ depth, ending: false, aborted: true })}>↩ 대화로</button>
        <div className="map-title">잿빛 변경 · 안갯속 길</div>
      </div>
      <div className="map-hint">발판은 모두 미지(?) · 판정 결과에 따라 길이 정해진다 · 밟으면 정체가 드러난다</div>
    </div>
  )
}
