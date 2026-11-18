// The wanted system for SOLMAR: heat rises when crimes are witnessed, foot
// cops chase and shoot on foot, cruisers pursue by road when the player
// drives, heat cools when no officer can see the player, and the Sunset Auto
// Spa respray clears the slate for $150.
import { WORLD, nearestRoadPoint, randomRoadPointNear, resolveBuildingCollision, hitsBuilding, isWater } from './city.js';
import { clamp, distance, angleDelta } from './rng.js';
import { makeCar, damageCar } from './entities.js';
import { fireHitscan } from './combat.js';
import { spawnParticles, showBanner, showHint, addFloater } from './fx.js';

export function witnessed(game) {
  for (const cop of game.cops) if (distance(cop.x, cop.y, game.player.x, game.player.y) < 700) return true;
  for (const car of game.cars) {
    if (car.kind === 'cruiser' && distance(car.x, car.y, game.player.x, game.player.y) < 700) return true;
  }
  for (const ped of game.peds) {
    if (ped.state !== 'down' && distance(ped.x, ped.y, game.player.x, game.player.y) < 300) return true;
  }
  return false;
}

// Raise the wanted level by n stars, only when someone saw it happen.
export function addWanted(game, n, kind = '') {
  if (game.state !== 'playing') return;
  if (!witnessed(game) && kind !== 'cop-down') return;
  const before = game.wanted;
  game.wanted = clamp(game.wanted + n, 0, 5);
  if (game.wanted > before) {
    game.unseenTimer = 0;
    if (game.wanted >= 1) game.audio.sirenStart();
  }
}

export function policeSeesPlayer(game) {
  const p = game.player;
  for (const cop of game.cops) if (distance(cop.x, cop.y, p.x, p.y) < 540) return true;
  for (const car of game.cars) {
    if (car.kind === 'cruiser' && distance(car.x, car.y, p.x, p.y) < 680) return true;
  }
  return false;
}

export function updateWanted(game, dt) {
  if (game.wanted <= 0) return;
  if (policeSeesPlayer(game)) {
    game.unseenTimer = 0;
    return;
  }
  game.unseenTimer += dt;
  // Lose one star every 5 seconds unseen, after a 6-second grace period.
  if (game.unseenTimer > 6) {
    game.unseenTimer = 6;
    game.coolTimer = (game.coolTimer || 0) + dt;
    if (game.coolTimer > 5) {
      game.coolTimer = 0;
      game.wanted -= 1;
      if (game.wanted <= 0) {
        game.wanted = 0;
        game.cops = [];
        for (const car of game.cars) if (car.kind === 'cruiser') car.kind = 'parked';
        game.cars = game.cars.filter((c) => c.kind !== 'cruiser');
        game.audio.sirenStop();
        showHint(game, 'You lost the heat. Stay clean.', 3);
      }
    }
  }
}

function spawnFootCop(game) {
  const p = randomRoadPointNear(game.city, game.rng, game.player.x, game.player.y, 650, 950);
  game.cops.push({
    x: p.x, y: p.y, hp: 100, team: 'cop',
    angle: 0, shootCd: 1 + Math.random(), bustT: 0,
    speed: 215 + game.wanted * 8,
  });
}

function spawnCruiser(game) {
  const p = randomRoadPointNear(game.city, game.rng, game.player.x, game.player.y, 700, 1000);
  const car = makeCar('cruiser', p.x, p.y, 0, 'cruiser');
  car.driver = 'police';
  game.cars.push(car);
}

export function updatePolice(game, dt) {
  const p = game.player;
  if (game.wanted <= 0) return;

  // Desired force depends on whether the player is on foot or driving.
  const wantFoot = p.onFoot ? Math.min(game.wanted, 4) : (game.wanted >= 3 ? 1 : 0);
  const wantCars = !p.onFoot ? Math.min(game.wanted, 4) : (game.wanted >= 4 ? 1 : 0);
  const cruisers = game.cars.filter((c) => c.kind === 'cruiser' && !c.wrecked);

  game.spawnCd = (game.spawnCd || 0) - dt;
  if (game.spawnCd <= 0) {
    if (game.cops.length < wantFoot) { spawnFootCop(game); game.spawnCd = 1.2; }
    else if (cruisers.length < wantCars) { spawnCruiser(game); game.spawnCd = 1.5; }
  }

  // Foot cops: run at the player, shoot in range, bust on contact.
  for (const cop of game.cops) {
    const d = distance(cop.x, cop.y, p.x, p.y);
    cop.shootCd -= dt;
    const a = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = a;
    if (d > 30) {
      const nx = cop.x + Math.cos(a) * cop.speed * dt;
      const ny = cop.y + Math.sin(a) * cop.speed * dt;
      if (!hitsBuilding(game.city, nx, ny, 12) && !isWater(game.city, nx, ny)) {
        cop.x = nx; cop.y = ny;
      } else {
        // Slide around the obstacle: try each axis alone.
        if (!hitsBuilding(game.city, nx, cop.y, 12)) cop.x = nx;
        else if (!hitsBuilding(game.city, cop.x, ny, 12)) cop.y = ny;
      }
      resolveBuildingCollision(game.city, cop, 12);
    }
    if (d < 430 && cop.shootCd <= 0 && p.onFoot) {
      cop.shootCd = 1.1 + Math.random() * 0.6 - game.wanted * 0.06;
      fireHitscan(game, cop.x, cop.y, p.x, p.y, { damage: 6, team: 'cop', spread: 0.3, tracerColor: '#7ec8ff' });
      game.audio.shoot();
    }
    // Busted: an officer standing on a slow player on foot.
    if (d < 30 && p.onFoot) {
      cop.bustT += dt;
      if (cop.bustT > 1.1) {
        game.endRun('busted');
        return;
      }
    } else {
      cop.bustT = 0;
    }
  }
  // Drop cops that fell too far behind.
  game.cops = game.cops.filter((c) => distance(c.x, c.y, p.x, p.y) < 2000);

  // Cruisers: steer at the player, ram when close, back out of trouble.
  for (const car of game.cars) {
    if (car.kind !== 'cruiser' || car.wrecked) continue;
    car.sirenT += dt;
    const d = distance(car.x, car.y, p.x, p.y);
    const targetA = Math.atan2(p.y - car.y, p.x - car.x);
    if (car.reverseT > 0) {
      car.reverseT -= dt;
      car.speed = -180;
      car.angle += 1.6 * dt;
    } else {
      car.angle += clamp(angleDelta(car.angle, targetA), -2.4 * dt, 2.4 * dt);
      const want = d < 130 ? 620 : 520;
      car.speed += clamp(want - car.speed, -300 * dt, 340 * dt);
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (hitsBuilding(game.city, nx, ny, 20) || isWater(game.city, nx, ny)) {
      if (Math.abs(car.speed) > 150) {
        damageCar(game, car, Math.abs(car.speed) * 0.06);
        spawnParticles(game, nx, ny, { count: 6, colors: ['#ffd23f'], speed: 150, life: 0.3, size: 2 });
      }
      car.reverseT = 0.8;
      car.speed = -120;
    } else {
      car.x = nx; car.y = ny;
    }
    car.x = clamp(car.x, 30, WORLD.w - 30);
    car.y = clamp(car.y, 30, WORLD.h - 30);
    resolveBuildingCollision(game.city, car, 18);
    // Ramming the player's car damages it.
    if (p.car && d < 46) {
      damageCar(game, p.car, 22 * dt);
      if (Math.random() < 0.3) spawnParticles(game, car.x, car.y, { count: 3, colors: ['#ffd23f'], speed: 140, life: 0.3, size: 2 });
    }
    if (d > 2200) {
      // Teleport a lost cruiser back onto a road near the player.
      const rp = randomRoadPointNear(game.city, game.rng, p.x, p.y, 700, 1000);
      car.x = rp.x; car.y = rp.y; car.speed = 0;
    }
  }
}

// Sunset Auto Spa: $150 clears the wanted level and repairs the car.
export function tryRespray(game) {
  const p = game.player;
  const spa = game.city.landmarks.autospa;
  if (!p.car || distance(p.x, p.y, spa.x, spa.y) > 170) return false;
  if (game.cash < 150) {
    showHint(game, 'Respray costs $150 — not enough cash.', 2.5);
    return true;
  }
  game.cash -= 150;
  game.wanted = 0;
  game.cops = [];
  game.cars = game.cars.filter((c) => c.kind !== 'cruiser');
  p.car.health = 100;
  p.car.wrecked = false;
  game.audio.sirenStop();
  game.audio.jingle();
  showBanner(game, 'RESPRAY COMPLETE', 'Wanted cleared — car repaired. $150');
  addFloater(game, p.x, p.y - 40, '-$150', '#ff9f43');
  return true;
}
