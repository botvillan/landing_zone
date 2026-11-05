// Drifting dots joined by thin lines. Dots near the pointer connect to it.
const canvas = document.querySelector<HTMLCanvasElement>('#network');
if (canvas) {
  const ctx = canvas.getContext('2d')!;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const LINK = 140;
  type Dot = { x: number; y: number; vx: number; vy: number; r: number };
  let w = 0, h = 0, dots: Dot[] = [], frame = 0;
  let born = 0;
  const pointer = { x: -1e4, y: -1e4 };

  const seed = () => {
    const n = Math.min(110, Math.round((w * h) / 12000));
    dots = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: 1 + Math.random() * 1.6,
    }));
  };
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const changedWidth = innerWidth !== w;
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Phone browsers resize height while scrolling, so only reseed on width changes.
    if (changedWidth) seed();
    draw(performance.now());
  };
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, range: number, alpha: number, colour: string) => {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > range) return;
    ctx.strokeStyle = `rgba(${colour},${alpha * (1 - d / range)})`;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  function draw(now: number) {
    ctx.clearRect(0, 0, w, h);
    // The network forms during the first two seconds.
    const t = still.matches ? 1 : Math.min(1, (now - born) / 2000);
    ctx.lineWidth = 1;
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) line(dots[i], dots[j], LINK * t, 0.28, '142,162,255');
      line(dots[i], pointer, 190, 0.8, '196,181,253');
    }
    ctx.fillStyle = 'rgba(200,210,255,0.7)';
    for (const d of dots) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill(); }
  }
  const tick = (now: number) => {
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > w) d.vx *= -1;
      if (d.y < 0 || d.y > h) d.vy *= -1;
    }
    draw(now);
    frame = requestAnimationFrame(tick);
  };
  const start = () => { cancelAnimationFrame(frame); if (!still.matches && !document.hidden) frame = requestAnimationFrame(tick); else draw(performance.now()); };

  born = performance.now();
  resize();
  start();
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', start);
  still.addEventListener('change', start);
  addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; if (still.matches) draw(performance.now()); });
  document.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });
}
