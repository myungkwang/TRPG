export function getToken() {
  return localStorage.getItem('access_token')
}

export function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function requireAuth() {
  if (!getToken()) {
    location.replace('/login')
    return false
  }
  return true
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
    location.replace('/login')
    throw new Error('로그인이 필요합니다.')
  }

  if (!response.ok) {
    throw new Error(data?.detail || '요청 실패')
  }

  return data
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

export async function apiTTS(text) {
  return fetchJson('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ text }),
  })
}
