// Mission system for SOLMAR: a small step engine plus a registry of mission
// definitions. Builder 2 adds the five Vera story missions by calling
// register() with a definition — no engine changes needed.
//
// Mission definition:
//   { id, title, giver, briefing, reward,
//     steps: [ { kind, ... } ], onStart(game)?, onComplete(game)? }
//
// Step kinds:
//   goto     { landmark | x, y, radius, label }            — reach a place
//   pickup   { landmark | x, y, radius, label }            — press E there
//   eliminate { count, spawn: {landmark | x, y}, label }   — defeat N Kings
//   channel  { landmark | x, y, radius, seconds, label }   — hold position
// Any step may carry `seconds` for a countdown; expiry fails the mission.
import { distance } from './rng.js';
import { spawnEnemy } from './combat.js';
import { showBanner, showHint, addFloater } from './fx.js';

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
}

export function createMissions() {
  const missions = {
    defs: {},
    active: null, // { def, stepIndex, stepState }
    done: [],

    register(def) {
      this.defs[def.id] = def;
    },

    start(id, game) {
      const def = this.defs[id];
      if (!def) return false;
      this.active = { def, stepIndex: 0, stepState: {} };
      if (def.onStart) def.onStart(game);
      showBanner(game, def.title.toUpperCase(), def.briefing || '');
      enterStep(game, this.active);
      return true;
    },

    failCurrent(game, reason) {
      if (!this.active) return;
      showBanner(game, 'MISSION FAILED', reason || this.active.def.title);
      game.audio.wasted();
      this.active = null;
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
      if (game.saveGame) game.saveGame();
    },

    update(game, dt) {
      const active = this.active;
      if (!active) return;
      const step = active.def.steps[active.stepIndex];
      const st = active.stepState;
      st.t += dt;

      if (step.seconds) {
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
        done = d < radius;
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
      const dist = Math.round(distance(game.player.x, game.player.y, pos.x, pos.y));
      return {
        title: active.def.title.toUpperCase(),
        text: step.label || '',
        sub: sub ? `${sub}  ·  ${dist}m` : `${dist}m`,
        marker: step.kind === 'eliminate' ? null : pos,
      };
    },
  };

  // Placeholder free-roam objective: meet Vera at the diner, earn $50, then
  // the city is yours. Builder 2 chains the five story missions after this.
  missions.register({
    id: 'freeroam',
    title: 'Free Roam',
    giver: 'Vera Santos',
    briefing: 'New in town, Dice? Come find me at the Sunny Side Diner.',
    reward: 50,
    steps: [
      { kind: 'goto', landmark: 'diner', radius: 130, label: 'Meet Vera at the Sunny Side Diner' },
    ],
    onComplete(game) {
      showHint(game, 'Vera: "Good. I have five jobs for you — come back when you are ready."', 5);
    },
  });

  return missions;
}
