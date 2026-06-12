import React, { useState } from 'react'

export default function MenuButton({ onStatus, onInventory, onFullMap, onCodex, onSave, onSettings, onTitle }) {
  const [open, setOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  const close = () => { setOpen(false); setUserOpen(false) }

  return (
    <div className="menu-root">
      <button className="menu-hex" onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <polygon points="50,4 91,27 91,73 50,96 9,73 9,27" />
        </svg>
        <span>메뉴</span>
      </button>

      {open && (
        <div className="menu-drop">
          <button className="menu-item" onClick={() => setUserOpen(u => !u)}>
            <span className="mi-icon">☻</span> 유저정보 <span className="mi-caret">{userOpen ? '▾' : '▸'}</span>
          </button>

          {userOpen && (
            <div className="menu-sub">
              <button onClick={() => { onStatus(); close() }}><span className="mi-icon">▤</span> 스테이터스</button>
              <button onClick={() => { onInventory(); close() }}><span className="mi-icon">🎒</span> 인벤토리</button>
              <button onClick={() => { onFullMap(); close() }}><span className="mi-icon">🗺</span> 전체지도</button>
              <button onClick={() => { onCodex(); close() }}><span className="mi-icon">📖</span> 도감</button>
            </div>
          )}

          <button className="menu-item" onClick={() => { onSave(); close() }}>
            <span className="mi-icon">💾</span> 저장
          </button>
          <button className="menu-item" onClick={() => { onSettings(); close() }}>
            <span className="mi-icon">⚙</span> 설정
          </button>
          <div className="menu-divider" />
          <button className="menu-item dim" onClick={() => { onTitle(); close() }}>
            <span className="mi-icon">⏏</span> 타이틀로
          </button>
        </div>
      )}
    </div>
  )
}
