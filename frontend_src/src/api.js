export function getToken() {
  return localStorage.getItem('access_token')
}

export function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, name, email }),
  })
}

export async function apiLogin({ username, password }) {
  const data = await fetchJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function apiLoadSession(sessionId) {
  return fetchJson(`/api/session/${sessionId}`, {
    headers: { ...authHeaders() },
  })
}

export async function apiChat(sessionId, message) {
  return fetchJson('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId, message }),
  })
}

export async function apiMove(sessionId, location) {
  return fetchJson('/api/move', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ session_id: sessionId, location }),
  })
}

export async function apiTTS(text, options = {}) {
  const body = typeof options === 'string'
    ? { text, voice: options }
    : {
      text,
      ...options,
      tone_instructions: options.tone_instructions ?? options.instructions,
    }
  delete body.instructions

  return fetchJson('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  })
}

export async function apiLockEnding(sessionId) {
  return fetchJson('/api/ending/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId }),
  })
}

export async function apiGetEnding(sessionId) {
  return fetchJson(`/api/ending/${sessionId}`, {
    headers: { ...authHeaders() },
  })
}

export async function apiGetCodex() {
  return fetchJson('/api/codex', {
    headers: { ...authHeaders() },
  })
}

export async function apiDebugEnding(sessionId, ending) {
  return fetchJson('/api/debug/ending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId, ending }),
  })
}
