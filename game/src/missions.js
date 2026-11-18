// Mission system for SOLMAR: a small step engine plus a registry of mission
// definitions. The five Vera story missions chain after the free-roam
// intro: each completion queues the next job a few seconds later (so the
// MISSION COMPLETE banner stays readable), and a failed mission is offered
// again the same way. Builder 1's engine, extended by builder 2 with:
// chaining (def.next + pendingStart), step.onEnter hooks, requireCar goto
// steps, and a fix for channel steps (their `seconds` is a hold duration,
// not a countdown — the old code failed the mission the frame it completed).
//
// Mission definition:
//   { id, title, giver, briefing, reward, next?,
//     steps: [ { kind, ... } ], onStart(game)?, onComplete(game)? }
//
// Step kinds:
//   goto     { landmark | x, y, radius, label, requireCar? } — reach a place
//   pickup   { landmark | x, y, radius, label }            — press E there
//   eliminate { count, spawn: {landmark | x, y}, label }   — defeat N Kings
//   channel  { landmark | x, y, radius, seconds, label }   — hold position
// Any non-channel step may carry `seconds` for a countdown; expiry fails
// the mission. Any step may carry onEnter(game), run when the step begins.
import { distance } from './rng.js';
import { spawnEnemy } from './combat.js';
import { showBanner, showHint, addFloater } from './fx.js';

// Story order, used to find the next job after a save/load round trip.
export const MISSION_ORDER = ['freeroam', 'wheels', 'pickup', 'delivery', 'pier', 'score'];

export function stepPos(game, step) {
  if (step.landmark) {
    const lm = game.city.landmarks[step.landmark];
    return { x: lm.x, y: lm.y };
  }
  return { x: step.x, y: step.y };
}

function enterStep(game, active) {
  const step = active.def.steps[active.stepIndex];
  active.stepState = { t: 0, progress: 0, killsAtStart: game.stats.kills || 0 };
  if (step.seconds) active.stepState.timeLeft = step.seconds;
  if (step.kind === 'eliminate') {
    const sp = stepPos(game, step.spawn || step);
    active.stepState.need = step.count;
    for (let i = 0; i < step.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 140;
      spawnEnemy(game, sp.x + Math.cos(a) * r, sp.y + Math.sin(a) * r, 'gang', {
        hp: 80, missionId: active.def.id,
      });
    }
    showHint(game, `${step.count} Harbor Kings guard this spot. Take them down.`, 3);
  }
  if (step.label) showHint(game, step.label, 3);
  if (step.onEnter) step.onEnter(game);
}

export function createMissions() {
  const missions = {
    defs: {},
    active: null, // { def, stepIndex, stepState }
    done: [],
    pendingStart: null, // { id, t } — next job, queued after a banner

    register(def) {
      this.defs[def.id] = def;
    },

    start(id, game) {
      const def = this.defs[id];
      if (!def) return false;
      this.pendingStart = null;
      this.active = { def, stepIndex: 0, stepState: {} };
      if (def.onStart) def.onStart(game);
      showBanner(game, def.title.toUpperCase(), def.briefing || '');
      enterStep(game, this.active);
      return true;
    },

    // First story mission the player has not finished yet (null when the
    // story is done). Used after CONTINUE to resume the chain.
    nextUndone() {
      for (const id of MISSION_ORDER) {
        if (!this.done.includes(id) && (!this.active || this.active.def.id !== id)) return id;
      }
      return null;
    },

    failCurrent(game, reason) {
      if (!this.active) return;
      const id = this.active.def.id;
      showBanner(game, 'MISSION FAILED', reason || this.active.def.title);
      game.audio.wasted();
      this.active = null;
      // Offer the same job again after the banner has been read.
      this.pendingStart = { id, t: 4 };
    },

    completeCurrent(game) {
      const active = this.active;
      if (!active) return;
      const def = active.def;
      // Clear mission state BEFORE any effect runs, so a reward can never
      // pay out twice or re-trigger from a stale update.
      this.active = null;
      this.done.push(def.id);
      game.cash += def.reward;
      game.audio.cash();
      game.audio.jingle();
      addFloater(game, game.player.x, game.player.y - 40, `+$${def.reward}`, '#7CFC00');
      showBanner(game, 'MISSION COMPLETE', `${def.title} — $${def.reward}`);
      if (def.onComplete) def.onComplete(game);
      // Chain the next story job after the banner has been read.
      if (def.next && this.defs[def.next]) this.pendingStart = { id: def.next, t: 3.5 };
      if (game.saveGame) game.saveGame();
    },

    update(game, dt) {
      const active = this.active;
      if (!active) {
        // No active job: count down to the queued next one, if any.
        if (this.pendingStart) {
          this.pendingStart.t -= dt;
          if (this.pendingStart.t <= 0) {
            const id = this.pendingStart.id;
            this.pendingStart = null;
            this.start(id, game);
          }
        }
        return;
      }
      const step = active.def.steps[active.stepIndex];
      const st = active.stepState;
      st.t += dt;

      // Countdown steps fail on expiry. Channel steps are exempt: their
      // `seconds` is the hold duration, and failing at timeLeft 0 would
      // make them impossible (progress reaches `seconds` the same frame).
      if (step.seconds && step.kind !== 'channel') {
        st.timeLeft -= dt;
        if (st.timeLeft <= 0) {
          this.failCurrent(game, 'Out of time.');
          return;
        }
      }

      let done = false;
      const pos = stepPos(game, step);
      const d = distance(game.player.x, game.player.y, pos.x, pos.y);
      const radius = step.radius ?? 130; // landmark buildings are wide: 130 keeps goto/pickup reachable from any side
      if (step.kind === 'goto') {
        if (step.requireCar && !game.player.car) {
          if (d < radius) showHint(game, 'You need a car for this job — steal one and drive here.', 0.5);
          done = false;
        } else {
          done = d < radius;
        }
      } else if (step.kind === 'pickup') {
        if (d < radius) showHint(game, 'Press E to pick it up', 0.2);
        if (d < radius && game.input.justPressed('KeyE')) { game.eConsumed = true; done = true; }
      } else if (step.kind === 'eliminate') {
        const killed = (game.stats.kills || 0) - st.killsAtStart;
        st.progress = killed;
        done = killed >= st.need;
      } else if (step.kind === 'channel') {
        if (d < radius) {
          st.progress += dt;
          if (st.progress >= step.seconds) done = true;
        } else if (st.progress > 0) {
          st.progress = Math.max(0, st.progress - dt * 0.5);
        }
      }
      if (!done) return;

      game.audio.pickup();
      active.stepIndex += 1;
      if (active.stepIndex >= active.def.steps.length) {
        this.completeCurrent(game);
      } else {
        enterStep(game, active);
      }
    },

    // What the objective panel shows, plus the world marker (if any).
    objective(game) {
      const active = this.active;
      if (!active) {
        if (this.pendingStart && this.defs[this.pendingStart.id]) {
          const def = this.defs[this.pendingStart.id];
          return {
            title: "VERA'S NEXT JOB",
            text: `${def.title} — ${def.briefing || ''}`,
            sub: 'Starting soon…',
            marker: null,
          };
        }
        return {
          title: 'FREE ROAM',
          text: 'Explore Solmar Bay. Vera has work at the diner when you are ready.',
          sub: '',
          marker: null,
        };
      }
      const step = active.def.steps[active.stepIndex];
      const st = active.stepState;
      let sub = '';
      if (step.seconds && step.kind !== 'channel') sub = `${Math.max(0, Math.ceil(st.timeLeft || 0))}s left`;
      if (step.kind === 'channel') sub = `${Math.floor((st.progress / step.seconds) * 100)}% — hold position`;
      if (step.kind === 'eliminate') sub = `${st.progress || 0} / ${st.need} down`;
      const pos = stepPos(game, step);
      // Eliminate steps have no target position — showing a distance
      // would render "NaNm" in the objective panel (caught in the
      // pier screenshot, 2026-11-18). Show progress only.
      const hasPos = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y);
      const dist = hasPos ? Math.round(distance(game.player.x, game.player.y, pos.x, pos.y)) : null;
      return {
        title: active.def.title.toUpperCase(),
        text: step.label || '',
        sub: dist === null ? sub : (sub ? `${sub}  ·  ${dist}m` : `${dist}m`),
        marker: step.kind === 'eliminate' ? null : pos,
      };
    },
  };

  // Intro: meet Vera at the diner, earn $50, then the story jobs begin.
  missions.register({
    id: 'freeroam',
    title: 'Free Roam',
    giver: 'Vera Santos',
    briefing: 'New in town, Dice? Come find me at the Sunny Side Diner.',
    reward: 50,
    next: 'wheels',
    steps: [
      { kind: 'goto', landmark: 'diner', radius: 130, label: 'Meet Vera at the Sunny Side Diner' },
    ],
    onComplete(game) {
      showHint(game, 'Vera: "Good. I have five jobs for you — first one coming up."', 5);
    },
  });

  // 1. First Wheels — steal a car, bring it to the garage. $250.
  missions.register({
    id: 'wheels',
    title: 'First Wheels',
    giver: 'Vera Santos',
    briefing: 'Vera needs a clean set of wheels. Steal a car and bring it to Bay Auto Garage.',
    reward: 250,
    next: 'pickup',
    steps: [
      { kind: 'goto', landmark: 'garage', radius: 130, requireCar: true, label: 'Steal a car and drive it to Bay Auto Garage' },
    ],
  });

  // 2. The Pickup — grab Vera's package at the docks, bring it to the garage. $400.
  missions.register({
    id: 'pickup',
    title: 'The Pickup',
    giver: 'Vera Santos',
    briefing: 'A package is waiting at East Harbour Docks. Grab it and bring it to the garage.',
    reward: 400,
    next: 'delivery',
    steps: [
      { kind: 'pickup', landmark: 'docks', radius: 130, label: "Pick up Vera's package at East Harbour Docks" },
      { kind: 'goto', landmark: 'garage', radius: 130, label: 'Bring the package to Bay Auto Garage' },
    ],
  });

  // 3. Hot Delivery — the package is hot: 60 seconds to the diner. $600.
  // Completing it unlocks Vera's Vortex GT sports car at the garage.
  missions.register({
    id: 'delivery',
    title: 'Hot Delivery',
    giver: 'Vera Santos',
    briefing: 'The Kings are onto the package. Get it to the diner fast — 60 seconds.',
    reward: 600,
    next: 'pier',
    steps: [
      { kind: 'pickup', landmark: 'garage', radius: 130, label: 'Grab the hot package at Bay Auto Garage' },
      { kind: 'goto', landmark: 'diner', radius: 130, seconds: 60, label: 'Deliver it to the Sunny Side Diner — fast!' },
    ],
    onComplete(game) {
      game.unlockedSports = true;
      if (game.spawnSportsCar) game.spawnSportsCar();
      showHint(game, 'Vera: "That was clean. The Vortex GT at the garage is yours now."', 5);
    },
  });

  // 4. Payback at the Pier — take down 4 Harbor Kings, then get home. $800.
  missions.register({
    id: 'pier',
    title: 'Payback at the Pier',
    giver: 'Vera Santos',
    briefing: 'The Harbor Kings shook down the pier. Take down four of them, then get home.',
    reward: 800,
    next: 'score',
    steps: [
      { kind: 'eliminate', count: 4, spawn: { landmark: 'pier' }, label: 'Take down 4 Harbor Kings at Solmar Pier' },
      { kind: 'goto', landmark: 'hideout', radius: 130, label: 'Get back to the hideout' },
    ],
  });

  // 5. The Solmar Score — crack the bank vault, then escape the heat. $1,500.
  missions.register({
    id: 'score',
    title: 'The Solmar Score',
    giver: 'Vera Santos',
    briefing: 'The big one: crack the vault at Solmar National Bank, then lose the heat.',
    reward: 1500,
    steps: [
      { kind: 'channel', landmark: 'bank', radius: 130, seconds: 10, label: 'Crack the vault — hold your position at the bank' },
      {
        kind: 'goto', landmark: 'hideout', radius: 130, label: 'Escape to the hideout — lose the cops!',
        onEnter(game) {
          game.wanted = Math.max(game.wanted, 3);
          game.audio.sirenStart();
          showHint(game, 'The alarm is up — 3 stars! Lose the cops and get home.', 4);
        },
      },
    ],
    onComplete(game) {
      showHint(game, 'Vera: "Solmar Bay is yours now, Dice. Free roam — and keep an eye out for hidden cash."', 6);
    },
  });

  return missions;
}
