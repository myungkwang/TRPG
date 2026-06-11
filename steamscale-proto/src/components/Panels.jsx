import React, { useState } from 'react'
import Dice3D from './Dice3D.jsx'
import {
  STATUS, INV_COLS, INV_ROWS, INV_ITEMS, EQUIP_SLOTS, EQUIPMENT,
} from '../data.js'
import { ITEMS, categoryLabel, priceLabel } from '../items.js'

/* ---------- 아이템 상세 모달 (인벤토리·장비 슬롯 공용) ---------- */
function ItemDetailModal({ item, onClose }) {
  if (!item) return null
  return (
    <div className="overlay item-detail-overlay" onClick={onClose}>
      <div className="item-detail" onClick={e => e.stopPropagation()}>
        <button className="item-detail-x" onClick={onClose}>✕</button>
        <div className="id-icon">{item.icon}</div>
        <div className="id-name">{item.name}</div>
        <div className="id-cat">{categoryLabel(item)}</div>
        <div className="id-meta">
          {item.effect && item.effect !== '-' && (
            <div className="id-row"><span>효과</span><b>{item.effect}</b></div>
          )}
          {priceLabel(item) && (
            <div className="id-row"><span>가격</span><b>{priceLabel(item)}</b></div>
          )}
          {item.sources?.length > 0 && (
            <div className="id-row"><span>획득처</span><b>{item.sources.join(', ')}</b></div>
          )}
        </div>
        {item.desc && <p className="id-desc">{item.desc}</p>}
      </div>
    </div>
  )
}

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
  const [detail, setDetail] = useState(null)
  const v = STATUS.vitals, rep = STATUS.reputation
  const repPct = ((rep.val - rep.min) / (rep.max - rep.min)) * 100
  const bar = (cur, max, bg) => (
    <span className="v-bar"><span className="v-fill" style={{ width: `${(cur / max) * 100}%`, background: bg }} /></span>
  )
  return (
    <>
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

      {/* 장비 — 머리 / 몸통 / 무기 (빈 슬롯도 자리 고정) */}
      <div className="st2-equip">
        <h3>장비</h3>
        <div className="eq-slots">
          {EQUIP_SLOTS.map(s => {
            const it = EQUIPMENT[s.key] ? ITEMS[EQUIPMENT[s.key]] : null
            return (
              <div key={s.key} className={'eq-slot' + (it ? ' clickable' : ' empty')}
                title={it ? `${it.name} — 클릭하면 상세` : `${s.label}: 비어 있음`}
                onClick={() => it && setDetail(it)}>
                <div className="eq-icon">{it ? it.icon : s.ph}</div>
                <div className="eq-slotlab">{s.label}</div>
                <div className="eq-name">{it ? it.name : '비어 있음'}</div>
              </div>
            )
          })}
        </div>
      </div>

      <hr className="st2-hr" />

      {/* 가로 3그리드 — 특성 / 전투 / 자원 */}
      <div className="st2-split">
        <div className="st2-col">
          <h3>특성</h3>
          {STATUS.abilities.map(a => <div className="kv" key={a.k}><span>{a.k}</span><b>{a.v}</b></div>)}
        </div>
        <div className="st2-vline" />
        <div className="st2-col">
          <h3>전투</h3>
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
    <ItemDetailModal item={detail} onClose={() => setDetail(null)} />
    </>
  )
}

/* ---------- 인벤토리 (가방 + 우측 드롭아웃 주사위 창) ---------- */
export function InventoryPanel({ onClose }) {
  const CELL = 86, GAPX = 9, GAPY = 18
  const [diceOpen, setDiceOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const gw = INV_COLS * CELL + (INV_COLS - 1) * GAPX
  const gh = INV_ROWS * CELL + (INV_ROWS - 1) * GAPY
  return (
    <>
    <div className="overlay bag-overlay">
      <div className="bag">
        <div className="bag-flap"><span className="bag-buckle" /></div>
        <span className="bag-strap left" />
        <span className="bag-strap right" />
        <button className="bag-x" onClick={onClose}>✕</button>

        <div className="inv-grid" style={{ width: gw, height: gh }}>
          {Array.from({ length: INV_COLS * INV_ROWS }).map((_, i) => {
            const cx = i % INV_COLS, cy = Math.floor(i / INV_COLS)
            return <div key={i} className="inv-cell"
              style={{ left: cx * (CELL + GAPX), top: cy * (CELL + GAPY), width: CELL, height: CELL }} />
          })}
          {INV_ITEMS.map(it => (
            <div key={it.id} className="inv-item clickable"
              title={`${it.name} — 클릭하면 상세`}
              onClick={() => setDetail(ITEMS[it.ref])}
              style={{
                left: it.x * (CELL + GAPX), top: it.y * (CELL + GAPY),
                width: it.w * CELL + (it.w - 1) * GAPX, height: it.h * CELL + (it.h - 1) * GAPY,
              }}>
              <span className="inv-icon">{it.icon}</span>
              {it.stack != null && <span className="inv-stack">{it.stack}</span>}
            </div>
          ))}
        </div>

        {/* 좌하단 바깥 주사위 탭 — 클릭하면 아래로 주사위 창이 나타났다/사라짐 (인벤토리 고정) */}
        <div className={'dice-drawer' + (diceOpen ? ' open' : '')}>
          <button className="dice-tab" onClick={() => setDiceOpen(o => !o)} title="주사위">
            <span className="dice-tab-ico">🎲</span>
            <span className="dice-tab-arrow">{diceOpen ? '◀' : '▶'}</span>
          </button>
          {diceOpen && (
            <div className="dice-window">
              <Dice3D size={104} />
              <div className="dice-window-hint">클릭해서 굴리기</div>
            </div>
          )}
        </div>
      </div>
    </div>
    <ItemDetailModal item={detail} onClose={() => setDetail(null)} />
    </>
  )
}

/* ---------- 전체지도 (여정 기록 기반 — 좌우 분기 반영 · 지나온 길 + 안 간 길 ???) ---------- */
export function FullMapPanel({ onClose, journey = [] }) {
  const ICON = { 전투: '⚔', 이벤트: '✦', 거래: '$', 미지: '?' }
  const W = 480, rowH = 86, padTop = 72, padBottom = 84, step = 120
  const levels = journey.length
  const H = padTop + padBottom + Math.max(levels, 1) * rowH
  const cx = W / 2
  const yAt = lvl => H - padBottom - lvl * rowH         // lvl 0 = 출발(맨 아래)
  const xOf = slot => cx + (slot || 0) * step
  const posOf = i => ({ x: xOf(journey[i].slot), y: yAt(i + 1) })          // 방문 노드 i
  const prevOf = i => (i === 0 ? { x: cx, y: yAt(0) } : posOf(i - 1))      // 그 직전 노드
  const reachedEnd = journey[levels - 1]?.ending
  const lastPos = levels === 0 ? { x: cx, y: yAt(0) } : posOf(levels - 1)

  // 라벨(텍스트 배경 포함) — 선 위에 올려 가독성 확보
  const Label = ({ x, y, text, color }) => (
    <>
      <rect x={x - (text.length * 6.6 + 6)} y={y - 11} width={text.length * 13.2 + 12} height="18" rx="4"
        fill="#e8dcc0" opacity="0.92" />
      <text x={x} y={y + 3} textAnchor="middle" fontSize="12" fill={color}>{text}</text>
    </>
  )

  return (
    <Overlay title="전체 지도" onClose={onClose} className="fullmap">
      <div className="fm-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="fm-svg">
          {/* ===== 1패스: 엣지(선) 먼저 — 노드/텍스트보다 아래 ===== */}
          {journey.map((s, i) => {
            const a = prevOf(i), b = posOf(i)
            return (
              <g key={'e' + i}>
                {s.siblingSlots.map((slot, k) => (
                  <line key={k} x1={a.x} y1={a.y} x2={xOf(slot)} y2={b.y}
                    stroke="#6b5836" strokeWidth="2" strokeDasharray="4 6" opacity="0.38" />
                ))}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8a6d3b" strokeWidth="3" />
              </g>
            )
          })}
          {!reachedEnd && (
            <line x1={lastPos.x} y1={lastPos.y} x2={lastPos.x} y2={lastPos.y - 46}
              stroke="#6b5836" strokeWidth="2" strokeDasharray="4 6" opacity="0.45" />
          )}

          {/* ===== 2패스: 노드 + 아이콘 + 라벨 (선 위로) ===== */}
          {/* 출발점 */}
          <circle cx={cx} cy={yAt(0)} r="20" fill="#efe2c4" stroke="#5b4a2e" strokeWidth="3" />
          <text x={cx} y={yAt(0) + 5} textAnchor="middle" fontSize="16" fill="#5b4a2e">⌂</text>
          <Label x={cx} y={yAt(0) + 40} text="출발" color="#5b4a2e" />

          {journey.map((s, i) => {
            const b = posOf(i)
            const icon = s.ending ? '☠' : (ICON[s.kind] || '?')
            return (
              <g key={'n' + i}>
                {/* 안 간 갈림길 ??? */}
                {s.siblingSlots.map((slot, k) => (
                  <g key={k} opacity="0.42">
                    <circle cx={xOf(slot)} cy={b.y} r="18" fill="#e6d9bb" stroke="#b9aa86" strokeWidth="2" />
                    <text x={xOf(slot)} y={b.y + 5} textAnchor="middle" fontSize="15" fill="#8a7858">?</text>
                    <Label x={xOf(slot)} y={b.y + 36} text="???" color="#8a7858" />
                  </g>
                ))}
                {/* 지나온(방문) 노드 */}
                <circle cx={b.x} cy={b.y} r="20" fill="#efe2c4" stroke={s.ending ? '#9b1c31' : '#8a6d3b'} strokeWidth="3" />
                <text x={b.x} y={b.y + 5} textAnchor="middle" fontSize="16" fill="#5b4a2e">{icon}</text>
                <Label x={b.x} y={b.y + 40} text={s.ending ? '엔딩' : s.kind} color="#5b4a2e" />
              </g>
            )
          })}

          {/* 아직 가지 않은 앞길 */}
          {!reachedEnd && (
            <g opacity="0.5">
              <circle cx={lastPos.x} cy={lastPos.y - 58} r="18" fill="#e6d9bb" stroke="#b9aa86" strokeWidth="2" />
              <text x={lastPos.x} y={lastPos.y - 53} textAnchor="middle" fontSize="15" fill="#8a7858">?</text>
            </g>
          )}

          {/* 현재 위치 강조 */}
          <circle cx={lastPos.x} cy={lastPos.y} r="26" fill="none" stroke="#c0392b" strokeWidth="2" strokeDasharray="3 4" />
        </svg>
      </div>
      <p className="fm-note">실선 = 지나온 길(좌·중·우 분기 반영) · 흐린 ??? = 가지 않은 갈림길/미발견 · 붉은 원 = 현재 위치.</p>
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
