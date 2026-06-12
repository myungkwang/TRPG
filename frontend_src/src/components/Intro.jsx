import React, { useEffect, useState, useRef } from 'react'
import { applyBgmVolume } from '../audioSettings.js'

const INTRO_BGM = '/static/audio/bgm/intro-clockwork-dragon-rest.mp3'

// 세계관 인트로 — 검은 화면에 하얀 글씨가 밑에서 위로 올라가는 크롤(스타워즈식).
// 아나운서가 직접 설명하듯 읽히는 톤. 마지막 문구("…이제, 깨어날 시간입니다.")가
// 게임 시작 GM(의사)의 "아… 깨어나셨군요"로 자연스럽게 이어진다.
const SCRIPT = [
  '영석(靈石)의 시대.',
  '땅속에서 캐낸 푸른 빛이 기계를 움직이고,',
  '도시를 밝히고, 사람의 운명마저 사고팔던 시절.',
  '',
  '제국은 변경의 산을 파고들었다.',
  '더 깊이, 더 많이 —',
  '정제된 영석, ‘영정(靈精)’을 좇아서.',
  '',
  '그러나 봉우리 끝에서',
  '광부들이 하나둘 자취를 감추기 시작했고,',
  '재끝 마을에는 잿빛 안개가 내려앉았다.',
  '',
  '…그리고 당신.',
  '이름도, 과거도 잃은 채',
  '낡은 침상 위에 누운 한 사람.',
  '',
  '당신이 누구였는지는 아무도 모른다.',
  '당신이 무엇이 될지는, 아직 정해지지 않았다.',
]

export default function Intro({ onDone }) {
  const [done, setDone] = useState(false)
  const firedRef = useRef(false)
  const audioRef = useRef(null)

  useEffect(() => {
    const audio = new Audio(INTRO_BGM)
    audio.loop = true
    const stopVolume = applyBgmVolume(audio, 0.38)
    audioRef.current = audio
    audio.play().catch(() => {})

    return () => {
      stopVolume()
      audio.pause()
      audio.currentTime = 0
      audioRef.current = null
    }
  }, [])

  // 크롤이 끝나거나 건너뛰면 1회만 onDone 호출
  const finish = () => {
    if (firedRef.current) return
    firedRef.current = true
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setDone(true)
    setTimeout(() => onDone?.(), 900)   // 페이드 아웃 후 게임으로
  }

  return (
    <div className={'intro-screen' + (done ? ' fading' : '')}>
      <div className="intro-vignette" />
      <div className="intro-crawl" onAnimationEnd={finish}>
        <h1 className="intro-title">증기와 비늘</h1>
        {SCRIPT.map((line, i) => (
          line === '' ? <div key={i} className="intro-gap" /> : <p key={i}>{line}</p>
        ))}
        <p className="intro-last">…이제, 깨어날 시간입니다.</p>
      </div>

      <button className="intro-skip" onClick={finish}>건너뛰기 ▸</button>
    </div>
  )
}
