import React, { useState, useEffect, useRef } from 'react'
import Auth from './components/Auth.jsx'
import Title from './components/Title.jsx'
import Intro from './components/Intro.jsx'
import Dialogue from './components/Dialogue.jsx'
import MenuButton from './components/Menu.jsx'
import { StatusPanel, InventoryPanel, FullMapPanel, SettingsPanel } from './components/Panels.jsx'
import CodexPanel from './components/Codex.jsx'
import MapOverlay from './components/MapOverlay.jsx'

const SAVE_KEY = 'steamscale_save_v1'

export default function App() {
  const [screen, setScreen] = useState('auth')         // 'auth' | 'title' | 'intro' | 'game'
  const [user, setUser] = useState(null)               // 로그인한 계정 이름
  const [overlay, setOverlay] = useState(null)          // status|inventory|fullmap|codex|settings|null
  const [showMap, setShowMap] = useState(false)         // Phaser 안갯속 지도
  const [mapDepth, setMapDepth] = useState(0)           // 지도에서 나아간 걸음 수
  const [mapDest, setMapDest] = useState(null)          // 이번 걸음의 도착 발판 종류(판정 결과)
  const [journey, setJourney] = useState([])            // 지나온 길 기록 {kind, ending, siblings}
  const [hasSave, setHasSave] = useState(false)
  const [toast, setToast] = useState('')
  const mapResolver = useRef(null)

  useEffect(() => { setHasSave(!!localStorage.getItem(SAVE_KEY)) }, [])

  // 대화 흐름이 호출 → 지도 한 걸음(결과로 정해진 발판으로 자동 이동) → Promise로 대화 복귀
  const runMapStep = (dest) => new Promise(resolve => { mapResolver.current = resolve; setMapDest(dest || null); setShowMap(true) })
  const onMapResult = (r) => {
    setShowMap(false)
    if (!r.aborted) {
      setMapDepth(r.depth)
      setJourney(j => [...j, { kind: r.kind, ending: r.ending, slot: r.slot || 0, siblingSlots: r.siblingSlots || [] }])
    }
    const res = mapResolver.current; mapResolver.current = null
    res && res(r)
  }

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 1600) }

  const saveGame = () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ at: Date.now(), screen: 'game' }))
    setHasSave(true); flashToast('게임을 저장했습니다')
  }

  const startNew = () => { setJourney([]); setMapDepth(0); setScreen('intro') }
  const continueGame = () => { if (hasSave) setScreen('game') }

  return (
    <div className="app">
      {screen === 'auth' && (
        <Auth onAuthed={(name) => { setUser(name); setScreen('title'); flashToast(`${name}님, 환영합니다`) }} />
      )}

      {screen === 'title' && (
        <Title
          hasSave={hasSave}
          onNew={startNew}
          onContinue={continueGame}
          onCodex={() => setOverlay('codex')}
          onSettings={() => { setScreen('game'); setOverlay('settings') }}
        />
      )}

      {screen === 'intro' && <Intro onDone={() => setScreen('game')} />}

      {screen === 'game' && (
        <>
          <Dialogue runMapStep={runMapStep} />

          <MenuButton
            onStatus={() => setOverlay('status')}
            onInventory={() => setOverlay('inventory')}
            onFullMap={() => setOverlay('fullmap')}
            onCodex={() => setOverlay('codex')}
            onSave={saveGame}
            onSettings={() => setOverlay('settings')}
            onTitle={() => { setScreen('title'); setOverlay(null) }}
          />

          {overlay === 'status'    && <StatusPanel    onClose={() => setOverlay(null)} />}
          {overlay === 'inventory' && <InventoryPanel onClose={() => setOverlay(null)} />}
          {overlay === 'fullmap'   && <FullMapPanel   onClose={() => setOverlay(null)} journey={journey} />}
          {overlay === 'settings'  && <SettingsPanel  onClose={() => setOverlay(null)} />}

          {showMap && <MapOverlay depth={mapDepth} dest={mapDest} onResult={onMapResult} />}
        </>
      )}

      {/* 도감은 타이틀 화면에서도 (게임 진입 없이) 열림 */}
      {overlay === 'codex' && <CodexPanel onClose={() => setOverlay(null)} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
