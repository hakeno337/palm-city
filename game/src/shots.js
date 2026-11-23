// Palm City — screenshot staging behind ?shot=drive|foot|chase|title.
// Each scene builds a fresh world, plays the real rules forward with
// scripted inputs, and leaves the world mid-moment, so the frame is what
// the game actually looks like and the same seed always gives the same
// frame. A little teleportation sets the scene; nothing is faked that the
// renderer draws.

import { CITY_W, roadX, roadY } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE = { x: 0, y: 0, sprint: false, interact: false, punch: false };
const DRIVE = { x: 0.05, y: -1, sprint: false, interact: false, punch: false };

function stepN(world, n, input) {
  for (let i = 0; i < n; i++) world.step(1 / 60, input);
}

/** Move a spare parked car to (x, y) and put the player in the driver's seat. */
function putPlayerInCar(state, x, y, angle, speed) {
  const car = state.cars.find((c) => c.kind === 'parked' && !c.missionMark && !c.dead);
  car.x = x; car.y = y; car.angle = angle; car.speed = speed;
  car.parked = false; car.driver = false;
  state.player.carId = car.id;
  state.player.x = x; state.player.y = y; state.player.angle = angle;
  return car;
}

function nearestPolice(state) {
  let best = null, bestD = Infinity;
  for (const c of state.cars) {
    if (c.kind !== 'police') continue;
    const d = (c.x - state.player.x) ** 2 + (c.y - state.player.y) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Teleport a traffic car into the scene with a node ahead to drive toward. */
function dressTraffic(state, pick, x, y, angle, node, speed) {
  const traffic = state.cars.filter((c) => c.kind === 'traffic' && !c.dead);
  const car = traffic[pick % traffic.length];
  car.x = x; car.y = y; car.angle = angle; car.speed = speed;
  car.target = { i: node.i, j: node.j, x: roadX(node.i), y: roadY(node.j) };
  car.goalX = undefined; car.goalY = undefined;
  car.cameFrom = null;
  return car;
}

/** Start Marisol's first job and run it to the delivery stage. */
function startDelivery(world) {
  const s = world.state;
  s.player.x = s.giver.x; s.player.y = s.giver.y;
  stepN(world, 2, IDLE);
  const m = s.mission;
  if (m.active && m.data.pickup) {
    s.player.x = m.data.pickup.x; s.player.y = m.data.pickup.y;
    stepN(world, 2, IDLE);
  }
}

function stageDrive(world) {
  const s = world.state;
  startDelivery(world);
  // Roll east through downtown so the law spawns and gives chase for real.
  putPlayerInCar(s, roadX(3), roadY(4) - 23, 0, 330);
  s.heat = 4.5;
  stepN(world, 150, DRIVE);
  // Compose the cover frame: a fresh car at speed on a clean stretch,
  // traffic ahead and oncoming, one patrol car on the tail.
  const car = putPlayerInCar(s, roadX(4) + 30, roadY(4) - 23, 0, 420);
  dressTraffic(s, 0, car.x + 340, roadY(4) - 23, 0, { i: 7, j: 4 }, 300);
  dressTraffic(s, 1, car.x - 300, roadY(4) + 23, Math.PI, { i: 2, j: 4 }, 320);
  const cop = nearestPolice(s);
  if (cop) { cop.x = car.x - 290; cop.y = car.y + 5; cop.angle = 0; cop.speed = 455; }
  s.heat = 4.5;
  world.setBanner('PACKAGE ON BOARD', 'Get it across town. The clock is running.', 3.5);
  stepN(world, 8, DRIVE);
  car.speed = 430; // The frame freezes mid-flight, not mid-brake.
  return SCREEN_PLAY;
}

function stageFoot(world) {
  const s = world.state;
  // A stroll on the Coral Beach sand, locals about, ocean on the right.
  s.player.x = CITY_W + 250;
  s.player.y = roadY(4) + 30;
  s.player.carId = null;
  stepN(world, 62, { x: -0.4, y: 0.06, sprint: false, interact: false, punch: false });
  // Bring a few beachgoers in around where the stroll ends up.
  let placed = 0;
  for (const ped of s.peds) {
    if (placed >= 4) break;
    if (ped === s.giver || ped.mode !== 'walk') continue;
    ped.x = s.player.x + [-80, 90, 170, -150][placed];
    ped.y = s.player.y + [-110, -50, 80, 120][placed];
    ped.path = [{ x: ped.x - 60, y: ped.y }, { x: ped.x + 60, y: ped.y }];
    ped.wp = 0;
    placed++;
  }
  s.banner = null; // Only the district splash speaks in this frame.
  stepN(world, 6, { x: -0.2, y: 0, sprint: false, interact: false, punch: false });
  return SCREEN_PLAY;
}

function stageChase(world) {
  const s = world.state;
  startDelivery(world);
  putPlayerInCar(s, roadX(5), roadY(5) - 23, 0, 360);
  s.heat = 13.5; // Four stars.
  stepN(world, 210, { x: 0.04, y: -1, sprint: false, interact: false, punch: false });
  // Compose the hot moment on a clean avenue: boxed in, still moving.
  const car = putPlayerInCar(s, roadX(6), roadY(5) - 23, 0, 390);
  const cops = s.cars.filter((c) => c.kind === 'police');
  const spots = [
    { dx: -175, dy: 46, angle: 0.05, speed: 430 },
    { dx: -310, dy: -6, angle: 0, speed: 445 },
    { dx: 120, dy: 46, angle: -0.14, speed: 395 },
  ];
  cops.slice(0, 3).forEach((cop, i) => {
    const spot = spots[i];
    if (!spot) return;
    cop.x = car.x + spot.dx;
    cop.y = car.y + spot.dy;
    cop.angle = spot.angle;
    cop.speed = spot.speed;
  });
  s.heat = 13.5;
  s.bust = 0.55;
  stepN(world, 8, DRIVE);
  car.speed = 400; // Caught mid-flight on the speedometer, not mid-brake.
  s.bust = 0.55;
  s.heat = 13.5;
  return SCREEN_PLAY;
}

function stageTitle(world) {
  const s = world.state;
  // Overlook where downtown meets the beach; let the traffic flow through.
  s.camOverride = { x: CITY_W - 430, y: roadY(3) };
  stepN(world, 200, IDLE);
  // Land the frame while the start prompt is in its visible blink phase.
  for (let i = 0; i < 45 && Math.floor(s.time * 1.6) % 2 !== 0; i++) world.step(1 / 60, IDLE);
  return SCREEN_TITLE;
}

/** Set `world` to the named scene and return the screen to draw over it. */
export function stageShot(world, name) {
  world.newGame();
  world.state.events.length = 0;
  if (name === 'drive') return stageDrive(world);
  if (name === 'foot') return stageFoot(world);
  if (name === 'chase') return stageChase(world);
  return stageTitle(world);
}
