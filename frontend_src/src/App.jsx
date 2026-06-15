import React, { useEffect, useRef, useState } from 'react'
import Auth from './components/Auth.jsx'
import Title from './components/Title.jsx'
import Intro from './components/Intro.jsx'
import CharacterCreation from './components/CharacterCreation.jsx'
import Dialogue from './components/Dialogue.jsx'
import MenuButton from './components/Menu.jsx'
import { StatusPanel, InventoryPanel, FullMapPanel, SettingsPanel } from './components/Panels.jsx'
import CodexPanel from './components/Codex.jsx'
import Ending from './components/Ending.jsx'
import MapOverlay from './components/MapOverlay.jsx'
import { apiLoadSession, apiNewSession, apiLockEnding, apiGetEnding, apiEquip, getStoredUser, getToken, logout } from './api.js'
import { EQUIPMENT, EQUIP_SLOTS } from './data.js'

const SAVE_KEY = 'persona_session_id'

export default function App() {
  const [screen, setScreen] = useState(() => getToken() ? 'title' : 'auth')
  const [user, setUser] = useState(() => getStoredUser())
  const [overlay, setOverlay] = useState(null)
  const [showMap, setShowMap] = useState(false)
  const [mapDepth, setMapDepth] = useState(0)
  const [mapDest, setMapDest] = useState(null)
  const [journey, setJourney] = useState([])
  const [session, setSession] = useState(null)
  const [history, setHistory] = useState([])
  const [storyScene, setStoryScene] = useState(null)
  // 장비는 세션 인벤토리(서버 권위)에서 끌어온다. 세션 없으면 데모 기본값.
  const equipment = session?.inventory?.equipment || EQUIPMENT
  const [hasSave, setHasSave] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [ending, setEnding] = useState(null)
  const mapResolver = useRef(null)
  const endingLockRef = useRef(false)
  const endingShownRef = useRef(null)

  useEffect(() => {
    setHasSave(Boolean(localStorage.getItem(SAVE_KEY)))
  }, [])

  useEffect(() => {
    if (!session?.id) return
    const pct = session.progress || 0
    const threshold = session.settle_threshold || 100

    if (pct >= threshold && !session.ending_locked && !endingLockRef.current) {
      endingLockRef.current = true
      apiLockEnding(session.id)
        .then((d) => {
          if (d?.id) {
            setEnding(d)
            endingShownRef.current = session.id
          }
        })
        .catch(() => { endingLockRef.current = false })
    }
    if (pct >= 100 && !ending && endingShownRef.current !== session.id) {
      apiGetEnding(session.id).then((d) => {
        if (d.ending) { setEnding(d.ending); endingShownRef.current = session.id }
      }).catch(() => {})
    }
  }, [session])

  const closeEnding = () => {
    setEnding(null)
    setOverlay(null)
    setScreen('title')
  }

  const runMapStep = (dest) => new Promise(resolve => {
    mapResolver.current = resolve
    setMapDest(dest || null)
    setShowMap(true)
  })

  const onMapResult = (r) => {
    setShowMap(false)
    if (!r.aborted) {
      setMapDepth(r.depth)
      setJourney(j => [...j, { kind: r.kind, ending: r.ending, slot: r.slot || 0, siblingSlots: r.siblingSlots || [] }])
    }
    const res = mapResolver.current
    mapResolver.current = null
    res && res(r)
  }

  const flashToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 1600)
  }

  const applyLoaded = (data, shouldSpeak = false) => {
    setSession(data.session)
    const loadedHistory = data.history || (data.intro ? [{ role: 'assistant', content: data.intro, speak: shouldSpeak }] : [])
    setHistory(loadedHistory)
    setStoryScene(data.story || null)
    localStorage.setItem(SAVE_KEY, data.session.id)
    setHasSave(true)
  }

  const goToAuth = (message = '로그인이 필요합니다') => {
    logout()
    localStorage.removeItem(SAVE_KEY)
    setUser(null)
    setSession(null)
    setHistory([])
    setStoryScene(null)
    setScreen('auth')
    setOverlay(null)
    setHasSave(false)
    flashToast(message)
  }

  const requireAuth = () => {
    if (getToken()) return true
    goToAuth()
    return false
  }

  const handleAuthError = (err) => {
    const message = err?.message || ''
    if (message.includes('로그인') || message.includes('401') || message.includes('Unauthorized')) {
      goToAuth('로그인이 만료되었습니다. 다시 로그인해주세요')
      return true
    }
    return false
  }

  const startNew = async () => {
    if (!requireAuth()) return
    setLoading(true)
    try {
      localStorage.removeItem(SAVE_KEY)
      setEnding(null)
      endingLockRef.current = false
      endingShownRef.current = null
      setJourney([])
      setMapDepth(0)
      const data = await apiNewSession()
      applyLoaded(data, false)
      setScreen('intro')
      setOverlay(null)
    } catch (err) {
      if (handleAuthError(err)) return
      flashToast(err.message || '새 세션 생성 실패')
    } finally {
      setLoading(false)
    }
  }

  const continueGame = async () => {
    if (!requireAuth()) return
    const sessionId = localStorage.getItem(SAVE_KEY)
    if (!sessionId) return
    setLoading(true)
    try {
      setEnding(null)
      endingLockRef.current = false
      endingShownRef.current = null
      const data = await apiLoadSession(sessionId)
      applyLoaded(data, false)
      setScreen('game')
      setOverlay(null)
    } catch (err) {
      localStorage.removeItem(SAVE_KEY)
      setHasSave(false)
      if (handleAuthError(err)) return
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

  const equipItem = (item) => {
    const slot = EQUIP_SLOTS.find(s => s.label === item?.slot)
    if (!slot || !item?.id) return
    if (!session?.id) { flashToast('세션이 없습니다'); return }
    // 낙관적 갱신 후 서버에 저장(서버가 권위 — 반환 세션으로 확정)
    setSession(prev => prev ? {
      ...prev,
      inventory: { ...prev.inventory, equipment: { ...(prev.inventory?.equipment || {}), [slot.key]: item.id } },
    } : prev)
    flashToast(`${item.name} 장착`)
    apiEquip(session.id, item.id, slot.key)
      .then(d => { if (d?.session) setSession(d.session) })
      .catch(() => flashToast('장착 저장 실패'))
  }

  const doLogout = () => {
    logout()
    setUser(null)
    setSession(null)
    setHistory([])
    setStoryScene(null)
    setScreen('auth')
    setOverlay(null)
    setHasSave(false)
    flashToast('로그아웃했습니다')
  }

  return (
    <div className="app">
      {screen === 'auth' && (
        <Auth onAuthed={(authedUser) => {
          setUser(authedUser)
          setScreen('title')
          setHasSave(Boolean(localStorage.getItem(SAVE_KEY)))
          flashToast(`${authedUser.name || authedUser.username}님, 환영합니다`)
        }} />
      )}

      {screen === 'title' && (
        <Title
          hasSave={hasSave}
          onNew={startNew}
          onContinue={continueGame}
          onCodex={() => setOverlay('codex')}
          onSettings={() => setOverlay('settings')}
          onLogout={doLogout}
          loading={loading}
        />
      )}

      {screen === 'intro' && <Intro onDone={() => setScreen(session ? 'character' : 'game')} />}

      {screen === 'character' && (
        <CharacterCreation
          session={session}
          onDone={(data) => {
            applyLoaded(data, true)
            setScreen('game')
            setOverlay(null)
          }}
          onCancel={() => {
            setScreen('title')
            setOverlay(null)
          }}
        />
      )}

      {screen === 'game' && (
        <>
          <Dialogue
            session={session}
            story={storyScene}
            history={history}
            onHistoryChange={setHistory}
            onSessionChange={(nextSession, nextStory) => {
              setSession(nextSession)
              if (nextStory) setStoryScene(nextStory)
            }}
            onStoryChange={setStoryScene}
            onEnding={setEnding}
            runMapStep={runMapStep}
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

          <div className="user-pill">
            <span>{user?.name || user?.username || '플레이어'} 님</span>
            <button onClick={doLogout}>로그아웃</button>
          </div>

          {overlay === 'status'    && <StatusPanel    onClose={() => setOverlay(null)} session={session} equipment={equipment} onEquip={equipItem} />}
          {overlay === 'inventory' && <InventoryPanel onClose={() => setOverlay(null)} session={session} equipment={equipment} onEquip={equipItem} />}
          {overlay === 'fullmap'   && <FullMapPanel   onClose={() => setOverlay(null)} journey={journey} />}
          {showMap && <MapOverlay depth={mapDepth} dest={mapDest} onResult={onMapResult} />}
        </>
      )}

      {overlay === 'codex' && <CodexPanel onClose={() => setOverlay(null)} />}
      {overlay === 'settings' && <SettingsPanel onClose={() => setOverlay(null)} />}

      {ending && <Ending ending={ending} onClose={closeEnding} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
