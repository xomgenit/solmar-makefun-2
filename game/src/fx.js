// Juice for SOLMAR: particles, tracers, skid marks, floating cash text, screen
// shake and banners. All effects live on game.fx and are spawned by the
// gameplay modules; render.js draws them.
export function initFx() {
  return {
    particles: [], tracers: [], floaters: [], skids: [],
    shake: 0, flash: 0, flashColor: '255,60,40',
    banner: null, bannerT: 0, hint: null, hintT: 0,
  };
}

export function spawnParticles(game, x, y, opts = {}) {
  const count = opts.count ?? 8;
  const colors = opts.colors ?? ['#ffd23f', '#ff8c42', '#ffffff'];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (opts.speed ?? 160) * (0.4 + Math.random() * 0.8);
    game.fx.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8),
      maxLife: opts.life ?? 0.5,
      size: (opts.size ?? 3) * (0.7 + Math.random() * 0.6),
      color: colors[i % colors.length],
      gravity: opts.gravity ?? 0,
    });
  }
  if (game.fx.particles.length > 400) game.fx.particles.splice(0, game.fx.particles.length - 400);
}

export function addTracer(game, x1, y1, x2, y2, color = '#ffe66d') {
  game.fx.tracers.push({ x1, y1, x2, y2, color, life: 0.09 });
}

export function addFloater(game, x, y, text, color = '#7CFC00') {
  game.fx.floaters.push({ x, y, text, color, life: 1.4 });
}

export function addSkid(game, x, y, angle) {
  game.fx.skids.push({ x, y, angle, life: 6 });
  if (game.fx.skids.length > 300) game.fx.skids.splice(0, game.fx.skids.length - 300);
}

export function showBanner(game, title, sub = '') {
  game.fx.banner = { title, sub };
  game.fx.bannerT = 3.2;
}

export function showHint(game, text, seconds = 2.5) {
  game.fx.hint = text;
  game.fx.hintT = seconds;
}

export function addShake(game, amount) {
  game.fx.shake = Math.min(14, game.fx.shake + amount);
}

export function addFlash(game, amount, color = '255,60,40') {
  game.fx.flash = Math.min(0.55, game.fx.flash + amount);
  game.fx.flashColor = color;
}

export function updateFx(game, dt) {
  const fx = game.fx;
  for (const p of fx.particles) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += (p.gravity || 0) * dt;
    p.vx *= 0.98; p.vy *= 0.98;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  for (const t of fx.tracers) t.life -= dt;
  fx.tracers = fx.tracers.filter((t) => t.life > 0);
  for (const f of fx.floaters) { f.life -= dt; f.y -= 34 * dt; }
  fx.floaters = fx.floaters.filter((f) => f.life > 0);
  for (const s of fx.skids) s.life -= dt;
  fx.skids = fx.skids.filter((s) => s.life > 0);
  fx.shake = Math.max(0, fx.shake - dt * 26);
  fx.flash = Math.max(0, fx.flash - dt * 1.4);
  if (fx.bannerT > 0) { fx.bannerT -= dt; if (fx.bannerT <= 0) fx.banner = null; }
  if (fx.hintT > 0) { fx.hintT -= dt; if (fx.hintT <= 0) fx.hint = null; }
}

// Draw particles, tracers, skids and floaters (world space; camera applied).
export function drawFx(ctx, game, cam) {
  const fx = game.fx;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.translate(-cam.x, -cam.y);
  for (const s of fx.skids) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.globalAlpha = Math.min(0.5, s.life * 0.2);
    ctx.fillStyle = '#222';
    ctx.fillRect(-9, -2, 18, 4);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  for (const t of fx.tracers) {
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = Math.min(1, t.life / 0.09);
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px Arial, sans-serif';
  for (const f of fx.floaters) {
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}
