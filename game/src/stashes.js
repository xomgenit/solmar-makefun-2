// Hidden cash stashes for SOLMAR: three $300 bundles tucked around Solmar
// Bay. Their positions derive from the city seed alone, so CONTINUE rebuilds
// the same spots and the save only needs the found flags. Unfound stashes
// show as green dots on the minimap, so finding them is a real activity
// instead of a needle in a 4800x3600 haystack.
import { makeRng } from './rng.js';
import { hitsBuilding, isWater } from './city.js';
import { addFloater, showHint } from './fx.js';

export const STASH_VALUE = 300;
export const STASH_COUNT = 3;

// One on the beach near the pier, one in the east docks, one in a quiet
// mid-city block — each nudged until it sits on walkable ground.
const STASH_ANCHORS = [
  { x: 1050, y: 3130 },
  { x: 4150, y: 2520 },
  { x: 2650, y: 2050 },
];

export function buildStashes(city) {
  const rng = makeRng((city.seed ^ 0x5a51a5) >>> 0);
  const stashes = [];
  for (const a of STASH_ANCHORS) {
    let x = a.x, y = a.y;
    for (let t = 0; t < 48; t++) {
      const cx = a.x + rng.range(-260, 260);
      const cy = a.y + rng.range(-170, 170);
      if (!hitsBuilding(city, cx, cy, 22) && !isWater(city, cx, cy)) { x = cx; y = cy; break; }
      x = cx; y = cy;
    }
    stashes.push({ x, y, found: false });
  }
  return stashes;
}

// Walk over a stash to collect it: +$300, a floater, and an autosave.
export function checkStashes(game) {
  const p = game.player;
  for (const s of game.stashes) {
    if (s.found) continue;
    if (Math.hypot(p.x - s.x, p.y - s.y) < 46) {
      s.found = true;
      game.stashesFound = (game.stashesFound || 0) + 1;
      game.cash += STASH_VALUE;
      game.audio.cash();
      addFloater(game, s.x, s.y - 24, `+$${STASH_VALUE} HIDDEN CASH`, '#7CFC00');
      showHint(game, `Hidden stash found! ${game.stashesFound}/${STASH_COUNT}`, 3);
      if (game.saveGame) game.saveGame();
    }
  }
}

// Draw unfound stashes in world space (the caller applies the camera):
// a pulsing green glow, a money bag, and a $ sign.
export function drawStashes(ctx, game) {
  const pulse = 0.6 + 0.4 * Math.sin(game.time * 4);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  for (const s of game.stashes) {
    if (s.found) continue;
    ctx.fillStyle = `rgba(124,252,0,${0.18 + 0.12 * pulse})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, 26 + 4 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7CFC00';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#2f7d32';
    ctx.beginPath();
    ctx.roundRect(s.x - 10, s.y - 8, 20, 18, 5);
    ctx.fill();
    ctx.fillStyle = '#7CFC00';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.fillText('$', s.x, s.y + 6);
  }
  ctx.restore();
}
