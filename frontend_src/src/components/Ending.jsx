import React from 'react'

const KIND_COLOR = {
  good: '#c9a24b',
  bad: '#9b1c31',
}

const NAME_TITLE = {
  '노멀': '노멀 엔딩',
  '트루': '트루 엔딩',
  '히든': '히든 엔딩',
  '베드': '베드 엔딩',
}

export default function Ending({ ending, onClose }) {
  if (!ending) return null
  const color = KIND_COLOR[ending.kind] || '#c9a24b'
  const title = NAME_TITLE[ending.name] || `${ending.name} 엔딩`
  const body = String(ending.text || '').replace(/^\s*GM\s*[:：]\s*/gm, '').trim()

  return (
    <div style={overlay}>
      <div style={{ ...card, borderColor: color }}>
        {ending.image_url && (
          <div style={imgWrap}>
            <img src={ending.image_url} alt={title} style={img} />
          </div>
        )}
        <div style={{ ...badge, color, borderColor: color }}>END</div>
        <h2 style={{ ...titleStyle, color }}>{title}</h2>
        <p style={summaryStyle}>{ending.summary || ''}</p>
        <div style={textStyle}>{body}</div>
        <button style={{ ...btn, borderColor: color, color }} onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(8,8,10,0.92)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: '24px',
}
const card = {
  maxWidth: '720px', width: '100%', maxHeight: '92vh', overflowY: 'auto',
  background: '#14110d', border: '2px solid', borderRadius: '14px',
  padding: '0 0 24px', textAlign: 'center', boxShadow: '0 12px 50px #000a',
}
const imgWrap = { width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: '12px 12px 0 0', background: '#000' }
const img = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
const badge = {
  display: 'inline-block', marginTop: '18px', padding: '2px 14px',
  border: '1px solid', borderRadius: '999px', fontSize: '12px', letterSpacing: '3px',
}
const titleStyle = { margin: '10px 0 6px', fontSize: '28px', letterSpacing: '2px' }
const summaryStyle = { margin: '0 24px 14px', color: '#b8a98c', fontSize: '14px' }
const textStyle = {
  margin: '0 28px', color: '#e8e0d2', fontSize: '15px', lineHeight: 1.85,
  textAlign: 'left', whiteSpace: 'pre-wrap',
}
const btn = {
  marginTop: '22px', padding: '10px 28px', background: 'transparent',
  border: '1px solid', borderRadius: '8px', cursor: 'pointer', fontSize: '15px',
}
