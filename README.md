# solmar-makefun-2

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/xomgenit/solmar-makefun-2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/xomgenit/solmar-makefun-2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLMAR — Streets of the Sun.** An original open-world crime game for make.fun's **Make GTA 6** bounty (`gta6-01`). A complete 2D top-down open world in the browser: Solmar Bay, a sun-soaked city to explore on foot and by car, with traffic and pedestrians, cars to steal, a wanted level with police who respond, five story missions for fixer Vera Santos (plus a sports-car unlock and three hidden cash stashes), combat, a HUD with a minimap, a title screen and localStorage saves. Fully offline — no network requests, no external assets; all sound is synthesised with WebAudio.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Requires Node.js 22+. No build step, no dependencies.

---

<sub>Entered on [make.fun](https://make.fun/?ref=x90fkarn&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Walk, or drive when in a car |
| Shift | Sprint on foot |
| Space | Handbrake while driving |
| E | Steal / enter / exit a car, pick things up, respray at the Auto Spa |
| Mouse | Aim |
| Click / hold | Shoot |
| Esc / P | Pause |
| M | Mute |

## The story

Dice arrives in Solmar Bay broke. Fixer Vera Santos has five jobs: steal a car for Bay Auto Garage (**First Wheels**, $250), grab a package at East Harbour Docks (**The Pickup**, $400), race it to the diner in 60 seconds (**Hot Delivery**, $600 — unlocks Vera's Vortex GT sports car), take down four Harbor Kings at the pier (**Payback at the Pier**, $800), and crack the vault at Solmar National Bank (**The Solmar Score**, $1,500). Three hidden cash stashes ($300 each) are tucked around the city — green dots on the minimap. After the score, the city is yours: free roam.

## Structure

- `game/index.html` + `game/style.css` — page, canvas, menus
- `game/src/main.js` — game loop, screens, save/load wiring
- `game/src/city.js` — seeded procedural city (roads, blocks, landmarks, beach)
- `game/src/entities.js` — vehicles, traffic AI, pedestrians
- `game/src/police.js` — wanted system, foot cops, cruiser pursuit, respray
- `game/src/combat.js` — hitscan shooting, Harbor Kings gang members
- `game/src/missions.js` — mission step engine + 5 story missions (chained)
- `game/src/stashes.js` — hidden cash stashes (seeded placement, pickup, draw)
- `game/src/render.js` — canvas world + entity drawing
- `game/src/hud.js` — health, cash, wanted stars, objective panel, minimap
- `game/src/audio.js` — WebAudio-synthesised sound
- `game/src/save.js` — localStorage saves (the city seed travels with them)
- `game/src/input.js`, `game/src/fx.js`, `game/src/rng.js` — input, effects, RNG
- `main.ts` — the make.fun entry program (writes `/output` + `dossier.json`)
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

## License

MIT — see `LICENSE`.
