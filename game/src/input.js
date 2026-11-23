// Palm City — keyboard input. Held keys give the movement axes; one-shot
// presses (interact, punch, pause, confirm, mute, continue) are queued as
// flags and consumed once by the shell, so a tap between frames is never
// lost and never double-counted.

export const ACT_INTERACT = 1;
export const ACT_PUNCH = 2;
export const ACT_PAUSE = 4;
export const ACT_CONFIRM = 8;
export const ACT_MUTE = 16;
export const ACT_CONTINUE = 32;

const HELD = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
};
const PRESS = {
  [ACT_INTERACT]: ['KeyE'],
  [ACT_PUNCH]: ['KeyF'],
  [ACT_PAUSE]: ['KeyP', 'Escape'],
  [ACT_CONFIRM]: ['Enter', 'Space'],
  [ACT_MUTE]: ['KeyM'],
  [ACT_CONTINUE]: ['KeyC'],
};
const ALL_HELD = new Set(Object.values(HELD).flat());
const PRESS_BY_CODE = new Map();
for (const [flag, codes] of Object.entries(PRESS)) {
  for (const code of codes) PRESS_BY_CODE.set(code, Number(flag));
}

export function createInput(target) {
  const held = new Set();
  let queued = 0;

  window.addEventListener('keydown', (event) => {
    if (ALL_HELD.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    const flag = PRESS_BY_CODE.get(event.code);
    if (flag !== undefined) {
      if (!event.repeat) queued |= flag;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => { held.delete(event.code); });
  window.addEventListener('blur', () => held.clear());
  if (target) {
    target.addEventListener('pointerdown', () => { queued |= ACT_CONFIRM; });
  }

  const any = (codes) => codes.some((c) => held.has(c));
  return {
    /** Movement axes in -1..1 plus held sprint; safe to read every step. */
    axes() {
      return {
        x: (any(HELD.right) ? 1 : 0) - (any(HELD.left) ? 1 : 0),
        y: (any(HELD.down) ? 1 : 0) - (any(HELD.up) ? 1 : 0),
        sprint: any(HELD.sprint),
      };
    },
    /** Queued one-shot presses since the last call, as ACT_* flags. */
    takeActions() {
      const taken = queued;
      queued = 0;
      return taken;
    },
  };
}
