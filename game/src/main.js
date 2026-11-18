// SOLMAR — Streets of the Sun: entry point. Wires the city, vehicles, police,
// combat, missions, HUD and save system into one game loop, plus the title,
// pause and wasted/busted screens (DOM overlays over the canvas).
import { buildCity, zoneAt, isWater, isSand, hitsBuilding, resolveBuildingCollision, WORLD } from './city.js';
import { makeRng, clamp } from './rng.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { hasSave, readSave, writeSave, serializeGame } from './save.js';
import { createMissions } from './missions.js';
import { initFx, updateFx, showBanner, showHint } from './fx.js';
import {
  CAR_MODELS, spawnParkedCars, spawnTraffic, spawnPeds, updateTraffic,
  updatePeds, drivePlayerCar, collideCars, nearestCar, enterCar, exitCar, makeCar,
} from './entities.js';
import { addWanted, updateWanted, updatePolice, tryRespray } from './police.js';
import { playerShoot, updateEnemies } from './combat.js';
import { drawWorld, drawEntities, VIEW_W, VIEW_H } from './render.js';
import { drawHUD } from './hud.js';

// Debug handle for play-testing: window.__solmar.game is ALWAYS the live
// game object (re-pointed on every NEW GAME / CONTINUE), and .errors collects
// uncaught page errors so a headless run can assert a clean console.
export const debug = { game: null, errors: [] };
window.__solmar = debug;
window.addEventListener('error', (e) => {
  if (debug.errors.length < 50) debug.errors.push(String(e.message || e.error || 'unknown error'));
});

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
input.attach();
const audio = createAudio();

let game = null;

function $(id) { return document.getElementById(id); }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function createGame(seed, opts = {}) {
  const city = buildCity(seed);
  const hideout = city.landmarks.hideout;
  const g = {
    seed, city,
    rng: makeRng((seed ^ 0x51ab3f) >>> 0),
    state: 'title',
    time: 0,
    cash: 0,
    wanted: 0, unseenTimer: 0, coolTimer: 0, spawnCd: 0,
    player: { x: hideout.x, y: hideout.y + 130, angle: -Math.PI / 2, health: 100, onFoot: true, car: null },
    cars: [], peds: [], cops: [], enemies: [],
    missions: createMissions(),
    fx: initFx(),
    camera: { x: clamp(hideout.x - VIEW_W / 2, 0, WORLD.w - VIEW_W), y: clamp(hideout.y - VIEW_H / 2, 0, WORLD.h - VIEW_H) },
    stats: { kills: 0, carsStolen: 0, pedsHit: 0, copsDown: 0, distanceDriven: 0 },
    zone: zoneAt(city, hideout.x, hideout.y),
    zoneT: 0,
    input, audio,
    mouseWorld: { x: 0, y: 0 },
    lastPlayerShot: 0, lastShotAt: 0,
    unlockedSports: false, stashesFound: 0,
    autosaveT: 0, eConsumed: false,
  };
  g.onCrime = (n, kind) => addWanted(g, n, kind);
  g.saveGame = () => writeSave(serializeGame(g));
  g.endRun = (kind) => endRun(g, kind);
  spawnParkedCars(g);
  spawnTraffic(g, 14);
  spawnPeds(g, 18);
  if (opts.startMission) g.missions.start('freeroam', g);
  debug.game = g;
  return g;
}

function applySave(g, data) {
  g.cash = data.cash || 0;
  g.player.health = data.health || 100;
  g.player.x = data.player.x;
  g.player.y = data.player.y;
  g.unlockedSports = !!data.unlockedSports;
  g.stashesFound = data.stashesFound || 0;
  Object.assign(g.stats, data.stats || {});
  g.missions.done = [...(data.completedMissions || [])];
  if (data.car) {
    const car = makeCar(data.car.model, data.car.x, data.car.y, data.car.angle, 'parked');
    car.health = data.car.health;
    car.color = data.car.color;
    g.cars.push(car);
    if (data.inCar) {
      car.kind = 'player';
      car.driver = 'player';
      g.player.car = car;
      g.player.onFoot = false;
      g.player.x = car.x; g.player.y = car.y;
    }
  }
  // Restore the mission at its first step: safe, deterministic, and the
  // mission id + seed + cash + position all survive the round trip.
  if (data.mission && g.missions.defs[data.mission] && !g.missions.done.includes(data.mission)) {
    g.missions.start(data.mission, g);
  }
  g.zone = zoneAt(g.city, g.player.x, g.player.y);
  g.camera.x = clamp(g.player.x - VIEW_W / 2, 0, WORLD.w - VIEW_W);
  g.camera.y = clamp(g.player.y - VIEW_H / 2, 0, WORLD.h - VIEW_H);
}

// --- Screens ----------------------------------------------------------------

function refreshTitleButtons() {
  $('btn-continue').disabled = !hasSave();
}

function newGame() {
  audio.ensure();
  audio.click();
  const seed = 1 + Math.floor(Math.random() * 999999);
  game = createGame(seed, { startMission: true });
  game.state = 'playing';
  hide($('title-screen'));
  showBanner(game, 'SOLMAR BAY', 'Welcome to the sun, Dice. Vera is waiting at the diner.');
}

function continueGame() {
  const data = readSave();
  if (!data) return;
  audio.ensure();
  audio.click();
  game = createGame(data.seed, { startMission: false });
  applySave(game, data);
  game.state = 'playing';
  hide($('title-screen'));
  showBanner(game, 'WELCOME BACK', `${game.zone} — same city, same streets.`);
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  audio.engineStop();
  const s = game.stats;
  $('pause-stats').textContent =
    `Cash $${game.cash.toLocaleString('en-US')}  ·  Missions done: ${game.missions.done.length}  ·  ` +
    `Cars stolen: ${s.carsStolen}  ·  Kings down: ${s.kills}  ·  Driven: ${Math.round(s.distanceDriven / 1000)} km`;
  show($('pause-menu'));
  input.endFrame();
}

function resumeGame() {
  if (game.state !== 'paused') return;
  audio.ensure();
  audio.click();
  game.state = 'playing';
  hide($('pause-menu'));
  if (game.wanted > 0) audio.sirenStart();
  input.endFrame();
}

function quitToTitle() {
  audio.click();
  game.saveGame();
  audio.stopAll();
  game = createGame(1 + Math.floor(Math.random() * 999999), { startMission: false });
  game.state = 'title';
  hide($('pause-menu'));
  refreshTitleButtons();
  show($('title-screen'));
}

function endRun(g, kind) {
  if (g.state !== 'playing') return;
  g.state = kind;
  audio.stopAll();
  audio.wasted();
  const title = kind === 'wasted' ? 'WASTED' : 'BUSTED';
  const text = kind === 'wasted'
    ? 'Dice went down in Solmar Bay. The hospital patched him up — $100.'
    : 'SBPD caught up with Dice. Bail and fines cost $150.';
  $('end-title').textContent = title;
  $('end-text').textContent = text;
  show($('end-screen'));
}

function respawn() {
  audio.ensure();
  audio.click();
  const kind = game.state;
  const penalty = kind === 'wasted' ? 100 : 150;
  game.cash = Math.max(0, game.cash - penalty);
  const p = game.player;
  if (p.car) { p.car.kind = 'parked'; p.car.driver = null; p.car.speed = 0; }
  p.car = null;
  p.onFoot = true;
  p.health = 100;
  game.wanted = 0;
  game.cops = [];
  game.enemies = game.enemies.filter((e) => !e.missionId);
  game.cars = game.cars.filter((c) => c.kind !== 'cruiser');
  audio.sirenStop();
  const spot = kind === 'wasted' ? game.city.landmarks.hospital : game.city.landmarks.hideout;
  p.x = spot.x; p.y = spot.y + 130;
  game.camera.x = clamp(p.x - VIEW_W / 2, 0, WORLD.w - VIEW_W);
  game.camera.y = clamp(p.y - VIEW_H / 2, 0, WORLD.h - VIEW_H);
  if (game.missions.active) game.missions.start(game.missions.active.def.id, game);
  game.state = 'playing';
  hide($('end-screen'));
  game.saveGame();
  showHint(game, kind === 'wasted' ? 'Patched up. -$100' : 'Out on bail. -$150', 3);
}

// --- Per-frame update ---------------------------------------------------------

function updateOnFoot(g, dt) {
  const p = g.player;
  const mv = input.moveVector();
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = (sprint ? 320 : 200) * (isSand(p.x, p.y) ? 0.85 : 1);
  p.angle = Math.atan2(g.mouseWorld.y - p.y, g.mouseWorld.x - p.x);
  const nx = p.x + mv.x * speed * dt;
  const ny = p.y + mv.y * speed * dt;
  if (!hitsBuilding(g.city, nx, ny, 12) && !isWater(g.city, nx, ny)) { p.x = nx; p.y = ny; }
  else {
    if (!hitsBuilding(g.city, nx, p.y, 12) && !isWater(g.city, nx, p.y)) p.x = nx;
    if (!hitsBuilding(g.city, p.x, ny, 12) && !isWater(g.city, p.x, ny)) p.y = ny;
  }
  resolveBuildingCollision(g.city, p, 12);
  p.x = clamp(p.x, 20, WORLD.w - 20);
  p.y = clamp(p.y, 20, WORLD.h - 20);
  audio.engineStop();
}

function handleInteract(g) {
  if (g.eConsumed || !input.justPressed('KeyE')) return;
  const p = g.player;
  if (!p.onFoot) {
    if (tryRespray(g)) return;
    exitCar(g);
    return;
  }
  const car = nearestCar(g, p.x, p.y, 80);
  if (car) { enterCar(g, car); return; }
  // Hospital: patch up to full health for $50.
  const hosp = g.city.landmarks.hospital;
  if (Math.hypot(p.x - hosp.x, p.y - hosp.y) < 150 && p.health < 100) {
    if (g.cash >= 50) {
      g.cash -= 50;
      p.health = 100;
      audio.jingle();
      showBanner(g, 'PATCHED UP', 'Solmar General — full health. $50');
    } else {
      showHint(g, 'Treatment costs $50.', 2.5);
    }
  }
}

function update(g, dt) {
  g.time += dt;
  g.mouseWorld.x = g.camera.x + input.mouse.x;
  g.mouseWorld.y = g.camera.y + input.mouse.y;

  if (input.justPressed('Escape') || input.justPressed('KeyP')) {
    pauseGame();
    return;
  }
  if (input.justPressed('KeyM')) {
    audio.muted = !audio.muted;
    if (audio.muted) audio.stopAll();
    else if (g.wanted > 0) audio.sirenStart();
    showHint(g, audio.muted ? 'Sound off (M to turn on)' : 'Sound on', 2);
  }

  const p = g.player;
  if (p.onFoot) {
    updateOnFoot(g, dt);
    if (input.mouse.down) playerShoot(g);
  } else {
    drivePlayerCar(g, dt);
    p.x = p.car.x; p.y = p.car.y;
    p.angle = p.car.angle;
    if (p.car.wrecked) {
      exitCar(g);
      showHint(g, 'The car is wrecked. Find another ride.', 3);
    }
  }

  g.eConsumed = false;
  g.missions.update(g, dt);
  handleInteract(g);

  // "Press E" hint when a stealable car is right there.
  if (p.onFoot && !g.eConsumed) {
    const car = nearestCar(g, p.x, p.y, 80);
    if (car) showHint(g, `Press E — Steal the ${CAR_MODELS[car.model].name}`, 0.15);
  }
  if (p.car) {
    const spa = g.city.landmarks.autospa;
    if (Math.hypot(p.x - spa.x, p.y - spa.y) < 170) {
      showHint(g, 'Press E — Respray $150 (clears wanted, repairs car)', 0.15);
    }
  }

  updateTraffic(g, dt);
  updatePeds(g, dt);
  updateWanted(g, dt);
  updatePolice(g, dt);
  updateEnemies(g, dt);
  collideCars(g);
  updateFx(g, dt);

  // Camera: follow the player with a look-ahead toward the aim / the road.
  let lx = 0, ly = 0;
  if (p.car) { lx = Math.cos(p.car.angle) * 70; ly = Math.sin(p.car.angle) * 70; }
  else { lx = (g.mouseWorld.x - p.x) * 0.12; ly = (g.mouseWorld.y - p.y) * 0.12; }
  const tx = clamp(p.x + lx - VIEW_W / 2, 0, WORLD.w - VIEW_W);
  const ty = clamp(p.y + ly - VIEW_H / 2, 0, WORLD.h - VIEW_H);
  g.camera.x += (tx - g.camera.x) * Math.min(1, dt * 5);
  g.camera.y += (ty - g.camera.y) * Math.min(1, dt * 5);

  // Zone popup.
  const z = zoneAt(g.city, p.x, p.y);
  if (z !== g.zone) { g.zone = z; g.zoneT = 3; }
  if (g.zoneT > 0) g.zoneT -= dt;

  // Quiet autosave every 45 seconds of play.
  g.autosaveT += dt;
  if (g.autosaveT > 45) { g.autosaveT = 0; g.saveGame(); }

  input.endFrame();
}

function render(g) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  if (g.fx.shake > 0) {
    ctx.translate((Math.random() - 0.5) * g.fx.shake, (Math.random() - 0.5) * g.fx.shake);
  }
  drawWorld(ctx, g);
  drawEntities(ctx, g);
  ctx.restore();
  if (g.state === 'playing' || g.state === 'paused') drawHUD(ctx, g);
}

// --- Boot + main loop ---------------------------------------------------------

game = createGame(1 + Math.floor(Math.random() * 999999), { startMission: false });
game.state = 'title';

$('btn-new').addEventListener('click', newGame);
$('btn-continue').addEventListener('click', continueGame);
$('btn-howto').addEventListener('click', () => { audio.ensure(); audio.click(); show($('howto-panel')); });
$('btn-howto-close').addEventListener('click', () => { audio.click(); hide($('howto-panel')); });
$('btn-resume').addEventListener('click', resumeGame);
$('btn-save').addEventListener('click', () => {
  audio.click();
  game.saveGame();
  showHint(game, 'Game saved.', 2);
});
$('btn-restart-mission').addEventListener('click', () => {
  audio.click();
  if (game.missions.active) game.missions.start(game.missions.active.def.id, game);
  resumeGame();
});
$('btn-quit').addEventListener('click', quitToTitle);
$('btn-respawn').addEventListener('click', respawn);
refreshTitleButtons();

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'playing') {
    update(game, dt);
  } else if (game.state === 'title') {
    // Living backdrop behind the title: traffic, peds, a slow camera drift.
    game.time += dt;
    updateTraffic(game, dt);
    updatePeds(game, dt);
    updateFx(game, dt);
    game.camera.x = clamp(1700 + Math.sin(game.time * 0.05) * 700, 0, WORLD.w - VIEW_W);
    game.camera.y = clamp(1000 + Math.cos(game.time * 0.04) * 320, 0, WORLD.h - VIEW_H);
    input.endFrame();
  } else {
    input.endFrame();
  }
  render(game);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
