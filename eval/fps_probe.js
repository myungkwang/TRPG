// 검문소 D · FPS 측정 (가이드 §2-2)
// 브라우저 콘솔에 이 파일 내용을 붙여넣고 window.__fpsReport(5) 를 호출한다.
// 게임이 렌더 중인 상태(캐릭터 말하는 중 등)에서 측정해야 의미가 있다.
// 반환: { avg, min, keep_rate_30_pct } → eval/metrics_system.py --fps <avg> --fps-keep-rate <keep_rate>
window.__fpsReport = (seconds = 5) =>
  new Promise((resolve) => {
    const frames = []
    let last = performance.now()
    const end = last + seconds * 1000
    const tick = (now) => {
      const dt = now - last
      last = now
      if (dt > 0) frames.push(1000 / dt)
      if (now < end) requestAnimationFrame(tick)
      else {
        const avg = frames.reduce((a, b) => a + b, 0) / frames.length
        const min = Math.min(...frames)
        const keep = (frames.filter((f) => f >= 30).length / frames.length) * 100
        resolve({
          avg: +avg.toFixed(1),
          min: +min.toFixed(1),
          keep_rate_30_pct: +keep.toFixed(1),
          samples: frames.length,
        })
      }
    }
    requestAnimationFrame(tick)
  })
