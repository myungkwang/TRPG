// ============================================================
// 아이템 마스터 — 게임 전체의 유일한 아이템 원본 (Single Source of Truth)
// ------------------------------------------------------------
// 관리법: 아래 RAW 배열에 한 줄(객체) 추가/수정하면 끝.
//   인벤토리·도감·장비·상점이 전부 ITM_* ID로 이 데이터를 참조한다.
//
// 필드:
//   id        고유 ID (ITM_*)
//   name      이름
//   icon      아이콘(이모지)
//   category  분류  '소모품' | '자원' | '장비' | '무기' | '부품' | '마법서'
//   slot      장착 슬롯 '머리' | '몸통' | '무기'  (없으면 생략)
//   effect    효과(데이터시트)
//   currency  가격(화폐) '동화'|'은화'|'금화'|'고가(상점 희소)'|'금화(고가)'|'-'
//   essence   가격(영정) '-' | '소량'
//   sources   획득처 (배열)
//   unique    유일무기 직업명 (해당 시)
//   tier      유일무기 단계 1|2|3 (해당 시)
//   desc      상세 설명(도감/상세창)
// ============================================================

const RAW = [
  // ===== 핵심 자원 / 소모품 =====
  { id:'ITM_ESSENCE', name:'영정', icon:'✦', category:'자원',
    effect:'술식기계 연료, 마법 촉매, 약학 재료 (회복 안 됨)', currency:'고가(상점 희소)', essence:'-',
    sources:['갱도 심부','정제소','보스','핵심 퀘스트'], rarity:'unique',
    modelPath:'/static/models/items/essence.glb',
    desc:'늘 부족한 핵심 자원. 화폐이자 술식의 매개이며, 좀처럼 상점에 풀리지 않는다.' },
  { id:'ITM_LANTERN', name:'영석 등불', icon:'🏮', category:'소모품',
    effect:'어둠을 밝힘', currency:'동화', essence:'-', sources:['상점','탐색'],
    modelPath:'/static/models/items/lantern.glb',
    desc:'갱도를 밝히는 영석 등불. 안갯속에서도 좀처럼 꺼지지 않는다.' },
  { id:'ITM_ROPE', name:'밧줄', icon:'🪢', category:'소모품',
    effect:'지형 통과, 구출', currency:'동화', essence:'-', sources:['상점'],
    modelPath:'/static/models/items/rope.glb', model3d:{ rotation:[0.25, -0.6, 0] },
    desc:'튼튼하게 꼰 밧줄. 끊긴 다리나 수직 갱도에서 길을 잇는다. (지형 통과 판정 일회성 자동 성공)' },
  // ===== 회복류 (포션 모델 공용) =====
  { id:'ITM_HP_AMPLE_LOW', name:'HP앰플(저가형)', icon:'🧪', category:'소모품',
    effect:'HP 소량 회복', currency:'동화', essence:'-', sources:['상점','탐색'],
    modelPath:'/static/models/items/potion.glb',
    desc:'영석 가루를 녹인 응급 앰플. HP를 조금 회복한다.' },
  { id:'ITM_HP_AMPLE_HIGH', name:'HP앰플(고급형)', icon:'❤️', category:'소모품',
    effect:'HP 대량 회복', currency:'은화', essence:'-', sources:['상점','탐색'],
    modelPath:'/static/models/items/potion.glb',
    desc:'정제 영석을 농축한 앰플. HP를 크게 회복한다.' },
  { id:'ITM_MP_AMPLE_LOW', name:'MP앰플(저가형)', icon:'🔹', category:'소모품',
    effect:'MP 소량 회복', currency:'동화', essence:'-', sources:['상점','탐색'],
    modelPath:'/static/models/items/potion.glb',
    desc:'옅은 영정수를 담은 앰플. MP를 조금 회복한다.' },
  { id:'ITM_MP_AMPLE_HIGH', name:'MP앰플(고급형)', icon:'🔷', category:'소모품',
    effect:'MP 대량 회복', currency:'은화', essence:'-', sources:['상점','탐색'],
    modelPath:'/static/models/items/potion.glb',
    desc:'농축 영정수를 담은 앰플. MP를 크게 회복한다.' },
  { id:'ITM_STAMINA', name:'스태미나 강장제', icon:'🍶', category:'소모품',
    effect:'스태미나 회복', currency:'동화', essence:'-', sources:['상점','탐색'],
    modelPath:'/static/models/items/potion.glb',
    desc:'쓴 약초를 우린 강장제. 지친 몸의 스태미나를 되살린다.' },
  // ===== 화폐 (코인 3D — 자원 표시/도감용) =====
  { id:'ITM_COIN_GOLD', name:'금화', icon:'🪙', category:'화폐',
    effect:'고액 화폐', currency:'-', essence:'-', sources:['상점','보상'],
    modelPath:'/static/models/items/coin-gold.glb',
    desc:'제국 각인이 새겨진 금화. 큰 거래에 쓰인다.' },
  { id:'ITM_COIN_SILVER', name:'은화', icon:'⚪', category:'화폐',
    effect:'중간 화폐', currency:'-', essence:'-', sources:['상점','보상'],
    modelPath:'/static/models/items/coin-silver.glb',
    desc:'손때 묻은 은화. 일상적인 거래의 기준이 된다.' },
  { id:'ITM_COIN_BRONZE', name:'동화', icon:'🟤', category:'화폐',
    effect:'소액 화폐', currency:'-', essence:'-', sources:['상점','보상'],
    modelPath:'/static/models/items/coin-bronze.glb',
    desc:'가장 흔한 동화. 잔돈으로 주머니를 채운다.' },

  // ===== 장비 (액세서리 / 슬롯 무기·머리) =====
  { id:'ITM_WPN_ARM', name:'술식 의수', icon:'🦾', category:'장비', slot:'무기',
    effect:'마법 발사 보조 (술식기계)', currency:'금화', essence:'소량', sources:['상점','퀘스트'],
    modelPath:'/static/models/items/prosthetic-arm.glb',
    stats:{ '무기 공격력':4, 피해:'4-7', 지능:1 },
    desc:'영정을 동력으로 삼는 기계 의수. 술식을 손끝에서 직접 쏘아 보낸다.' },
  { id:'ITM_HEAD_GOGGLE', name:'영정 고글', icon:'🥽', category:'장비', slot:'머리',
    effect:'숨은 단서 감지 (간파 보조)', currency:'금화', essence:'-', sources:['퀘스트'],
    modelPath:'/static/models/items/essence-goggle.glb',
    stats:{ 지능:1, 매력:1 },
    desc:'영정 렌즈를 끼운 고글. 안개 너머와 숨겨진 흔적을 드러낸다.' },
  { id:'ITM_PART', name:'술식 강화 부품', icon:'⚙️', category:'장비',
    effect:'술식기계 출력 강화', currency:'은화', essence:'소량', sources:['상점','탐색'],
    modelPath:'/static/models/items/enhancement-part.glb', model3d:{ rotation:[0.25, -0.6, 0] },
    stats:{ 지능:2 },
    desc:'술식기계에 끼워 출력을 끌어올리는 정밀 부품.' },
  { id:'ITM_CHARM_GEAR', name:'톱니 부적', icon:'🧿', category:'장비',
    effect:'기계 관련 장비 전투 보정 / 유지', currency:'은화', essence:'-', sources:['상점','탐색'],
    modelPath:'/static/models/items/gear-charm.glb',
    stats:{ 힘:1, 민첩:1 },
    desc:'증기 장인이 만든 부적. 기계 장비를 다룰 때 전투 보정을 준다.' },
  { id:'ITM_COMPASS', name:'안개 나침반', icon:'🧭', category:'장비',
    effect:'방향 관련 판정 보정 / 유지', currency:'은화', essence:'-', sources:['상점','탐색'],
    modelPath:'/static/models/items/fog-compass.glb',
    stats:{ 민첩:2 },
    desc:'안갯속에서도 방향을 가리키는 나침반. 길 찾기 판정에 유리하다.' },

  // ===== 마법서 =====
  { id:'ITM_TOME', name:'마법서', icon:'📖', category:'마법서',
    effect:'영정을 매개로 하는 마법 습득', currency:'금화', essence:'-', sources:['상점','탐색'],
    modelPath:'/static/models/items/magicbook.glb',
    stats:{ 지능:2 },
    desc:'술식의 구문이 적힌 책. 영정을 매개로 새로운 마법을 익힌다.' },
  { id:'ITM_TOME_NAMDU', name:'비법서 『남두의 권』', icon:'📕', category:'마법서',
    effect:'남두의 권(T3) 해금 비법서. 힘 50↑ 필요', currency:'금화(고가)', essence:'-',
    sources:['뒷골목 암시장 (힘 50↑)'],
    desc:'권법의 비전을 담은 책. 충분한 힘을 갖춘 자만이 그 한 수를 펼칠 수 있다.' },

  // ===== 유일무기 — 증기 갑주병 =====
  { id:'ITM_UNIQ_SHORTSWORD', name:'숏 소드', icon:'⚔️', category:'무기', slot:'무기', unique:'증기 갑주병', tier:1,
    effect:'T1. 어떤 직업이든 착용 가능한 시작 검', currency:'-', essence:'-', sources:['직업 시작 장비(증기 갑주병)'],
    modelPath:'/static/models/items/short-sword.glb',
    desc:'증기 갑주병의 표준 지급검. 누구나 쥘 수 있는 균형 잡힌 한 자루.',
   },
  { id:'ITM_UNIQ_BROADSWORD', name:'증기 브로드소드', icon:'⚔️', category:'무기', slot:'무기', unique:'증기 갑주병', tier:2,
    effect:'T2. 가압 노심 장착 시 숏 소드에서 자동 업그레이드', currency:'-', essence:'-', sources:['가압 노심 장착 시 자동 업그레이드'],
    modelPath:'/static/models/items/steam-broadsword.glb',
    desc:'가압 노심으로 증기를 모아 묵직한 일격을 내지른다.' },
  { id:'ITM_UNIQ_SABER', name:'영석 세이버', icon:'⚔️', category:'무기', slot:'무기', unique:'증기 갑주병', tier:3,
    effect:'T3. 제국 군용 각인. 군용도면 입수 후 해금', currency:'-', essence:'-', sources:['가일 대화 중 군용도면 획득 (제국 주둔소)'],
    modelPath:'/static/models/items/essence-saber.glb',
    desc:'제국 군용 각인이 새겨진 영석 칼날. 베는 궤적마다 푸른 빛이 흐른다.' },

  // ===== 유일무기 — 변경 탐사꾼 =====
  { id:'ITM_UNIQ_DAGGER', name:'대거', icon:'🗡️', category:'무기', slot:'무기', unique:'변경 탐사꾼', tier:1,
    effect:'T1. 어떤 직업이든 착용 가능한 시작 단검', currency:'-', essence:'-', sources:['직업 시작 장비(변경 탐사꾼)'],
    modelPath:'/static/models/items/explorer-dagger.glb',
    desc:'변경 탐사꾼의 기본 단검. 가볍고 빠르며 어디에나 어울린다.' },
  { id:'ITM_UNIQ_TWINDAGGER', name:'톱니 쌍단검', icon:'🗡️', category:'무기', slot:'무기', unique:'변경 탐사꾼', tier:2,
    effect:'T2. 맞물림 기어 장착 시 대거에서 자동 업그레이드', currency:'-', essence:'-', sources:['맞물림 기어 장착 시 자동 업그레이드'],
    modelPath:'/static/models/items/twin-dagger.glb',
    desc:'맞물림 기어로 회전하는 양손 톱니 칼. 베고 찢는 데 능하다.' },
  { id:'ITM_UNIQ_FOXFANG', name:'여우의 송곳니', icon:'🗡️', category:'무기', slot:'무기', unique:'변경 탐사꾼', tier:3,
    effect:'T3. 린 우호도가 높은 상태에서 대화로 해금', currency:'-', essence:'-', sources:['린 우호도 높을 때 대화 (여관)'],
    modelPath:'/static/models/items/fox-fang.glb',
    desc:'영정으로 벼린 비수. 은신과 기습에 특화된 탐사꾼의 유일검.' },

  // ===== 유일무기 — 메카닉 =====
  { id:'ITM_UNIQ_CROWHAMMER', name:'크로우해머', icon:'🔨', category:'무기', slot:'무기', unique:'메카닉', tier:1,
    effect:'T1. 어떤 직업이든 착용 가능한 시작 해머', currency:'-', essence:'-', sources:['직업 시작 장비(메카닉)'],
    modelPath:'/static/models/items/crow-hammer.glb', model3d:{ rotation:[0.25, -0.6, 0] },
    desc:'메카닉의 만능 해머. 못을 박고 머리를 부수는 데 모두 쓰인다.' },
  { id:'ITM_UNIQ_PISTONHAMMER', name:'피스톤 해머', icon:'🔨', category:'무기', slot:'무기', unique:'메카닉', tier:2,
    effect:'T2. 유압 실린더 구매 후 즉시 업그레이드(메카닉 한정)', currency:'-', essence:'-', sources:['유압 실린더 구매 후 즉시 업그레이드'],
    modelPath:'/static/models/items/piston-hammer.glb',
    desc:'유압 실린더가 박힌 망치. 닿는 순간 충격이 두 배로 터진다.' },
  { id:'ITM_UNIQ_PILEBUNKER', name:'영석 파일벙커', icon:'🔩', category:'무기', slot:'무기', unique:'메카닉', tier:3,
    effect:'T3. 설계도면 입수 후 해금', currency:'-', essence:'-', sources:['광산 탐색 중 저확률 설계도면 획득 (폐광 구역)'],
    modelPath:'/static/models/items/pile-bunker.glb',
    desc:'팔에 고정하는 말뚝타격기. 단 한 방에 모든 출력을 쏟는다.' },

  // ===== 유일무기 — 영석 인파이터 =====
  { id:'ITM_UNIQ_GAUNTLET', name:'기계 건틀릿', icon:'🥊', category:'무기', slot:'무기', unique:'영석 인파이터', tier:1,
    effect:'T1. 어떤 직업이든 착용 가능한 시작 건틀릿', currency:'-', essence:'-', sources:['직업 시작 장비(영석 인파이터)'],
    modelPath:'/static/models/items/mech-gauntlet.glb',
    desc:'인파이터의 기본 건틀릿. 주먹의 무게를 배로 싣는다.' },
  { id:'ITM_UNIQ_SHOCKGAUNTLET', name:'충격 건틀릿', icon:'🥊', category:'무기', slot:'무기', unique:'영석 인파이터', tier:2,
    effect:'T2. 충격 코일 장착 시 기계 건틀릿에서 자동 업그레이드', currency:'-', essence:'-', sources:['충격 코일 장착 시 자동 업그레이드'],
    desc:'충격 코일을 감은 건틀릿. 가압 분사로 연타가 무겁게 박힌다.' },
  { id:'ITM_UNIQ_NAMDU', name:'남두의 권', icon:'👊', category:'무기', slot:'무기', unique:'영석 인파이터', tier:3,
    effect:'T3. 비법서 『남두의 권』 습득으로 해금', currency:'-', essence:'-', sources:['힘 50↑ 상태에서 비법서 구입 (뒷골목 암시장)'],
    desc:'비법서로 전수되는 권법의 정수. 맨주먹으로 하늘을 가른다.' },

  // ===== 유일무기 — 영석 연금술사 =====
  { id:'ITM_UNIQ_REVOLVER', name:'리볼버', icon:'🔫', category:'무기', slot:'무기', unique:'영석 연금술사', tier:1,
    effect:'T1. 어떤 직업이든 착용 가능한 시작 권총', currency:'-', essence:'-', sources:['직업 시작 장비(영석 연금술사)'],
    modelPath:'/static/models/items/alch-revolver.glb',
    desc:'영석 연금술사의 표준 권총. 술식 탄을 여섯 발 장전한다.' },
  { id:'ITM_UNIQ_ESSREVOLVER', name:'영정 리볼버', icon:'🔫', category:'무기', slot:'무기', unique:'영석 연금술사', tier:2,
    effect:'T2. 공명 약실 장착 시 리볼버에서 자동 업그레이드', currency:'-', essence:'소량', sources:['공명 약실 장착 시 자동 업그레이드'],
    modelPath:'/static/models/items/essence-revolver.glb',
    desc:'공명 약실로 영정을 점화해 탄알에 술식을 싣는다.' },
  { id:'ITM_UNIQ_ARIA', name:'아리아 리볼버', icon:'🔫', category:'무기', slot:'무기', unique:'영석 연금술사', tier:3,
    effect:'T3. 마르타 우호도가 높은 상태에서 대화로 해금', currency:'-', essence:'소량', sources:['마르타 우호도 높을 때 대화 (산기슭 오두막)'],
    modelPath:'/static/models/items/aria-revolver.glb',
    desc:'마르타가 전한 명품 권총. 방아쇠를 당길 때마다 한 소절이 울린다.' },

  // ===== T2 해금 부품 =====
  { id:'ITM_UNL_CORE', name:'가압 노심', icon:'🔘', category:'부품',
    effect:'증기 브로드소드 해금 부품. 장착 시 자동 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    desc:'증기를 압축해 모으는 심장부. 숏 소드에 장착하면 증기 브로드소드로 거듭난다.' },
  { id:'ITM_UNL_GEAR', name:'맞물림 기어', icon:'⚙️', category:'부품',
    effect:'톱니 쌍단검 해금 부품. 장착 시 자동 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    modelPath:'/static/models/items/gear-mesh.glb',
    desc:'칼날을 회전시키는 정밀 기어. 대거에 장착하면 톱니 쌍단검이 된다.' },
  { id:'ITM_UNL_CYLINDER', name:'유압 실린더', icon:'🛢️', category:'부품',
    effect:'피스톤 해머 해금 부품. 메카닉은 구매 후 즉시 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    desc:'충격을 증폭하는 유압 장치. 크로우해머를 피스톤 해머로 바꾼다.' },
  { id:'ITM_UNL_COIL', name:'충격 코일', icon:'🌀', category:'부품',
    effect:'충격 건틀릿 해금 부품. 장착 시 자동 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    desc:'반동을 감아 되쏘는 코일. 기계 건틀릿을 충격 건틀릿으로 강화한다.' },
  { id:'ITM_UNL_CHAMBER', name:'공명 약실', icon:'🔩', category:'부품',
    effect:'영정 리볼버 해금 부품. 장착 시 자동 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    modelPath:'/static/models/items/resonance-chamber.glb',
    desc:'영정을 점화하는 개조 약실. 리볼버를 영정 리볼버로 거듭나게 한다.' },

  // ===== 머리 장비 =====
  { id:'ITM_HEAD_GOT', name:'동양식 모자(갓/삿갓)', icon:'👒', category:'장비', slot:'머리',
    effect:'머리 장비', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'챙 넓은 동양식 모자. 비와 햇빛, 그리고 시선을 가린다.' },
  { id:'ITM_HEAD_IMPCAP', name:'제국군 정모', icon:'🧢', category:'장비', slot:'머리',
    effect:'머리 장비', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'제국 영석공사 병사의 정모. 쓰고 있으면 통행이 수월하다.' },
  { id:'ITM_HEAD_GEARGLASS', name:'톱니 안경', icon:'👓', category:'장비', slot:'머리',
    effect:'머리 장비', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'배율 렌즈를 끼운 기계공 안경. 정밀 작업에 유용하다.' },
  { id:'ITM_HEAD_WITCHHAT', name:'마녀 모자', icon:'🧙', category:'장비', slot:'머리',
    effect:'머리 장비', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'끝이 뾰족한 마녀 모자. 술식사들이 즐겨 쓴다.' },
  { id:'ITM_HEAD_DOCMASK', name:'의사 가면', icon:'🎭', category:'장비', slot:'머리',
    effect:'머리 장비', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'부리 모양의 역병 의사 가면. 안개와 독기를 걸러 준다.' },

  // ===== 몸통 장비 =====
  { id:'ITM_BODY_STEAMPLATE', name:'증기 흉갑', icon:'🛡️', category:'장비', slot:'몸통',
    effect:'몸통 장비', currency:'금화', essence:'-', sources:['상점','탐색'],
    stats:{ 방어:5, 힘:1, 민첩:-1 },
    desc:'증기 배관을 두른 중장 흉갑. 묵직한 만큼 든든하다.' },
  { id:'ITM_BODY_ROBE', name:'영정 술식 로브', icon:'🧥', category:'장비', slot:'몸통',
    effect:'몸통 장비', currency:'금화', essence:'소량', sources:['상점','탐색'],
    desc:'영정 실을 짜 넣은 로브. 술식 효율을 높여 준다.' },
  { id:'ITM_BODY_HAZMAT', name:'영석 방호복', icon:'🥼', category:'장비', slot:'몸통',
    effect:'몸통 장비', currency:'금화', essence:'-', sources:['상점','탐색'],
    desc:'영석 분진을 막는 방호복. 갱도 심부 탐사에 적합하다.' },
  { id:'ITM_BODY_IMPUNIFORM', name:'제국군 제복', icon:'🎽', category:'장비', slot:'몸통',
    effect:'몸통 장비', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'제국 영석공사 제복. 입고 있으면 신분을 의심받지 않는다.' },
  { id:'ITM_BODY_HANBOK', name:'동양식 의복(두루마기류)', icon:'👘', category:'장비', slot:'몸통',
    effect:'몸통 장비', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'품이 넉넉한 두루마기. 가볍고 움직임이 자유롭다.' },
  { id:'ITM_BODY_DOCCOAT', name:'의사복', icon:'🥼', category:'장비', slot:'몸통',
    effect:'몸통 장비', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'진료소에서 빌린 의사 가운. 어딘가 익숙한 냄새가 난다.' },
]

// 무기 스탯 자동 산정 — 명시 stats가 없으면 티어로 공격력/피해를 매긴다.
//   T1 +3(2-4) / T2 +6(4-7) / T3 +10(6-11) / 티어 없는 무기 +2(2-4)
function deriveStats(r) {
  if (r.stats) return r.stats
  const isWeapon = r.category === '무기' || r.slot === '무기'
  if (!isWeapon) return null
  const t = r.tier || 0
  const atk = t === 3 ? 10 : t === 2 ? 6 : t === 1 ? 3 : 2
  return { '무기 공격력': atk, 피해: `${atk}-${atk + 3}` }
}

// ---- 정규화: 평면 필드 → 객체 ----
export const ITEMS = Object.fromEntries(
  RAW.map((r) => {
    const { currency, essence, ...rest } = r
    return [r.id, { slot: null, unique: null, tier: null, ...rest, stats: deriveStats(r), price: { currency, essence } }]
  })
)

// 아이템 스탯 → 표시용 [라벨, 값] 목록. 숫자 양수는 +표기.
export const statEntries = (it) => {
  if (!it?.stats) return []
  return Object.entries(it.stats).map(([k, v]) => {
    const val = typeof v === 'number' ? (v > 0 ? `+${v}` : `${v}`) : v
    return [k, val]
  })
}

// 시트 순서 그대로의 목록
export const ITEM_LIST = RAW.map((r) => ITEMS[r.id])

// ---- 헬퍼 ----
export const getItem = (id) => ITEMS[id] || null

// 가격 표시 문자열 ('금화 · 영정 소량' / 화폐가 '-'면 빈 문자열)
export const priceLabel = (it) => {
  if (!it || it.price.currency === '-') return ''
  return it.price.essence && it.price.essence !== '-'
    ? `${it.price.currency} · 영정 ${it.price.essence}`
    : it.price.currency
}

// 분류 표시 문자열 ('장비 · 머리' / '무기 · T2 · 증기 갑주병')
export const categoryLabel = (it) => {
  if (!it) return ''
  let s = it.category
  if (it.slot) s += ` · ${it.slot}`
  if (it.tier) s += ` · T${it.tier}`
  if (it.unique) s += ` · ${it.unique}`
  return s
}

// 상점에 풀리는 아이템만
export const shopItems = () => ITEM_LIST.filter((it) => it.sources.some((s) => s.includes('상점')))
