// ===== 임시 데이터 (나중에 서버/시트 데이터로 교체) =====
import { ITEMS, ITEM_LIST } from './items.js'

// 말풍선 색: GM=나레이터(청록빛 슬레이트, NPC들과 확실히 구분), 린=진홍, 플레이어=회색
//   (의사 등 NPC는 personas.js의 color를 쓰므로, GM은 그 어떤 NPC와도 겹치지 않는 색으로 둔다)
export const SPEAKERS = {
  gm:     { name: 'GM', color: '#3f7d86', tint: 'rgba(63,125,134,0.16)' },    // 청록 슬레이트(나레이터)
  lin:    { name: "여우 ‘린’", color: '#9b1c31', tint: 'rgba(155,28,49,0.18)' }, // 진홍
  player: { name: '나', color: '#7d858d', tint: 'rgba(125,133,141,0.16)' },   // 회색
}

export const SEED_DIALOGUE = [
  { who: 'gm', text: '아… 깨어나셨군요.' },
  { who: 'gm', text: '꼬박 사흘 밤낮을 앓으셨습니다. 여기는 재끝 마을 진료소 — 다행히, 숨은 붙어 있군요.' },
  { who: 'gm', text: '…이름은. 기억나는 게, 있으십니까?' },
]

export const FLAVOR_CHOICE = '~ 선택의 기회가 주어지면, 후회할 선택은 하지 마세요. ~'

export const CHOICES = [
  { id: 1, text: '가진 단검을 보여주며 거래한다', tag: null,        judge: false },
  { id: 2, text: '그녀의 말투를 의심하며 떠본다', tag: '간파',      judge: true, stat: '지각', dc: 13 },
  { id: 3, text: '영석에 손을 대 본다',          tag: '술식 · 위험', judge: true, stat: '지능', dc: 1 },
]

// 스테이터스 (이미지10을 우리 게임에 맞게)
export const STATUS = {
  name: '당신 (기억상실)',
  abilities: [
    { k: '힘',   v: 6 },
    { k: '민첩', v: 5 },
    { k: '지능', v: 7 },
    { k: '매력', v: 4 },
    { k: '지각', v: 6 },
  ],
  vitals: { hp: [22, 25], mp: [35, 40], stamina: [12, 16] },
  reputation: { val: 20, min: -50, max: 50 },
  resources: { 금화: 0, 은화: 7, 동화: 39, 영정: 23 },
  combat: { 피해: '1-2', 회피: 17, 속도: 6 },
  talent: '술식기계 사용자(반각자)',
  job: '영석 연금술사',
  etc: ['특이: 기억상실 — 정체 불명', '사회성: 보통', '마법: 술식형 (영정 매개)'],
}

// 장착 장비 — 머리 / 몸통 / 무기 3칸.
//   slot.ph = 빈 슬롯에 보이는 흐린 안내 아이콘
//   EQUIPMENT 값은 items.js 마스터의 ITM_* ID (null = 빈 슬롯)
export const EQUIP_SLOTS = [
  { key: 'head',   label: '머리', ph: '🎩' },
  { key: 'body',   label: '몸통', ph: '🧥' },
  { key: 'weapon', label: '무기', ph: '⚔️' },
]
export const EQUIPMENT = { head: 'ITM_HEAD_GOGGLE', body: 'ITM_BODY_STEAMPLATE', weapon: 'ITM_WPN_ARM' }

// 인벤토리: 3열 x 4행 + 주사위 슬롯 1칸
export const INV_COLS = 3
export const INV_ROWS = 4
// 시작 인벤토리 — 아이템 마스터(items.js)를 ITM_* ID로 "참조"만 한다.
//   ref: 마스터 ID / x,y: 좌상단 셀 / w,h: 차지 셀 / stack: 겹침 수
//   (이름·아이콘은 마스터에서 자동으로 끌어옴 → 한 군데에서만 관리)
const INV_LAYOUT = [
  { ref: 'ITM_HP_AMPLE_HIGH', x: 0, y: 0, w: 1, h: 1, stack: 3 },
  { ref: 'ITM_MP_AMPLE_HIGH', x: 1, y: 0, w: 1, h: 1, stack: 3 },
  { ref: 'ITM_LANTERN',       x: 2, y: 0, w: 1, h: 1 },
  { ref: 'ITM_ROPE',          x: 0, y: 1, w: 1, h: 1, stack: 2 },
  { ref: 'ITM_COMPASS',       x: 1, y: 1, w: 1, h: 1 },
  { ref: 'ITM_TOME',          x: 2, y: 1, w: 1, h: 1 },
  // 영정 23개 → 10/10/3 으로 칸 분할 (희소 자원)
  { ref: 'ITM_ESSENCE', x: 0, y: 2, w: 1, h: 1, stack: 10, currency: true },
  { ref: 'ITM_ESSENCE', x: 1, y: 2, w: 1, h: 1, stack: 10, currency: true },
  { ref: 'ITM_ESSENCE', x: 2, y: 2, w: 1, h: 1, stack: 3,  currency: true },
  // 무기는 '유일무기'만 존재한다. 데모 캐릭터(영석 연금술사)의 시작 유일무기.
  { ref: 'ITM_UNIQ_REVOLVER', x: 0, y: 3, w: 1, h: 1 },
]
export const INV_ITEMS = INV_LAYOUT.map((slot, i) => {
  const m = ITEMS[slot.ref]
  return { ...slot, id: `${slot.ref}_${i}`, name: m.name, icon: m.icon }
})

// 도감 인물 (이미지7 형식)
export const CODEX = [
  { id: 'lin',    name: "여우 ‘린’", no: '제 ?? 호', age: '나이 불명',  desc: '재끝 마을 여관 주인. 구미호. 말끝마다 무언가를 숨기는 듯하다. 모든 소문이 그녀를 거쳐 간다.', got: true },
  { id: 'gail',   name: '가일',     no: '제국 영석공사', age: '40대',    desc: '채굴 현장 감독. 사라진 광부 수를 축소·은폐하고 있다.', got: true },
  { id: 'marta',  name: '마르타',   no: '재끝 마을',   age: '노년',     desc: '산의 전설을 아는 노파. 봉우리 위 옛 둥지를 기억한다.', got: true },
  { id: 'tobi',   name: '토비',     no: '재끝 마을',   age: '소년',     desc: '사라진 형을 찾는 소년. 순수하고 절박하다.', got: true },
  { id: 'kargas', name: '카르가스', no: '???',        age: '태고',     desc: '???', got: false },
  { id: 'doctor', name: '의사',     no: '마을 진료소', age: '?',        desc: '기억을 잃은 당신을 진찰한 인물.', got: true },
  { id: 'lock1',  name: '???',      no: '???',        age: '???',      desc: '아직 만나지 못한 인물.', got: false },
]

// 전체 지도 노드 (정적 SVG 표시용 - 양피지 위)
export const MAP_NODES = [
  { id: 'n0', x: 90,  y: 360, type: 'start',  label: '재끝 마을', state: 'done' },
  { id: 'n1', x: 220, y: 300, type: 'battle', label: '광산 입구', state: 'done' },
  { id: 'n2', x: 220, y: 410, type: 'event',  label: '여관',     state: 'cur'  },
  { id: 'n3', x: 350, y: 250, type: 'unknown',label: '?',        state: 'open' },
  { id: 'n4', x: 350, y: 360, type: 'shop',   label: '정제소',   state: 'open' },
  { id: 'n5', x: 350, y: 460, type: 'unknown',label: '?',        state: 'fog'  },
  { id: 'n6', x: 480, y: 300, type: 'unknown',label: '?',        state: 'fog'  },
  { id: 'n7', x: 480, y: 420, type: 'battle', label: '갱도 심부', state: 'fog'  },
  { id: 'n8', x: 610, y: 360, type: 'boss',   label: '봉우리',   state: 'fog'  },
]
export const MAP_EDGES = [
  ['n0','n1'],['n0','n2'],['n1','n3'],['n1','n4'],['n2','n4'],['n2','n5'],
  ['n3','n6'],['n4','n6'],['n4','n7'],['n5','n7'],['n6','n8'],['n7','n8'],
]
export const NODE_ICON = { start:'⌂', battle:'⚔', event:'✦', shop:'$', unknown:'?', boss:'☠' }

// ===== 도감 데이터 (계정당 영구 — 추후 서버/계정 저장으로 교체) =====
export const REP_RANGE = { min: -50, max: 50 }

// 인물 — 현재 플롯 순서. affinity = 현재 평판 기반 호감 수치
export const CODEX_CHARACTERS = [
  { id:'lin',    name:"여우 ‘린’", role:'재끝 마을 여관 주인 · 구미호', got:true, affinity:32,
    desc:'재끝 마을 여관의 주인. 말끝마다 무언가를 숨기는 듯한 미소를 짓는다. 마을의 모든 소문이 그녀를 거쳐 간다.' },
  { id:'gail',   name:'가일', role:'제국 영석공사 채굴 감독', got:true, affinity:-14,
    desc:'채굴 현장의 감독. 사라진 광부 수를 축소·은폐하고 있다. 권위적이지만 속은 겁이 많다.' },
  { id:'marta',  name:'마르타', role:'재끝 마을 노파', got:true, affinity:10,
    desc:'산의 전설을 아는 노파. 봉우리 위 옛 둥지를 기억하는 마지막 사람이다.' },
  { id:'tobi',   name:'토비', role:'사라진 광부의 동생', got:true, affinity:46,
    desc:'사라진 형을 찾는 소년. 순수하고 절박하다. 어느새 당신을 형처럼 따른다.' },
  { id:'doctor', name:'의사', role:'마을 진료소', got:true, affinity:6,
    desc:'기억을 잃은 당신을 처음 진찰한 인물. 무언가 알고 있는 듯 말을 아낀다.' },
  { id:'kargas', name:'???', role:'???', got:false, affinity:0,
    desc:'아직 만나지 못한 존재. 태고의 무언가가 봉우리 너머에서 숨 쉰다.' },
]

// 아이템 — 아이템 마스터(items.js)에서 전체 생성. 미해금 시 NO.????? 로 표시.
//   해금 규칙(데이터 기반): T2·T3 유일무기 / 해금 부품 / 남두의 권 비법서 = 잠김.
//   그 외(소모품·일반 무기/장비·T1 시작무기 등)는 도감에 공개.
const isLocked = (it) =>
  (it.tier && it.tier >= 2) || it.category === '부품' || it.id === 'ITM_TOME_NAMDU'
export const CODEX_ITEMS = ITEM_LIST.map((it, i) => ({
  id: it.id, no: i + 1, name: it.name, icon: it.icon,
  category: it.category, slot: it.slot, unique: it.unique, tier: it.tier,
  effect: it.effect, price: it.price, sources: it.sources, desc: it.desc,
  got: !isLocked(it),
}))

// 해금단서 — 아이템과 유사
export const CODEX_CLUES = [
  { id:'cl1', no:1, name:'은폐된 명부', got:true, icon:'📜', desc:'가일이 숨긴 광부 명부. 사라진 인원이 공식 발표의 세 배에 달한다.' },
  { id:'cl2', no:2, name:'봉우리의 그림자', got:true, icon:'🏔️', desc:'마르타가 말한 옛 둥지. 봉우리 위에 무언가 거대한 것이 산다.' },
  { id:'cl3', no:3, name:'잊혀진 자장가', got:true, icon:'🎶', desc:'토비가 흥얼대는 자장가. 어딘가 당신의 기억을 건드린다.' },
  { id:'cl4', no:4, name:'?????', got:false },
  { id:'cl5', no:5, name:'?????', got:false },
  { id:'cl6', no:6, name:'?????', got:false },
  { id:'cl7', no:7, name:'?????', got:false },
  { id:'cl8', no:8, name:'?????', got:false },
]

// 정규 엔딩 슬롯(고정). 계정 누적분(/api/codex)과 이름으로 매칭해 해금/요약/이미지를 채운다.
//   미도달 항목은 ??? 잠김으로 표시.
export const ENDING_DEX = [
  { name: '노멀', art: '🌅', teaser: '봉우리의 대면을 지나, 마을은 잿빛 새벽을 맞는다.' },
  { name: '트루', art: '🐉', teaser: '진실을 모두 꿰뚫은 자만이 닿는 결말.' },
  { name: '히든', art: '✨', teaser: '잊혀진 기억과 린의 동맹이 여는 숨겨진 길.' },
]

// 베드 엔딩 — 고정 슬롯이 아니라 AI가 회차마다 새로 쓰는 결말. 도달할 때마다 누적된다.
export const BAD_ENDING_INFO = {
  art: '🥀',
  desc: '베드 엔딩은 정해진 결말이 아닙니다. 단서나 핵심 합의를 놓친 채 이야기가 끝나면, '
      + 'AI가 그 회차의 선택에 맞춰 매번 새로운 실패 결말을 써냅니다. 도달할 때마다 아래에 누적됩니다.',
}

// 엔딩 — 일러스트 1개/페이지, 클릭 시 모달 (구 더미 데이터 — 현재는 ENDING_DEX 사용)
export const CODEX_ENDINGS = [
  { id:'en1', no:1, name:'레치타티보 아리아', got:true, art:'🎭',
    summary:'레치타티보, 아리아. 공연의 폐막은 운명의 쉼표일 뿐이다. 당신은 무대를 떠나지만, 막은 다시 오른다.',
    footnotes:['린: “결국 손님도 무대 위 사람이었네요.”', '토비: “형, 봤어? 끝까지 멋졌어.”'] },
  { id:'en2', no:2, name:'재끝의 새벽', got:true, art:'🌅',
    summary:'안개가 걷히고 재끝 마을에 새벽이 든다. 사라진 이들은 돌아오지 않았지만, 남은 자들은 다시 곡괭이를 든다.',
    footnotes:['마르타: “산은 늘 대가를 받지.”', '가일: “…내 잘못이었소.”'] },
  { id:'en3', no:3, name:'???', got:false, art:'❔', summary:'아직 도달하지 못한 결말.', footnotes:[] },
  { id:'en4', no:4, name:'???', got:false, art:'❔', summary:'아직 도달하지 못한 결말.', footnotes:[] },
  { id:'en5', no:5, name:'???', got:false, art:'❔', summary:'아직 도달하지 못한 결말.', footnotes:[] },
  { id:'en6', no:6, name:'???', got:false, art:'❔', summary:'아직 도달하지 못한 결말.', footnotes:[] },
]
