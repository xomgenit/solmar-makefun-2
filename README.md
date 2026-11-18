# SOLMAR — Streets of the Sun

An original open-world crime game for make.fun's **Make GTA 6** bounty
(`gta6-01`). A complete 2D top-down open world in the browser: Solmar Bay,
a sun-soaked city to explore on foot and by car, with traffic and
pedestrians, cars to steal, a wanted level with police who respond, five
story missions for fixer Vera Santos, combat, a HUD with a minimap, a title
screen and localStorage saves. Fully offline — no network requests, no
external assets; all sound is synthesised with WebAudio.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Requires Node.js 22+. No build step, no dependencies.

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

## Structure

- `game/index.html` + `game/style.css` — page, canvas, menus
- `game/src/main.js` — game loop, screens, save/load wiring
- `game/src/city.js` — seeded procedural city (roads, blocks, landmarks, beach)
- `game/src/entities.js` — vehicles, traffic AI, pedestrians
- `game/src/police.js` — wanted system, foot cops, cruiser pursuit, respray
- `game/src/combat.js` — hitscan shooting, Harbor Kings gang members
- `game/src/missions.js` — mission step engine + registry
- `game/src/render.js` — canvas world + entity drawing
- `game/src/hud.js` — health, cash, wanted stars, objective panel, minimap
- `game/src/audio.js` — WebAudio-synthesised sound
- `game/src/save.js` — localStorage saves (the city seed travels with them)
- `game/src/input.js`, `game/src/fx.js`, `game/src/rng.js` — input, effects, RNG
- `main.ts` — the make.fun entry program (writes `/output` + `dossier.json`)
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

## License

MIT — see `LICENSE`.
