import React, { useEffect, useRef, useState } from 'react'
import { applyBgmVolume } from '../audioSettings.js'

const TITLE_BGM = '/static/audio/bgm/intro-clockwork-dragon-rest.mp3'
const TITLE_VIDEO = '/static/video/title.mp4'        // 루프 영상(로고 없음)
const TITLE_POSTER = '/static/ui/title-poster.png'   // 로딩 전 정지컷(로고 없음)
const TITLE_LOGO = '/static/ui/logo.png'             // 별도 로고 PNG(웹에서 제어)

// 메뉴 좌측 기어 아이콘 (호버 시 회전). 커스텀 PNG로 교체 가능.
const Gear = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
)

const playWhenAllowed = (audio) => {
  let cleanup = () => {}
  const retry = () => {
    audio.play()
      .then(cleanup)
      .catch(() => {})
  }

  audio.play().catch(() => {
    window.addEventListener('pointerdown', retry, { once: true })
    window.addEventListener('keydown', retry, { once: true })
    window.addEventListener('touchstart', retry, { once: true })
    cleanup = () => {
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
      window.removeEventListener('touchstart', retry)
    }
  })

  return () => cleanup()
}

export default function Title({ hasSave, onNew, onContinue, onCodex, onSettings, onLogout }) {
  const audioRef = useRef(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const audio = new Audio(TITLE_BGM)
    audio.loop = true
    const stopVolume = applyBgmVolume(audio, 0.34)
    audioRef.current = audio
    const stopRetry = playWhenAllowed(audio)

    return () => {
      stopVolume()
      stopRetry()
      audio.pause()
      audio.currentTime = 0
      audioRef.current = null
    }
  }, [])

  const items = [
    { key: 'new',      label: '게임 시작', onClick: onNew,                disabled: false },
    { key: 'continue', label: '이어하기',  onClick: onContinue,           disabled: !hasSave },
    { key: 'codex',    label: '도감',      onClick: onCodex,              disabled: false },
    { key: 'settings', label: '설정',      onClick: onSettings,           disabled: false },
    { key: 'logout',   label: '로그아웃',  onClick: onLogout,             disabled: false },
    { key: 'quit',     label: '종료',      onClick: () => window.close(), disabled: false },
  ]

  return (
    <div className="title-screen title-static">
      {/* 루프 영상 배경. 무한 반복 */}
      <video
        className="title-bg-video"
        src={TITLE_VIDEO}
        poster={TITLE_POSTER}
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="title-scrim-bottom" />

      <div className={'title-inner' + (revealed ? ' show' : ' hide')}>
        {/* 로고 + 메뉴를 한 덩어리로 — 항상 로고 바로 밑, 같은 너비, 비율 유지 */}
        <div className="title-brand">
        <img className="title-logo-overlay" src={TITLE_LOGO} alt="증기와 비늘" />
        <div className="title-menu-col">
        {/* 로고와 메뉴를 나누는 꾸밈선 (곡선 + 중앙 보석) */}
        <div className="title-divider"><i /></div>
        <nav className="title-menu">
          {items.map((it, i) => (
            <button
              key={it.key}
              className={'title-item' + (it.disabled ? ' disabled' : '')}
              onClick={it.disabled ? undefined : it.onClick}
              disabled={it.disabled}
            >
              <span className="title-label">{it.label}</span>
              <span className="title-gear"><Gear /></span>
              {it.key === 'continue' && it.disabled && <span className="lock"> (저장 없음)</span>}
            </button>
          ))}
        </nav>
        </div>
        </div>
        <p className="title-ver">v0.1.0 prototype · © Steam &amp; Scales</p>
      </div>
    </div>
  )
}
