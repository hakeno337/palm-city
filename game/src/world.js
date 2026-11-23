// Palm City — the simulation. Pure rules, no DOM, no rendering: the city,
// the player, traffic, pedestrians, police, crime and missions, advanced in
// fixed 1/60 steps from seeded randomness only, so a seed replays exactly.
// The renderer reads `state`; the shell (main.js) feeds it input objects of
// the shape { x, y, sprint, interact, punch } with x/y in -1..1.

import {
  STEP, ROAD, BLOCK_W, BLOCK_H, COLS, ROWS, SIDEWALK,
  CITY_W, CITY_H, BEACH_W, WORLD_W, WORLD_H,
  roadX, roadY, blockX, blockY, districtAt,
} from './config.js';
import { createRandom } from './random.js';

// ---------------------------------------------------------------- helpers

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function circleRectResolve(px, py, r, rect) {
  // Push a circle out of a rect; returns [x, y, hit].
  const nx = clamp(px, rect.x, rect.x + rect.w);
  const ny = clamp(py, rect.y, rect.y + rect.h);
  const dx = px - nx, dy = py - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return [px, py, false];
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return [nx + (dx / d) * r, ny + (dy / d) * r, true];
  }
  // Centre inside the rect: leave by the shallowest side.
  const left = px - rect.x, right = rect.x + rect.w - px;
  const top = py - rect.y, bottom = rect.y + rect.h - py;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [rect.x - r, py, true];
  if (m === right) return [rect.x + rect.w + r, py, true];
  if (m === top) return [px, rect.y - r, true];
  return [px, rect.y + rect.h + r, true];
}

// ---------------------------------------------------------------- the city

const BUILDING_COLORS = ['#f7d9c4', '#f9e79f', '#fadbd8', '#d5f5e3', '#d6eaf8', '#fdebd0', '#e8daef', '#fbeee6', '#f5cba7', '#aed6f1', '#f9ebea', '#fef9e7'];
const ROOF_COLORS = ['#d98880', '#aeb6bf', '#f0b27a', '#82e0aa', '#85c1e9', '#d7bde2', '#f5cba7', '#a3e4d7'];
const SHOP_NAMES = ['Café Sol', 'Tropicana Tours', 'Azure Condos', 'The Salty Anchor', 'Palm Pharmacy', 'Coral Realty', 'Sunset Laundry', 'Coco Cabana', 'Pier 9 Gym', 'Vela Jewels', 'Marina Books', 'Café Brisa', 'Tortuga Tacos', 'Solstice Spa', 'Palm Records', 'The Dune Bar', 'Hotel Marisol', 'Brisa Bikes', 'Coral Cleaners', 'Tide & Timber', 'Palmetto Pizza', 'Sundial Suites', 'The Lazy Pelican', 'Copa Cobana Shoes', 'Neptune Nets', 'Solana Sails'];

// Landmark blocks: [col, row, name, kind] — kind 'building' or 'garage'.
const LANDMARKS = [
  [2, 2, 'Palm Court Hotel', 'building'],
  [3, 3, 'Palm City Bank', 'building'],
  [4, 7, 'Palm City PD', 'building'],
  [5, 4, 'St. Coral Hospital', 'building'],
  [6, 5, 'The Flamingo Club', 'building'],
  [7, 2, 'Sunset Garage', 'garage'],
  [9, 8, 'Portside Warehouse No. 9', 'building'],
  [12, 2, 'Coral Diner', 'building'],
  [12, 6, 'Marina Mart', 'building'],
];

function generateCity(rng) {
  const buildings = [];
  const palms = [];
  const umbrellas = [];
  const parks = [];
  const lots = [];
  const landmarks = {};
  const landmarkAt = new Map(LANDMARKS.map(([c, r, n, k]) => [c + ',' + r, { name: n, kind: k }]));

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const bx = blockX(col), by = blockY(row);
      const lm = landmarkAt.get(col + ',' + row);
      const roll = (col * 7 + row * 13) % 9;
      if (lm) {
        if (lm.kind === 'garage') {
          // Building at the back of the block, open forecourt in front.
          const b = { x: bx + 30, y: by + 18, w: BLOCK_W - 60, h: 84, color: '#fdebd0', roof: '#d98880', name: lm.name, landmark: true };
          buildings.push(b);
          lots.push({ x: bx + 16, y: by + 116, w: BLOCK_W - 32, h: BLOCK_H - 132, garage: true });
          landmarks[lm.name] = { x: bx + BLOCK_W / 2, y: by + 150, frontX: bx + BLOCK_W / 2, frontY: by + BLOCK_H + 6 };
        } else {
          const b = { x: bx + 26, y: by + 22, w: BLOCK_W - 52, h: BLOCK_H - 44, color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS), name: lm.name, landmark: true };
          buildings.push(b);
          landmarks[lm.name] = { x: bx + BLOCK_W / 2, y: by + BLOCK_H / 2, frontX: bx + BLOCK_W / 2, frontY: by + BLOCK_H + 6 };
        }
      } else if (roll === 4) {
        parks.push({ x: bx, y: by, w: BLOCK_W, h: BLOCK_H });
        for (let i = 0; i < 9; i++) palms.push({ x: bx + rng.range(18, BLOCK_W - 18), y: by + rng.range(18, BLOCK_H - 18), s: rng.range(0.85, 1.25) });
      } else if (roll === 7) {
        lots.push({ x: bx + 10, y: by + 10, w: BLOCK_W - 20, h: BLOCK_H - 20, garage: false });
      } else {
        // 2x2 or 2x1 building lots with alleys between.
        const wide = rng.chance(0.35);
        const cells = wide
          ? [{ dx: 8, dy: 10, w: BLOCK_W - 16, h: 92 }, { dx: 8, dy: 118, w: BLOCK_W - 16, h: 92 }]
          : [
              { dx: 8, dy: 10, w: 138, h: 92 }, { dx: 156, dy: 10, w: 136, h: 92 },
              { dx: 8, dy: 118, w: 138, h: 92 }, { dx: 156, dy: 118, w: 136, h: 92 },
            ];
        for (const cell of cells) {
          buildings.push({
            x: bx + cell.dx, y: by + cell.dy, w: cell.w, h: cell.h,
            color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS),
            name: rng.chance(0.4) ? rng.pick(SHOP_NAMES) : null, landmark: false,
          });
        }
      }
      // Palms sprinkled along the sidewalks of every block.
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const side = rng.int(0, 3);
        const t = rng.range(0.08, 0.92);
        const px = side === 0 ? bx + t * BLOCK_W : side === 1 ? bx + t * BLOCK_W : side === 2 ? bx - 6 : bx + BLOCK_W + 6;
        const py = side === 0 ? by - 6 : side === 1 ? by + BLOCK_H + 6 : by + t * BLOCK_H;
        palms.push({ x: px, y: py, s: rng.range(0.8, 1.2) });
      }
    }
  }
  // Beach palms and umbrellas.
  for (let i = 0; i < 60; i++) palms.push({ x: CITY_W + rng.range(14, BEACH_W - 30), y: rng.range(20, CITY_H - 20), s: rng.range(0.9, 1.4) });
  for (let i = 0; i < 26; i++) umbrellas.push({ x: CITY_W + rng.range(120, BEACH_W - 24), y: rng.range(30, CITY_H - 30), color: rng.pick(['#ff6b5e', '#ffd94d', '#4fc3f7', '#ff9ff3', '#7bed9f']) });

  return { buildings, palms, umbrellas, parks, lots, landmarks };
}

// Which named district a point is in is config's job; blocks are looked up
// by position for collision so queries stay local.
function buildingsNear(city, x, y) {
  const out = [];
  const col = Math.floor((x - ROAD) / (BLOCK_W + ROAD));
  const row = Math.floor((y - ROAD) / (BLOCK_H + ROAD));
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const bx = blockX(c), by = blockY(r);
      for (const b of city.buildings) {
        if (b.x >= bx - 1 && b.x < bx + BLOCK_W + 1 && b.y >= by - 1 && b.y < by + BLOCK_H + 1) out.push(b);
      }
    }
  }
  return out;
}

function collideBuildings(city, x, y, r) {
  let hit = false;
  for (const b of buildingsNear(city, x, y)) {
    const [nx, ny, h] = circleRectResolve(x, y, r, b);
    if (h) { x = nx; y = ny; hit = true; }
  }
  return [x, y, hit];
}

export function surfaceAt(x, y) {
  if (x > CITY_W + BEACH_W) return 'water';
  if (x > CITY_W) return 'sand';
  const inRoadX = ((x % (BLOCK_W + ROAD)) + (BLOCK_W + ROAD)) % (BLOCK_W + ROAD) < ROAD;
  const inRoadY = ((y % (BLOCK_H + ROAD)) + (BLOCK_H + ROAD)) % (BLOCK_H + ROAD) < ROAD;
  if (inRoadX || inRoadY) return 'road';
  const col = Math.floor((x - ROAD) / (BLOCK_W + ROAD));
  const row = Math.floor((y - ROAD) / (BLOCK_H + ROAD));
  if (((col * 7 + row * 13) % 9) === 4) return 'grass';
  return 'ground';
}

// ---------------------------------------------------------------- entities

const CAR_COLORS = ['#e74c3c', '#f39c12', '#f1c40f', '#ecf0f1', '#95a5a6', '#e67e22', '#9b59b6', '#1abc9c', '#fd79a8', '#54a0ff', '#5f27cd', '#c8d6e5', '#222f3e', '#ff9f43', '#48dbfb'];
const PED_COLORS = ['#ff6b81', '#feca57', '#48dbfb', '#1dd1a1', '#f368e0', '#ff9f43', '#54a0ff', '#5f27cd', '#c8d6e5', '#ff9ff3'];
const SKIN_TONES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

let nextId = 1;

function makeCar(rng, kind, x, y, angle, opts = {}) {
  return {
    id: nextId++, kind, x, y, angle, speed: 0,
    color: opts.color ?? rng.pick(CAR_COLORS),
    convertible: opts.convertible ?? false,
    health: 100, driver: kind === 'traffic',
    parked: kind === 'parked',
    target: null, prevNode: null, stuckT: 0, reverseT: 0, brake: false,
    cruise: rng.range(185, 245), dead: false, missionMark: false,
    wobble: rng.range(0, Math.PI * 2),
  };
}

function makePed(rng, x, y, path) {
  return {
    id: nextId++, x, y, angle: rng.range(0, Math.PI * 2), speed: rng.range(52, 84),
    color: rng.pick(PED_COLORS), skin: rng.pick(SKIN_TONES),
    path, wp: 0, mode: 'walk', t: 0, threatX: 0, threatY: 0, waitSeed: rng.range(0, 10),
  };
}

// Sidewalk loop around a block: the four corners, expanded past the kerb.
function blockPath(col, row) {
  const bx = blockX(col) - SIDEWALK + 3, by = blockY(row) - SIDEWALK + 3;
  const w = BLOCK_W + (SIDEWALK - 3) * 2, h = BLOCK_H + (SIDEWALK - 3) * 2;
  return [
    { x: bx, y: by }, { x: bx + w, y: by },
    { x: bx + w, y: by + h }, { x: bx, y: by + h },
  ];
}

// ---------------------------------------------------------------- the world

export function createWorld(seed) {
  const rng = createRandom(seed);
  const city = generateCity(rng);
  nextId = 1;

  const state = {
    seed, time: 0, city,
    player: { x: 0, y: 0, angle: -Math.PI / 2, health: 100, cash: 0, carId: null, punchT: 0, stepPhase: 0 },
    cars: [], peds: [],
    heat: 0, stars: 0, bust: 0, lastSeenT: -99, policeSpawnT: 0,
    mission: { active: false, index: 0, type: null, stage: 0, target: null, targetLabel: '', timer: 0, timeLeft: 0, reward: 0, data: {} },
    storyDone: false, endlessCount: 0,
    district: 'Downtown', splashUntil: 0,
    banner: null, objective: '',
    events: [], over: null, overInfo: null,
    camOverride: null,
    stats: { crimes: 0, carsStolen: 0, missionsDone: 0, topSpeed: 0 },
    giver: null,
  };

  // ---- spawning ----

  function spawnTrafficCar() {
    const i = rng.int(0, COLS), j = rng.int(0, ROWS);
    const car = makeCar(rng, 'traffic', roadX(i), roadY(j), 0);
    car.fresh = true;
    car.prevNode = { i, j };
    car.target = pickNextNode(car, rng);
    snapToLane(car);
    state.cars.push(car);
    return car;
  }

  function snapToLane(car) {
    if (!car.target) return;
    const dx = Math.sign(car.target.x - car.x), dy = Math.sign(car.target.y - car.y);
    // Right-hand traffic: offset the goal to the right of the direction.
    car.goalX = car.target.x + (dy !== 0 ? 23 * dy : 0);
    car.goalY = car.target.y + (dx !== 0 ? -23 * dx : 0);
    if (car.fresh) {
      car.x = roadX(car.prevNode.i) + (dy !== 0 ? 23 * dy : 0);
      car.y = roadY(car.prevNode.j) + (dx !== 0 ? -23 * dx : 0);
      car.angle = Math.atan2(dy, dx);
      car.fresh = false;
    }
  }

  function pickNextNode(car, rand) {
    const { i, j } = car.prevNode;
    const came = car.cameFrom;
    const options = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [di, dj] of dirs) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni > COLS || nj > ROWS) continue;
      const isBack = came && came.i === ni && came.j === nj;
      const straight = came && (came.i - i) === -di && (came.j - j) === -dj;
      options.push({ i: ni, j: nj, w: isBack ? 0.04 : straight ? 0.55 : 0.22 });
    }
    let total = 0;
    for (const o of options) total += o.w;
    let roll = rand.next() * total;
    for (const o of options) { roll -= o.w; if (roll <= 0) return { i: o.i, j: o.j, x: roadX(o.i), y: roadY(o.j) }; }
    const last = options[options.length - 1];
    return { i: last.i, j: last.j, x: roadX(last.i), y: roadY(last.j) };
  }

  function spawnParkedCars() {
    for (const lot of city.lots) {
      const n = rng.int(3, 6);
      for (let k = 0; k < n; k++) {
        const x = lot.x + 30 + (k % 3) * ((lot.w - 50) / 2);
        const y = lot.y + 34 + Math.floor(k / 3) * 74;
        if (x > lot.x + lot.w - 24 || y > lot.y + lot.h - 20) continue;
        state.cars.push(makeCar(rng, 'parked', x, y, -Math.PI / 2));
      }
    }
    // Kerbside parking on a few avenues.
    for (let k = 0; k < 12; k++) {
      const i = rng.int(1, COLS - 1), j = rng.int(0, ROWS);
      const vertical = rng.chance(0.5);
      const x = vertical ? roadX(i) - 33 : roadX(i) + rng.range(-BLOCK_W / 2, BLOCK_W / 2) + BLOCK_W / 2;
      const y = vertical ? roadY(j) + rng.range(-BLOCK_H / 2, BLOCK_H / 2) + BLOCK_H / 2 : roadY(j) - 33;
      state.cars.push(makeCar(rng, 'parked', x, y, vertical ? 0 : Math.PI / 2));
    }
  }

  function spawnPeds() {
    for (let k = 0; k < 42; k++) {
      let path, x, y;
      if (k < 8) {
        // Beach strollers walk the sand north-south.
        const bx = CITY_W + rng.range(60, BEACH_W - 60);
        path = [{ x: bx, y: rng.range(80, CITY_H - 400) }, { x: bx + rng.range(-30, 30), y: rng.range(400, CITY_H - 80) }];
        x = path[0].x; y = path[0].y;
      } else {
        const col = rng.int(0, COLS - 1), row = rng.int(0, ROWS - 1);
        path = blockPath(col, row);
        const start = rng.int(0, 3);
        x = path[start].x; y = path[start].y;
      }
      const ped = makePed(rng, x, y, path);
      ped.wp = rng.int(0, path.length - 1);
      state.peds.push(ped);
    }
    // Marisol, the fixer, holds her corner outside The Flamingo Club.
    const club = city.landmarks['The Flamingo Club'];
    const giver = makePed(rng, club.frontX, club.frontY + 8, null);
    giver.mode = 'stand';
    giver.color = '#ffd94d';
    state.giver = giver;
    state.peds.push(giver);
  }

  function playerCar() {
    if (state.player.carId === null) return null;
    return state.cars.find((c) => c.id === state.player.carId) ?? null;
  }

  function newGame() {
    state.cars.length = 0;
    state.peds.length = 0;
    for (let i = 0; i < 26; i++) spawnTrafficCar();
    spawnParkedCars();
    spawnPeds();
    const club = city.landmarks['The Flamingo Club'];
    state.player.x = club.frontX - 60;
    state.player.y = club.frontY + 26;
    state.player.angle = -Math.PI / 2;
    state.player.health = 100;
    state.player.cash = 0;
    state.player.carId = null;
    state.heat = 0; state.stars = 0; state.bust = 0;
    state.mission = { active: false, index: 0, type: null, stage: 0, target: null, targetLabel: '', timer: 0, timeLeft: 0, reward: 0, data: {} };
    state.storyDone = false;
    state.endlessCount = 0;
    state.over = null;
    state.stats = { crimes: 0, carsStolen: 0, missionsDone: 0, topSpeed: 0 };
    setBanner('PALM CITY', 'Marisol at The Flamingo Club has work for a driver like you.', 5);
    updateObjective();
  }

  function saveData() {
    return {
      cash: state.player.cash, missionIndex: state.mission.index,
      storyDone: state.storyDone, x: state.player.x, y: state.player.y,
      missionsDone: state.stats.missionsDone, carsStolen: state.stats.carsStolen,
    };
  }

  function applySave(data) {
    newGame();
    state.player.cash = data.cash | 0;
    state.mission.index = data.missionIndex | 0;
    state.storyDone = !!data.storyDone;
    state.player.x = +data.x || state.player.x;
    state.player.y = +data.y || state.player.y;
    state.stats.missionsDone = data.missionsDone | 0;
    state.stats.carsStolen = data.carsStolen | 0;
    if (state.storyDone) state.mission.index = 4;
    updateObjective();
  }

  // ---- narration helpers ----

  function setBanner(title, sub, seconds) {
    state.banner = { title, sub, until: state.time + seconds };
  }

  function updateObjective() {
    const m = state.mission;
    if (state.over) { state.objective = ''; return; }
    if (!m.active) {
      state.objective = state.storyDone
        ? 'Free roam — see Marisol for another run'
        : 'See Marisol at The Flamingo Club for work.';
      return;
    }
    state.objective = m.targetLabel || '';
  }

  // ---- crime, heat and the law ----

  const STAR_THRESHOLDS = [1, 4, 8, 13, 19];

  function starsFor(heat) {
    let s = 0;
    for (const t of STAR_THRESHOLDS) if (heat >= t) s++;
    return Math.min(5, s);
  }

  function audible(x, y) { return dist2(x, y, state.player.x, state.player.y) < 560 * 560; }

  function witnessed(x, y, radius) {
    for (const p of state.peds) {
      if (p.mode !== 'down' && dist2(x, y, p.x, p.y) < radius * radius) return true;
    }
    for (const c of state.cars) {
      if (c.kind === 'police' && dist2(x, y, c.x, c.y) < 460 * 460) return true;
    }
    return false;
  }

  function crime(amount, x, y, label) {
    const seen = witnessed(x, y, 300);
    state.heat = Math.min(24, state.heat + (seen ? amount : amount * 0.3));
    state.stats.crimes++;
    if (seen) state.events.push('crime');
    return seen;
  }

  function policeCount() { return state.cars.filter((c) => c.kind === 'police').length; }

  function spawnPolice() {
    // Appear at an intersection a few blocks away, never in plain sight.
    const px = state.player.x, py = state.player.y;
    let best = null, bestD = -1;
    for (let tries = 0; tries < 12; tries++) {
      const i = rng.int(0, COLS), j = rng.int(0, ROWS);
      const x = roadX(i), y = roadY(j);
      const d = dist2(x, y, px, py);
      if (d > 620 * 620 && d < 1200 * 1200 && d > bestD) { best = { i, j, x, y }; bestD = d; }
    }
    if (!best) {
      const i = clamp(Math.round((px - ROAD / 2) / (BLOCK_W + ROAD)) + (px < CITY_W / 2 ? 3 : -3), 0, COLS);
      const j = clamp(Math.round((py - ROAD / 2) / (BLOCK_H + ROAD)), 0, ROWS);
      best = { i, j, x: roadX(i), y: roadY(j) };
    }
    const cop = makeCar(rng, 'police', best.x, best.y, 0, { color: '#f4f6f7' });
    cop.driver = true;
    cop.cruise = 545;
    cop.prevNode = { i: best.i, j: best.j };
    cop.target = null;
    state.cars.push(cop);
    state.events.push('siren');
  }

  // Breadth-first next hop on the intersection grid, from node A toward B.
  function bfsNext(ai, aj, bi, bj) {
    if (ai === bi && aj === bj) return null;
    const key = (i, j) => i * 100 + j;
    const prev = new Map();
    const queue = [[ai, aj]];
    prev.set(key(ai, aj), null);
    while (queue.length) {
      const [i, j] = queue.shift();
      if (i === bi && j === bj) break;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni > COLS || nj > ROWS || prev.has(key(ni, nj))) continue;
        prev.set(key(ni, nj), [i, j]);
        queue.push([ni, nj]);
      }
    }
    let cur = [bi, bj];
    if (!prev.has(key(bi, bj))) return null;
    while (prev.get(key(cur[0], cur[1])) && !(prev.get(key(cur[0], cur[1]))[0] === ai && prev.get(key(cur[0], cur[1]))[1] === aj)) {
      cur = prev.get(key(cur[0], cur[1]));
    }
    return { i: cur[0], j: cur[1], x: roadX(cur[0]), y: roadY(cur[1]) };
  }

  function nearestNode(x, y) {
    const i = clamp(Math.round((x - ROAD / 2) / (BLOCK_W + ROAD)), 0, COLS);
    const j = clamp(Math.round((y - ROAD / 2) / (BLOCK_H + ROAD)), 0, ROWS);
    return { i, j };
  }

  // ---- shared driving physics ----

  function driveCar(car, throttle, steer, dt) {
    const surface = surfaceAt(car.x, car.y);
    const grip = surface === 'road' ? 1 : surface === 'sand' ? 0.45 : surface === 'grass' ? 0.7 : 0.85;
    const maxF = 540 * grip, maxR = 170;
    const accel = throttle > 0 ? 300 : throttle < 0 ? (car.speed > 8 ? -560 : -190) : 0;
    car.speed += accel * dt * (throttle > 0 ? grip : 1);
    if (throttle === 0) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 130 * dt);
    }
    car.speed = clamp(car.speed, -maxR, maxF);
    const steerAuthority = clamp(Math.abs(car.speed) / 150, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle = wrapAngle(car.angle + steer * 2.45 * steerAuthority * dt);
    car.brake = throttle < 0 && car.speed > 8;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const [cx, cy, hit] = collideBuildings(city, nx, ny, 19);
    if (hit) {
      const impact = Math.abs(car.speed);
      if (impact > 190) {
        car.health -= (impact - 190) / 14;
        if (audible(car.x, car.y)) state.events.push('crash');
        if (car === playerCar()) hurtPlayer((impact - 190) / 22);
      }
      car.speed = -car.speed * 0.22;
      car.x = cx; car.y = cy;
    } else {
      car.x = nx; car.y = ny;
    }
    // Keep cars out of the ocean and inside the world.
    car.x = clamp(car.x, 24, CITY_W + BEACH_W - 10);
    car.y = clamp(car.y, 24, WORLD_H - 24);
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      car.speed = 0;
      if (car === playerCar()) ejectFromCar(46);
    }
  }

  function hurtPlayer(amount) {
    if (state.over) return;
    state.player.lastDamageT = state.time;
    state.player.health = Math.max(0, state.player.health - amount);
    if (state.player.health <= 0) gameOver('wasted', 'Your story ends on the asphalt of Palm City.');
  }

  function ejectFromCar(hp) {
    const car = playerCar();
    state.player.carId = null;
    if (car) {
      state.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
      state.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    }
    state.player.health = Math.max(state.player.health, hp);
  }

  function gameOver(kind, message) {
    if (state.over) return;
    state.over = kind;
    state.overInfo = { message, at: state.time };
    const fine = kind === 'busted' ? Math.min(state.player.cash, 100 + state.stars * 50) : Math.min(state.player.cash, 120);
    state.overInfo.fine = fine;
    state.player.cash -= fine;
    state.events.push(kind);
  }

  function respawn() {
    const kind = state.over;
    const spot = kind === 'busted' ? city.landmarks['Palm City PD'] : city.landmarks['St. Coral Hospital'];
    state.over = null;
    state.overInfo = null;
    state.player.carId = null;
    state.player.x = spot.frontX;
    state.player.y = spot.frontY + 14;
    state.player.health = 100;
    state.heat = 0;
    state.bust = 0;
    // The law drives off.
    state.cars = state.cars.filter((c) => c.kind !== 'police');
    setBanner(kind === 'busted' ? 'RELEASED' : 'DISCHARGED', 'You are back on the street. Stay out of trouble — or don\'t.', 3.5);
    updateObjective();
  }


  // ---- traffic & police driving ----

  function obstacleAhead(car, lookDist) {
    const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const ahead = dx * fx + dy * fy;
      if (ahead < 6 || ahead > lookDist) continue;
      const side = Math.abs(-dx * fy + dy * fx);
      if (side < 26) return other;
    }
    for (const p of state.peds) {
      if (p.mode === 'down' || p === state.giver) continue;
      const dx = p.x - car.x, dy = p.y - car.y;
      const ahead = dx * fx + dy * fy;
      if (ahead < 4 || ahead > lookDist * 0.8) continue;
      if (Math.abs(-dx * fy + dy * fx) < 20) return p;
    }
    const pc = playerCar();
    if (!pc && state.player.carId === null) {
      const dx = state.player.x - car.x, dy = state.player.y - car.y;
      const ahead = dx * fx + dy * fy;
      if (ahead > 4 && ahead < lookDist * 0.8 && Math.abs(-dx * fy + dy * fx) < 20) return state.player;
    }
    return null;
  }

  function steerToward(car, tx, ty, dt, cruise) {
    const desired = Math.atan2(ty - car.y, tx - car.x);
    const diff = wrapAngle(desired - car.angle);
    let steer = clamp(diff * 1.7, -1, 1);
    let throttle = 1;
    let want = cruise;
    if (Math.abs(diff) > 2.2) { want = -170; steer = -steer; }
    else if (Math.abs(diff) > 1.1) want = cruise * 0.35;
    // Translate desired speed into throttle/brake against current speed.
    if (car.reverseT > 0) {
      car.reverseT -= dt;
      driveCar(car, -1, -steer, dt);
      return;
    }
    if (car.speed < want - 12) throttle = 1;
    else if (car.speed > want + 24) throttle = -1;
    else throttle = 0;
    driveCar(car, throttle, steer, dt);
    // Anti-stuck: trying to move but barely moving means a wall — back out.
    if (want > 60 && Math.abs(car.speed) < 14) {
      car.stuckT += dt;
      if (car.stuckT > 0.75) { car.reverseT = 0.55; car.stuckT = 0; }
    } else car.stuckT = 0;
  }

  function updateTrafficCar(car, dt) {
    if (car.dead || !car.driver) { car.speed = 0; return; }
    if (!car.target) { car.target = pickNextNode(car, rng); snapToLane(car); }
    const gx = car.goalX ?? car.target.x, gy = car.goalY ?? car.target.y;
    const d = Math.sqrt(dist2(car.x, car.y, gx, gy));
    if (d < 30) {
      car.cameFrom = car.prevNode;
      car.prevNode = { i: car.target.i, j: car.target.j };
      car.target = pickNextNode(car, rng);
      snapToLane(car);
      return;
    }
    let cruise = car.cruise;
    const obstacle = obstacleAhead(car, 58);
    if (obstacle) cruise = Math.min(cruise, Math.max(0, (obstacle.speed ?? 0) - 4));
    if (obstacle && Math.sqrt(dist2(car.x, car.y, obstacle.x, obstacle.y)) < 40) cruise = 0;
    steerToward(car, gx, gy, dt, cruise);
  }

  function updatePoliceCar(car, dt) {
    if (car.dead) { car.speed = 0; return; }
    const px = state.player.x, py = state.player.y;
    const d = Math.sqrt(dist2(car.x, car.y, px, py));
    // Pull up beside a suspect on foot instead of running them down.
    if (state.player.carId === null && d < 54) {
      driveCar(car, car.speed > 12 ? -1 : 0, 0, dt);
      return;
    }
    let tx = px, ty = py, cruise = 548;
    if (d > 250) {
      // Route along the grid toward the player's nearest intersection.
      car.routeT = (car.routeT ?? 0) - dt;
      if (!car.routeTarget || car.routeT <= 0) {
        const from = nearestNode(car.x, car.y);
        const to = nearestNode(px, py);
        car.routeTarget = bfsNext(from.i, from.j, to.i, to.j) ?? to;
        car.routeT = 0.3;
      }
      tx = car.routeTarget.x ?? roadX(car.routeTarget.i);
      ty = car.routeTarget.y ?? roadY(car.routeTarget.j);
      if (Math.sqrt(dist2(car.x, car.y, tx, ty)) < 44) car.routeT = 0;
    }
    steerToward(car, tx, ty, dt, cruise);
    // A ram that connects shoves the player's day sideways.
    const pc = playerCar();
    if (pc && Math.sqrt(dist2(car.x, car.y, pc.x, pc.y)) < 40 && Math.abs(car.speed) > 200) {
      pc.health -= 3.2;
      hurtPlayer(1.4);
      state.events.push('crash');
      car.speed *= 0.55;
    }
  }

  // ---- pedestrians ----

  function updatePed(ped, dt) {
    if (ped.mode === 'stand') return;
    if (ped.mode === 'down') {
      ped.t -= dt;
      if (ped.t <= 0) { ped.mode = 'flee'; ped.t = 1.6; ped.threatX = ped.x + 50; ped.threatY = ped.y; }
      return;
    }
    if (ped.mode === 'flee') {
      ped.t -= dt;
      const dx = ped.x - ped.threatX, dy = ped.y - ped.threatY;
      const len = Math.hypot(dx, dy) || 1;
      ped.angle = Math.atan2(dy, dx);
      const nx = ped.x + (dx / len) * 205 * dt;
      const ny = ped.y + (dy / len) * 205 * dt;
      const [cx, cy] = collideBuildings(city, nx, ny, 10);
      ped.x = clamp(cx, 12, WORLD_W - 12);
      ped.y = clamp(cy, 12, WORLD_H - 12);
      if (ped.t <= 0) ped.mode = 'walk';
      return;
    }
    if (ped.mode === 'wait' || ped.mode === 'aboard') return;
    // Stroll the waypoint loop.
    const target = ped.path[ped.wp];
    const dx = target.x - ped.x, dy = target.y - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 7) { ped.wp = (ped.wp + 1) % ped.path.length; return; }
    ped.angle = Math.atan2(dy, dx);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }

  function scarePeds(x, y, radius) {
    for (const p of state.peds) {
      if (p.mode === 'walk' && dist2(x, y, p.x, p.y) < radius * radius) {
        p.mode = 'flee';
        p.t = rng.range(1.2, 2.4);
        p.threatX = x; p.threatY = y;
      }
    }
  }

  // ---- the player ----

  function nearestCar(x, y, maxD) {
    let best = null, bestD = maxD * maxD;
    for (const c of state.cars) {
      if (c.dead) continue;
      const d = dist2(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function enterCar(car) {
    const p = state.player;
    const wasTraffic = car.kind === 'traffic' && car.driver;
    const wasParked = car.kind === 'parked';
    if (car.driver) {
      // The driver bails out and runs.
      const ped = makePed(rng, car.x + 26, car.y + 10, blockPath(0, 0));
      ped.mode = 'flee'; ped.t = 2.6; ped.threatX = p.x; ped.threatY = p.y;
      ped.path = blockPath(clamp(Math.floor((car.x - ROAD) / (BLOCK_W + ROAD)), 0, COLS - 1), clamp(Math.floor((car.y - ROAD) / (BLOCK_H + ROAD)), 0, ROWS - 1));
      state.peds.push(ped);
      car.driver = false;
    }
    car.parked = false;
    p.carId = car.id;
    p.x = car.x; p.y = car.y;
    state.stats.carsStolen++;
    if (car.missionMark) {
      state.events.push('board');
      return; // The mission script handles its own heat and staging.
    }
    if (wasTraffic) crime(2, car.x, car.y, 'theft');
    else if (wasParked) crime(1, car.x, car.y, 'theft');
    else if (car.kind === 'police') crime(3, car.x, car.y, 'theft');
    state.events.push('board');
  }

  function exitCar() {
    const car = playerCar();
    if (!car) return;
    state.player.carId = null;
    state.player.x = clamp(car.x + Math.cos(car.angle + Math.PI / 2) * 30, 14, WORLD_W - 14);
    state.player.y = clamp(car.y + Math.sin(car.angle + Math.PI / 2) * 30, 14, WORLD_H - 14);
    const [cx, cy] = collideBuildings(city, state.player.x, state.player.y, 11);
    state.player.x = cx; state.player.y = cy;
  }

  function updatePlayer(dt, input) {
    const p = state.player;
    if (p.punchT > 0) p.punchT -= dt;
    const car = playerCar();
    if (car) {
      const throttle = -input.y;
      const steer = input.x;
      driveCar(car, throttle, steer, dt);
      p.x = car.x; p.y = car.y; p.angle = car.angle;
      if (Math.abs(car.speed) > 300) scarePeds(car.x, car.y, 130);
      state.stats.topSpeed = Math.max(state.stats.topSpeed, Math.abs(car.speed));
      if (input.interact) exitCar();
      return;
    }
    // On foot.
    const moving = input.x !== 0 || input.y !== 0;
    if (moving) {
      const len = Math.hypot(input.x, input.y);
      const speed = input.sprint ? 285 : 172;
      const dx = (input.x / len) * speed * dt;
      const dy = (input.y / len) * speed * dt;
      p.angle = Math.atan2(input.y, input.x);
      p.stepPhase += dt * (input.sprint ? 13 : 9);
      const [cx, cy] = collideBuildings(city, p.x + dx, p.y + dy, 11);
      p.x = clamp(cx, 12, WORLD_W - 12);
      p.y = clamp(cy, 12, WORLD_H - 12);
    }
    if (input.punch && p.punchT <= 0) {
      p.punchT = 0.34;
      state.events.push('punch');
      const hx = p.x + Math.cos(p.angle) * 30, hy = p.y + Math.sin(p.angle) * 30;
      for (const ped of state.peds) {
        if (ped === state.giver || ped.mode === 'down') continue;
        if (dist2(hx, hy, ped.x, ped.y) < 30 * 30) {
          ped.mode = 'flee'; ped.t = 2.2; ped.threatX = p.x; ped.threatY = p.y;
          crime(1, p.x, p.y, 'assault');
          scarePeds(p.x, p.y, 90);
        }
      }
    }
    if (input.interact) {
      const near = nearestCar(p.x, p.y, 58);
      if (near) enterCar(near);
    }
  }

  // ---- car vs car, car vs pedestrian ----

  function updateCollisions(dt) {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.dead) continue;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 > 40 * 40 || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const push = (40 - d) / 2;
        const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 90) {
          const dmg = (rel - 90) / 16;
          a.health -= dmg; b.health -= dmg;
          if (audible(a.x, a.y)) state.events.push('crash');
          const pc = playerCar();
          if (pc === a || pc === b) {
            hurtPlayer(dmg * 0.55);
            crime(1, pc.x, pc.y, 'collision');
            scarePeds(pc.x, pc.y, 120);
          }
          a.speed *= 0.6; b.speed *= 0.6;
        }
      }
      // Cars versus pedestrians.
      if (Math.abs(a.speed) > 55) {
        for (const ped of state.peds) {
          if (ped.mode === 'down' || ped === state.giver) continue;
          if (dist2(a.x, a.y, ped.x, ped.y) < 21 * 21) {
            ped.mode = 'down';
            ped.t = 5.5;
            if (audible(a.x, a.y)) state.events.push('crash');
            if (a === playerCar()) {
              crime(2, a.x, a.y, 'hit-and-run');
              hurtPlayer(0);
              scarePeds(a.x, a.y, 170);
            }
          }
        }
      }
    }
  }

  // ---- missions: Marisol's work ----

  const STORY = [
    { type: 'delivery', name: 'Special Delivery', reward: 250, brief: 'A package waits at Coral Diner. Don\'t open it. Don\'t be late.' },
    { type: 'fare', name: 'Fare Play', reward: 200, brief: 'A fare is waiting at Palm Court Hotel. Keep the ride smooth and quick.' },
    { type: 'steal', name: 'Grand Theft Otto', reward: 400, brief: 'Otto\'s teal convertible sits in Palm Heights. Marisol wants it at Sunset Garage.' },
    { type: 'drops', name: 'Harbor Heat', reward: 500, brief: 'Five cash drops around the port. The heat will be on — keep moving.' },
  ];

  function front(name) {
    const lm = city.landmarks[name];
    return { x: lm.frontX, y: lm.frontY };
  }

  function reach(target, radius) {
    return dist2(state.player.x, state.player.y, target.x, target.y) < radius * radius;
  }

  function startMission(index) {
    const m = state.mission;
    m.active = true;
    m.index = index;
    m.stage = 0;
    m.data = {};
    const story = STORY[index];
    if (story) {
      m.type = story.type;
      m.reward = story.reward;
      setBanner('JOB ' + (index + 1) + ' — ' + story.name.toUpperCase(), story.brief, 5);
    } else {
      const types = ['delivery', 'fare', 'drops'];
      m.type = types[(index + state.endlessCount) % types.length];
      m.reward = m.type === 'drops' ? 300 : 220;
      setBanner('FIXER RUN', 'Another quiet job, another envelope of cash.', 4);
    }
    state.events.push('missionStart');
    const L = city.landmarks;
    if (m.type === 'delivery') {
      const from = story ? 'Coral Diner' : rng.pick(['Coral Diner', 'Marina Mart', 'Palm City Bank']);
      const to = story ? 'Portside Warehouse No. 9' : rng.pick(['Portside Warehouse No. 9', 'The Flamingo Club', 'Palm Court Hotel']);
      m.data.pickup = front(from);
      m.data.dropoff = front(to);
      m.target = m.data.pickup;
      m.targetLabel = 'Pick up the package at ' + from;
      m.timer = 0;
    } else if (m.type === 'fare') {
      const from = story ? 'Palm Court Hotel' : rng.pick(['Palm Court Hotel', 'Coral Diner', 'Marina Mart']);
      const to = story ? 'The Flamingo Club' : rng.pick(['The Flamingo Club', 'Sunset Garage', 'Portside Warehouse No. 9']);
      const spot = front(from);
      const passenger = makePed(rng, spot.x, spot.y + 6, null);
      passenger.mode = 'wait';
      passenger.color = '#ffffff';
      state.peds.push(passenger);
      m.data.passengerId = passenger.id;
      m.data.dropoff = front(to);
      m.data.dropoffName = to;
      m.target = { x: passenger.x, y: passenger.y };
      m.targetLabel = 'Pick up your fare at ' + from + ' — pull up gently';
      m.timer = 0;
    } else if (m.type === 'steal') {
      const otto = makeCar(rng, 'parked', roadX(9) - 33, roadY(2) + 120, Math.PI / 2, { color: '#12cbc4', convertible: true });
      otto.missionMark = true;
      state.cars.push(otto);
      m.data.carId = otto.id;
      m.target = { x: otto.x, y: otto.y };
      m.targetLabel = 'Steal the teal convertible in Palm Heights';
      m.timer = 0;
    } else if (m.type === 'drops') {
      const nodes = story
        ? [[10, 8], [8, 9], [11, 6], [6, 8], [9, 7]]
        : [[rng.int(4, 11), rng.int(5, 9)], [rng.int(4, 11), rng.int(5, 9)], [rng.int(4, 11), rng.int(5, 9)]];
      m.data.drops = nodes.map(([i, j]) => ({ x: roadX(i), y: roadY(j) }));
      m.data.dropIdx = 0;
      m.target = m.data.drops[0];
      m.targetLabel = 'Grab the cash drops around the port (' + m.data.drops.length + ')';
      m.timer = 240;
      m.timeLeft = 240;
    }
    updateObjective();
  }

  function completeMission() {
    const m = state.mission;
    let reward = m.reward;
    if (m.type === 'fare' && m.timer > 0) reward += Math.round((m.timeLeft / m.timer) * 60);
    state.player.cash += reward;
    state.stats.missionsDone++;
    state.events.push('missionDone');
    state.events.push('cash');
    const wasStoryFinale = !state.storyDone && m.index === 3;
    m.active = false;
    m.timer = 0;
    m.target = null;
    if (wasStoryFinale) {
      state.storyDone = true;
      state.events.push('storyDone');
      setBanner('STORY COMPLETE', 'Marisol: "Palm City is yours now, driver." Final job paid $' + reward + '.', 7);
      m.index = 4;
    } else {
      setBanner('JOB DONE', '+$' + reward + ' — Marisol always pays on time.', 4.5);
      if (m.index < 4) m.index++;
      else state.endlessCount++;
    }
    updateObjective();
  }

  function failMission(reason) {
    const m = state.mission;
    if (m.type === 'steal' && m.data.carId) {
      const otto = state.cars.find((c) => c.id === m.data.carId);
      if (otto) otto.missionMark = false;
    }
    if (m.type === 'fare' && m.data.passengerId) {
      const ped = state.peds.find((p) => p.id === m.data.passengerId);
      if (ped && ped.mode === 'aboard') {
        ped.mode = 'walk';
        ped.x = state.player.x + 24; ped.y = state.player.y + 10;
        ped.path = blockPath(6, 5);
      }
    }
    m.active = false;
    m.timer = 0;
    m.target = null;
    state.events.push('missionFail');
    setBanner('JOB BLOWN', reason + ' See Marisol to try again.', 4.5);
    updateObjective();
  }

  function updateMission(dt) {
    const m = state.mission;
    if (!m.active) {
      // Standing close to Marisol starts the next job.
      if (state.giver && reach({ x: state.giver.x, y: state.giver.y }, 56)) {
        startMission(state.storyDone ? 4 + state.endlessCount : m.index);
      }
      return;
    }
    if (m.type === 'drops' && state.heat < 8) state.heat = 8;
    if (m.timer > 0) {
      m.timeLeft -= dt;
      if (m.timeLeft <= 0) { failMission('Out of time.'); return; }
    }
    if (m.type === 'delivery') {
      if (m.stage === 0 && reach(m.data.pickup, 56)) {
        m.stage = 1;
        m.target = m.data.dropoff;
        m.targetLabel = 'Deliver the package — fast, but intact';
        m.timer = 150;
        m.timeLeft = 150;
        state.events.push('pickup');
        setBanner('PACKAGE ON BOARD', 'Get it across town. The clock is running.', 3.5);
      } else if (m.stage === 1 && reach(m.data.dropoff, 62)) {
        completeMission();
      }
    } else if (m.type === 'fare') {
      const ped = state.peds.find((p) => p.id === m.data.passengerId);
      if (m.stage === 0) {
        if (ped) { m.target = { x: ped.x, y: ped.y }; }
        const car = playerCar();
        if (ped && car && Math.abs(car.speed) < 45 && dist2(car.x, car.y, ped.x, ped.y) < 58 * 58) {
          ped.mode = 'aboard';
          m.stage = 1;
          m.target = m.data.dropoff;
          m.targetLabel = 'Take your fare to ' + m.data.dropoffName;
          m.timer = 120;
          m.timeLeft = 120;
          state.events.push('pickup');
        }
      } else if (m.stage === 1) {
        if (ped) { ped.x = state.player.x; ped.y = state.player.y; }
        if (reach(m.data.dropoff, 62)) {
          if (ped) {
            ped.mode = 'walk';
            ped.x = m.data.dropoff.x + 18; ped.y = m.data.dropoff.y + 8;
            ped.path = blockPath(6, 5);
          }
          completeMission();
        }
      }
    } else if (m.type === 'steal') {
      const car = state.cars.find((c) => c.id === m.data.carId);
      if (!car || car.dead) { failMission('The convertible is wrecked.'); return; }
      if (m.stage === 0) {
        m.target = { x: car.x, y: car.y };
        if (state.player.carId === car.id) {
          m.stage = 1;
          state.heat = Math.min(24, state.heat + 6);
          state.events.push('crime');
          const garage = city.landmarks['Sunset Garage'];
          m.target = { x: garage.x, y: garage.y };
          m.targetLabel = 'Deliver the convertible to Sunset Garage — the law noticed';
          setBanner('HOT WHEELS', 'Every cop in Palm City just heard your name.', 4);
        }
      } else if (m.stage === 1 && state.player.carId === car.id && reach(m.target, 74)) {
        car.missionMark = false;
        completeMission();
      }
    } else if (m.type === 'drops') {
      const drop = m.data.drops[m.data.dropIdx];
      if (drop && reach(drop, 50)) {
        state.player.cash += 60;
        state.events.push('pickup');
        state.events.push('cash');
        m.data.dropIdx++;
        if (m.data.dropIdx >= m.data.drops.length) completeMission();
        else {
          m.target = m.data.drops[m.data.dropIdx];
          m.targetLabel = 'Grab the cash drops around the port (' + (m.data.drops.length - m.data.dropIdx) + ' left)';
        }
      }
    }
    updateObjective();
  }

  // ---- heat, stars, bust ----

  function updateLaw(dt) {
    const floorStars = state.mission.active && state.mission.type === 'drops' ? 3 : 0;
    state.stars = Math.max(starsFor(state.heat), floorStars);
    // Police presence refreshes the "seen" clock.
    let nearestCop = Infinity;
    for (const c of state.cars) {
      if (c.kind !== 'police') continue;
      const d = Math.sqrt(dist2(c.x, c.y, state.player.x, state.player.y));
      if (d < nearestCop) nearestCop = d;
      if (d < 480) state.lastSeenT = state.time;
    }
    // Lying low cools the heat.
    if (state.time - state.lastSeenT > 5 && state.heat > 0) {
      const floorHeat = floorStars > 0 ? 8 : 0;
      state.heat = Math.max(floorHeat, state.heat - 0.32 * dt);
      state.stars = Math.max(starsFor(state.heat), floorStars);
    }
    if (state.stars === 0) {
      // The law gives up and rolls off as ordinary traffic.
      for (const c of state.cars) {
        if (c.kind === 'police') {
          c.kind = 'traffic';
          c.driver = true;
          if (!c.target) { c.prevNode = nearestNode(c.x, c.y); c.cameFrom = null; c.target = pickNextNode(c, rng); snapToLane(c); }
        }
      }
      state.bust = 0;
      return;
    }
    const desired = Math.min(2 + state.stars, 6);
    state.policeSpawnT -= dt;
    if (policeCount() < desired && state.policeSpawnT <= 0) {
      spawnPolice();
      state.policeSpawnT = 1.7;
    }
    // The bust meter: pinned and slow with the law on top of you.
    const car = playerCar();
    const mySpeed = car ? Math.abs(car.speed) : (state.player.footSpeed ?? 0);
    if (nearestCop < 88 && mySpeed < 70) {
      state.bust = Math.min(1, state.bust + (dt / 2.4) * (1 + 0.25 * Math.max(0, policeCount() - 1)));
      if (state.bust >= 1) gameOver('busted', 'The Palm City PD finally caught up with you.');
    } else {
      state.bust = Math.max(0, state.bust - dt / 2.5);
    }
  }

  // ---- the fixed step ----

  function step(dt, input) {
    state.time += dt;
    const p = state.player;
    if (!state.over) {
      // Track foot speed for the bust meter.
      const ox = p.x, oy = p.y;
      updatePlayer(dt, input);
      if (!playerCar()) p.footSpeed = Math.hypot(p.x - ox, p.y - oy) / dt;
    }
    for (const car of state.cars) {
      if (car.id === state.player.carId) continue;
      if (car.kind === 'traffic') updateTrafficCar(car, dt);
      else if (car.kind === 'police') updatePoliceCar(car, dt);
    }
    // Keep the streets populated.
    const trafficCount = state.cars.reduce((n, c) => n + (c.kind === 'traffic' ? 1 : 0), 0);
    if (trafficCount < 26 && rng.chance(0.02)) {
      const c = spawnTrafficCar();
      if (dist2(c.x, c.y, p.x, p.y) < 700 * 700) state.cars.splice(state.cars.indexOf(c), 1);
    }
    for (const ped of state.peds) updatePed(ped, dt);
    updateCollisions(dt);
    if (!state.over) {
      updateMission(dt);
      updateLaw(dt);
      // Slow recovery once the danger has passed.
      if (state.time - (p.lastDamageT ?? -99) > 8 && p.health > 0) {
        p.health = Math.min(100, p.health + 3 * dt);
      }
      const nd = districtAt(p.x, p.y);
      if (nd !== state.district) {
        state.district = nd;
        state.splashUntil = state.time + 2.2;
        state.events.push('splash');
      }
    }
  }

  return { state, rng, city, newGame, saveData, applySave, playerCar, setBanner, step, respawn };
}
