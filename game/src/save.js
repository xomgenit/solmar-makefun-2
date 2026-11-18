// localStorage saves for SOLMAR. The save stores the city seed, so CONTINUE
// rebuilds the exact same city the player left — never a fresh random one.
export const SAVE_KEY = 'solmar-save-v2';
export const SAVE_VERSION = 2;

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION || typeof data.seed !== 'number') return null;
    return data;
  } catch { return null; }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() }));
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// Serialise the live game into a plain save object.
export function serializeGame(game) {
  const p = game.player;
  const save = {
    seed: game.city.seed,
    cash: game.cash,
    health: Math.max(1, Math.round(p.health)),
    player: { x: Math.round(p.x), y: Math.round(p.y) },
    inCar: !!p.car,
    car: p.car ? {
      model: p.car.model, x: Math.round(p.car.x), y: Math.round(p.car.y),
      angle: p.car.angle, health: Math.round(p.car.health), color: p.car.color,
    } : null,
    mission: game.missions.active ? game.missions.active.def.id : null,
    missionStep: game.missions.active ? game.missions.active.stepIndex : 0,
    completedMissions: [...game.missions.done],
    unlockedSports: !!game.unlockedSports,
    stashesFound: game.stashesFound || 0,
    stats: { ...game.stats },
  };
  return save;
}
