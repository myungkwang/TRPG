// ===== 임시 데이터 (나중에 서버/시트 데이터로 교체) =====

// 말풍선 색: GM=밤색, 린=진홍, 플레이어=회색
export const SPEAKERS = {
  gm:     { name: 'GM', color: '#7a4a2e', tint: 'rgba(122,74,46,0.18)' },     // 밤색
  lin:    { name: "여우 ‘린’", color: '#9b1c31', tint: 'rgba(155,28,49,0.18)' }, // 진홍
  player: { name: '나', color: '#7d858d', tint: 'rgba(125,133,141,0.16)' },   // 회색
}

export const SEED_DIALOGUE = [
  { who: 'gm',     text: '낡은 영석 등불이 깜빡인다. 카운터 뒤의 여인이 고개를 들어 너를 본다.' },
  { who: 'player', text: '사라진 광부들에 대해 알고 있나?' },
  { who: 'lin',    text: '…어머. 그 얘길 묻는 손님은 오랜만이네요. 공짜는 아니랍니다. 뭘 내놓으시겠어요?' },
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

// 인벤토리: 3열 x 4행 + 주사위 슬롯 1칸
export const INV_COLS = 3
export const INV_ROWS = 4
// 아이템: x,y(좌상단 셀), w,h(차지 셀), stack(겹침 수, 재화/영정은 10 초과 시 분할되어 이미 칸 나뉨)
export const INV_ITEMS = [
  { id: 'dagger', name: '낡은 단검', icon: '🗡️', x: 0, y: 0, w: 1, h: 2 },
  { id: 'potion', name: '회복 물약', icon: '🧪', x: 1, y: 0, w: 1, h: 1, stack: 5 },
  { id: 'lantern',name: '영석 등불', icon: '🏮', x: 2, y: 0, w: 1, h: 1 },
  { id: 'stone',  name: '영석 조각', icon: '🪨', x: 1, y: 1, w: 1, h: 1 },
  // 영정 23개 → 10/10/3 으로 칸 분할
  { id: 'ess1',   name: '영정', icon: '✦', x: 0, y: 2, w: 1, h: 1, stack: 10, currency: true },
  { id: 'ess2',   name: '영정', icon: '✦', x: 1, y: 2, w: 1, h: 1, stack: 10, currency: true },
  { id: 'ess3',   name: '영정', icon: '✦', x: 2, y: 2, w: 1, h: 1, stack: 3,  currency: true },
]

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
