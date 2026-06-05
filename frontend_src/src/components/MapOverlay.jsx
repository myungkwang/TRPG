import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import MapScene from '../game/mapScene.js'

export default function MapOverlay({ onClose }) {
  const hostRef = useRef(null)
  const gameRef = useRef(null)

  useEffect(() => {
    if (gameRef.current) return
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: '#11161b',
      scale: { mode: Phaser.Scale.RESIZE, parent: hostRef.current },
      scene: MapScene,
    })
    return () => { gameRef.current?.destroy(true); gameRef.current = null }
  }, [])

  return (
    <div className="map-overlay">
      <div className="map-host" ref={hostRef} />
      <div className="map-top">
        <button className="map-back" onClick={onClose}>↩ 대화로</button>
        <div className="map-title">잿빛 변경 · 안갯속 길</div>
      </div>
      <div className="map-hint">발판을 눌러 이동 · 고르지 않은 길은 사라집니다 · 끝까지 가면 엔딩 노드</div>
    </div>
  )
}
