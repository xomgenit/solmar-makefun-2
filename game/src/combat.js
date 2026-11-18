// Hitscan combat for SOLMAR: the player aims with the mouse and shoots; cops
// and Harbor Kings gang members shoot back. One shared ray function serves
// every shooter so damage, tracers and hit reactions stay consistent.
import { distance } from './rng.js';
import { damageCar } from './entities.js';
import { spawnParticles, addTracer, addFloater, addShake, addFlash } from './fx.js';

const RAY_RANGE = 760;

// Fire one hitscan ray. Returns the hit ({type, target, x, y}) or null.
// Teams: 'player', 'cop', 'gang'. A ray never hits its own team.
export function fireHitscan(game, ox, oy, tx, ty, opts = {}) {
  const damage = opts.damage ?? 34;
  const fromTeam = opts.team ?? 'player';
  const spread = opts.spread ?? 0;
  const angle = Math.atan2(ty - oy, tx - ox) + (Math.random() - 0.5) * spread;
  const ex = ox + Math.cos(angle) * RAY_RANGE;
  const ey = oy + Math.sin(angle) * RAY_RANGE;

  let best = null, bestT = 1;
  const consider = (x, y, radius, type, target) => {
    const dx = ex - ox, dy = ey - oy;
    const len2 = dx * dx + dy * dy;
    let t = ((x - ox) * dx + (y - oy) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ox + dx * t, cy = oy + dy * t;
    const d = Math.hypot(x - cx, y - cy);
    if (d < radius + 6 && t < bestT) { bestT = t; best = { type, target, x: cx, y: cy }; }
  };

  // People: cops, gang members, the player, pedestrians.
  if (fromTeam !== 'cop') for (const cop of game.cops) consider(cop.x, cop.y, 14, 'cop', cop);
  if (fromTeam !== 'gang') for (const e of game.enemies) consider(e.x, e.y, 14, 'gang', e);
  if (fromTeam !== 'player') consider(game.player.x, game.player.y, 14, 'player', game.player);
  if (fromTeam === 'player') for (const ped of game.peds) {
    if (ped.state !== 'down') consider(ped.x, ped.y, 12, 'ped', ped);
  }
  // Cars take damage too.
  for (const car of game.cars) {
    if (car.wrecked) continue;
    consider(car.x, car.y, 24, 'car', car);
  }

  const hitX = ox + (ex - ox) * bestT;
  const hitY = oy + (ey - oy) * bestT;
  addTracer(game, ox, oy, hitX, hitY, opts.tracerColor || (fromTeam === 'player' ? '#ffe66d' : '#ff6b6b'));
  spawnParticles(game, hitX, hitY, { count: 3, colors: ['#ffd23f', '#ffffff'], speed: 120, life: 0.25, size: 2 });

  if (!best) return null;
  if (best.type === 'cop' || best.type === 'gang') {
    best.target.hp -= damage;
    spawnParticles(game, best.x, best.y, { count: 5, colors: ['#ff4444'], speed: 100, life: 0.4, size: 3 });
    if (best.target.hp <= 0) killTarget(game, best);
  } else if (best.type === 'player') {
    damagePlayer(game, damage);
  } else if (best.type === 'ped') {
    best.target.state = 'down';
    best.target.down = 6;
    game.stats.pedsHit = (game.stats.pedsHit || 0) + 1;
    if (game.onCrime) game.onCrime(1, 'ped-shot');
  } else if (best.type === 'car') {
    damageCar(game, best.target, damage * 0.6);
  }
  return best;
}

function killTarget(game, hit) {
  const t = hit.target;
  spawnParticles(game, t.x, t.y, { count: 16, colors: ['#ff4444', '#ffffff'], speed: 200, life: 0.6, size: 3 });
  if (hit.type === 'cop') {
    game.cops = game.cops.filter((c) => c !== t);
    game.stats.copsDown = (game.stats.copsDown || 0) + 1;
    addFloater(game, t.x, t.y - 24, 'COP DOWN', '#ff6b6b');
    if (game.onCrime) game.onCrime(1, 'cop-down');
  } else {
    game.enemies = game.enemies.filter((e) => e !== t);
    game.stats.kills = (game.stats.kills || 0) + 1;
    addFloater(game, t.x, t.y - 24, 'KING DOWN', '#ffd23f');
  }
}

export function damagePlayer(game, amount) {
  const p = game.player;
  if (game.state !== 'playing' || p.health <= 0) return;
  p.health -= amount;
  addFlash(game, 0.25);
  addShake(game, 3);
  if (p.health <= 0) {
    p.health = 0;
    game.endRun('wasted');
  }
}

// Player shooting toward the mouse. Handles cooldown, sound and heat.
export function playerShoot(game) {
  const p = game.player;
  if (!p.onFoot || game.state !== 'playing') return;
  if (game.time - (game.lastPlayerShot || 0) < 0.18) return;
  game.lastPlayerShot = game.time;
  game.lastShotAt = game.time;
  const m = game.mouseWorld;
  fireHitscan(game, p.x, p.y, m.x, m.y, { damage: 34, team: 'player' });
  spawnParticles(game, p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, {
    count: 2, colors: ['#ffe66d'], speed: 60, life: 0.1, size: 3,
  });
  game.audio.shoot();
  if (game.wanted === 0 && game.onCrime) game.onCrime(1, 'gunfire');
}

// --- Gang members (Harbor Kings) --------------------------------------------

export function spawnEnemy(game, x, y, team = 'gang', opts = {}) {
  const e = {
    x, y, hp: opts.hp ?? 100, team,
    angle: Math.random() * Math.PI * 2,
    speed: opts.speed ?? 130,
    shootCd: 0.5 + Math.random(),
    state: opts.state || 'guard',
    homeX: x, homeY: y,
    missionId: opts.missionId || null,
  };
  game.enemies.push(e);
  return e;
}

export function updateEnemies(game, dt) {
  const p = game.player;
  for (const e of game.enemies) {
    const d = distance(e.x, e.y, p.x, p.y);
    e.shootCd -= dt;
    if (d > 460) {
      // Drift back toward home turf when the player is far away.
      const a = Math.atan2(e.homeY - e.y, e.homeX - e.x);
      e.x += Math.cos(a) * e.speed * 0.5 * dt;
      e.y += Math.sin(a) * e.speed * 0.5 * dt;
      e.angle = a;
    } else if (d > 260) {
      // Close in.
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.angle = a;
      const nx = e.x + Math.cos(a) * e.speed * dt;
      const ny = e.y + Math.sin(a) * e.speed * dt;
      e.x = nx; e.y = ny;
    } else {
      e.angle = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.shootCd <= 0 && d < 430) {
        e.shootCd = 0.9 + Math.random() * 0.5;
        fireHitscan(game, e.x, e.y, p.x, p.y, { damage: 7, team: 'gang', spread: 0.22, tracerColor: '#ff6b6b' });
        game.audio.shoot();
      }
    }
  }
}
