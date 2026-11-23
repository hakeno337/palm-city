// Palm City — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 steps, the renderer paints what is there, and the
// shell moves between screens: title, play, paused, busted, wasted and
// story complete. It also owns saving, sound triggers and shot staging.
//
// ?seed=N fixes the city's randomness. ?shot=drive|foot|chase|title (with
// &seed=N) stages that scene instead of running the loop, paints it a few
// times and sets window.__shotReady for a screenshot.

import { SAVE_KEY, STEP } from './config.js';
import { createWorld } from './world.js';
import { ACT_CONFIRM, ACT_CONTINUE, ACT_INTERACT, ACT_MUTE, ACT_PAUSE, ACT_PUNCH, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const sound = createSound();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
  } catch { /* Private windows: progress then lasts this visit only. */ }
}

if (shot) {
  const screen = stageShot(world, shot);
  world.state.events.length = 0;
  let painted = 0;
  const paint = () => {
    renderer.draw(world.state, screen, { hasSave: !!readSave() });
    painted++;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  runGame();
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let started = false;
  let accumulator = 0;
  let last = performance.now();
  let saveT = 0;
  let completeShown = false;

  world.newGame();
  world.state.events.length = 0;

  const announce = (msg) => { status.textContent = msg; };
  announce('Palm City. Press Enter to start.');

  window.addEventListener('keydown', () => sound.unlock(), { once: true });
  canvas.addEventListener('pointerdown', () => sound.unlock(), { once: true });

  function startNew() {
    world.newGame();
    world.state.events.length = 0;
    started = true;
    completeShown = false;
    screen = SCREEN_PLAY;
    writeSave();
    announce('Playing. See Marisol at The Flamingo Club for work.');
  }

  function startContinue() {
    const data = readSave();
    if (!data) { startNew(); return; }
    world.applySave(data);
    world.state.events.length = 0;
    started = true;
    completeShown = world.state.storyDone;
    screen = SCREEN_PLAY;
    announce('Welcome back to Palm City.');
  }

  function drainEvents() {
    const events = world.state.events;
    for (const e of events) {
      if (e === 'pickup') sound.pickup();
      else if (e === 'cash') sound.cash();
      else if (e === 'punch') sound.punch();
      else if (e === 'crash') sound.crash();
      else if (e === 'board') sound.board();
      else if (e === 'crime') sound.crime();
      else if (e === 'missionStart') sound.missionStart();
      else if (e === 'missionDone') { sound.missionDone(); writeSave(); }
      else if (e === 'missionFail') sound.missionFail();
      else if (e === 'splash') sound.splash();
      else if (e === 'storyDone' && !completeShown) {
        completeShown = true;
        sound.storyDone();
        screen = SCREEN_COMPLETE;
        writeSave();
      }
    }
    events.length = 0;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACT_MUTE) {
      const muted = sound.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACT_CONFIRM) startNew();
      else if ((actions & ACT_CONTINUE) && readSave()) startContinue();
      return actions;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACT_CONFIRM) {
        world.respawn();
        screen = SCREEN_PLAY;
        writeSave();
        announce('Back on the street.');
      }
      return actions;
    }
    if (screen === SCREEN_COMPLETE) {
      if (actions & ACT_CONFIRM) { screen = SCREEN_PLAY; announce('Free roam.'); }
      return actions;
    }
    if (actions & ACT_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
    }
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();

    if (screen === SCREEN_TITLE) {
      // The city idles behind the title: traffic flows, nobody works.
      while (accumulator >= STEP) { world.step(STEP, { x: 0, y: 0, sprint: false, interact: false, punch: false }); accumulator -= STEP; }
      world.state.events.length = 0;
    } else if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP) {
        const axes = input.axes();
        world.step(STEP, {
          x: axes.x, y: axes.y, sprint: axes.sprint,
          interact: first && !!(actions & ACT_INTERACT),
          punch: first && !!(actions & ACT_PUNCH),
        });
        first = false;
        accumulator -= STEP;
        if (world.state.over) break;
      }
      drainEvents();
      if (world.state.over === 'busted') { screen = SCREEN_BUSTED; sound.busted(); sound.setSiren(false); announce('Busted.'); }
      else if (world.state.over === 'wasted') { screen = SCREEN_WASTED; sound.wasted(); sound.setSiren(false); announce('Wasted.'); }
      saveT += 1 / 60;
      if (saveT > 5) { saveT = 0; if (started) writeSave(); }
    } else {
      accumulator = 0;
      if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
        // The street keeps moving behind the card, at half attention.
        world.step(STEP, { x: 0, y: 0, sprint: false, interact: false, punch: false });
        world.state.events.length = 0;
      }
    }

    // The siren follows the law while you play.
    if (screen === SCREEN_PLAY && world.state.stars > 0) {
      const near = world.state.cars.some((c) => c.kind === 'police'
        && (c.x - world.state.player.x) ** 2 + (c.y - world.state.player.y) ** 2 < 700 * 700);
      sound.setSiren(near);
    } else if (screen !== SCREEN_PLAY) {
      sound.setSiren(false);
    }

    renderer.draw(world.state, screen, { hasSave: !!readSave() });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  requestAnimationFrame(frame);
}
