import React, { useEffect, useRef } from 'react'
import { applyBgmVolume } from '../audioSettings.js'

const TITLE_BGM = '/static/audio/bgm/title.wav'

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
    { key: 'new',      label: '게임 시작', onClick: onNew,                         disabled: false },
    { key: 'continue', label: '이어하기',  onClick: onContinue,                    disabled: !hasSave },
    { key: 'codex',    label: '도감',      onClick: onCodex,                       disabled: false },
    { key: 'settings', label: '설정',      onClick: onSettings,                    disabled: false },
    { key: 'logout',   label: '로그아웃',  onClick: onLogout,                      disabled: false },
    { key: 'quit',     label: '종료',      onClick: () => window.close(),          disabled: false },
  ]
  return (
    <div className="title-screen">
      <div className="title-fog" />
      <div className="title-gears" />
      <div className="title-inner">
        <h1 className="title-logo">증기와 비늘</h1>
        <p className="title-sub">STEAM &amp; SCALES</p>
        <nav className="title-menu">
          {items.map((it, i) => (
            <button
              key={it.key}
              className={'title-item' + (it.disabled ? ' disabled' : '')}
              style={{ animationDelay: `${0.15 * i + 0.3}s` }}
              onClick={it.disabled ? undefined : it.onClick}
              disabled={it.disabled}
            >
              {it.label}
              {it.key === 'continue' && it.disabled && <span className="lock"> (저장 없음)</span>}
            </button>
          ))}
        </nav>
        <p className="title-ver">v0.1.0 prototype · © Steam &amp; Scales</p>
      </div>
    </div>
  )
}
