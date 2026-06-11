import React, { useState } from 'react'
import { apiLogin, apiSignup } from '../api.js'

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('choice')   // choice | login | register
  const [lid, setLid] = useState('')
  const [lpw, setLpw] = useState('')
  const [rid, setRid] = useState('')
  const [rpw, setRpw] = useState('')
  const [rname, setRname] = useState('')
  const [remail, setRemail] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const goChoice = () => { setMode('choice'); setErr(''); setInfo('') }
  const goLogin = (m = '') => { setMode('login'); setErr(''); setInfo(m) }
  const goRegister = () => { setMode('register'); setErr(''); setInfo('') }

  const doLogin = async () => {
    if (loading) return
    setErr('')
    if (!lid.trim()) return setErr('아이디를 입력하세요.')
    if (!lpw) return setErr('비밀번호를 입력하세요.')

    setLoading(true)
    try {
      const data = await apiLogin({ username: lid.trim(), password: lpw })
      onAuthed(data.user)
    } catch (e) {
      setErr(e.message || '로그인 실패')
    } finally {
      setLoading(false)
    }
  }

  const doRegister = async () => {
    if (loading) return
    setErr('')
    if (!rid.trim()) return setErr('아이디를 입력하세요.')
    if (!rpw) return setErr('비밀번호를 입력하세요.')
    if (!rname.trim()) return setErr('이름을 입력하세요.')
    if (!remail.trim()) return setErr('이메일을 입력하세요.')

    setLoading(true)
    try {
      await apiSignup({
        username: rid.trim(),
        password: rpw,
        name: rname.trim(),
        email: remail.trim(),
      })
      setLid(rid.trim())
      setRpw('')
      setRname('')
      setRemail('')
      goLogin('가입이 완료됐어요. 로그인해 주세요.')
    } catch (e) {
      setErr(e.message || '회원가입 실패')
    } finally {
      setLoading(false)
    }
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
            <label>아이디</label>
            <input value={lid} autoFocus onChange={e => setLid(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLogin()} placeholder="영문 시작, 영문+숫자" />
          </div>
          <div className="auth-field">
            <label>비밀번호</label>
            <input type="password" value={lpw} onChange={e => setLpw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLogin()} placeholder="비밀번호" />
          </div>
          {err && <div className="auth-err">{err}</div>}
          <div className="auth-actions">
            <button className="auth-btn primary" onClick={doLogin} disabled={loading}>
              {loading ? '처리 중...' : '로그인'}
            </button>
            <button className="auth-btn" onClick={goChoice}>뒤로가기</button>
          </div>
        </div>
      )}

      {mode === 'register' && (
        <div className="auth-card">
          <h2 className="auth-title">회원가입</h2>
          <div className="auth-field">
            <label>아이디</label>
            <input value={rid} autoFocus onChange={e => setRid(e.target.value)} placeholder="예: player123" />
          </div>
          <div className="auth-field">
            <label>비밀번호</label>
            <input type="password" value={rpw} onChange={e => setRpw(e.target.value)} placeholder="영문 또는 숫자 4~30자" />
          </div>
          <div className="auth-field">
            <label>이름</label>
            <input value={rname} onChange={e => setRname(e.target.value)} placeholder="한글 또는 영문" />
          </div>
          <div className="auth-field">
            <label>이메일</label>
            <input value={remail} onChange={e => setRemail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doRegister()} placeholder="example@email.com" />
          </div>
          {err && <div className="auth-err">{err}</div>}
          <div className="auth-actions">
            <button className="auth-btn primary" onClick={doRegister} disabled={loading}>
              {loading ? '처리 중...' : '가입하기'}
            </button>
            <button className="auth-btn" onClick={() => goLogin()}>로그인으로</button>
          </div>
        </div>
      )}
    </div>
  )
}
