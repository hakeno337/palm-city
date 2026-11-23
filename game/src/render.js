// Palm City — the canvas renderer. Reads world state and paints the city,
// the actors, the HUD and the screens. It never changes the simulation;
// animations key off state.time so a staged frame is reproducible.

import {
  VIEW_W, VIEW_H, ROAD, BLOCK_W, BLOCK_H, COLS, ROWS, SIDEWALK,
  CITY_W, CITY_H, BEACH_W, WORLD_W, WORLD_H,
  roadX, roadY, blockX, blockY, COLORS,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'pause';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) ctx.fill(); else ctx.stroke();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;

  function cameraFor(state) {
    if (state.camOverride) return { x: state.camOverride.x - VIEW_W / 2, y: state.camOverride.y - VIEW_H / 2 };
    const p = state.player;
    return {
      x: Math.max(0, Math.min(WORLD_W - VIEW_W, p.x - VIEW_W / 2)),
      y: Math.max(0, Math.min(WORLD_H - VIEW_H, p.y - VIEW_H / 2)),
    };
  }

  // ------------------------------------------------------------ terrain

  function drawTerrain(state, cam) {
    const { city } = state;
    const t = state.time;
    // Ocean everywhere first, then sand, then the city slab.
    ctx.fillStyle = COLORS.oceanDeep;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = COLORS.ocean;
    const ox = CITY_W + BEACH_W - cam.x;
    if (ox < VIEW_W) {
      ctx.fillRect(Math.max(0, ox), 0, VIEW_W, VIEW_H);
      // Foam lines drifting with the swell.
      ctx.strokeStyle = COLORS.foam;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const fx = ox + 14 + k * 46 + Math.sin(t * 0.9 + k * 1.7) * 7;
        if (fx > VIEW_W) continue;
        ctx.beginPath();
        for (let y = -20; y <= VIEW_H + 20; y += 44) {
          const xx = fx + Math.sin(y * 0.02 + t * 1.3 + k) * 5;
          if (y === -20) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Sand.
    const sx = CITY_W - cam.x;
    if (sx < VIEW_W) {
      ctx.fillStyle = COLORS.sand;
      ctx.fillRect(Math.max(0, sx), 0, BEACH_W + (ox < 0 ? 0 : 0), VIEW_H);
      ctx.fillStyle = COLORS.sandDark;
      const x0 = Math.max(0, Math.floor(sx / 46) * 46);
      for (let x = x0; x < Math.min(VIEW_W, sx + BEACH_W); x += 46) {
        for (let y = 8; y < VIEW_H; y += 52) {
          if (hash2(x + cam.x, y + cam.y) > 0.55) ctx.fillRect(x + hash2(y, x) * 20, y, 3, 2);
        }
      }
    }
    // City slab: asphalt base, then per-block ground.
    const cx0 = Math.max(0, -cam.x), cy0 = Math.max(0, -cam.y);
    const cx1 = Math.min(VIEW_W, CITY_W - cam.x), cy1 = Math.min(VIEW_H, CITY_H - cam.y);
    if (cx1 > cx0 && cy1 > cy0) {
      ctx.fillStyle = COLORS.asphalt;
      ctx.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
      // Lane dashes along every road centre.
      ctx.strokeStyle = COLORS.laneMark;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 3;
      ctx.setLineDash([26, 30]);
      ctx.beginPath();
      for (let i = 0; i <= COLS; i++) {
        const x = roadX(i) - cam.x;
        if (x < -10 || x > VIEW_W + 10) continue;
        ctx.moveTo(x, cy0); ctx.lineTo(x, cy1);
      }
      for (let j = 0; j <= ROWS; j++) {
        const y = roadY(j) - cam.y;
        if (y < -10 || y > VIEW_H + 10) continue;
        ctx.moveTo(cx0, y); ctx.lineTo(cx1, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // Crosswalks at intersections.
      ctx.fillStyle = COLORS.crosswalk;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i <= COLS; i++) {
        for (let j = 0; j <= ROWS; j++) {
          const x = roadX(i) - cam.x, y = roadY(j) - cam.y;
          if (x < -70 || y < -70 || x > VIEW_W + 70 || y > VIEW_H + 70) continue;
          for (let s = -3; s <= 3; s++) {
            if (s === 0) continue;
            ctx.fillRect(x + s * 12 - 3, y - ROAD / 2 + 4, 6, 12);
            ctx.fillRect(x + s * 12 - 3, y + ROAD / 2 - 16, 6, 12);
            ctx.fillRect(x - ROAD / 2 + 4, y + s * 12 - 3, 12, 6);
            ctx.fillRect(x + ROAD / 2 - 16, y + s * 12 - 3, 12, 6);
          }
        }
      }
      ctx.globalAlpha = 1;
      // Blocks: sidewalk apron, then the block's own ground.
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const bx = blockX(col) - cam.x, by = blockY(row) - cam.y;
          if (bx + BLOCK_W < -20 || by + BLOCK_H < -20 || bx > VIEW_W + 20 || by > VIEW_H + 20) continue;
          ctx.fillStyle = COLORS.sidewalk;
          ctx.fillRect(bx - SIDEWALK, by - SIDEWALK, BLOCK_W + SIDEWALK * 2, BLOCK_H + SIDEWALK * 2);
          ctx.fillStyle = COLORS.blockGround;
          ctx.fillRect(bx, by, BLOCK_W, BLOCK_H);
        }
      }
      for (const park of city.parks) {
        const x = park.x - cam.x, y = park.y - cam.y;
        if (x + park.w < 0 || y + park.h < 0 || x > VIEW_W || y > VIEW_H) continue;
        ctx.fillStyle = COLORS.grass;
        ctx.fillRect(x, y, park.w, park.h);
        ctx.fillStyle = COLORS.grassDark;
        ctx.fillRect(x, y, park.w, 8); ctx.fillRect(x, y + park.h - 8, park.w, 8);
        ctx.fillStyle = COLORS.parkPath;
        ctx.fillRect(x, y + park.h / 2 - 7, park.w, 14);
        ctx.fillRect(x + park.w / 2 - 7, y, 14, park.h);
      }
      for (const lot of city.lots) {
        const x = lot.x - cam.x, y = lot.y - cam.y;
        if (x + lot.w < 0 || y + lot.h < 0 || x > VIEW_W || y > VIEW_H) continue;
        ctx.fillStyle = '#565d66';
        ctx.fillRect(x, y, lot.w, lot.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        for (let px = x + 16; px < x + lot.w - 20; px += 52) {
          ctx.beginPath(); ctx.moveTo(px, y + 8); ctx.lineTo(px, y + 44); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px, y + lot.h - 44); ctx.lineTo(px, y + lot.h - 8); ctx.stroke();
        }
        if (lot.garage) {
          ctx.fillStyle = COLORS.gold;
          ctx.font = '700 13px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('SUNSET GARAGE — DROP-OFF', x + lot.w / 2, y + lot.h - 12);
        }
      }
    }
  }

  function drawBuildings(state, cam) {
    for (const b of state.city.buildings) {
      const x = b.x - cam.x, y = b.y - cam.y;
      if (x + b.w < -30 || y + b.h < -30 || x > VIEW_W + 30 || y > VIEW_H + 30) continue;
      ctx.fillStyle = 'rgba(30, 25, 15, 0.20)';
      ctx.fillRect(x + 11, y + 14, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(x + 7, y + 7, b.w - 14, b.h - 14);
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(x + 16, y + 16, Math.max(10, b.w * 0.22), Math.max(8, b.h * 0.18));
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      const ax = x + b.w * (0.55 + hash2(b.x, b.y) * 0.25);
      const ay = y + b.h * (0.4 + hash2(b.y, b.x) * 0.3);
      ctx.fillRect(ax, ay, 20, 14);
      if (b.landmark) {
        ctx.fillStyle = 'rgba(20, 26, 34, 0.78)';
        ctx.font = '700 14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.name.toUpperCase(), x + b.w / 2, y + b.h / 2 + 5);
      }
    }
  }

  function drawPalmsAndBeach(state, cam) {
    for (const u of state.city.umbrellas) {
      const x = u.x - cam.x, y = u.y - cam.y;
      if (x < -20 || y < -20 || x > VIEW_W + 20 || y > VIEW_H + 20) continue;
      ctx.fillStyle = 'rgba(30,25,15,0.15)';
      ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = u.color;
      ctx.beginPath(); ctx.arc(x, y, 13, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - 13, y - 1, 26, 3);
    }
    for (const p of state.city.palms) {
      const x = p.x - cam.x, y = p.y - cam.y;
      if (x < -24 || y < -24 || x > VIEW_W + 24 || y > VIEW_H + 24) continue;
      ctx.strokeStyle = COLORS.palmLeaf;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + p.x * 0.01;
        const ex = x + Math.cos(a) * 15 * p.s, ey = y + Math.sin(a) * 11 * p.s;
        const mx = x + Math.cos(a) * 8 * p.s, my = y + Math.sin(a) * 5 * p.s - 3;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(mx, my, ex, ey);
      }
      ctx.stroke();
      ctx.fillStyle = COLORS.palmTrunk;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ------------------------------------------------------------ actors

  function drawMarker(state, cam, x, y, symbol, color) {
    const sx = x - cam.x, sy = y - cam.y;
    if (sx < -80 || sy < -80 || sx > VIEW_W + 80 || sy > VIEW_H + 80) return;
    const t = state.time;
    const pulse = 26 + Math.sin(t * 4) * 6;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sx, sy, pulse, pulse * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    const grad = ctx.createLinearGradient(0, sy - 190, 0, sy);
    grad.addColorStop(0, 'rgba(255, 217, 77, 0)');
    grad.addColorStop(1, 'rgba(255, 217, 77, 0.34)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx - 13, sy - 190, 26, 190);
    ctx.globalAlpha = 1;
    const bobY = sy - 52 + Math.sin(t * 3.2) * 5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx, bobY + 16); ctx.lineTo(sx - 13, bobY); ctx.lineTo(sx, bobY - 10); ctx.lineTo(sx + 13, bobY);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#12202e';
    ctx.font = '900 15px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(symbol, sx, bobY + 3);
  }

  function drawCar(state, cam, car) {
    const x = car.x - cam.x, y = car.y - cam.y;
    if (x < -60 || y < -60 || x > VIEW_W + 60 || y > VIEW_H + 60) return;
    ctx.save();
    ctx.translate(x, y);
    // Ground shadow.
    ctx.fillStyle = 'rgba(20, 18, 10, 0.28)';
    rr(ctx, -19, -7, 46, 22, 7); ctx.fill();
    ctx.rotate(car.angle);
    // Wheels.
    ctx.fillStyle = '#14161a';
    ctx.fillRect(-15, -13, 10, 5); ctx.fillRect(6, -13, 10, 5);
    ctx.fillRect(-15, 8, 10, 5); ctx.fillRect(6, 8, 10, 5);
    // Body.
    if (car.kind === 'police') ctx.fillStyle = '#f4f6f7';
    else ctx.fillStyle = car.dead ? '#5d5648' : car.color;
    rr(ctx, -22, -11, 44, 22, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    rr(ctx, -22, -11, 44, 22, 6); ctx.stroke();
    if (car.kind === 'police') {
      ctx.fillStyle = '#16222e';
      ctx.fillRect(-6, -11, 13, 22);
      // Light bar: red and blue take turns.
      const phase = Math.floor(state.time * 3.4 + car.id) % 2 === 0;
      ctx.fillStyle = phase ? COLORS.policeRed : '#5dade2';
      ctx.fillRect(-3, -7, 6, 6);
      ctx.fillStyle = phase ? '#5dade2' : COLORS.policeRed;
      ctx.fillRect(-3, 1, 6, 6);
    }
    // Glass and cabin.
    ctx.fillStyle = 'rgba(18, 32, 44, 0.85)';
    if (car.convertible) {
      ctx.fillRect(-9, -8, 15, 16);
      ctx.fillStyle = '#8d5524';
      ctx.fillRect(-6, -6, 6, 5); ctx.fillRect(-6, 1, 6, 5);
    } else {
      ctx.fillRect(-10, -8, 7, 16);
      ctx.fillStyle = car.kind === 'police' ? '#dfe6ea' : car.color;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(-2, -8, 10, 16);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(18, 32, 44, 0.85)';
      ctx.fillRect(9, -8, 5, 16);
    }
    // Lights: headlights forward, brake lights when braking.
    ctx.fillStyle = '#fff6bf';
    ctx.fillRect(20, -8, 3, 4); ctx.fillRect(20, 4, 3, 4);
    ctx.fillStyle = car.brake ? '#ff2d20' : '#8e241d';
    ctx.fillRect(-23, -8, 3, 4); ctx.fillRect(-23, 4, 3, 4);
    ctx.restore();
    // Damage smoke.
    if (car.health < 35 && !car.dead) {
      const n = 3;
      for (let k = 0; k < n; k++) {
        const ph = (state.time * 0.9 + k / n + car.id * 0.37) % 1;
        ctx.fillStyle = 'rgba(70, 70, 70,' + (0.4 * (1 - ph)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x + 14 + ph * 10, y - 6 - ph * 26, 4 + ph * 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (car.missionMark) {
      ctx.strokeStyle = COLORS.gold;
      ctx.globalAlpha = 0.65 + Math.sin(state.time * 5) * 0.3;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawPed(state, cam, ped) {
    if (ped.mode === 'aboard') return;
    const x = ped.x - cam.x, y = ped.y - cam.y;
    if (x < -20 || y < -20 || x > VIEW_W + 20 || y > VIEW_H + 20) return;
    ctx.fillStyle = 'rgba(20,18,10,0.25)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 4, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    if (ped.mode === 'down') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ped.angle);
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath(); ctx.arc(11, 0, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const stride = ped.mode === 'walk' || ped.mode === 'flee' ? Math.sin(state.time * 10 + ped.id * 2.1) * 3 : 0;
    ctx.fillStyle = '#2c3440';
    ctx.beginPath(); ctx.arc(x + stride * 0.4, y + 4, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - stride * 0.4, y + 4, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(x, y, 6.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(x, y - 1, 3.6, 0, Math.PI * 2); ctx.fill();
    if (ped === state.giver) {
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
    }
    if (ped.mode === 'wait') {
      ctx.fillStyle = COLORS.gold;
      ctx.font = '900 13px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', x, y - 14 + Math.sin(state.time * 3) * 2);
    }
  }

  function drawPlayer(state, cam) {
    const p = state.player;
    if (p.carId !== null) return;
    const x = p.x - cam.x, y = p.y - cam.y;
    ctx.fillStyle = 'rgba(20,18,10,0.3)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 5, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    const stride = Math.sin(p.stepPhase) * 3.4;
    const px = Math.cos(p.angle + Math.PI / 2), py = Math.sin(p.angle + Math.PI / 2);
    ctx.fillStyle = '#26313d';
    ctx.beginPath(); ctx.arc(x + px * stride, y + py * stride + 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - px * stride, y - py * stride + 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff7f50';
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(x, y - 1, 4.4, 0, Math.PI * 2); ctx.fill();
    // Punch arc.
    if (p.punchT > 0.16) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 24, p.angle - 0.7, p.angle + 0.7);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ HUD

  function bar(x, y, w, h, frac, color, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    rr(ctx, x, y, w, h, 4); ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = color;
      rr(ctx, x + 2, y + 2, Math.max(2, (w - 4) * Math.max(0, Math.min(1, frac))), h - 4, 3); ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = '700 10px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 6, y + h - 4);
  }

  function drawMinimap(state) {
    const MW = 198, MH = 106, MX = VIEW_W - MW - 16, MY = 64;
    ctx.fillStyle = 'rgba(8, 20, 30, 0.78)';
    rr(ctx, MX - 4, MY - 4, MW + 8, MH + 8, 8); ctx.fill();
    const sx = MW / WORLD_W, sy = MH / WORLD_H;
    ctx.fillStyle = COLORS.oceanDeep;
    ctx.fillRect(MX, MY, MW, MH);
    ctx.fillStyle = '#cbbd97';
    ctx.fillRect(MX, MY, CITY_W * sx, MH);
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(MX + CITY_W * sx, MY, BEACH_W * sx, MH);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= COLS; i++) { ctx.moveTo(MX + roadX(i) * sx, MY); ctx.lineTo(MX + roadX(i) * sx, MY + CITY_H * sy); }
    for (let j = 0; j <= ROWS; j++) { ctx.moveTo(MX, MY + roadY(j) * sy); ctx.lineTo(MX + CITY_W * sx, MY + roadY(j) * sy); }
    ctx.stroke();
    const dot = (x, y, color, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(MX + x * sx, MY + y * sy, r, 0, Math.PI * 2); ctx.fill(); };
    for (const c of state.cars) {
      if (c.kind === 'traffic') dot(c.x, c.y, 'rgba(255,255,255,0.75)', 1.6);
      else if (c.missionMark) dot(c.x, c.y, COLORS.gold, 3);
    }
    const flash = Math.floor(state.time * 3.4) % 2 === 0;
    for (const c of state.cars) if (c.kind === 'police') dot(c.x, c.y, flash ? '#ff5347' : '#54a0ff', 2.6);
    const m = state.mission;
    if (m.active && m.target) {
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(MX + m.target.x * sx, MY + m.target.y * sy, 4.5 + Math.sin(state.time * 5) * 1.4, 0, Math.PI * 2); ctx.stroke();
    } else if (!m.active && state.giver) {
      dot(state.giver.x, state.giver.y, COLORS.gold, 3);
    }
    // Player arrow.
    const px = MX + state.player.x * sx, py = MY + state.player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawHUD(state) {
    const p = state.player;
    // Cash + district, top-left.
    ctx.fillStyle = COLORS.hudPanel;
    rr(ctx, 14, 14, 252, 62, 9); ctx.fill();
    ctx.fillStyle = COLORS.gold;
    ctx.font = '900 26px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('$ ' + p.cash.toLocaleString('en-US'), 26, 46);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 12px Arial, sans-serif';
    ctx.fillText(state.district.toUpperCase() + ' · PALM CITY', 27, 66);
    // Health bars.
    bar(16, 84, 180, 15, p.health / 100, p.health > 30 ? '#58d158' : COLORS.danger, 'HEALTH');
    const car = state.cars.find((c) => c.id === p.carId);
    if (car) bar(16, 104, 180, 15, car.health / 100, '#54a0ff', 'CAR');
    // Objective.
    if (state.objective) {
      ctx.fillStyle = COLORS.hudPanel;
      rr(ctx, 14, 128, 312, 60, 9); ctx.fill();
      ctx.fillStyle = COLORS.gold;
      ctx.font = '700 10px Arial, sans-serif';
      ctx.fillText('OBJECTIVE', 26, 145);
      ctx.fillStyle = '#fff';
      ctx.font = '600 13.5px Arial, sans-serif';
      wrapText(state.objective, 26, 163, 288, 15, 2);
      const m = state.mission;
      if (m.active && m.timer > 0) {
        const left = Math.max(0, m.timeLeft);
        const txt = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
        ctx.fillStyle = left < 20 ? COLORS.danger : COLORS.gold;
        ctx.font = '900 15px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(txt, 314, 145);
        ctx.textAlign = 'left';
      }
    }
    // Wanted stars, top-right above the minimap.
    ctx.fillStyle = COLORS.hudPanel;
    rr(ctx, VIEW_W - 214, 12, 198, 44, 9); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const cx = VIEW_W - 196 + i * 38, cy = 34;
      if (i < state.stars) { ctx.fillStyle = COLORS.gold; star(ctx, cx, cy, 13, true); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.6; star(ctx, cx, cy, 13, false); }
    }
    drawMinimap(state);
    // Bust meter under the minimap.
    if (state.bust > 0.02) {
      const w = 198, x = VIEW_W - w - 16, y = 182;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      rr(ctx, x, y, w, 16, 5); ctx.fill();
      ctx.fillStyle = COLORS.danger;
      rr(ctx, x + 2, y + 2, (w - 4) * state.bust, 12, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 10px Arial, sans-serif';
      ctx.textAlign = 'center';
      if (Math.floor(state.time * 4) % 2 === 0) ctx.fillText('BUSTED…', x + w / 2, y + 12);
    }
    // Speedometer.
    if (car) {
      const kmh = Math.round(Math.abs(car.speed) * 0.19);
      ctx.fillStyle = COLORS.hudPanel;
      rr(ctx, VIEW_W - 128, VIEW_H - 74, 112, 58, 9); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 30px Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(kmh), VIEW_W - 52, VIEW_H - 32);
      ctx.font = '700 11px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('km/h', VIEW_W - 24, VIEW_H - 32);
      ctx.textAlign = 'left';
      ctx.font = '700 11px Arial, sans-serif';
      ctx.fillText(car.speed < -4 ? 'REV' : 'DRIVE', VIEW_W - 116, VIEW_H - 32);
    }
    // Banner.
    if (state.banner && state.time < state.banner.until) {
      const remain = state.banner.until - state.time;
      const alpha = Math.min(1, remain / 0.8, (state.time - (state.banner.until - 5)) / 0.3 + 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = 'rgba(8, 16, 26, 0.82)';
      const bw = 620;
      rr(ctx, (VIEW_W - bw) / 2, 92, bw, 74, 12); ctx.fill();
      ctx.fillStyle = COLORS.gold;
      ctx.font = '900 25px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.banner.title, VIEW_W / 2, 126);
      ctx.fillStyle = '#fff';
      ctx.font = '600 14.5px Arial, sans-serif';
      ctx.fillText(state.banner.sub, VIEW_W / 2, 150);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
    // District splash.
    if (state.time < state.splashUntil && !state.over) {
      const a = Math.min(1, (state.splashUntil - state.time) / 0.7);
      ctx.globalAlpha = a * 0.95;
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 44px "Arial Black", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 12;
      ctx.fillText(state.district.toUpperCase(), VIEW_W / 2, 210);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
    // Controls hint.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 11.5px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WASD / arrows — move & drive · SHIFT sprint · E enter / exit car · F punch · P pause · M mute', VIEW_W / 2, VIEW_H - 10);
    ctx.textAlign = 'left';
  }

  function wrapText(text, x, y, maxW, lineH, maxLines) {
    const words = text.split(' ');
    let line = '', lines = 0;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y + lines * lineH);
        lines++;
        if (lines >= maxLines) return;
        line = word;
      } else line = test;
    }
    if (lines < maxLines) ctx.fillText(line, x, y + lines * lineH);
  }

  // ------------------------------------------------------------ screens

  function dim(alpha) {
    ctx.fillStyle = 'rgba(6, 12, 20,' + alpha + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function drawTitle(state, hasSave) {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, 'rgba(6, 16, 28, 0.66)');
    grad.addColorStop(0.55, 'rgba(6, 16, 28, 0.30)');
    grad.addColorStop(1, 'rgba(6, 16, 28, 0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    // A small palm over the title.
    const px = VIEW_W / 2, py = 118;
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(px, py + 34);
    ctx.quadraticCurveTo(px + 5, py + 12, px + 2, py);
    ctx.stroke();
    ctx.strokeStyle = '#7bed9f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI + (k / 5) * Math.PI;
      ctx.moveTo(px + 2, py);
      ctx.quadraticCurveTo(px + 2 + Math.cos(a) * 22, py + Math.sin(a) * 16 - 8, px + 2 + Math.cos(a) * 34, py + Math.sin(a) * 20 + 4);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 96px "Arial Black", Arial, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 18;
    ctx.fillText('PALM CITY', px, 248);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(px - 210, 268, 420, 5);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'italic 600 21px Georgia, serif';
    ctx.fillText('Sun, sand, and somebody else\'s car.', px, 306);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 16.5px Arial, sans-serif';
    ctx.fillText('You roll into Palm City with empty pockets and a heavy right foot.', px, 352);
    ctx.fillText('Fixer Marisol pays cash for questionable errands — if the Palm City PD doesn\'t have you first.', px, 376);
    // Controls card.
    ctx.fillStyle = 'rgba(8, 16, 26, 0.72)';
    rr(ctx, px - 300, 404, 600, 128, 12); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 15.5px Arial, sans-serif';
    ctx.textAlign = 'left';
    const lines = [
      ['WASD / Arrows', 'Walk & drive'],
      ['SHIFT', 'Sprint'],
      ['E', 'Enter / exit any car'],
      ['F', 'Punch'],
      ['P', 'Pause'],
      ['M', 'Mute'],
    ];
    lines.forEach(([key, what], i) => {
      const colX = px - 272 + (i % 2) * 292;
      const rowY = 434 + Math.floor(i / 2) * 32;
      ctx.fillStyle = COLORS.gold;
      ctx.font = '800 14px Arial, sans-serif';
      ctx.fillText(key, colX, rowY);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 14.5px Arial, sans-serif';
      ctx.fillText(what, colX + 118, rowY);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 21px Arial, sans-serif';
    if (Math.floor(state.time * 1.6) % 2 === 0) {
      ctx.fillText(hasSave ? 'ENTER — NEW GAME        C — CONTINUE' : 'PRESS ENTER TO START', px, 586);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 12.5px Arial, sans-serif';
    ctx.fillText('Four jobs for Marisol stand between you and a reputation. Steal responsibly.', px, 622);
    ctx.textAlign = 'left';
  }

  function drawCenterCard(title, titleColor, lines, accent) {
    dim(0.55);
    ctx.fillStyle = 'rgba(8, 14, 24, 0.88)';
    rr(ctx, VIEW_W / 2 - 330, 218, 660, 250, 16); ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    rr(ctx, VIEW_W / 2 - 330, 218, 660, 250, 16); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = titleColor;
    ctx.font = '900 62px "Arial Black", Arial, sans-serif';
    ctx.fillText(title, VIEW_W / 2, 308);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = '600 17px Arial, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 356 + i * 28));
    ctx.textAlign = 'left';
  }

  function draw(state, screen, opts = {}) {
    const cam = cameraFor(state);
    drawTerrain(state, cam);
    drawBuildings(state, cam);
    drawPalmsAndBeach(state, cam);
    // Mission and offer markers under the actors.
    const m = state.mission;
    if (!state.over) {
      if (m.active && m.target) drawMarker(state, cam, m.target.x, m.target.y, m.type === 'drops' ? '$' : '!', COLORS.gold);
      else if (!m.active && state.giver && screen !== SCREEN_TITLE) drawMarker(state, cam, state.giver.x, state.giver.y, '!', COLORS.gold);
    }
    for (const car of state.cars) drawCar(state, cam, car);
    for (const ped of state.peds) drawPed(state, cam, ped);
    drawPlayer(state, cam);

    if (screen === SCREEN_TITLE) { drawTitle(state, !!opts.hasSave); return; }
    drawHUD(state);
    if (screen === SCREEN_PAUSED) {
      drawCenterCard('PAUSED', '#ffffff', ['The city holds its breath.', '', 'P or ENTER — back to the streets'], '#ffffff');
    } else if (screen === SCREEN_BUSTED) {
      // Flashing red/blue frame.
      const phase = Math.floor(state.time * 3.4) % 2 === 0;
      ctx.strokeStyle = phase ? COLORS.policeRed : COLORS.policeBlue;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, VIEW_W - 10, VIEW_H - 10);
      const info = state.overInfo ?? {};
      drawCenterCard('BUSTED', COLORS.danger, [
        info.message ?? 'The Palm City PD finally caught up with you.',
        'Fine paid: $' + (info.fine ?? 0) + ' · The car stays where it lies.',
        '',
        'Press ENTER to walk out of Palm City PD',
      ], COLORS.policeBlue);
    } else if (screen === SCREEN_WASTED) {
      const info = state.overInfo ?? {};
      drawCenterCard('WASTED', '#c0392b', [
        info.message ?? 'Your story ends on the asphalt of Palm City.',
        'Hospital bill: $' + (info.fine ?? 0) + ' · Marisol sends flowers.',
        '',
        'Press ENTER to check out of St. Coral Hospital',
      ], '#c0392b');
    } else if (screen === SCREEN_COMPLETE) {
      const s = state.stats;
      drawCenterCard('STORY COMPLETE', COLORS.gold, [
        'Four jobs, four envelopes, one legend of Palm City.',
        'Cash earned: $' + state.player.cash.toLocaleString('en-US') + ' · Jobs done: ' + s.missionsDone + ' · Cars stolen: ' + s.carsStolen,
        'Top speed: ' + Math.round(s.topSpeed * 0.19) + ' km/h · Free roam is yours now.',
        'Press ENTER — Marisol still has runs for you',
      ], COLORS.gold);
    }
  }

  return { draw };
}
