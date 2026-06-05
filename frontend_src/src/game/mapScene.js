import Phaser from 'phaser'

const TYPES = [
  { icon: '⚔', name: '전투' },
  { icon: '?', name: '미지' },
  { icon: '✦', name: '이벤트' },
  { icon: '$', name: '상점' },
]

export default class MapScene extends Phaser.Scene {
  constructor() { super('map') }

  create() {
    this.W = this.scale.width
    this.worldW = this.W
    this.worldH = 3200
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH)
    this.cameras.main.setBackgroundColor('#11161b')

    const bg = this.add.graphics()
    bg.fillGradientStyle(0x1a232c, 0x1a232c, 0x2b3a46, 0x2b3a46, 1)
    bg.fillRect(0, 0, this.worldW, this.worldH)

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

  makeFog() {
    if (!this.textures.exists('fogblob')) {
      const g = this.make.graphics({ add: false })
      for (let r = 150; r > 0; r -= 6) { g.fillStyle(0xc8d2dc, 0.03); g.fillCircle(150, 150, r) }
      g.generateTexture('fogblob', 300, 300); g.destroy()
    }
    this.fog = this.add.container(0, 0).setScrollFactor(0).setDepth(60)
    for (let i = 0; i < 10; i++) {
      const x = (i / 9) * this.W + Phaser.Math.Between(-40, 40)
      const y = Phaser.Math.Between(55, 205)
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
    if (isCurrent) this.setCurrent(node)
    return node
  }

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
    const k = this.add.text(0, -46, '♞', { fontSize: '48px', color: '#eaf4f8' }).setOrigin(0.5)
    node.cont.add(k); node.knight = k
    this.tweens.add({ targets: k, y: '-=8', yoyo: true, repeat: -1, duration: 900, ease: 'Sine.inOut' })
    this.current = node
  }

  spawnCandidates(from) {
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
  }

  linkEdge(a, b) {
    const g = this.add.graphics(); this.edgeLayer.add(g)
    this.dashed(g, a.x, a.y - 8, b.x, b.y + 8, 12, 9, 0xaeb9c4, 2)
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
      this.tweens.add({ targets: c.cont, alpha: 0, scaleX: 0.6, scaleY: 0.6, duration: 420, ease: 'Back.in', onComplete: () => c.cont.destroy() })
      if (c.inEdge) this.tweens.add({ targets: c.inEdge, alpha: 0, duration: 300, onComplete: () => c.inEdge.destroy() })
    })
    this.setCurrent(chosen)
    this.depth++
    this.tweens.add({
      targets: this.cameras.main, scrollY: Math.max(0, chosen.y - this.scale.height * 0.78),
      duration: 700, ease: 'Sine.inOut',
      onComplete: () => { chosen.isEnding ? this.showEnding(chosen) : this.spawnCandidates(chosen) },
    })
  }

  // 엔딩 노드: 대표 인물 데포르메 (지금은 플레이스홀더)
  showEnding(node) {
    const drag = this.add.text(node.x, node.y - 150, '🐉', { fontSize: '120px' }).setOrigin(0.5).setAlpha(0)
    const cap = this.add.text(node.x, node.y - 60, '카르가스 (데포르메)', {
      fontFamily: '"Gowun Batang", serif', fontSize: '20px', color: '#eaf4f8',
    }).setOrigin(0.5).setAlpha(0)
    const note = this.add.text(node.x, node.y + 70, '엔딩 노드 도달 — 대표 인물 데포르메 자리', {
      fontFamily: '"Gowun Dodum", sans-serif', fontSize: '14px', color: '#aebac6',
    }).setOrigin(0.5).setAlpha(0)
    this.tweens.add({ targets: [drag, cap, note], alpha: 1, duration: 700 })
    this.tweens.add({ targets: drag, y: '-=14', yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.inOut' })
  }
}
