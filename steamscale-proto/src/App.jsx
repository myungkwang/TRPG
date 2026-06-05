import React, { useState, useEffect } from 'react'
import Title from './components/Title.jsx'
import Dialogue from './components/Dialogue.jsx'
import MenuButton from './components/Menu.jsx'
import { StatusPanel, InventoryPanel, CodexPanel, FullMapPanel, SettingsPanel } from './components/Panels.jsx'
import MapOverlay from './components/MapOverlay.jsx'

const SAVE_KEY = 'steamscale_save_v1'

export default function App() {
  const [screen, setScreen] = useState('title')        // 'title' | 'game'
  const [overlay, setOverlay] = useState(null)          // status|inventory|fullmap|codex|settings|null
  const [showMap, setShowMap] = useState(false)         // Phaser 안갯속 지도
  const [hasSave, setHasSave] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { setHasSave(!!localStorage.getItem(SAVE_KEY)) }, [])

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 1600) }

  const saveGame = () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ at: Date.now(), screen: 'game' }))
    setHasSave(true); flashToast('게임을 저장했습니다')
  }

  const startNew = () => { setScreen('game') }
  const continueGame = () => { if (hasSave) setScreen('game') }

  return (
    <div className="app">
      {screen === 'title' && (
        <Title
          hasSave={hasSave}
          onNew={startNew}
          onContinue={continueGame}
          onCodex={() => { setScreen('game'); setOverlay('codex') }}
          onSettings={() => { setScreen('game'); setOverlay('settings') }}
        />
      )}

      {screen === 'game' && (
        <>
          <Dialogue onTriggerMap={() => setShowMap(true)} />

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
          {overlay === 'fullmap'   && <FullMapPanel   onClose={() => setOverlay(null)} />}
          {overlay === 'codex'     && <CodexPanel     onClose={() => setOverlay(null)} />}
          {overlay === 'settings'  && <SettingsPanel  onClose={() => setOverlay(null)} />}

          {showMap && <MapOverlay onClose={() => setShowMap(false)} />}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
