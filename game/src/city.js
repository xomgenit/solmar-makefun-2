// Procedural Solmar Bay: a seeded road grid, city blocks, landmark buildings,
// a beachfront promenade, docks and a pier. buildCity(seed) is deterministic —
// the same seed always rebuilds the same streets, which is what makes CONTINUE
// restore the player's city exactly.
import { makeRng, clamp } from './rng.js';

export const WORLD = {
  w: 4800, h: 3600,
  roadGap: 400, roadW: 96,
  beachY: 3000, // sand starts here
  seaY: 3300, // water starts here
  coastRoadY: 2920, // Ocean Drive, the beachfront road
};

const ROOF_COLORS = ['#e07856', '#d9a05b', '#7fb3d5', '#a8c686', '#c98bb9', '#e8e0c8', '#8fa3b8', '#e5b8a0'];
const WALL_COLORS = ['#f2e6d0', '#e8dcc8', '#dce8f0', '#f0e2d4', '#e4e8d8', '#f5efe0'];

// Landmark anchors: fixed block positions with a little seeded jitter.
const LANDMARK_SPOTS = [
  { id: 'hideout', name: "Dice's Hideout", gx: 600, gy: 600, kind: 'house' },
  { id: 'diner', name: 'Sunny Side Diner', gx: 1400, gy: 600, kind: 'diner' },
  { id: 'hospital', name: 'Solmar General', gx: 3200, gy: 600, kind: 'hospital' },
  { id: 'bank', name: 'Solmar National Bank', gx: 2000, gy: 1000, kind: 'bank' },
  { id: 'sbpd', name: 'SBPD Headquarters', gx: 2400, gy: 1400, kind: 'police' },
  { id: 'garage', name: 'Bay Auto Garage', gx: 3600, gy: 1800, kind: 'garage' },
  { id: 'autospa', name: 'Sunset Auto Spa', gx: 1200, gy: 2200, kind: 'spa' },
  { id: 'docks', name: 'East Harbour Docks', gx: 4400, gy: 2200, kind: 'docks' },
  { id: 'pier', name: 'Solmar Pier', gx: 800, gy: 3200, kind: 'pier' },
];

export function buildCity(seed) {
  const rng = makeRng(seed);
  const roadsV = [];
  for (let x = 400; x <= 4400; x += WORLD.roadGap) roadsV.push(x);
  const roadsH = [];
  for (let y = 400; y <= 2800; y += WORLD.roadGap) roadsH.push(y);
  roadsH.push(WORLD.coastRoadY);

  const buildings = [];
  const palms = [];
  const parkedSpots = [];
  const landmarks = {};
  const parks = [];
  const lots = [];
  const sidewalks = [];

  // Landmark buildings first, so nothing else overlaps them.
  for (const spot of LANDMARK_SPOTS) {
    const jx = rng.range(-30, 30), jy = rng.range(-30, 30);
    const x = spot.gx + jx, y = spot.gy + jy;
    const w = spot.kind === 'docks' ? 320 : spot.kind === 'pier' ? 120 : rng.range(150, 210);
    const h = spot.kind === 'docks' ? 160 : spot.kind === 'pier' ? 260 : rng.range(120, 170);
    const b = {
      x: x - w / 2, y: y - h / 2, w, h,
      wall: spot.kind === 'police' ? '#cfe0ee' : spot.kind === 'hospital' ? '#fdfdf8' : rng.pick(WALL_COLORS),
      roof: spot.kind === 'diner' ? '#e07856' : spot.kind === 'bank' ? '#d9a05b' : rng.pick(ROOF_COLORS),
      landmark: spot.id, label: spot.name, tall: spot.kind === 'bank' || spot.kind === 'police',
    };
    buildings.push(b);
    landmarks[spot.id] = { id: spot.id, name: spot.name, x, y, w, h, kind: spot.kind };
  }

  // Ordinary blocks: buildings, parks, or parking lots between the roads.
  const xs = [0, ...roadsV, WORLD.w];
  const ys = [0, ...roadsH, WORLD.beachY];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const bx = xs[i] + WORLD.roadW / 2 + 14;
      const by = ys[j] + WORLD.roadW / 2 + 14;
      const bw = xs[i + 1] - xs[i] - WORLD.roadW - 28;
      const bh = ys[j + 1] - ys[j] - WORLD.roadW - 28;
      // Sidewalk ring for the whole inter-road block (drawn under everything).
      const sw = xs[i + 1] - xs[i] - WORLD.roadW;
      const sh = ys[j + 1] - ys[j] - WORLD.roadW;
      if (sw > 40 && sh > 40 && ys[j] < WORLD.coastRoadY) {
        sidewalks.push({ x: xs[i] + WORLD.roadW / 2, y: ys[j] + WORLD.roadW / 2, w: sw, h: sh });
      }
      if (bw < 90 || bh < 90) continue;
      const cx = bx + bw / 2, cy = by + bh / 2;
      // Keep landmark blocks clear.
      if (LANDMARK_SPOTS.some((s) => Math.abs(s.gx - cx) < 260 && Math.abs(s.gy - cy) < 240)) continue;
      const roll = rng.next();
      if (roll < 0.16) {
        parks.push({ x: bx, y: by, w: bw, h: bh });
        const n = rng.int(3, 6);
        for (let k = 0; k < n; k++) palms.push({ x: rng.range(bx + 20, bx + bw - 20), y: rng.range(by + 20, by + bh - 20) });
        continue;
      }
      if (roll < 0.3) {
        // Parking lot: asphalt + rows of parked-car spots.
        lots.push({ x: bx, y: by, w: bw, h: bh });
        const rows = Math.max(1, Math.floor(bh / 70));
        for (let r = 0; r < rows; r++) {
          const n = Math.max(1, Math.floor(bw / 70));
          for (let k = 0; k < n; k++) {
            if (rng.chance(0.55)) {
              parkedSpots.push({ x: bx + 35 + k * 70, y: by + 35 + r * 70, angle: rng.chance(0.5) ? 0 : Math.PI });
            }
          }
        }
        continue;
      }
      const nB = rng.chance(0.45) ? 3 : 2;
      for (let k = 0; k < nB; k++) {
        const w = rng.range(110, Math.min(230, bw - 20));
        const h = rng.range(100, Math.min(180, bh - 20));
        const x = rng.range(bx, bx + bw - w);
        const y = rng.range(by, by + bh - h);
        if (buildings.some((o) => x < o.x + o.w + 16 && x + w + 16 > o.x && y < o.y + o.h + 16 && y + h + 16 > o.y)) continue;
        buildings.push({
          x, y, w, h,
          wall: rng.pick(WALL_COLORS), roof: rng.pick(ROOF_COLORS),
          tall: rng.chance(0.18), landmark: null, label: null,
        });
      }
    }
  }

  // Beach palms along the promenade + a few roadside palms.
  for (let x = 120; x < WORLD.w; x += rng.range(90, 170)) {
    palms.push({ x, y: WORLD.beachY + rng.range(30, 90) });
  }
  for (let i = 0; i < 40; i++) {
    const vertical = rng.chance(0.5);
    palms.push({
      x: vertical ? rng.pick(roadsV) + rng.range(-70, 70) : rng.range(100, WORLD.w - 100),
      y: vertical ? rng.range(100, WORLD.beachY - 100) : rng.pick(roadsH) + rng.range(-70, 70),
    });
  }

  // A few kerbside parked cars on the coast road and downtown, in the lane.
  for (let i = 0; i < 14; i++) {
    parkedSpots.push({
      x: rng.range(300, WORLD.w - 300),
      y: rng.chance(0.5) ? WORLD.coastRoadY + (rng.chance(0.5) ? 34 : -34) : rng.pick(roadsH) + (rng.chance(0.5) ? 34 : -34),
      angle: rng.chance(0.5) ? 0 : Math.PI,
    });
  }

  return { seed, roadsV, roadsH, buildings, palms, parkedSpots, landmarks, parks, lots, sidewalks };
}

// --- Queries ---------------------------------------------------------------

export function isRoad(city, x, y) {
  const half = WORLD.roadW / 2;
  if (city.roadsV.some((rx) => Math.abs(x - rx) <= half)) return true;
  if (city.roadsH.some((ry) => Math.abs(y - ry) <= half)) return true;
  return false;
}

export function isWater(city, x, y) {
  if (y < WORLD.seaY) return false;
  // The pier deck is walkable out over the water.
  const pier = city.landmarks.pier;
  if (pier && Math.abs(x - pier.x) < 34 && y >= pier.y - 130 && y <= WORLD.seaY + 260) return false;
  return true;
}

export function isSand(x, y) {
  return y >= WORLD.beachY && y < WORLD.seaY;
}

// Circle vs buildings; returns the building hit, or null.
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of any building it overlaps (axis-separated slide).
export function resolveBuildingCollision(city, pos, r) {
  for (const b of city.buildings) {
    const nx = clamp(pos.x, b.x, b.x + b.w);
    const ny = clamp(pos.y, b.y, b.y + b.h);
    const dx = pos.x - nx, dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.y = ny + (dy / d) * r;
      } else {
        // Centre inside the building: push out along the smallest overlap.
        const left = pos.x - b.x + r, right = b.x + b.w - pos.x + r;
        const top = pos.y - b.y + r, bottom = b.y + b.h - pos.y + r;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.x - r;
        else if (m === right) pos.x = b.x + b.w + r;
        else if (m === top) pos.y = b.y - r;
        else pos.y = b.y + b.h + r;
      }
    }
  }
}

export function zoneAt(city, x, y) {
  if (y >= WORLD.beachY) return 'PALMA BEACH';
  if (x >= 4000) return 'EAST HARBOUR';
  if (y >= 2400) return 'SUNSET STRIP';
  if (x >= 1600 && x <= 3200 && y >= 800 && y <= 2000) return 'DOWNTOWN';
  if (y < 800) return 'NORTH HILLS';
  if (x < 1200) return 'OLD TOWN';
  return 'SOLMAR BAY';
}

// Nearest point on any road centre line.
export function nearestRoadPoint(city, x, y) {
  let best = null, bestD = Infinity;
  for (const rx of city.roadsV) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 60, WORLD.beachY - 60) }; }
  }
  for (const ry of city.roadsH) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 60, WORLD.w - 60), y: ry }; }
  }
  return best;
}

// Random point on a road at a distance band from (x, y).
export function randomRoadPointNear(city, rng, x, y, minD, maxD) {
  for (let tries = 0; tries < 24; tries++) {
    const vertical = rng.chance(0.5);
    const px = vertical ? rng.pick(city.roadsV) : rng.range(100, WORLD.w - 100);
    const py = vertical ? rng.range(100, WORLD.beachY - 100) : rng.pick(city.roadsH);
    const d = Math.hypot(px - x, py - y);
    if (d >= minD && d <= maxD) return { x: px, y: py };
  }
  return nearestRoadPoint(city, x + minD, y);
}
