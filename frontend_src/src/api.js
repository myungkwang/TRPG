export function getToken() {
  return localStorage.getItem('access_token')
}

export function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    return null
  }
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { detail: text || '서버 응답을 해석할 수 없습니다.' }
  }

  if (response.status === 401) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    localStorage.removeItem('persona_session_id')
    throw new Error('로그인이 필요합니다.')
  }

  if (!response.ok) {
    throw new Error(data?.detail || '요청 실패')
  }

  return data
}

export async function apiSignup({ username, password, name, email }) {
  return fetchJson('/api/auth/signup', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ username, password, name, email }),
  })
}

export async function apiLogin({ username, password }) {
  const data = await fetchJson('/api/auth/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ username, password }),
  })
  localStorage.setItem('access_token', data.access_token)
  localStorage.setItem('user', JSON.stringify(data.user))
  return data
}

export function logout() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('user')
  localStorage.removeItem('persona_session_id')
}

export async function apiNewSession() {
  return fetchJson('/api/session', {
    method: 'POST',
    headers: { ...authHeaders() },
  })
}

export async function apiCharacterQuestions() {
  return fetchJson('/api/character/questions', {
    headers: { ...authHeaders() },
  })
}

export async function apiCharacterPreview(sessionId, answers) {
  return fetchJson('/api/character/preview', {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...authHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId, answers }),
  })
}

export async function apiCharacterConfirm(sessionId, answers) {
  return fetchJson('/api/character/confirm', {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...authHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId, answers }),
  })
}

export async function apiLoadSession(sessionId) {
  return fetchJson(`/api/session/${sessionId}`, {
    headers: { ...authHeaders() },
  })
}

export async function apiChat(sessionId, message) {
  return fetchJson('/api/chat', {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...authHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId, message }),
  })
}

export async function apiChatStream(sessionId, message, onEvent) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...authHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId, message }),
  })

  if (response.status === 401) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    localStorage.removeItem('persona_session_id')
    throw new Error('로그인이 필요합니다.')
  }

  if (!response.ok || !response.body) {
    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { detail: text }
    }
    throw new Error(data?.detail || '스트리밍 대화 요청 실패')
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''
  let finalData = null

  const dispatchBlock = (block) => {
    const lines = String(block || '').split(/\r?\n/)
    let eventName = 'message'
    const dataLines = []

    lines.forEach((line) => {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message'
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    })

    if (!dataLines.length) return
    const payload = JSON.parse(dataLines.join('\n'))
    if (eventName === 'error') throw new Error(payload?.detail || '스트리밍 대화 오류')
    if (eventName === 'final') finalData = payload
    onEvent?.(eventName, payload)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let splitAt = buffer.indexOf('\n\n')
    while (splitAt >= 0) {
      const block = buffer.slice(0, splitAt)
      buffer = buffer.slice(splitAt + 2)
      dispatchBlock(block)
      splitAt = buffer.indexOf('\n\n')
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) dispatchBlock(buffer)
  return finalData
}

export async function apiMove(sessionId, location) {
  return fetchJson('/api/move', {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...authHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId, location }),
  })
}

// 장비 슬롯(머리/몸통/무기)에 아이템 장착 → 갱신된 세션 반환
export async function apiEquip(sessionId, itemId, slot = null) {
  return fetchJson('/api/equip', {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId, item_id: itemId, slot }),
  })
}

export async function apiStoryCurrent(sessionId) {
  return fetchJson(`/api/story/${sessionId}`, {
    headers: { ...authHeaders() },
  })
}

// 계정 단위로 누적된 도감(단서·엔딩). 회차가 바뀌어도 유지된다.
export async function apiGetCodex() {
  return fetchJson('/api/codex', {
    headers: { ...authHeaders() },
  })
}

// 주요 장소가 아닌 곳 이동 시 배경 즉석 생성 (라이브 생성기 꺼져있으면 url=null)
export async function apiGenerateBackground(sessionId, location) {
  return fetchJson('/api/background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId, location }),
  })
}

// [테스트 전용] 원하는 엔딩으로 즉시 점프 (노멀/트루/히든/베드)
export async function apiDebugEnding(sessionId, ending) {
  return fetchJson('/api/debug/ending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId, ending }),
  })
}

export async function apiStoryChoice(sessionId, choiceId, roll) {
  return fetchJson('/api/story/choice', {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...authHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId, choice_id: choiceId, roll }),
  })
}

export async function apiTTS(text, options = {}) {
  const body = typeof options === 'string'
    ? { text, voice: options }
    : { text, ...options }

  return fetchJson('/api/tts', {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  })
}

export async function apiTTSStream(text, options = {}, onEvent, fetchOptions = {}) {
  const body = typeof options === 'string'
    ? { text, voice: options }
    : { text, ...options }

  const response = await fetch('/api/tts/stream', {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...authHeaders(),
    },
    body: JSON.stringify(body),
    signal: fetchOptions.signal,
  })

  if (response.status === 401) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    localStorage.removeItem('persona_session_id')
    throw new Error('濡쒓렇?몄씠 ?꾩슂?⑸땲??')
  }

  if (!response.ok || !response.body) {
    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = { detail: raw }
    }
    throw new Error(data?.detail || 'TTS stream request failed')
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''
  let finalData = null

  const dispatchBlock = (block) => {
    const lines = String(block || '').split(/\r?\n/)
    let eventName = 'message'
    const dataLines = []

    lines.forEach((line) => {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message'
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    })

    if (!dataLines.length) return
    const payload = JSON.parse(dataLines.join('\n'))
    if (eventName === 'error') throw new Error(payload?.detail || 'TTS stream error')
    if (eventName === 'final') finalData = payload
    onEvent?.(eventName, payload)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let splitAt = buffer.indexOf('\n\n')
    while (splitAt >= 0) {
      const block = buffer.slice(0, splitAt)
      buffer = buffer.slice(splitAt + 2)
      dispatchBlock(block)
      splitAt = buffer.indexOf('\n\n')
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) dispatchBlock(buffer)
  return finalData
}

export async function apiLockEnding(sessionId) {
  return fetchJson('/api/ending/lock', {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId }),
  })
}

export async function apiGetEnding(sessionId) {
  return fetchJson(`/api/ending/${sessionId}`, {
    headers: { ...authHeaders() },
  })
}

// NPC별 정량검사 — 백그라운드 잡 시작 → job_id 반환
export async function apiEvalRun() {
  return fetchJson('/api/eval/run', {
    method: 'POST',
    headers: { ...authHeaders() },
  })
}

// 정량검사 진행 상태/부분결과 폴링
export async function apiEvalStatus(jobId) {
  return fetchJson(`/api/eval/status/${jobId}`, {
    headers: { ...authHeaders() },
  })
}

// 브라우저에서 실제 3D 모델로 측정한 립싱크 결과를 서버에 올려 차트/요약 갱신
export async function apiEvalLipsync(jobId, results) {
  return fetchJson('/api/eval/lipsync', {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...authHeaders() },
    body: JSON.stringify({ job_id: jobId, results }),
  })
}
