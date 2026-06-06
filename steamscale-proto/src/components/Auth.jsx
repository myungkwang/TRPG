import React, { useState } from 'react'

// 로컬 계정 저장 (프로토타입용 — 백엔드 없이 localStorage)
const USERS_KEY = 'steamscale_users'
const loadUsers = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {} } catch { return {} } }
const saveUsers = (u) => localStorage.setItem(USERS_KEY, JSON.stringify(u))

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('choice')   // choice | login | register
  const [lid, setLid] = useState(''); const [lpw, setLpw] = useState('')
  const [rid, setRid] = useState(''); const [rpw, setRpw] = useState(''); const [rpw2, setRpw2] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  const goChoice = () => { setMode('choice'); setErr(''); setInfo('') }
  const goLogin = (m = '') => { setMode('login'); setErr(''); setInfo(m) }
  const goRegister = () => { setMode('register'); setErr(''); setInfo('') }

  const doLogin = () => {
    const users = loadUsers()
    if (!lid.trim()) return setErr('이름을 입력하세요.')
    if (users[lid] == null) return setErr('존재하지 않는 계정입니다.')
    if (users[lid] !== lpw) return setErr('비밀번호가 일치하지 않습니다.')
    onAuthed(lid)
  }

  const doRegister = () => {
    const users = loadUsers()
    if (!rid.trim()) return setErr('이름을 입력하세요.')
    if (!rpw) return setErr('비밀번호를 입력하세요.')
    if (rpw !== rpw2) return setErr('비밀번호가 일치하지 않습니다.')
    if (users[rid] != null) return setErr('이미 존재하는 이름입니다.')
    users[rid] = rpw; saveUsers(users)
    setRid(''); setRpw(''); setRpw2('')
    setLid(rid)
    goLogin('가입이 완료됐어요. 로그인해 주세요.')
  }

  return (
    <div className="auth-screen">
      <div className="title-fog" />
      <div className="title-gears" />
      <h1 className="auth-logo">증기와 비늘</h1>

      {mode === 'choice' && (
        <div className="auth-card auth-choice">
          <h2 className="auth-title">모험가 등록소</h2>
          <p className="auth-desc">계정으로 로그인하거나 새로 등록하세요.</p>
          <div className="auth-actions">
            <button className="auth-btn primary" onClick={() => goLogin()}>로그인</button>
            <button className="auth-btn" onClick={goRegister}>회원가입</button>
          </div>
        </div>
      )}

      {mode === 'login' && (
        <div className="auth-card">
          <h2 className="auth-title">로그인</h2>
          {info && <div className="auth-info">{info}</div>}
          <div className="auth-field">
            <label>이름</label>
            <input value={lid} autoFocus onChange={e => setLid(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLogin()} placeholder="이름" />
          </div>
          <div className="auth-field">
            <label>비밀번호</label>
            <input type="password" value={lpw} onChange={e => setLpw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLogin()} placeholder="비밀번호" />
          </div>
          {err && <div className="auth-err">{err}</div>}
          <div className="auth-actions">
            <button className="auth-btn primary" onClick={doLogin}>로그인</button>
            <button className="auth-btn" onClick={goChoice}>뒤로가기</button>
          </div>
        </div>
      )}

      {mode === 'register' && (
        <div className="auth-card">
          <h2 className="auth-title">회원가입</h2>
          <div className="auth-field">
            <label>이름</label>
            <input value={rid} autoFocus onChange={e => setRid(e.target.value)} placeholder="닉네임 / 이름" />
          </div>
          <div className="auth-field">
            <label>비밀번호</label>
            <input type="password" value={rpw} onChange={e => setRpw(e.target.value)} placeholder="비밀번호" />
          </div>
          <div className="auth-field">
            <label>비밀번호 재확인</label>
            <input type="password" value={rpw2} onChange={e => setRpw2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doRegister()} placeholder="비밀번호 재입력" />
          </div>
          {err && <div className="auth-err">{err}</div>}
          <div className="auth-actions">
            <button className="auth-btn primary" onClick={doRegister}>등록</button>
            <button className="auth-btn" onClick={goChoice}>뒤로가기</button>
          </div>
        </div>
      )}
    </div>
  )
}
