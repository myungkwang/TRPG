import React, { useEffect, useMemo, useState } from 'react'
import Title from './components/Title.jsx'
import Dialogue from './components/Dialogue.jsx'
import MenuButton from './components/Menu.jsx'
import { StatusPanel, InventoryPanel, CodexPanel, FullMapPanel, SettingsPanel } from './components/Panels.jsx'
import MapOverlay from './components/MapOverlay.jsx'
import { apiLoadSession, apiNewSession, requireAuth } from './api.js'
import { SPEAKER_KEY } from './data.js'

const SAVE_KEY = 'persona_session_id'

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    return null
  }
}

export default function App() {
  const [screen, setScreen] = useState('title')
  const [overlay, setOverlay] = useState(null)
  const [showMap, setShowMap] = useState(false)
  const [session, setSession] = useState(null)
  const [history, setHistory] = useState([])
  const [hasSave, setHasSave] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const user = useMemo(() => getStoredUser(), [])

  useEffect(() => {
    if (!requireAuth()) return
    setHasSave(Boolean(localStorage.getItem(SAVE_KEY)))
  }, [])

  const flashToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 1600)
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    localStorage.removeItem(SAVE_KEY)
    location.replace('/login')
  }

  const applyLoaded = (data, shouldSpeak = false) => {
    setSession(data.session)
    let loadedHistory
    if (data.history) {
      loadedHistory = data.history
    } else if (data.intro_segments?.length) {
      // 도입부도 화자별 말풍선으로 펼친다 (GM 서술 + 의사 대사)
      loadedHistory = data.intro_segments.map((seg, i, arr) => ({
        role: 'assistant',
        content: seg.text,
        who: seg.role === 'npc' ? (SPEAKER_KEY[seg.speaker] || 'gm') : 'gm',
        speak: shouldSpeak && i === arr.length - 1,
      }))
    } else if (data.intro) {
      loadedHistory = [{ role: 'assistant', content: data.intro, speak: shouldSpeak }]
    } else {
      loadedHistory = []
    }
    setHistory(loadedHistory)
    localStorage.setItem(SAVE_KEY, data.session.id)
    setHasSave(true)
  }

  const startNew = async () => {
    setLoading(true)
    try {
      localStorage.removeItem(SAVE_KEY)
      const data = await apiNewSession()
      applyLoaded(data, true)
      setScreen('game')
      setOverlay(null)
    } catch (err) {
      flashToast(err.message || '새 세션 생성 실패')
    } finally {
      setLoading(false)
    }
  }

  const continueGame = async () => {
    const sessionId = localStorage.getItem(SAVE_KEY)
    if (!sessionId) return
    setLoading(true)
    try {
      const data = await apiLoadSession(sessionId)
      applyLoaded(data, false)
      setScreen('game')
      setOverlay(null)
    } catch (err) {
      localStorage.removeItem(SAVE_KEY)
      setHasSave(false)
      flashToast('저장된 세션을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  const saveGame = () => {
    if (session?.id) {
      localStorage.setItem(SAVE_KEY, session.id)
      setHasSave(true)
      flashToast('현재 세션을 저장했습니다')
    } else {
      flashToast('저장할 세션이 없습니다')
    }
  }

  return (
    <div className="app">
      {screen === 'title' && (
        <>
          <Title
            hasSave={hasSave}
            onNew={startNew}
            onContinue={continueGame}
            onCodex={() => { setScreen('game'); setOverlay('codex') }}
            onSettings={() => { setScreen('game'); setOverlay('settings') }}
          />
          <div className="account-top-right title-account">
            <span>{user?.name || user?.username || '사용자'} 님</span>
            <button type="button" onClick={logout}>로그아웃</button>
          </div>
          {loading && <div className="loading-cover">불러오는 중...</div>}
        </>
      )}

      {screen === 'game' && (
        <>
          <Dialogue
            session={session}
            history={history}
            onHistoryChange={setHistory}
            onSessionChange={setSession}
            onTriggerMap={() => setShowMap(true)}
          />

          <MenuButton
            onStatus={() => setOverlay('status')}
            onInventory={() => setOverlay('inventory')}
            onFullMap={() => setOverlay('fullmap')}
            onCodex={() => setOverlay('codex')}
            onSave={saveGame}
            onSettings={() => setOverlay('settings')}
            onTitle={() => { setScreen('title'); setOverlay(null) }}
          />

          <div className="account-below-tools">
            <span>{user?.name || user?.username || '사용자'} 님</span>
            <button type="button" onClick={logout}>로그아웃</button>
          </div>

          {overlay === 'status'    && <StatusPanel    onClose={() => setOverlay(null)} session={session} />}
          {overlay === 'inventory' && <InventoryPanel onClose={() => setOverlay(null)} session={session} />}
          {overlay === 'fullmap'   && <FullMapPanel   onClose={() => setOverlay(null)} session={session} />}
          {overlay === 'codex'     && <CodexPanel     onClose={() => setOverlay(null)} />}
          {overlay === 'settings'  && <SettingsPanel  onClose={() => setOverlay(null)} />}

          {showMap && <MapOverlay onClose={() => setShowMap(false)} />}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
