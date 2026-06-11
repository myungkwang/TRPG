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
    desc:'늘 부족한 핵심 자원. 화폐이자 술식의 매개이며, 좀처럼 상점에 풀리지 않는다.' },
  { id:'ITM_LANTERN', name:'영석 등불', icon:'🏮', category:'소모품',
    effect:'어둠을 밝힘', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'갱도를 밝히는 영석 등불. 안갯속에서도 좀처럼 꺼지지 않는다.' },
  { id:'ITM_ROPE', name:'밧줄', icon:'🪢', category:'소모품',
    effect:'지형 통과, 구출', currency:'동화', essence:'-', sources:['상점'],
    desc:'튼튼하게 꼰 밧줄. 끊긴 다리나 수직 갱도에서 길을 잇는다. (지형 통과 판정 일회성 자동 성공)' },
  { id:'ITM_WPN_OLD_PISTOL_3D', name:'낡은 권총', icon:'🔫', category:'무기', slot:'무기',
    effect:'공격력 +2', attackBonus:2, modelPath:'/static/models/weapons/old-revolver.glb',
    currency:'-', essence:'-', sources:['보유'],
    desc:'낡고 닳은 리볼버. 성능은 낮지만 손에 익은 금속의 무게가 있다.' },
  { id:'ITM_WPN_ARIA_REVOLVER_3D', name:'아리아 리볼버', icon:'🔫', category:'무기', slot:'무기',
    effect:'공격력 +8', attackBonus:8, modelPath:'/static/models/weapons/aria-revolver.glb',
    currency:'-', essence:'-', sources:['보유'],
    desc:'정교한 장식과 안정적인 약실을 갖춘 명품 리볼버.' },
  { id:'ITM_WPN_GUN_3D', name:'gun', icon:'🔫', category:'무기', slot:'무기',
    effect:'공격력 +12', attackBonus:12, modelPath:'/static/models/weapons/gun.glb',
    currency:'-', essence:'-', sources:['보유'],
    desc:'강한 화력을 내는 현대식 총기. 단순하지만 위력적이다.' },

  // ===== 회복류 =====
  { id:'ITM_HP_AMPLE_LOW', name:'HP앰플(저가형)', icon:'🧪', category:'소모품',
    effect:'HP 소량 회복', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'영석 가루를 녹인 응급 앰플. HP를 조금 회복한다.' },
  { id:'ITM_HP_AMPLE_HIGH', name:'HP앰플(고급형)', icon:'❤️', category:'소모품',
    effect:'HP 대량 회복', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'정제 영석을 농축한 앰플. HP를 크게 회복한다.' },
  { id:'ITM_MP_AMPLE_LOW', name:'MP앰플(저가형)', icon:'🔹', category:'소모품',
    effect:'MP 소량 회복', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'옅은 영정수를 담은 앰플. MP를 조금 회복한다.' },
  { id:'ITM_MP_AMPLE_HIGH', name:'MP앰플(고급형)', icon:'🔷', category:'소모품',
    effect:'MP 대량 회복', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'농축 영정수를 담은 앰플. MP를 크게 회복한다.' },
  { id:'ITM_STAMINA', name:'스태미나 강장제', icon:'🍶', category:'소모품',
    effect:'스태미나 회복', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'쓴 약초를 우린 강장제. 지친 몸의 스태미나를 되살린다.' },

  // ===== 장비 (액세서리 / 슬롯 무기·머리) =====
  { id:'ITM_WPN_ARM', name:'술식 의수', icon:'🦾', category:'장비', slot:'무기',
    effect:'마법 발사 보조 (술식기계)', currency:'금화', essence:'소량', sources:['상점','퀘스트'],
    desc:'영정을 동력으로 삼는 기계 의수. 술식을 손끝에서 직접 쏘아 보낸다.' },
  { id:'ITM_HEAD_GOGGLE', name:'영정 고글', icon:'🥽', category:'장비', slot:'머리',
    effect:'숨은 단서 감지 (간파 보조)', currency:'금화', essence:'-', sources:['퀘스트'],
    desc:'영정 렌즈를 끼운 고글. 안개 너머와 숨겨진 흔적을 드러낸다.' },
  { id:'ITM_PART', name:'술식 강화 부품', icon:'⚙️', category:'장비',
    effect:'술식기계 출력 강화', currency:'은화', essence:'소량', sources:['상점','탐색'],
    desc:'술식기계에 끼워 출력을 끌어올리는 정밀 부품.' },
  { id:'ITM_CHARM_GEAR', name:'톱니 부적', icon:'🧿', category:'장비',
    effect:'기계 관련 장비 전투 보정 / 유지', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'증기 장인이 만든 부적. 기계 장비를 다룰 때 전투 보정을 준다.' },
  { id:'ITM_COMPASS', name:'안개 나침반', icon:'🧭', category:'장비',
    effect:'방향 관련 판정 보정 / 유지', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'안갯속에서도 방향을 가리키는 나침반. 길 찾기 판정에 유리하다.' },

  // ===== 마법서 =====
  { id:'ITM_TOME', name:'마법서', icon:'📖', category:'마법서',
    effect:'영정을 매개로 하는 마법 습득', currency:'금화', essence:'-', sources:['상점','탐색'],
    desc:'술식의 구문이 적힌 책. 영정을 매개로 새로운 마법을 익힌다.' },
  { id:'ITM_TOME_NAMDU', name:'비법서 『남두의 권』', icon:'📕', category:'마법서',
    effect:'남두의 권(T3) 해금 비법서. 힘 50↑ 필요', currency:'금화(고가)', essence:'-',
    sources:['뒷골목 암시장 (힘 50↑)'],
    desc:'권법의 비전을 담은 책. 충분한 힘을 갖춘 자만이 그 한 수를 펼칠 수 있다.' },

  // ===== 유일무기 — 증기 갑주병 =====
  { id:'ITM_UNIQ_SHORTSWORD', name:'숏 소드', icon:'⚔️', category:'무기', slot:'무기', unique:'증기 갑주병', tier:1,
    effect:'T1. 어떤 직업이든 착용 가능한 시작 검', currency:'-', essence:'-', sources:['직업 시작 장비(증기 갑주병)'],
    desc:'증기 갑주병의 표준 지급검. 누구나 쥘 수 있는 균형 잡힌 한 자루.' },
  { id:'ITM_UNIQ_BROADSWORD', name:'증기 브로드소드', icon:'⚔️', category:'무기', slot:'무기', unique:'증기 갑주병', tier:2,
    effect:'T2. 가압 노심 장착 시 숏 소드에서 자동 업그레이드', currency:'-', essence:'-', sources:['가압 노심 장착 시 자동 업그레이드'],
    desc:'가압 노심으로 증기를 모아 묵직한 일격을 내지른다.' },
  { id:'ITM_UNIQ_SABER', name:'영석 세이버', icon:'⚔️', category:'무기', slot:'무기', unique:'증기 갑주병', tier:3,
    effect:'T3. 제국 군용 각인. 군용도면 입수 후 해금', currency:'-', essence:'-', sources:['가일 대화 중 군용도면 획득 (제국 주둔소)'],
    desc:'제국 군용 각인이 새겨진 영석 칼날. 베는 궤적마다 푸른 빛이 흐른다.' },

  // ===== 유일무기 — 변경 탐사꾼 =====
  { id:'ITM_UNIQ_DAGGER', name:'대거', icon:'🗡️', category:'무기', slot:'무기', unique:'변경 탐사꾼', tier:1,
    effect:'T1. 어떤 직업이든 착용 가능한 시작 단검', currency:'-', essence:'-', sources:['직업 시작 장비(변경 탐사꾼)'],
    desc:'변경 탐사꾼의 기본 단검. 가볍고 빠르며 어디에나 어울린다.' },
  { id:'ITM_UNIQ_TWINDAGGER', name:'톱니 쌍단검', icon:'🗡️', category:'무기', slot:'무기', unique:'변경 탐사꾼', tier:2,
    effect:'T2. 맞물림 기어 장착 시 대거에서 자동 업그레이드', currency:'-', essence:'-', sources:['맞물림 기어 장착 시 자동 업그레이드'],
    desc:'맞물림 기어로 회전하는 양손 톱니 칼. 베고 찢는 데 능하다.' },
  { id:'ITM_UNIQ_FOXFANG', name:'여우의 송곳니', icon:'🗡️', category:'무기', slot:'무기', unique:'변경 탐사꾼', tier:3,
    effect:'T3. 린 우호도가 높은 상태에서 대화로 해금', currency:'-', essence:'-', sources:['린 우호도 높을 때 대화 (여관)'],
    desc:'영정으로 벼린 비수. 은신과 기습에 특화된 탐사꾼의 유일검.' },

  // ===== 유일무기 — 메카닉 =====
  { id:'ITM_UNIQ_CROWHAMMER', name:'크로우해머', icon:'🔨', category:'무기', slot:'무기', unique:'메카닉', tier:1,
    effect:'T1. 어떤 직업이든 착용 가능한 시작 해머', currency:'-', essence:'-', sources:['직업 시작 장비(메카닉)'],
    desc:'메카닉의 만능 해머. 못을 박고 머리를 부수는 데 모두 쓰인다.' },
  { id:'ITM_UNIQ_PISTONHAMMER', name:'피스톤 해머', icon:'🔨', category:'무기', slot:'무기', unique:'메카닉', tier:2,
    effect:'T2. 유압 실린더 구매 후 즉시 업그레이드(메카닉 한정)', currency:'-', essence:'-', sources:['유압 실린더 구매 후 즉시 업그레이드'],
    desc:'유압 실린더가 박힌 망치. 닿는 순간 충격이 두 배로 터진다.' },
  { id:'ITM_UNIQ_PILEBUNKER', name:'영석 파일벙커', icon:'🔩', category:'무기', slot:'무기', unique:'메카닉', tier:3,
    effect:'T3. 설계도면 입수 후 해금', currency:'-', essence:'-', sources:['광산 탐색 중 저확률 설계도면 획득 (폐광 구역)'],
    desc:'팔에 고정하는 말뚝타격기. 단 한 방에 모든 출력을 쏟는다.' },

  // ===== 유일무기 — 영석 인파이터 =====
  { id:'ITM_UNIQ_GAUNTLET', name:'기계 건틀릿', icon:'🥊', category:'무기', slot:'무기', unique:'영석 인파이터', tier:1,
    effect:'T1. 어떤 직업이든 착용 가능한 시작 건틀릿', currency:'-', essence:'-', sources:['직업 시작 장비(영석 인파이터)'],
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
    desc:'영석 연금술사의 표준 권총. 술식 탄을 여섯 발 장전한다.' },
  { id:'ITM_UNIQ_ESSREVOLVER', name:'영정 리볼버', icon:'🔫', category:'무기', slot:'무기', unique:'영석 연금술사', tier:2,
    effect:'T2. 공명 약실 장착 시 리볼버에서 자동 업그레이드', currency:'-', essence:'소량', sources:['공명 약실 장착 시 자동 업그레이드'],
    desc:'공명 약실로 영정을 점화해 탄알에 술식을 싣는다.' },
  { id:'ITM_UNIQ_ARIA', name:'아리아 리볼버', icon:'🔫', category:'무기', slot:'무기', unique:'영석 연금술사', tier:3,
    effect:'T3. 마르타 우호도가 높은 상태에서 대화로 해금', currency:'-', essence:'소량', sources:['마르타 우호도 높을 때 대화 (산기슭 오두막)'],
    desc:'마르타가 전한 명품 권총. 방아쇠를 당길 때마다 한 소절이 울린다.' },

  // ===== T2 해금 부품 =====
  { id:'ITM_UNL_CORE', name:'가압 노심', icon:'🔘', category:'부품',
    effect:'증기 브로드소드 해금 부품. 장착 시 자동 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    desc:'증기를 압축해 모으는 심장부. 숏 소드에 장착하면 증기 브로드소드로 거듭난다.' },
  { id:'ITM_UNL_GEAR', name:'맞물림 기어', icon:'⚙️', category:'부품',
    effect:'톱니 쌍단검 해금 부품. 장착 시 자동 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    desc:'칼날을 회전시키는 정밀 기어. 대거에 장착하면 톱니 쌍단검이 된다.' },
  { id:'ITM_UNL_CYLINDER', name:'유압 실린더', icon:'🛢️', category:'부품',
    effect:'피스톤 해머 해금 부품. 메카닉은 구매 후 즉시 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    desc:'충격을 증폭하는 유압 장치. 크로우해머를 피스톤 해머로 바꾼다.' },
  { id:'ITM_UNL_COIL', name:'충격 코일', icon:'🌀', category:'부품',
    effect:'충격 건틀릿 해금 부품. 장착 시 자동 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    desc:'반동을 감아 되쏘는 코일. 기계 건틀릿을 충격 건틀릿으로 강화한다.' },
  { id:'ITM_UNL_CHAMBER', name:'공명 약실', icon:'🔩', category:'부품',
    effect:'영정 리볼버 해금 부품. 장착 시 자동 업그레이드', currency:'고가(상점 희소)', essence:'-', sources:['상점(낮은 확률)','대장간 방문'],
    desc:'영정을 점화하는 개조 약실. 리볼버를 영정 리볼버로 거듭나게 한다.' },

  // ===== 일반 무기 — 낡은(시작 보급, 성장률 약간 높음) =====
  { id:'ITM_WPN_OLDDAGGER', name:'낡은 단검', icon:'🗡️', category:'무기', slot:'무기',
    effect:'단검류. 티어 무기보다 스탯 상승률이 약간 높음', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'오래 써 손에 익은 단검. 화려하진 않지만 키우는 맛이 있다.' },
  { id:'ITM_WPN_OLDSWORD', name:'낡은 직검', icon:'⚔️', category:'무기', slot:'무기',
    effect:'직검류. 티어 무기보다 스탯 상승률이 약간 높음', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'이가 나간 직검. 손질하며 쓰면 의외로 오래 간다.' },
  { id:'ITM_WPN_OLDREVOLVER', name:'낡은 리볼버', icon:'🔫', category:'무기', slot:'무기',
    effect:'권총류. 티어 무기보다 스탯 상승률이 약간 높음', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'녹슨 리볼버. 방아쇠는 뻑뻑해도 탄알은 곧게 나간다.' },
  { id:'ITM_WPN_OLDGAUNTLET', name:'낡은 건틀릿', icon:'🥊', category:'무기', slot:'무기',
    effect:'건틀릿류. 티어 무기보다 스탯 상승률이 약간 높음', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'가죽이 닳은 건틀릿. 주먹에 익숙해질수록 단단해진다.' },
  { id:'ITM_WPN_OLDHAMMER', name:'낡은 해머', icon:'🔨', category:'무기', slot:'무기',
    effect:'해머류. 티어 무기보다 스탯 상승률이 약간 높음', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'자루가 헐거운 해머. 그래도 한 방의 무게는 여전하다.' },
  { id:'ITM_WPN_OLDSTAFF', name:'낡은 지팡이', icon:'🪄', category:'무기', slot:'무기',
    effect:'지팡이류. 티어 무기보다 스탯 상승률이 약간 높음', currency:'동화', essence:'-', sources:['상점','탐색'],
    desc:'칠이 벗겨진 지팡이. 영정을 흘려보내면 아직도 빛을 낸다.' },

  // ===== 일반 무기 — 근접/원거리 =====
  { id:'ITM_WPN_RAPIER', name:'레이피어', icon:'🤺', category:'무기', slot:'무기',
    effect:'찌르기 특화 세검', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'가늘고 긴 세검. 빠른 찌르기에 능하다.' },
  { id:'ITM_WPN_ESTOC', name:'에스톡', icon:'⚔️', category:'무기', slot:'무기',
    effect:'갑옷 관통 직검', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'단단한 갑옷을 꿰뚫기 위한 송곳 같은 직검.' },
  { id:'ITM_WPN_HYEOPCHA', name:'협차', icon:'🗡️', category:'무기', slot:'무기',
    effect:'양손 단병기', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'양손에 나눠 쥐는 동양식 단병기. 짧지만 매섭다.' },
  { id:'ITM_WPN_HANDAXE', name:'핸드 액스', icon:'🪓', category:'무기', slot:'무기',
    effect:'편수 도끼', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'한 손 도끼. 던지기에도, 패는 데도 쓸 만하다.' },
  { id:'ITM_WPN_MACE', name:'메이스', icon:'🔨', category:'무기', slot:'무기',
    effect:'타격 둔기', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'묵직한 머리를 단 둔기. 갑옷 위로도 충격을 전한다.' },
  { id:'ITM_WPN_MORNINGSTAR', name:'모닝스타', icon:'🌟', category:'무기', slot:'무기',
    effect:'가시 둔기', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'가시 박힌 철구. 휘두를 때마다 둔탁한 소리가 난다.' },
  { id:'ITM_WPN_TONFA', name:'톤파', icon:'🥋', category:'무기', slot:'무기',
    effect:'방어형 봉', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'손잡이가 직각으로 달린 봉. 막고 치는 데 두루 능하다.' },
  { id:'ITM_WPN_HANDWRAP', name:'핸드랩', icon:'🥊', category:'무기', slot:'무기',
    effect:'권투용 붕대', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'주먹에 감는 단단한 붕대. 맨손 타격을 보강한다.' },
  { id:'ITM_WPN_SHORTBOW', name:'숏 보우', icon:'🏹', category:'무기', slot:'무기',
    effect:'단궁', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'다루기 쉬운 짧은 활. 좁은 갱도에서도 쏘기 좋다.' },

  // ===== 일반 무기 — 지팡이류 =====
  { id:'ITM_WPN_STAFF_METEOR', name:'운석 지팡이', icon:'☄️', category:'무기', slot:'무기',
    effect:'마법 지팡이', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'운석 조각을 박은 지팡이. 떨어지는 불을 부른다는 소문이 있다.' },
  { id:'ITM_WPN_STAFF_ESSENCE', name:'영석 지팡이', icon:'🪄', category:'무기', slot:'무기',
    effect:'마법 지팡이', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'영석을 끼운 표준 술식 지팡이. 영정 효율이 무난하다.' },
  { id:'ITM_WPN_STAFF_SPIRITWOOD', name:'영목의 가지', icon:'🌿', category:'무기', slot:'무기',
    effect:'마법 지팡이', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'살아 있는 영목에서 꺾은 가지. 술식과 함께 잎이 떨린다.' },
  { id:'ITM_WPN_STAFF_BROOM', name:'빗자루', icon:'🧹', category:'무기', slot:'무기',
    effect:'마법 지팡이', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'평범해 보이는 빗자루. 술식을 통과시키면 의외로 잘 듣는다.' },
  { id:'ITM_WPN_STAFF_COURT', name:'궁정 지팡이', icon:'🔱', category:'무기', slot:'무기',
    effect:'마법 지팡이', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'화려한 장식의 의례용 지팡이. 보기보다 술식 전도가 좋다.' },
  { id:'ITM_WPN_STAFF_STEAM', name:'증기 지팡이', icon:'🪄', category:'무기', slot:'무기',
    effect:'마법 지팡이', currency:'은화', essence:'-', sources:['상점','탐색'],
    desc:'증기 밸브를 단 지팡이. 술식을 쏘면 김이 뿜어 나온다.' },

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

// ---- 정규화: 평면 필드 → 객체 ----
export const ITEMS = Object.fromEntries(
  RAW.map((r) => {
    const { currency, essence, ...rest } = r
    return [r.id, { slot: null, unique: null, tier: null, ...rest, price: { currency, essence } }]
  })
)

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
