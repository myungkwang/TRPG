import React, { useEffect, useState } from 'react'
import { apiGetCodex } from '../api.js'
import {
  CODEX_CHARACTERS, CODEX_ITEMS, CODEX_CLUES, CODEX_ENDINGS, REP_RANGE,
} from '../data.js'
import { categoryLabel, priceLabel } from '../items.js'

const CATS = [
  { key: 'chars',   label: '인물' },
  { key: 'items',   label: '아이템' },
  { key: 'clues',   label: '해금단서' },
  { key: 'endings', label: '엔딩' },
]

const affLabel = (v) => (v >= 20 ? '우호' : v <= -20 ? '적대' : '중립')

/* 인물 한 페이지 */
function CharPage({ c }) {
  if (!c) return <div className="cx2-page cx2-blank" />
  if (!c.got) return (
    <div className="cx2-page cx2-char locked">
      <div className="cx2-portrait">?</div>
      <div className="cx2-cname">???</div>
      <div className="cx2-crole">아직 만나지 못한 인물</div>
      <p className="cx2-cdesc">베일에 싸여 있다.</p>
    </div>
  )
  const { min, max } = REP_RANGE
  const pct = ((c.affinity - min) / (max - min)) * 100
  return (
    <div className="cx2-page cx2-char">
      <div className="cx2-portrait">{c.name.replace(/[^가-힣A-Za-z]/g, '').slice(0, 2) || '?'}</div>
      <div className="cx2-cname">{c.name}</div>
      <div className="cx2-crole">{c.role}</div>
      <p className="cx2-cdesc">{c.desc}</p>
      <div className="cx2-aff">
        <div className="cx2-aff-head"><span>호감</span><b>{c.affinity > 0 ? `+${c.affinity}` : c.affinity} · {affLabel(c.affinity)}</b></div>
        <div className="cx2-aff-track"><span className="cx2-aff-fill" style={{ width: `${pct}%` }} /><span className="cx2-aff-mid" /></div>
        <div className="cx2-aff-ends"><span>적대</span><span>중립</span><span>우호</span></div>
      </div>
    </div>
  )
}

/* 아이템/단서 — 좌측 스크롤 목록 + 우측 상세 */
function ListSpread({ list, sel, setSel, kindLabel }) {
  const cur = list[sel]
  return (
    <>
      <div className="cx2-page cx2-listpage">
        <h3 className="cx2-ptitle">{kindLabel} 목록</h3>
        <div className="cx2-list">
          {list.map((it, i) => (
            <button key={it.id}
              className={'cx2-row' + (i === sel ? ' on' : '') + (it.got ? '' : ' locked')}
              onClick={() => setSel(i)}>
              <span className="cx2-rno">NO.{it.got ? it.no : '?????'}</span>
              {it.got ? <span className="cx2-rname">{it.icon} {it.name}</span>
                      : <span className="cx2-rname dim">???</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="cx2-page cx2-detail">
        {cur && cur.got ? (
          <>
            <div className="cx2-dicon">{cur.icon}</div>
            <div className="cx2-dno">NO.{cur.no}</div>
            <div className="cx2-dname">{cur.name}</div>
            {cur.category && (
              <div className="cx2-dmeta">
                <div className="cx2-dmeta-row"><span>분류</span><b>{categoryLabel(cur)}</b></div>
                {cur.effect && cur.effect !== '-' && (
                  <div className="cx2-dmeta-row"><span>효과</span><b>{cur.effect}</b></div>
                )}
                {priceLabel(cur) && (
                  <div className="cx2-dmeta-row"><span>가격</span><b>{priceLabel(cur)}</b></div>
                )}
                {cur.sources?.length > 0 && (
                  <div className="cx2-dmeta-row"><span>획득처</span><b>{cur.sources.join(', ')}</b></div>
                )}
              </div>
            )}
            <p className="cx2-ddesc">{cur.desc}</p>
          </>
        ) : (
          <div className="cx2-locked-detail">
            <div className="cx2-dicon dim">❔</div>
            <div className="cx2-dno">NO.?????</div>
            <p className="cx2-ddesc dim">아직 해금되지 않은 {kindLabel}입니다.</p>
          </div>
        )}
      </div>
    </>
  )
}

const ENDING_KIND_LABEL = {
  END_NORMAL: '노멀엔딩',
  END_TRUE:   '트루엔딩',
  END_HIDDEN: '히든엔딩',
  END_BAD:    '베드엔딩',
}

function EndingPage({ slot, entry, onOpen }) {
  const label = ENDING_KIND_LABEL[slot.id] || (entry ? ENDING_KIND_LABEL[entry.id] : '베드엔딩')
  const got = Boolean(entry)
  return (
    <div className="cx2-page cx2-endpage">
      <div className="cx2-end-kindlabel">{label}</div>
      <button
        className={'cx2-endcard' + (got ? '' : ' locked')}
        disabled={!got}
        onClick={() => got && onOpen({ ...entry, no: slot.no })}
      >
        <div className="cx2-endart">{got ? (entry.art || '📜') : '❔'}</div>
        <div className="cx2-endno">NO.{slot.no}</div>
        <div className="cx2-endname">{got ? (entry.name || slot.name) : '???'}</div>
        {got && <div className="cx2-endhint">클릭하여 자세히</div>}
      </button>
    </div>
  )
}

export default function CodexPanel({ onClose }) {
  const [cat, setCat] = useState('chars')
  const [pair, setPair] = useState(0)         // chars/endings 스프레드 인덱스
  const [selItem, setSelItem] = useState(0)
  const [selClue, setSelClue] = useState(0)
  const [ending, setEnding] = useState(null)  // 엔딩 모달
  const [codexData, setCodexData] = useState(null)

  useEffect(() => {
    if (cat === 'endings') {
      apiGetCodex().then(setCodexData).catch(() => {})
    }
  }, [cat])

  // 고정 슬롯 정의 (No.1~3)
  const FIXED_SLOTS = [
    { no: 1, id: 'END_NORMAL', name: '노멀엔딩' },
    { no: 2, id: 'END_TRUE',   name: '트루엔딩' },
    { no: 3, id: 'END_HIDDEN', name: '히든엔딩' },
  ]

  // API 엔딩 데이터를 슬롯에 매핑
  const buildEndingSlots = () => {
    const apiEndings = codexData?.endings || []
    // 고정 슬롯 (1~3)
    const slots = FIXED_SLOTS.map(slot => ({
      slot,
      entry: apiEndings.find(e => e.id === slot.id) || null,
    }))
    // 베드 엔딩 (4~)
    const bads = apiEndings.filter(e => e.kind === 'bad' || (e.id === 'END_BAD'))
    bads.forEach((bad, i) => {
      slots.push({ slot: { no: 4 + i, id: 'END_BAD', name: '베드엔딩' }, entry: bad })
    })
    // 빈 베드 슬롯 1개 (미획득 표시)
    if (bads.length === 0) {
      slots.push({ slot: { no: 4, id: 'END_BAD', name: '베드엔딩' }, entry: null })
    }
    return slots
  }

  const switchCat = (k) => { setCat(k); setPair(0); setEnding(null) }

  const endingSlots = cat === 'endings' ? buildEndingSlots() : []
  const paged = cat === 'chars' ? CODEX_CHARACTERS : null
  const spreads = cat === 'chars' ? Math.ceil(CODEX_CHARACTERS.length / 2)
    : cat === 'endings' ? Math.ceil(endingSlots.length / 2)
    : 0
  const prev = () => setPair(p => Math.max(0, p - 1))
  const next = () => setPair(p => Math.min(spreads - 1, p + 1))

  return (
    <div className="overlay cx2-overlay" onClick={onClose}>
      <div className="cx2" onClick={e => e.stopPropagation()}>
        {/* 좌상단 책갈피 탭 */}
        <div className="cx2-tabs">
          {CATS.map(c => (
            <button key={c.key} className={'cx2-tab' + (cat === c.key ? ' on' : '')}
              onClick={() => switchCat(c.key)}>{c.label}</button>
          ))}
        </div>
        <button className="cx2-x" onClick={onClose}>✕</button>

        <div className="cx2-book">
          {cat === 'chars' && (<><CharPage c={paged[pair * 2]} /><CharPage c={paged[pair * 2 + 1]} /></>)}
          {cat === 'items' && (<ListSpread list={CODEX_ITEMS} sel={selItem} setSel={setSelItem} kindLabel="아이템" />)}
          {cat === 'clues' && (<ListSpread list={CODEX_CLUES} sel={selClue} setSel={setSelClue} kindLabel="단서" />)}
          {cat === 'endings' && (
            <>
              <EndingPage
                slot={endingSlots[pair * 2]?.slot || { no: pair * 2 + 1, id: '', name: '' }}
                entry={endingSlots[pair * 2]?.entry || null}
                onOpen={setEnding}
              />
              <EndingPage
                slot={endingSlots[pair * 2 + 1]?.slot || { no: pair * 2 + 2, id: '', name: '' }}
                entry={endingSlots[pair * 2 + 1]?.entry || null}
                onOpen={setEnding}
              />
            </>
          )}
        </div>

        {(cat === 'chars' || cat === 'endings') && spreads > 1 && (
          <div className="cx2-nav">
            <button className="cx2-arrow" onClick={prev} disabled={pair === 0}>◀</button>
            <span className="cx2-pageno">{pair + 1} / {spreads}</span>
            <button className="cx2-arrow" onClick={next} disabled={pair >= spreads - 1}>▶</button>
          </div>
        )}

        {/* 엔딩 모달 */}
        {ending && (
          <div className="cx2-endmodal-overlay" onClick={() => setEnding(null)}>
            <div className="cx2-endmodal" onClick={e => e.stopPropagation()}>
              <button className="cx2-endmodal-x" onClick={() => setEnding(null)}>✕</button>
              <div className="cx2-endmodal-art">{ending.art}</div>
              <div className="cx2-endmodal-title">NO.{ending.no} · {ending.name}</div>
              <p className="cx2-endmodal-summary">{ending.summary || ''}</p>
              {ending.text && (
                <div className="cx2-endmodal-text" style={{ whiteSpace: 'pre-wrap', color: '#e8e0d2', fontSize: '14px', lineHeight: 1.8, margin: '12px 0 0' }}>
                  {String(ending.text).replace(/^\s*GM\s*[:：]\s*/gm, '').trim()}
                </div>
              )}
              <div className="cx2-endmodal-hint">X 또는 바깥을 누르면 닫힙니다</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
