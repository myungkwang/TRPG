import Phaser from 'phaser'

<<<<<<< HEAD
const TYPES = [
  { icon: '⚔', name: '전투' },
  { icon: '?', name: '미지' },
  { icon: '✦', name: '이벤트' },
  { icon: '$', name: '상점' },
]
=======
// 발판 종류 — 밟기 전엔 전부 '?'(미지)로 보이고, 도착(밟음) 시 정체가 드러남
const NODE_KINDS = {
  battle:  { icon: '⚔', name: '전투' },
  event:   { icon: '✦', name: '이벤트' },
  shop:    { icon: '$', name: '거래' },
  mystery: { icon: '?', name: '미지' },
  boss:    { icon: '☠', name: '엔딩 · 카르가스' },
}
const RANDOM_KEYS = ['battle', 'event', 'shop', 'mystery']
>>>>>>> main

export default class MapScene extends Phaser.Scene {
  constructor() { super('map') }

<<<<<<< HEAD
  create() {
    this.W = this.scale.width
    this.worldW = this.W
    this.worldH = 3200
=======
  init(data) {
    this.startDepth = (data && data.depth) || 0
    this.onDone = data && data.onDone
    this.dest = (data && data.dest) || null   // 판정/행동 결과로 정해진 도착 발판 종류 키
    this.maxDepth = 5
  }

  create() {
    this.W = this.scale.width
    this.H = this.scale.height
    this.worldW = this.W
    this.worldH = Math.max(this.H, 640)
>>>>>>> main
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH)
    this.cameras.main.setBackgroundColor('#11161b')

    const bg = this.add.graphics()
    bg.fillGradientStyle(0x1a232c, 0x1a232c, 0x2b3a46, 0x2b3a46, 1)
    bg.fillRect(0, 0, this.worldW, this.worldH)

<<<<<<< HEAD
    this.depth = 0
    this.maxDepth = 5
    this.cx = this.worldW / 2
    const startY = this.worldH - 220

    this.nodeLayer = this.add.layer()
    this.edgeLayer = this.add.layer()

    this.current = this.makeNode(this.cx, startY, { icon: '', name: '진행중' }, true)
    this.spawnCandidates(this.current)

    this.cameras.main.scrollY = startY - this.scale.height * 0.78

    // 상단 어둠(미발견 영역) + 움직이는 안개
    const dark = this.add.graphics().setScrollFactor(0)
    dark.fillGradientStyle(0x11161b, 0x11161b, 0x11161b, 0x11161b, 0.94, 0.94, 0, 0)
    dark.fillRect(0, 0, this.W, 210)
    this.makeFog()
  }

=======
    this.depth = this.startDepth
    this.finished = false
    this.cx = this.worldW / 2
    const startY = this.worldH - 150

    this.edgeLayer = this.add.layer()   // 엣지를 먼저(아래) → 노드/말 뒤에 깔림
    this.nodeLayer = this.add.layer()

    this.current = this.makeNode(this.cx, startY, { icon: '', name: '현재 위치' }, true, false)
    this.spawnCandidates(this.current)

    this.cameras.main.scrollY = Phaser.Math.Clamp(startY - this.H * 0.72, 0, this.worldH - this.H)

    const dark = this.add.graphics().setScrollFactor(0)
    dark.fillGradientStyle(0x11161b, 0x11161b, 0x11161b, 0x11161b, 0.94, 0.94, 0, 0)
    dark.fillRect(0, 0, this.W, 180)
    this.makeFog()
  }

  // 한 걸음 완료 → React로 결과 전달(맵이 닫히고 대화로 복귀)
  // slot = 도착 발판의 좌우 위치(-1 왼쪽 / 0 가운데 / 1 오른쪽), siblingSlots = 안 간 갈림길 위치들
  finish(ending, kind, slot, siblingSlots) {
    if (this.finished) return
    this.finished = true
    this.onDone && this.onDone({ depth: this.depth + 1, ending, kind, slot, siblingSlots })
  }

>>>>>>> main
  makeFog() {
    if (!this.textures.exists('fogblob')) {
      const g = this.make.graphics({ add: false })
      for (let r = 150; r > 0; r -= 6) { g.fillStyle(0xc8d2dc, 0.03); g.fillCircle(150, 150, r) }
      g.generateTexture('fogblob', 300, 300); g.destroy()
    }
    this.fog = this.add.container(0, 0).setScrollFactor(0).setDepth(60)
<<<<<<< HEAD
    for (let i = 0; i < 10; i++) {
      const x = (i / 9) * this.W + Phaser.Math.Between(-40, 40)
      const y = Phaser.Math.Between(55, 205)
=======
    for (let i = 0; i < 9; i++) {
      const x = (i / 8) * this.W + Phaser.Math.Between(-40, 40)
      const y = Phaser.Math.Between(45, 175)
>>>>>>> main
      const sp = this.add.image(x, y, 'fogblob')
        .setScale(Phaser.Math.FloatBetween(1.1, 2.2))
        .setAlpha(Phaser.Math.FloatBetween(0.4, 0.7))
      this.fog.add(sp)
      this.tweens.add({ targets: sp, x: x + Phaser.Math.Between(25, 70), duration: Phaser.Math.Between(4500, 7500), yoyo: true, repeat: -1, ease: 'Sine.inOut' })
      this.tweens.add({ targets: sp, alpha: sp.alpha * 0.55, duration: Phaser.Math.Between(2600, 4200), yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    }
  }

  clearFog() {
    if (!this.fog) return
    this.tweens.add({ targets: this.fog, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 1100, ease: 'Cubic.out', onComplete: () => this.fog.setVisible(false) })
  }

  dashed(g, x1, y1, x2, y2, dash, gap, color, w) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy)
    if (len < 1) return
    const ux = dx / len, uy = dy / len, n = Math.floor(len / (dash + gap))
    g.lineStyle(w, color, 0.85)
    for (let i = 0; i <= n; i++) {
      const s = i * (dash + gap), sx = x1 + ux * s, sy = y1 + uy * s
      const e = Math.min(s + dash, len), ex = x1 + ux * e, ey = y1 + uy * e
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.strokePath()
    }
  }

<<<<<<< HEAD
  makeNode(x, y, type, isCurrent) {
    const cont = this.add.container(x, y); this.nodeLayer.add(cont)
    const r = 42
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.35); g.fillEllipse(0, 14, r * 2.1, r * 0.8)
    g.fillStyle(0x9fb0bd, 1); g.fillEllipse(0, 0, r * 2, r * 0.9)
    g.fillStyle(0xc4d2dc, 1); g.fillEllipse(0, -4, r * 2, r * 0.9)
    g.lineStyle(2, 0x6b7d8a, 1); g.strokeEllipse(0, -4, r * 2, r * 0.9)
    cont.add(g)
    const node = { cont, x, y, type, g, r, children: [], isCurrent: false }
    if (type.icon) { const t = this.add.text(0, -10, type.icon, { fontSize: '26px', color: '#2b3a46', fontStyle: 'bold' }).setOrigin(0.5); cont.add(t) }
    const lbl = this.add.text(0, 28, type.name, { fontFamily: '"Gowun Dodum", sans-serif', fontSize: '13px', color: '#dce6ee' }).setOrigin(0.5, 0); cont.add(lbl)
=======
  // 3D 원기둥 발판. hidden이면 '?'(미지)로 표시
  makeNode(x, y, kind, isCurrent, hidden) {
    const cont = this.add.container(x, y); this.nodeLayer.add(cont)
    const r = 42
    const g = this.add.graphics()
    const w = r * 2, hgt = r * 0.9, h = 16
    g.fillStyle(0x000000, 0.32); g.fillEllipse(0, 22, w * 1.08, hgt * 0.95)
    g.fillStyle(0x556672, 1); g.fillEllipse(0, h - 4, w, hgt)
    g.fillStyle(0x6f8190, 1); g.fillRect(-r, -4, w, h)
    g.fillStyle(0xaebcc8, 1); g.fillEllipse(0, -4, w, hgt)
    g.fillStyle(0xccd8e2, 1); g.fillEllipse(0, -7, w * 0.92, hgt * 0.92)
    g.lineStyle(2, 0x46555f, 1); g.strokeEllipse(0, -4, w, hgt)
    cont.add(g)

    const node = { cont, x, y, kind, g, r, hidden: !!hidden, isCurrent: false, children: [] }
    const ic = hidden ? '?' : (kind.icon || '')
    const nm = hidden ? '???' : (kind.name || '')
    node.iconText = this.add.text(0, -10, ic, { fontSize: '26px', color: '#2b3a46', fontStyle: 'bold' }).setOrigin(0.5)
    cont.add(node.iconText)
    node.lblText = this.add.text(0, 28, nm, { fontFamily: '"Gowun Dodum", sans-serif', fontSize: '13px', color: '#dce6ee' }).setOrigin(0.5, 0)
    cont.add(node.lblText)
>>>>>>> main
    if (isCurrent) this.setCurrent(node)
    return node
  }

<<<<<<< HEAD
=======
  // 도착(밟음) 시 발판 정체가 드러남
  reveal(node) {
    if (!node.hidden) return
    node.hidden = false
    node.iconText.setText(node.kind.icon || '')
    node.lblText.setText(node.kind.name || '')
    this.tweens.add({ targets: node.cont, scale: { from: 1.15, to: 1 }, duration: 280, ease: 'Back.out' })
  }

>>>>>>> main
  setCurrent(node) {
    if (this.current) {
      this.current.isCurrent = false
      if (this.current.knight) { this.current.knight.destroy(); this.current.glow.destroy() }
      this.current.cont.setAlpha(0.55)
    }
    node.isCurrent = true; node.cont.setAlpha(1)
    const glow = this.add.graphics(); glow.lineStyle(3, 0x6fd3e6, 0.9); glow.strokeEllipse(0, -4, node.r * 2 + 10, node.r * 0.9 + 8)
    node.cont.add(glow); node.glow = glow
    this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 1 }, yoyo: true, repeat: -1, duration: 800 })
<<<<<<< HEAD
    const k = this.add.text(0, -46, '♞', { fontSize: '48px', color: '#eaf4f8' }).setOrigin(0.5)
    node.cont.add(k); node.knight = k
    this.tweens.add({ targets: k, y: '-=8', yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' })
=======
    const k = this.makeWanderer(); k.setPosition(0, -7)
    node.cont.add(k); node.knight = k
    this.tweens.add({ targets: k, y: '-=6', yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.inOut' })
>>>>>>> main
    this.current = node
  }

  spawnCandidates(from) {
<<<<<<< HEAD
    const STEP = 230
    if (this.depth >= this.maxDepth) {
      const boss = this.makeNode(this.cx, from.y - STEP, { icon: '☠', name: '엔딩 · 카르가스' }, false)
      boss.isEnding = true
      this.linkEdge(from, boss); from.children = [boss]; this.armChoices(from)
      this.clearFog() // 보스 노드 등장 → 안개가 확 걷힘
      return
    }
    const spread = this.worldW * 0.32
    const ny = from.y - STEP
    const xs = [this.cx - spread, this.cx, this.cx + spread]
    from.children = []
    xs.forEach(nx => {
      nx = Phaser.Math.Clamp(nx, 90, this.worldW - 90)
      const type = Phaser.Utils.Array.GetRandom(TYPES)
      const n = this.makeNode(nx, ny, type, false)
      n.cont.setAlpha(0); this.tweens.add({ targets: n.cont, alpha: 1, duration: 600 })
      this.linkEdge(from, n); from.children.push(n)
    })
    this.armChoices(from)
=======
    const STEP = 230, ny = from.y - STEP
    if (this.depth >= this.maxDepth) {
      const boss = this.makeNode(this.cx, ny, NODE_KINDS.boss, false, true)
      boss.isEnding = true
      boss.cont.setAlpha(0); this.tweens.add({ targets: boss.cont, alpha: 1, duration: 500 })
      this.linkEdge(from, boss); from.children = [boss]
      from.dest = boss; from.destSlot = 0; from.siblingSlots = []
    } else {
      const spread = this.worldW * 0.32
      const xs = [this.cx - spread, this.cx, this.cx + spread].map(v => Phaser.Math.Clamp(v, 90, this.worldW - 90))
      const destIdx = Phaser.Math.Between(0, 2)
      const destKind = NODE_KINDS[this.dest] || NODE_KINDS[Phaser.Utils.Array.GetRandom(RANDOM_KEYS)]
      from.children = []
      xs.forEach((nx, i) => {
        const kind = i === destIdx ? destKind : NODE_KINDS[Phaser.Utils.Array.GetRandom(RANDOM_KEYS)]
        const n = this.makeNode(nx, ny, kind, false, true)   // 전부 미지('?')로 표시
        n.cont.setAlpha(0); this.tweens.add({ targets: n.cont, alpha: 1, duration: 500 })
        this.linkEdge(from, n); from.children.push(n)
      })
      from.dest = from.children[destIdx]
      from.destSlot = destIdx - 1                                    // -1/0/1
      from.siblingSlots = [0, 1, 2].filter(k => k !== destIdx).map(k => k - 1)
    }
    // 자동 이동 — 플레이어 선택 없이 결과로 정해진 발판으로 진행
    this.time.delayedCall(850, () => this.autoMove(from))
>>>>>>> main
  }

  linkEdge(a, b) {
    const g = this.add.graphics(); this.edgeLayer.add(g)
    this.dashed(g, a.x, a.y - 8, b.x, b.y + 8, 12, 9, 0xaeb9c4, 2)
<<<<<<< HEAD
    g.setAlpha(0); this.tweens.add({ targets: g, alpha: 1, duration: 600 })
    b.inEdge = g
  }

  armChoices(from) {
    from.children.forEach(child => {
      child.cont.setSize(child.r * 2.2, child.r * 1.8)
      child.cont.setInteractive({ useHandCursor: true })
      child.cont.on('pointerover', () => this.tweens.add({ targets: child.cont, scale: 1.08, duration: 120 }))
      child.cont.on('pointerout', () => this.tweens.add({ targets: child.cont, scale: 1, duration: 120 }))
      child.cont.on('pointerdown', () => this.choose(from, child))
    })
  }

  choose(from, chosen) {
    from.children.forEach(c => c.cont.disableInteractive())
    // 선택 안 한 발판: 붉게 변했다가 삭제
    from.children.filter(c => c !== chosen).forEach(c => {
      c.g.clear(); c.g.fillStyle(0xb85a5a, 1); c.g.fillEllipse(0, -4, c.r * 2, c.r * 0.9)
=======
    g.setAlpha(0); this.tweens.add({ targets: g, alpha: 1, duration: 500 })
    b.inEdge = g
  }

  autoMove(from) {
    if (this.finished) return
    const chosen = from.dest
    const slot = from.destSlot, siblingSlots = from.siblingSlots
    // 선택되지 않은 길: 미지인 채로 사라짐
    from.children.filter(c => c !== chosen).forEach(c => {
>>>>>>> main
      this.tweens.add({ targets: c.cont, alpha: 0, scaleX: 0.6, scaleY: 0.6, duration: 420, ease: 'Back.in', onComplete: () => c.cont.destroy() })
      if (c.inEdge) this.tweens.add({ targets: c.inEdge, alpha: 0, duration: 300, onComplete: () => c.inEdge.destroy() })
    })
    this.setCurrent(chosen)
<<<<<<< HEAD
    this.depth++
    this.tweens.add({
      targets: this.cameras.main, scrollY: Math.max(0, chosen.y - this.scale.height * 0.78),
      duration: 700, ease: 'Sine.inOut',
      onComplete: () => { chosen.isEnding ? this.showEnding(chosen) : this.spawnCandidates(chosen) },
=======
    // 지나온 발판/연결선 숨김
    const prev = from
    const fadeOut = [prev.cont, prev.inEdge, chosen.inEdge].filter(Boolean)
    this.tweens.add({
      targets: fadeOut, alpha: 0, duration: 450, ease: 'Cubic.out',
      onComplete: () => { prev.cont.destroy(); prev.inEdge?.destroy(); chosen.inEdge?.destroy() },
    })
    this.tweens.add({
      targets: this.cameras.main, scrollY: Phaser.Math.Clamp(chosen.y - this.H * 0.72, 0, this.worldH - this.H),
      duration: 700, ease: 'Sine.inOut',
      onComplete: () => {
        this.reveal(chosen)   // 밟음 → 발판 정체가 드러남
        if (chosen.isEnding) { this.clearFog(); this.showEnding(chosen); this.time.delayedCall(1600, () => this.finish(true, chosen.kind.name, slot, siblingSlots)) }
        else this.time.delayedCall(700, () => this.finish(false, chosen.kind.name, slot, siblingSlots))
      },
>>>>>>> main
    })
  }

  // 엔딩 노드: 대표 인물 데포르메 (지금은 플레이스홀더)
  showEnding(node) {
    const drag = this.add.text(node.x, node.y - 150, '🐉', { fontSize: '120px' }).setOrigin(0.5).setAlpha(0)
    const cap = this.add.text(node.x, node.y - 60, '카르가스 (데포르메)', {
      fontFamily: '"Gowun Batang", serif', fontSize: '20px', color: '#eaf4f8',
    }).setOrigin(0.5).setAlpha(0)
<<<<<<< HEAD
    const note = this.add.text(node.x, node.y + 70, '엔딩 노드 도달 — 대표 인물 데포르메 자리', {
      fontFamily: '"Gowun Dodum", sans-serif', fontSize: '14px', color: '#aebac6',
    }).setOrigin(0.5).setAlpha(0)
    this.tweens.add({ targets: [drag, cap, note], alpha: 1, duration: 700 })
    this.tweens.add({ targets: drag, y: '-=14', yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' })
  }
=======
    this.tweens.add({ targets: [drag, cap], alpha: 1, duration: 700 })
    this.tweens.add({ targets: drag, y: '-=14', yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' })
  }

  // 세계관 마커 — 두건 쓴 방랑자(주인공). 망토(원뿔)+두건(원)+영석 지팡이
  makeWanderer() {
    const g = this.add.graphics()
    const P = p => new Phaser.Geom.Point(p[0], p[1])
    const poly = (...ps) => ps.map(P)

    const MID = 0x4a3b2e, LIT = 0x6a5642, SHA = 0x312619, HOOD = 0x2a2016, FACE = 0x0b0704
    const STAFF = 0x5a3f24, GOLD = 0xc9a24b, ESS = 0x7ad0ee

    g.fillStyle(0x000000, 0.28); g.fillEllipse(0, 6, 44, 13)

    g.lineStyle(4, STAFF, 1); g.lineBetween(17, -60, 21, 6)
    g.fillStyle(0x7a5630, 1); g.fillCircle(17, -60, 3)

    const body = poly([-13, -45], [13, -45], [22, -2], [-22, -2])
    const lhalf = poly([-13, -45], [0, -45], [0, -2], [-22, -2])
    const rhalf = poly([0, -45], [13, -45], [22, -2], [0, -2])
    g.fillStyle(MID, 1); g.fillPoints(body, true); g.fillEllipse(0, -2, 46, 15)
    g.fillStyle(LIT, 1); g.fillPoints(lhalf, true)
    g.fillStyle(SHA, 1); g.fillPoints(rhalf, true)
    g.fillStyle(MID, 1); g.fillEllipse(0, 0, 46, 13)
    g.lineStyle(2, GOLD, 0.55); g.strokeEllipse(0, 0, 46, 13)
    g.lineStyle(1.5, 0x140d08, 1); g.strokePoints(body, true, true)

    g.fillStyle(HOOD, 1); g.fillTriangle(-9, -47, 9, -47, 0, -66); g.fillCircle(0, -51, 14)
    g.fillStyle(FACE, 1); g.fillCircle(0, -48, 8)
    g.lineStyle(2.5, LIT, 0.6); g.beginPath(); g.arc(0, -51, 12.5, Math.PI * 1.02, Math.PI * 1.5); g.strokePath()
    g.fillStyle(GOLD, 0.9); g.fillCircle(0, -43, 2.4)

    g.fillStyle(ESS, 0.10); g.fillCircle(17, -63, 13)
    g.fillStyle(ESS, 0.18); g.fillCircle(17, -63, 7)
    g.fillStyle(0x7ad0ee, 0.95); g.fillCircle(17, -63, 3.4)
    g.fillStyle(0xeafaff, 1); g.fillCircle(17, -63, 1.6)
    return g
  }
>>>>>>> main
}
