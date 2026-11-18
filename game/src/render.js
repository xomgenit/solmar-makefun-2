// Canvas rendering for SOLMAR: the sun-soaked city, its cars, people and
// police, drawn top-down with a following camera. Everything is drawn from
// primitives — no image assets, so the game loads nothing over the network.
import { WORLD, isSand } from './city.js';
import { CAR_MODELS } from './entities.js';
import { drawFx } from './fx.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

function onScreen(cam, x, y, margin = 120) {
  return x > cam.x - margin && x < cam.x + VIEW_W + margin && y > cam.y - margin && y < cam.y + VIEW_H + margin;
}

export function drawWorld(ctx, game) {
  const { city, camera: cam } = game;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.translate(-cam.x, -cam.y);

  // Ground: grass, then the beach band and the sea.
  ctx.fillStyle = '#8fd06a';
  ctx.fillRect(cam.x - 20, cam.y - 20, VIEW_W + 40, VIEW_H + 40);
  ctx.fillStyle = '#f6dc9a';
  ctx.fillRect(cam.x - 20, WORLD.beachY, VIEW_W + 40, WORLD.seaY - WORLD.beachY);
  const sea = ctx.createLinearGradient(0, WORLD.seaY, 0, WORLD.h);
  sea.addColorStop(0, '#4db2e8');
  sea.addColorStop(1, '#1f6fb8');
  ctx.fillStyle = sea;
  ctx.fillRect(cam.x - 20, WORLD.seaY, VIEW_W + 40, WORLD.h - WORLD.seaY + 40);
  // Gentle wave lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let y = WORLD.seaY + 24; y < WORLD.h; y += 56) {
    ctx.beginPath();
    for (let x = Math.max(0, cam.x - 40); x < cam.x + VIEW_W + 40; x += 90) {
      ctx.moveTo(x, y + Math.sin((x + game.time * 30) / 60) * 4);
      ctx.lineTo(x + 44, y + Math.sin((x + 44 + game.time * 30) / 60) * 4);
    }
    ctx.stroke();
  }

  // Sidewalks ring every block (border + grass inner), then parks, then lots.
  ctx.fillStyle = '#d9d2bd';
  for (const s of city.sidewalks) {
    if (onScreen(cam, s.x + s.w / 2, s.y + s.h / 2, 100)) ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  ctx.fillStyle = '#8fd06a';
  for (const s of city.sidewalks) {
    if (onScreen(cam, s.x + s.w / 2, s.y + s.h / 2, 100)) ctx.fillRect(s.x + 12, s.y + 12, s.w - 24, s.h - 24);
  }
  // Parks.
  ctx.fillStyle = '#6fbf4f';
  for (const park of city.parks) {
    if (onScreen(cam, park.x + park.w / 2, park.y + park.h / 2, 100)) ctx.fillRect(park.x, park.y, park.w, park.h);
  }
  // Parking lots: asphalt + bay lines.
  for (const lot of city.lots) {
    if (!onScreen(cam, lot.x + lot.w / 2, lot.y + lot.h / 2, 100)) continue;
    ctx.fillStyle = '#3f434c';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let x = lot.x + 35; x < lot.x + lot.w - 10; x += 70) {
      ctx.beginPath(); ctx.moveTo(x, lot.y + 8); ctx.lineTo(x, lot.y + lot.h - 8); ctx.stroke();
    }
  }

  // Roads: asphalt, edge lines, centre dashes, crosswalks.
  ctx.fillStyle = '#454a54';
  for (const rx of city.roadsV) ctx.fillRect(rx - WORLD.roadW / 2, 0, WORLD.roadW, WORLD.beachY);
  for (const ry of city.roadsH) ctx.fillRect(0, ry - WORLD.roadW / 2, WORLD.w, WORLD.roadW);
  ctx.strokeStyle = '#f5d76e';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (const rx of city.roadsV) {
    ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, WORLD.beachY); ctx.stroke();
  }
  for (const ry of city.roadsH) {
    ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(WORLD.w, ry); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of city.roadsV) {
    for (const ry of city.roadsH) {
      if (!onScreen(cam, rx, ry, 120)) continue;
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx - WORLD.roadW / 2 + 8, ry + i * 12 - 3, 14, 6);
        ctx.fillRect(rx + WORLD.roadW / 2 - 22, ry + i * 12 - 3, 14, 6);
      }
    }
  }

  // The pier deck, out over the water.
  const pier = city.landmarks.pier;
  if (pier) {
    ctx.fillStyle = '#b08954';
    ctx.fillRect(pier.x - 34, pier.y - 130, 68, WORLD.seaY + 260 - (pier.y - 130));
    ctx.fillStyle = '#8a6a3e';
    for (let y = pier.y - 120; y < WORLD.seaY + 250; y += 26) ctx.fillRect(pier.x - 34, y, 68, 4);
    ctx.fillStyle = '#d9b06a';
    ctx.fillRect(pier.x - 44, WORLD.seaY + 220, 88, 40);
  }

  // Buildings: drop shadow, walls, coloured roof, tall ones get a side face.
  for (const b of city.buildings) {
    if (!onScreen(cam, b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
    if (b.tall) {
      ctx.fillStyle = '#b8a88e';
      ctx.fillRect(b.x + b.w - 14, b.y + 6, 14, b.h);
    }
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(b.x + 12, b.y + 12, b.w - 24, 8);
    if (b.landmark) {
      // Landmark door + sign strip.
      ctx.fillStyle = '#5b4636';
      ctx.fillRect(b.x + b.w / 2 - 12, b.y + b.h - 22, 24, 22);
    }
  }

  // Palms: trunk + fronds.
  for (const palm of city.palms) {
    if (!onScreen(cam, palm.x, palm.y, 40)) continue;
    ctx.strokeStyle = '#8a6a3e';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y + 8); ctx.lineTo(palm.x + 2, palm.y - 6); ctx.stroke();
    ctx.fillStyle = '#2f9e44';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + palm.x;
      ctx.beginPath();
      ctx.ellipse(palm.x + Math.cos(a) * 9, palm.y - 6 + Math.sin(a) * 9, 11, 4, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7c4a12';
    ctx.beginPath(); ctx.arc(palm.x + 2, palm.y - 6, 3, 0, Math.PI * 2); ctx.fill();
  }

  // Landmark labels.
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px Arial, sans-serif';
  for (const key of Object.keys(city.landmarks)) {
    const lm = city.landmarks[key];
    if (!onScreen(cam, lm.x, lm.y, 60)) continue;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(lm.name, lm.x, lm.y - lm.h / 2 - 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lm.name, lm.x, lm.y - lm.h / 2 - 10);
  }

  // Mission marker: light pillar + bouncing diamond + ground ring.
  const obj = game.missions.objective(game);
  if (obj.marker) {
    const m = obj.marker;
    const bob = Math.sin(game.time * 3) * 8;
    ctx.fillStyle = 'rgba(255,215,0,0.18)';
    ctx.fillRect(m.x - 26, m.y - 220, 52, 220);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(m.x, m.y, 42, 16, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.save();
    ctx.translate(m.x, m.y - 60 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-11, -11, 22, 22);
    ctx.restore();
  }

  ctx.restore();
}

function drawCarBody(ctx, car) {
  const def = CAR_MODELS[car.model];
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.roundRect(-def.w / 2 + 3, -def.h / 2 + 4, def.w, def.h, 7);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#1a1a1a';
  const ww = 10, wh = 5;
  ctx.fillRect(-def.w / 2 + 6, -def.h / 2 - 2, ww, wh);
  ctx.fillRect(-def.w / 2 + 6, def.h / 2 - 3, ww, wh);
  ctx.fillRect(def.w / 2 - 16, -def.h / 2 - 2, ww, wh);
  ctx.fillRect(def.w / 2 - 16, def.h / 2 - 3, ww, wh);
  // Body.
  ctx.fillStyle = car.wrecked ? '#3a3a3a' : car.color;
  ctx.beginPath();
  ctx.roundRect(-def.w / 2, -def.h / 2, def.w, def.h, 7);
  ctx.fill();
  if (car.model === 'cruiser') {
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.roundRect(-6, -def.h / 2, 20, def.h, 4);
    ctx.fill();
    // Flashing light bar.
    const phase = Math.floor(car.sirenT * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2e2e' : '#2e7bff';
    ctx.fillRect(-12, -def.h / 2 + 2, 9, 6);
    ctx.fillStyle = phase ? '#2e7bff' : '#ff2e2e';
    ctx.fillRect(-12, def.h / 2 - 8, 9, 6);
  }
  if (car.model === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.font = 'bold 7px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, -def.h / 2 + 8);
  }
  // Windshield + rear window.
  ctx.fillStyle = car.wrecked ? '#222' : '#bfe3f0';
  ctx.fillRect(6, -def.h / 2 + 4, 8, def.h - 8);
  ctx.fillRect(-16, -def.h / 2 + 4, 7, def.h - 8);
  // Brake lights.
  if (car.brakeLights) {
    ctx.fillStyle = '#ff2222';
    ctx.fillRect(-def.w / 2, -def.h / 2 + 2, 3, 5);
    ctx.fillRect(-def.w / 2, def.h / 2 - 7, 3, 5);
  }
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(def.w / 2 - 2, -def.h / 2 + 3, 3, 4);
  ctx.fillRect(def.w / 2 - 2, def.h / 2 - 7, 3, 4);
  ctx.restore();
  // Wreck smoke.
  if (car.wrecked) {
    ctx.fillStyle = 'rgba(80,80,80,0.5)';
    const wob = Math.sin(gameTime(car) * 2) * 4;
    ctx.beginPath(); ctx.arc(car.x + wob, car.y - 16, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(car.x - wob, car.y - 26, 6, 0, Math.PI * 2); ctx.fill();
  }
}

// Cheap per-car time source for the wreck-smoke wobble (no mutation).
function gameTime(car) { return (car.id * 1.7 + Date.now() / 1000) % 100; }

function drawPerson(ctx, x, y, angle, shirt, skin, down) {
  ctx.save();
  ctx.translate(x, y);
  if (down) {
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(2, 3, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(13, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(1, 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(Math.cos(angle) * 3, Math.sin(angle) * 3, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHealthBar(ctx, x, y, hp) {
  if (hp >= 100) return;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 14, y - 24, 28, 5);
  ctx.fillStyle = hp > 50 ? '#7CFC00' : hp > 25 ? '#ffd23f' : '#ff4444';
  ctx.fillRect(x - 13, y - 23, 26 * Math.max(0, hp) / 100, 3);
}

export function drawEntities(ctx, game) {
  const { camera: cam } = game;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  for (const car of game.cars) {
    if (onScreen(cam, car.x, car.y, 60)) drawCarBody(ctx, car);
  }
  for (const ped of game.peds) {
    if (onScreen(cam, ped.x, ped.y, 40)) drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.state === 'down');
  }
  for (const cop of game.cops) {
    if (!onScreen(cam, cop.x, cop.y, 40)) continue;
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#1f3a93', '#f1c27d', false);
    // Police cap.
    ctx.fillStyle = '#101c3f';
    ctx.beginPath(); ctx.arc(cop.x + Math.cos(cop.angle) * 3, cop.y + Math.sin(cop.angle) * 3 - 1, 4, 0, Math.PI * 2); ctx.fill();
    drawHealthBar(ctx, cop.x, cop.y, cop.hp);
  }
  for (const e of game.enemies) {
    if (!onScreen(cam, e.x, e.y, 40)) continue;
    drawPerson(ctx, e.x, e.y, e.angle, '#c0392b', '#c68642', false);
    drawHealthBar(ctx, e.x, e.y, e.hp);
  }

  // The player: Dice in a teal jacket, gun toward the mouse when on foot.
  const p = game.player;
  if (p.onFoot && onScreen(cam, p.x, p.y, 40)) {
    drawPerson(ctx, p.x, p.y, p.angle, '#14b8a6', '#f1c27d', false);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8);
    ctx.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
    ctx.stroke();
  }

  drawFx(ctx, game, cam);
  ctx.restore();
}
