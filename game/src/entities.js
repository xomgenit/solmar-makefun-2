// Vehicles, traffic and pedestrians for SOLMAR.
// Cars are one shared object shape: parked, traffic, player-driven and police
// cruisers are all entries in game.cars with a `kind` flag.
import { WORLD, isRoad, isWater, isSand, hitsBuilding, resolveBuildingCollision, randomRoadPointNear } from './city.js';
import { clamp, distance, angleDelta } from './rng.js';
import { spawnParticles, addSkid, addShake, addFloater } from './fx.js';

export const CAR_MODELS = {
  sedan: { name: 'Solmar Sedan', topSpeed: 420, accel: 260, grip: 2.6, w: 46, h: 22, colors: ['#c0392b', '#2980b9', '#ecf0f1', '#7f8c8d', '#16a085'] },
  sports: { name: 'Vortex GT', topSpeed: 620, accel: 380, grip: 3.1, w: 48, h: 22, colors: ['#e74c3c', '#f1c40f', '#8e44ad', '#e67e22'] },
  taxi: { name: 'Bay Cab', topSpeed: 400, accel: 250, grip: 2.5, w: 46, h: 22, colors: ['#f7dc6f'] },
  van: { name: 'Harbor Van', topSpeed: 340, accel: 190, grip: 2.1, w: 52, h: 24, colors: ['#aeb6bf', '#5d6d7e', '#ffffff'] },
  pickup: { name: 'Dune Pickup', topSpeed: 380, accel: 230, grip: 2.4, w: 50, h: 23, colors: ['#27ae60', '#935116', '#2e86c1'] },
  cruiser: { name: 'SBPD Cruiser', topSpeed: 560, accel: 340, grip: 2.9, w: 47, h: 22, colors: ['#1a1a2e'] },
};

let nextCarId = 1;

export function makeCar(model, x, y, angle, kind = 'parked') {
  const def = CAR_MODELS[model];
  return {
    id: nextCarId++,
    model, kind, name: def.name,
    x, y, angle, speed: 0,
    health: 100, wrecked: false,
    color: def.colors[Math.floor(Math.random() * def.colors.length)],
    driver: kind === 'traffic' ? 'traffic' : null,
    ai: null, reverseT: 0, sirenT: Math.random() * 10,
    brakeLights: false,
  };
}

// --- Spawning ---------------------------------------------------------------

export function spawnParkedCars(game) {
  const models = ['sedan', 'sedan', 'taxi', 'van', 'pickup', 'sports'];
  for (const spot of game.city.parkedSpots) {
    const model = models[Math.floor(Math.random() * models.length)];
    game.cars.push(makeCar(model, spot.x, spot.y, spot.angle, 'parked'));
  }
  // Guarantee a drivable car near the hideout so the first minutes work.
  // Parked well east of the hideout building (max half-width 105 + margin).
  const hide = game.city.landmarks.hideout;
  game.cars.push(makeCar('sedan', hide.x + 190, hide.y + 40, -Math.PI / 2, 'parked'));
}

export function spawnTraffic(game, count) {
  const models = ['sedan', 'sedan', 'taxi', 'van', 'pickup'];
  for (let i = 0; i < count; i++) {
    const p = randomRoadPointNear(game.city, game.rng, game.player.x, game.player.y, 500, 1500);
    const model = models[Math.floor(Math.random() * models.length)];
    const car = makeCar(model, p.x, p.y, 0, 'traffic');
    // The road point sits on a vertical road (x on a roadsV line) or a
    // horizontal one (y on a roadsH line); match the car's road to it.
    const vertical = game.city.roadsV.some((rx) => Math.abs(rx - p.x) < 1);
    const road = vertical
      ? { axis: 'v', line: nearestLine(game.city.roadsV, p.x), dir: Math.random() < 0.5 ? 1 : -1 }
      : { axis: 'h', line: nearestLine(game.city.roadsH, p.y), dir: Math.random() < 0.5 ? 1 : -1 };
    car.ai = { ...road, speed: 130 + Math.random() * 60, turnCd: 0 };
    car.angle = road.axis === 'v' ? (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (road.dir > 0 ? 0 : Math.PI);
    if (road.axis === 'v') car.x = road.line + laneOffset('v', road.dir);
    else car.y = road.line + laneOffset('h', road.dir);
    game.cars.push(car);
  }
}

function nearestLine(lines, v) {
  let best = lines[0], bd = Infinity;
  for (const l of lines) { const d = Math.abs(l - v); if (d < bd) { bd = d; best = l; } }
  return best;
}

// Right-hand traffic lane offset from a road centre line.
function laneOffset(axis, dir) {
  return axis === 'v' ? -dir * 22 : dir * 22;
}

export function spawnPeds(game, count) {
  const shirts = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1'];
  for (let i = 0; i < count; i++) {
    const p = randomRoadPointNear(game.city, game.rng, game.player.x, game.player.y, 200, 1400);
    game.peds.push(makePed(p.x + (Math.random() - 0.5) * 120, p.y + (Math.random() - 0.5) * 120, shirts));
  }
}

export function makePed(x, y, shirts) {
  return {
    x, y, angle: Math.random() * Math.PI * 2,
    speed: 45 + Math.random() * 30,
    state: 'walk', timer: 0, tx: x, ty: y,
    shirt: shirts[Math.floor(Math.random() * shirts.length)],
    skin: ['#f1c27d', '#c68642', '#8d5524', '#ffdbac'][Math.floor(Math.random() * 4)],
    down: 0, fleeX: 0, fleeY: 0,
  };
}

// --- Player driving ---------------------------------------------------------

export function drivePlayerCar(game, dt) {
  const car = game.player.car;
  if (!car || car.wrecked) return;
  const def = CAR_MODELS[car.model];
  const input = game.input;
  const fwd = input.down('KeyW') || input.down('ArrowUp');
  const back = input.down('KeyS') || input.down('ArrowDown');
  const left = input.down('KeyA') || input.down('ArrowLeft');
  const right = input.down('KeyD') || input.down('ArrowRight');
  const handbrake = input.down('Space') || input.down('ShiftLeft') || input.down('ShiftRight');

  const sand = isSand(car.x, car.y);
  const top = def.topSpeed * (sand ? 0.55 : 1);
  if (fwd) car.speed += def.accel * dt;
  if (back) car.speed -= (car.speed > 10 ? def.accel * 1.4 : def.accel * 0.55) * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 320 * dt);
  car.speed = clamp(car.speed, -140, top);

  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  const spdF = clamp(Math.abs(car.speed) / 220, 0, 1);
  const turnRate = def.grip * (handbrake ? 1.5 : 1) * (0.35 + 0.65 * (1 - spdF * 0.55));
  car.angle += steer * turnRate * dt * Math.sign(car.speed || 1) * (0.25 + 0.75 * spdF);
  if (handbrake && Math.abs(car.speed) > 120 && steer !== 0) {
    addSkid(game, car.x - Math.cos(car.angle) * 16, car.y - Math.sin(car.angle) * 16, car.angle);
    if (Math.random() < 0.4) spawnParticles(game, car.x, car.y, { count: 2, colors: ['#cccccc'], speed: 40, life: 0.5, size: 4 });
  }

  moveCar(game, car, dt, true);
  game.audio.engineSet(true, clamp(Math.abs(car.speed) / def.topSpeed, 0, 1));
  game.stats.distanceDriven = (game.stats.distanceDriven || 0) + Math.abs(car.speed) * dt;
}

// Move a car along its heading, colliding with buildings, water and cars.
export function moveCar(game, car, dt, isPlayer) {
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const hitB = hitsBuilding(game.city, nx, ny, 20);
  const water = isWater(game.city, nx, ny);
  if (hitB || water || nx < 30 || nx > WORLD.w - 30 || ny < 30 || ny > WORLD.h - 30) {
    const impact = Math.abs(car.speed);
    if (impact > 130) {
      damageCar(game, car, impact * 0.09, isPlayer);
      spawnParticles(game, nx, ny, { count: 10, colors: ['#ffd23f', '#ff8c42'], speed: 220, life: 0.4, size: 3 });
      game.audio.crash();
      if (isPlayer) addShake(game, Math.min(10, impact / 60));
    }
    car.speed *= -0.25;
    return;
  }
  car.x = nx; car.y = ny;
  resolveBuildingCollision(game.city, car, 18);
}

export function damageCar(game, car, amount, noisy = false) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.speed = 0;
    spawnParticles(game, car.x, car.y, { count: 22, colors: ['#555555', '#ff8c42', '#ffd23f'], speed: 260, life: 0.8, size: 4 });
    if (noisy) game.audio.crash();
    if (car === game.player.car) addFloater(game, car.x, car.y - 30, 'WRECKED!', '#ff4444');
  }
}

// --- Traffic AI ---------------------------------------------------------------

export function updateTraffic(game, dt) {
  const px = game.player.x, py = game.player.y;
  for (const car of game.cars) {
    if (car.kind !== 'traffic' || !car.ai) continue;
    const ai = car.ai;
    ai.turnCd -= dt;
    // Car ahead? brake.
    const lookX = car.x + Math.cos(car.angle) * 70;
    const lookY = car.y + Math.sin(car.angle) * 70;
    let blocked = false;
    for (const other of game.cars) {
      if (other === car) continue;
      if (distance(lookX, lookY, other.x, other.y) < 34) { blocked = true; break; }
    }
    const want = blocked ? 0 : ai.speed;
    car.speed += clamp(want - car.speed, -260 * dt, 160 * dt);
    car.brakeLights = blocked;

    // At an intersection, sometimes turn onto the crossing road.
    const cross = ai.axis === 'v'
      ? game.city.roadsH.find((ry) => Math.abs(car.y - ry) < 46)
      : game.city.roadsV.find((rx) => Math.abs(car.x - rx) < 46);
    if (cross !== undefined && ai.turnCd <= 0 && Math.random() < 0.35) {
      ai.turnCd = 4 + Math.random() * 4;
      if (ai.axis === 'v') {
        ai.axis = 'h'; ai.line = cross; ai.dir = Math.random() < 0.5 ? 1 : -1;
        car.y = cross + laneOffset('h', ai.dir);
      } else {
        ai.axis = 'v'; ai.line = cross; ai.dir = Math.random() < 0.5 ? 1 : -1;
        car.x = cross + laneOffset('v', ai.dir);
      }
    }
    const targetAngle = ai.axis === 'v' ? (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ai.dir > 0 ? 0 : Math.PI);
    car.angle += angleDelta(car.angle, targetAngle) * Math.min(1, dt * 3);
    // Ease back onto the lane centre.
    if (ai.axis === 'v') car.x += ((ai.line + laneOffset('v', ai.dir)) - car.x) * Math.min(1, dt * 1.5);
    else car.y += ((ai.line + laneOffset('h', ai.dir)) - car.y) * Math.min(1, dt * 1.5);
    moveCar(game, car, dt, false);
    if (car.speed < 5 && blocked) car.speed = 0;

    // Recycle far-away traffic near the player.
    if (distance(car.x, car.y, px, py) > 1800) {
      const p = randomRoadPointNear(game.city, game.rng, px, py, 900, 1400);
      car.x = p.x; car.y = p.y; car.speed = 0;
      const vertical = Math.random() < 0.5;
      ai.axis = vertical ? 'v' : 'h';
      ai.line = vertical ? nearestLine(game.city.roadsV, p.x) : nearestLine(game.city.roadsH, p.y);
      ai.dir = Math.random() < 0.5 ? 1 : -1;
      car.angle = ai.axis === 'v' ? (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ai.dir > 0 ? 0 : Math.PI);
    }
  }
  // Keep traffic topped up.
  const trafficCount = game.cars.filter((c) => c.kind === 'traffic').length;
  if (trafficCount < 14) spawnTraffic(game, 14 - trafficCount);
}

// --- Pedestrians ------------------------------------------------------------

export function updatePeds(game, dt) {
  const p = game.player;
  for (const ped of game.peds) {
    if (ped.state === 'down') {
      ped.down -= dt;
      if (ped.down <= 0) {
        if (distance(ped.x, ped.y, p.x, p.y) > 900) { ped.state = 'gone'; continue; }
        ped.state = 'walk';
        ped.timer = 0;
      }
      continue;
    }
    ped.timer -= dt;
    // Threats: fast player car nearby, or a recent gunshot.
    const threat =
      (p.car && distance(ped.x, ped.y, p.x, p.y) < 150 && Math.abs(p.car.speed) > 200) ||
      (game.lastShotAt && game.time - game.lastShotAt < 1.2 && distance(ped.x, ped.y, p.x, p.y) < 350);
    if (threat && ped.state !== 'flee') {
      ped.state = 'flee';
      ped.timer = 2 + Math.random() * 2;
      const a = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.fleeX = Math.cos(a); ped.fleeY = Math.sin(a);
    }
    if (ped.state === 'flee') {
      if (ped.timer <= 0) { ped.state = 'walk'; ped.timer = 0; }
      else {
        ped.x += ped.fleeX * 190 * dt;
        ped.y += ped.fleeY * 190 * dt;
        ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
      }
    } else {
      if (ped.timer <= 0 || distance(ped.x, ped.y, ped.tx, ped.ty) < 20) {
        ped.timer = 4 + Math.random() * 5;
        const t = randomRoadPointNear(game.city, game.rng, ped.x, ped.y, 60, 500);
        ped.tx = t.x + (Math.random() - 0.5) * 130;
        ped.ty = t.y + (Math.random() - 0.5) * 130;
      }
      const a = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
      ped.angle = a;
      const nx = ped.x + Math.cos(a) * ped.speed * dt;
      const ny = ped.y + Math.sin(a) * ped.speed * dt;
      if (!hitsBuilding(game.city, nx, ny, 10) && !isWater(game.city, nx, ny)) {
        ped.x = nx; ped.y = ny;
      } else {
        ped.timer = 0; // blocked: pick a new target
      }
    }
    ped.x = clamp(ped.x, 20, WORLD.w - 20);
    ped.y = clamp(ped.y, 20, WORLD.beachY + 40);
  }
  game.peds = game.peds.filter((ped) => ped.state !== 'gone');
  if (game.peds.length < 18) spawnPeds(game, 18 - game.peds.length);
}

// --- Car vs car + entering/exiting -------------------------------------------

export function collideCars(game) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 40) {
        const push = (40 - d) / 2;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 120) {
          damageCar(game, a, rel * 0.05);
          damageCar(game, b, rel * 0.05);
          spawnParticles(game, (a.x + b.x) / 2, (a.y + b.y) / 2, { count: 6, colors: ['#ffd23f'], speed: 160, life: 0.3, size: 2 });
          if (a === game.player.car || b === game.player.car) {
            game.audio.crash();
            addShake(game, 4);
          }
        }
        const avg = (a.speed + b.speed) / 2;
        a.speed = avg * 0.7; b.speed = avg * 0.7;
      }
    }
  }
  // Player car vs pedestrians: knock them down (a crime if witnessed).
  const car = game.player.car;
  if (car && Math.abs(car.speed) > 60) {
    for (const ped of game.peds) {
      if (ped.state === 'down') continue;
      if (distance(car.x, car.y, ped.x, ped.y) < 26) {
        ped.state = 'down';
        ped.down = 5;
        ped.x += Math.cos(car.angle) * 30;
        ped.y += Math.sin(car.angle) * 30;
        spawnParticles(game, ped.x, ped.y, { count: 8, colors: ['#ff4444', '#ffffff'], speed: 120, life: 0.5, size: 3 });
        game.stats.pedsHit = (game.stats.pedsHit || 0) + 1;
        if (game.onCrime) game.onCrime(1, 'ped-down');
      }
    }
  }
}

export function nearestCar(game, x, y, maxD) {
  let best = null, bestD = maxD;
  for (const car of game.cars) {
    if (car.wrecked) continue;
    const d = distance(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(game, car) {
  const p = game.player;
  if (car.kind === 'traffic') {
    // Yank the driver out: they flee on foot.
    const shirts = ['#e74c3c', '#3498db', '#f1c40f'];
    const ped = makePed(car.x + 30, car.y + 30, shirts);
    ped.state = 'flee'; ped.timer = 3;
    ped.fleeX = Math.cos(car.angle + Math.PI / 2); ped.fleeY = Math.sin(car.angle + Math.PI / 2);
    game.peds.push(ped);
    if (game.onCrime) game.onCrime(1, 'carjack');
  }
  car.kind = 'player';
  car.driver = 'player';
  p.car = car;
  p.onFoot = false;
  p.x = car.x; p.y = car.y;
  game.stats.carsStolen = (game.stats.carsStolen || 0) + 1;
  game.audio.click();
}

export function exitCar(game) {
  const p = game.player;
  const car = p.car;
  if (!car) return;
  car.kind = 'parked';
  car.driver = null;
  car.speed = 0;
  p.car = null;
  p.onFoot = true;
  // Step out on the car's left side.
  const sx = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  const sy = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.x = hitsBuilding(game.city, sx, sy, 12) ? car.x - Math.cos(car.angle + Math.PI / 2) * 34 : sx;
  p.y = hitsBuilding(game.city, sx, sy, 12) ? car.y - Math.sin(car.angle + Math.PI / 2) * 34 : sy;
  game.audio.engineStop();
}
