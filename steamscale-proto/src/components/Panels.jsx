import React, { useState } from 'react'
import {
  STATUS, INV_COLS, INV_ROWS, INV_ITEMS,
  CODEX, MAP_NODES, MAP_EDGES, NODE_ICON,
} from '../data.js'

function Overlay({ title, onClose, className, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={'panel ' + (className || '')} onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="panel-x" onClick={onClose}>✕</button>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  )
}

/* ---------- 스테이터스 ---------- */
export function StatusPanel({ onClose }) {
  const v = STATUS.vitals, rep = STATUS.reputation
  const repPct = ((rep.val - rep.min) / (rep.max - rep.min)) * 100
  const bar = (cur, max, bg) => (
    <span className="v-bar"><span className="v-fill" style={{ width: `${(cur / max) * 100}%`, background: bg }} /></span>
  )
  return (
    <Overlay title="스테이터스" onClose={onClose} className="status">
      {/* 상단: 초상화 + 활력(크게) */}
      <div className="st2-top">
        <div className="st2-portrait">
          <div className="st2-pic">당신</div>
          <div className="st2-name">{STATUS.name}</div>
        </div>
        <div className="st2-vitals">
          <div className="v-row"><span className="v-lab">HP</span>{bar(v.hp[0], v.hp[1], 'linear-gradient(90deg,#7a2020,#d24b4b)')}<i>{v.hp[0]}/{v.hp[1]}</i></div>
          <div className="v-row"><span className="v-lab">MP</span>{bar(v.mp[0], v.mp[1], 'linear-gradient(90deg,#26407a,#4b78d2)')}<i>{v.mp[0]}/{v.mp[1]}</i></div>
          <div className="v-row"><span className="v-lab">스태미나</span>{bar(v.stamina[0], v.stamina[1], 'linear-gradient(90deg,#1f6b3a,#3aa15a)')}<i>{v.stamina[0]}/{v.stamina[1]}</i></div>
        </div>
      </div>

      {/* 평판 게이지 */}
      <div className="st2-rep">
        <div className="rep-head"><span>평판</span><b>{rep.val > 0 ? `+${rep.val}` : rep.val}</b></div>
        <div className="rep-track"><span className="rep-fill" style={{ width: `${repPct}%` }} /><span className="rep-mid" /></div>
        <div className="rep-ends"><span>적대</span><span>중립</span><span>우호</span></div>
      </div>

      <hr className="st2-hr" />

      {/* 50:50 — 특성 / 자원 */}
      <div className="st2-split">
        <div className="st2-col">
          <h3>특성</h3>
          {STATUS.abilities.map(a => <div className="kv" key={a.k}><span>{a.k}</span><b>{a.v}</b></div>)}
          <h3 style={{ marginTop: 12 }}>전투</h3>
          <div className="kv"><span>피해</span><b>{STATUS.combat.피해}</b></div>
          <div className="kv"><span>회피</span><b>{STATUS.combat.회피}</b></div>
          <div className="kv"><span>속도</span><b>{STATUS.combat.속도}</b></div>
        </div>
        <div className="st2-vline" />
        <div className="st2-col">
          <h3>자원</h3>
          {Object.entries(STATUS.resources).map(([k, val]) => <div className="kv" key={k}><span>{k}</span><b>{val}</b></div>)}
        </div>
      </div>

      <hr className="st2-hr" />

      {/* 가로 — 재능·직업 / 기타 정보 */}
      <div className="st2-split">
        <div className="st2-col">
          <h3>재능 · 직업</h3>
          <div className="kv"><span>재능</span><b>{STATUS.talent}</b></div>
          <div className="kv"><span>직업</span><b>{STATUS.job}</b></div>
        </div>
        <div className="st2-vline" />
        <div className="st2-col">
          <h3>기타 정보</h3>
          {STATUS.etc.map((e, i) => <div className="st2-etc" key={i}>· {e}</div>)}
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- 인벤토리 (3x4 + 주사위 슬롯) ---------- */
export function InventoryPanel({ onClose }) {
  const CELL = 64, GAP = 6
  const gw = INV_COLS * CELL + (INV_COLS - 1) * GAP
  const gh = INV_ROWS * CELL + (INV_ROWS - 1) * GAP
  return (
    <Overlay title="인벤토리" onClose={onClose} className="inventory">
      <div className="inv-wrap">
        <div className="inv-grid" style={{ width: gw, height: gh }}>
          {Array.from({ length: INV_COLS * INV_ROWS }).map((_, i) => {
            const cx = i % INV_COLS, cy = Math.floor(i / INV_COLS)
            return <div key={i} className="inv-cell"
              style={{ left: cx * (CELL + GAP), top: cy * (CELL + GAP), width: CELL, height: CELL }} />
          })}
          {INV_ITEMS.map(it => (
            <div key={it.id} className="inv-item"
              title={it.name + (it.stack ? ` ×${it.stack}` : '')}
              style={{
                left: it.x * (CELL + GAP), top: it.y * (CELL + GAP),
                width: it.w * CELL + (it.w - 1) * GAP, height: it.h * CELL + (it.h - 1) * GAP,
              }}>
              <span className="inv-icon">{it.icon}</span>
              {it.stack != null && <span className="inv-stack">{it.stack}</span>}
            </div>
          ))}
        </div>
        <div className="inv-side">
          <div className="inv-dicebox">
            <div className="inv-dlabel">주사위 슬롯</div>
            <div className="inv-dice">⬢<span>d12</span></div>
          </div>
          <p className="inv-note">재화·영정은 칸당 최대 10개. 10을 넘으면 다음 칸으로 분할돼요. (영정 23 → 10·10·3)</p>
        </div>
      </div>
    </Overlay>
  )
}

/* ---------- 도감 (책 펼침 + 필름스트립) ---------- */
export function CodexPanel({ onClose }) {
  const [sel, setSel] = useState(CODEX[0])
  return (
    <Overlay title="도감" onClose={onClose} className="codex">
      <div className="cx-book">
        <div className="cx-left">
          <div className="cx-portrait">{sel.got ? sel.name : '???'}</div>
          <div className="cx-namecard">{sel.got ? sel.name : '???'}</div>
        </div>
        <div className="cx-right">
          <div className="cx-tabs"><span className="active">인물</span><span>증거품</span></div>
          <p className="cx-meta">{sel.got ? sel.no : '???'}</p>
          <p className="cx-meta">{sel.got ? sel.age : '???'}</p>
          <p className="cx-desc">{sel.got ? sel.desc : '아직 밝혀지지 않았다.'}</p>
        </div>
      </div>
      <div className="cx-film">
        {CODEX.map(c => (
          <button key={c.id} className={'cx-frame' + (sel.id === c.id ? ' on' : '') + (c.got ? '' : ' locked')}
            onClick={() => setSel(c)}>
            {c.got ? c.name.slice(0, 2) : '?'}
          </button>
        ))}
      </div>
    </Overlay>
  )
}

/* ---------- 전체지도 (양피지 + 노드) ---------- */
export function FullMapPanel({ onClose }) {
  const pos = id => MAP_NODES.find(n => n.id === id)
  const stateColor = { done: '#8a6d3b', cur: '#c0392b', open: '#5b4a2e', fog: '#b9aa86' }
  return (
    <Overlay title="전체 지도" onClose={onClose} className="fullmap">
      <div className="fm-scroll">
        <svg viewBox="0 0 700 560" className="fm-svg">
          {MAP_EDGES.map(([a, b], i) => {
            const p = pos(a), q = pos(b)
            const fogged = p.state === 'fog' || q.state === 'fog'
            return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
              stroke="#6b5836" strokeWidth="2" strokeDasharray="6 7"
              opacity={fogged ? 0.22 : 0.7} />
          })}
          {MAP_NODES.map(n => (
            <g key={n.id} opacity={n.state === 'fog' ? 0.35 : 1}>
              <circle cx={n.x} cy={n.y} r="20" fill="#efe2c4" stroke={stateColor[n.state]} strokeWidth="3" />
              <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="16" fill="#5b4a2e">
                {n.state === 'fog' ? '?' : NODE_ICON[n.type]}
              </text>
              {n.state !== 'fog' && <text x={n.x} y={n.y + 38} textAnchor="middle" fontSize="12" fill="#5b4a2e">{n.label}</text>}
              {n.state === 'cur' && <circle cx={n.x} cy={n.y} r="26" fill="none" stroke="#c0392b" strokeWidth="2" strokeDasharray="3 4" />}
            </g>
          ))}
        </svg>
        <div className="fm-fog" />
      </div>
      <p className="fm-note">현재 위치 = 붉은 노드 · 안개 너머(?)는 아직 미발견. 대화 중 트리거로 한 칸씩 전진합니다.</p>
    </Overlay>
  )
}

/* ---------- 설정 (템플릿 없음 — 비활성 자리) ---------- */
export function SettingsPanel({ onClose }) {
  return (
    <Overlay title="설정" onClose={onClose} className="settings">
      <p className="set-note">설정 UI는 아직 템플릿이 없어 자리만 잡아둔 화면입니다. (동작 안 함)</p>
      <div className="set-row"><span>마스터 볼륨</span><input type="range" disabled /></div>
      <div className="set-row"><span>BGM</span><input type="range" disabled /></div>
      <div className="set-row"><span>효과음</span><input type="range" disabled /></div>
      <div className="set-row"><span>화면 품질</span><select disabled><option>높음</option></select></div>
    </Overlay>
  )
}
