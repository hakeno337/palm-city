# palm-city

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/hakeno337/palm-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/hakeno337/palm-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Palm City** is a top-down open-world crime game that runs in a desktop browser from static files — no build step, no network, no libraries. You roll into a sun-soaked coastal city with empty pockets and a heavy right foot. Fixer **Marisol** pays cash for questionable errands; the Palm City PD would like a word.

Explore four districts — Downtown, Palm Heights, Portside and Coral Beach — on foot or behind the wheel of anything with keys in it. Work a four-job story chain for Marisol (a timed package run, a taxi fare, one very specific teal convertible, and a cash-drop spree under a three-star heat floor), then take endless fixer runs in free roam.

- **A living city:** a 13×10-block road grid, 300+ pastel buildings (the Palm Court Hotel, Coral Diner, Sunset Garage, Portside Warehouse No. 9, Palm City Bank, The Flamingo Club…), parks, parking lots, 400+ palm trees, and a sand beach with umbrellas along the ocean.
- **Traffic & people:** some two dozen AI cars work the lane network and brake for trouble; forty-odd pedestrians stroll the sidewalks and the sand — and run when they should.
- **Crime & the law:** a heat-based 0–5 star wanted system fed by *witnessed* crime — car theft, collisions, hit-and-runs, punches, mission heat. Police spawn, route through the grid, converge and ram; get pinned and the bust meter fills. Busted means a fine and a walk out of Palm City PD; wasted means St. Coral Hospital.
- **Driving:** arcade physics with surface grip (asphalt > grass > sand), car health and damage smoke, brake lights, and drivers who bail out and flee when you take their car.
- **HUD & screens:** cash, health and car-health bars, district splashes, an objective line with mission timers, wanted stars, a bust meter, a speedometer, and a live minimap with traffic, flashing police and the mission marker. Title, pause, BUSTED, WASTED and STORY COMPLETE screens; progress (cash, story progress, position) saves to localStorage with Continue.
- **Sound:** a tiny WebAudio synth — pickups, cash, punches, crashes, mission jingles and a two-tone siren that follows the law. `M` mutes.
- **Deterministic:** the whole simulation runs on a seeded RNG in fixed 1/60 steps, so a seed replays exactly — which is also how the screenshots in `screenshots/` were staged (`?shot=drive|foot|chase|title&seed=7`).

**Controls:** WASD / arrows walk & drive · SHIFT sprint · E enter / exit any car · F punch · P pause · M mute.

## Run it

Play it locally with the pocket static server (Node 22, standard library only):

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. (`node serve.ts --port 9000` picks another port.)

Package the bounty entry — copies `game/` and `screenshots/` to the output folder and writes `dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/index.html` — the page; `game/src/` holds the game, one job per file:
  - `config.js` — view, city geometry, palette, districts
  - `random.js` — seeded mulberry32 RNG
  - `world.js` — the whole simulation (city generation, driving, traffic, police, crime, missions), DOM-free and fixed-step
  - `render.js` — canvas renderer: terrain, actors, HUD, minimap, screens
  - `input.js` — keyboard axes and one-shot action flags
  - `sound.js` — WebAudio bleeps and the siren
  - `shots.js` — deterministic `?shot=` screenshot staging
  - `main.js` — boot, the fixed-step loop, screens, saving
- `main.ts` — the hand-in program; `serve.ts` — the dev server; `shots.json` — the screenshot manifest; `vendor/makefun-game.ts` — the make.fun dossier library.
