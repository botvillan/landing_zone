// A fluid flow field: particles drift along slowly changing currents and leave soft trails.
// Moving the pointer stirs a vortex; clicking or tapping sends out a ripple.
const canvas = document.querySelector<HTMLCanvasElement>('#flow');
if (canvas) {
  const ctx = canvas.getContext('2d')!;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const COLOURS = ['142,162,255', '196,181,253', '34,211,238', '240,171,252'];
  type P = { x: number; y: number; px: number; py: number; vx: number; vy: number; life: number; max: number; c: string; w: number };
  let w = 0, h = 0, dpr = 1, ps: P[] = [], frame = 0, t = Math.random() * 100, visible = true;
  const pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, active: false };
  const ripples: { x: number; y: number; r: number; a: number }[] = [];

  // Smooth, layered sine field: cheap, seamless and never repeats in an obvious way.
  const angle = (x: number, y: number) => {
    const s = 0.0028;
    return (
      Math.sin(x * s + Math.cos(y * s * 0.7 + t) * 1.5 + t * 0.6) * 1.6 +
      Math.cos(y * s * 1.2 + Math.sin(x * s * 0.8 - t * 0.7) * 1.5 - t * 0.45) * 1.6 +
      Math.sin((x - y) * s * 0.45 + t * 0.3) * 1.2
    );
  };

  const spawn = (p?: P): P => {
    const x = Math.random() * w, y = Math.random() * h;
    const q = p ?? ({} as P);
    q.x = q.px = x; q.y = q.py = y; q.vx = q.vy = 0;
    q.life = 0; q.max = 160 + Math.random() * 260;
    q.c = COLOURS[(Math.random() * (Math.random() < 0.7 ? 2 : 4)) | 0];
    q.w = 0.5 + Math.random() * 1.6;
    return q;
  };

  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    const changedWidth = innerWidth !== w;
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Phone browsers resize the height while scrolling, so only reseed on width changes.
    if (changedWidth || !ps.length) {
      const n = Math.round(Math.min(620, Math.max(160, (w * h) / 2600)));
      ps = Array.from({ length: n }, () => spawn());
    }
    if (still.matches) drawStill();
  };

  const step = () => {
    t += 0.0035;
    // Fade old trails to transparent so the aurora behind stays visible.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.045)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    pointer.vx *= 0.9; pointer.vy *= 0.9;
    for (const p of ps) {
      const a = angle(p.x, p.y);
      let ax = Math.cos(a) * 0.09, ay = Math.sin(a) * 0.09;
      if (pointer.active) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy, R = 190;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1, f = 1 - d / R;
          // Swirl around the pointer and get dragged along with its movement.
          const ease = f * f * (3 - 2 * f);
          ax += (-dy / d) * ease * 0.32 + pointer.vx * ease * 0.03 - (dx / d) * ease * 0.04;
          ay += (dx / d) * ease * 0.32 + pointer.vy * ease * 0.03 - (dy / d) * ease * 0.04;
        }
      }
      for (const r of ripples) {
        const dx = p.x - r.x, dy = p.y - r.y, d = Math.hypot(dx, dy) || 1;
        const band = Math.abs(d - r.r);
        if (band < 40) { const f = (1 - band / 40) * r.a * 1.6; ax += (dx / d) * f; ay += (dy / d) * f; }
      }
      p.vx = (p.vx + ax) * 0.94; p.vy = (p.vy + ay) * 0.94;
      p.px = p.x; p.py = p.y;
      p.x += p.vx * 1.8; p.y += p.vy * 1.8;
      p.life++;
      const fade = Math.min(1, p.life / 40, (p.max - p.life) / 40);
      const speed = Math.min(1, Math.hypot(p.vx, p.vy) * 1.2);
      ctx.strokeStyle = `rgba(${p.c},${(0.07 + speed * 0.3) * fade})`;
      ctx.lineWidth = p.w;
      ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      if (p.life > p.max || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) spawn(p);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.r += 7; r.a *= 0.95;
      ctx.strokeStyle = `rgba(196,181,253,${r.a * 0.35})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      if (r.a < 0.03) ripples.splice(i, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  // With reduced motion, draw the currents once as still lines.
  function drawStill() {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ps.slice(0, 260)) {
      let x = p.x, y = p.y;
      ctx.strokeStyle = `rgba(${p.c},0.22)`; ctx.lineWidth = p.w;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 0; i < 40; i++) { const a = angle(x, y); x += Math.cos(a) * 4; y += Math.sin(a) * 4; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  const loop = () => { step(); frame = requestAnimationFrame(loop); };
  const start = () => {
    cancelAnimationFrame(frame);
    if (still.matches) { drawStill(); return; }
    if (!document.hidden && visible) frame = requestAnimationFrame(loop);
  };

  resize();
  // Warm up so the first frame already shows flowing trails.
  if (!still.matches) for (let i = 0; i < 140; i++) step();
  start();

  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', start);
  still.addEventListener('change', start);
  // Stop drawing once the hero has scrolled away.
  const hero = document.querySelector('.hero');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }, { threshold: 0 }).observe(hero);
  }
  addEventListener('pointermove', (e) => {
    if (pointer.active) { pointer.vx += (e.clientX - pointer.x) * 0.3; pointer.vy += (e.clientY - pointer.y) * 0.3; }
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (ripples.length < 4) ripples.push({ x: e.clientX, y: e.clientY, r: 0, a: 1 });
  }, { passive: true });
  const leave = () => { pointer.active = false; };
  document.addEventListener('pointerleave', leave);
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') leave(); }, { passive: true });
}
