// Everything drawn over the world: the HUD, the minimap, banners, menus
// and the title screen. The world itself is drawn by city/vehicles/people.

import { WORLD, WANTED } from './config.js';
import { clamp } from './rng.js';

function panel(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(10, 14, 20, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
}

export function drawMinimap(ctx, state, x, y, size) {
  const s = size / WORLD.size;
  ctx.save();
  panel(ctx, x - 6, y - 6, size + 12, size + 12, 0.6);
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.fillStyle = '#3d5c3e';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#1d5f7a';
  ctx.fillRect(x, y + WORLD.waterLine * s, size, size - WORLD.waterLine * s);
  ctx.fillStyle = '#454a51';
  for (const c of state.city ? roadCentres() : []) {
    ctx.fillRect(x + (c - WORLD.roadWidth / 2) * s, y, WORLD.roadWidth * s, size);
    if (c < WORLD.beachLine) ctx.fillRect(x, y + (c - WORLD.roadWidth / 2) * s, size, WORLD.roadWidth * s);
  }
  const dot = (wx, wy, colour, r) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x + wx * s, y + wy * s, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const car of state.cars) if (car.role === 'traffic') dot(car.x, car.y, 'rgba(230,230,230,0.7)', 1.6);
  for (const cop of state.police) dot(cop.x, cop.y, Math.sin(state.time * 8) > 0 ? '#ff5040' : '#4d7dff', 3);
  if (state.objective) {
    const pulse = 3.4 + Math.sin(state.time * 5) * 1.1;
    dot(state.objective.x, state.objective.y, '#ffd23e', pulse);
  }
  if (state.offerAt && !state.mission) dot(state.offerAt.x, state.offerAt.y, '#ff9d3c', 3.4);
  // The player: a white arrow that turns with Rico (or his car).
  const p = state.player;
  ctx.translate(x + p.x * s, y + p.y * s);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.4, -3.6);
  ctx.lineTo(-4.4, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roadCentres() {
  const centres = [];
  for (let i = 0; i < 8; i++) centres.push(210 + i * WORLD.roadSpacing);
  return centres;
}

export function drawHud(ctx, state, w, h) {
  const p = state.player;
  // Top-left: cash and health.
  panel(ctx, 14, 14, 208, 64);
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('$' + state.money.toLocaleString('en-US'), 26, 42);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(26, 52, 184, 10);
  ctx.fillStyle = p.health > 30 ? '#e0483e' : '#ff7b2e';
  ctx.fillRect(26, 52, 184 * clamp(p.health / 100, 0, 1), 10);
  if (p.car) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(26, 66, 184, 5);
    ctx.fillStyle = '#e8b13a';
    ctx.fillRect(26, 66, 184 * clamp(p.car.health / 100, 0, 1), 5);
  }

  // Top-right: wanted stars and weapon.
  const stars = state.wanted;
  ctx.font = '26px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i < WANTED.maxStars; i++) {
    ctx.fillStyle = i < stars ? '#ffd23e' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', w - 20 - (WANTED.maxStars - 1 - i) * 30, 44);
  }
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = '#e8ecf0';
  const weaponText = p.weapon === 'pistol' ? `Harbor Hawk — ${p.ammo} rounds` : 'Fists';
  ctx.fillText(weaponText, w - 20, 68);

  // Top-centre: the current objective.
  if (state.objective) {
    const label = state.objective.label;
    ctx.font = 'bold 16px system-ui, sans-serif';
    const labelW = ctx.measureText(label).width;
    const distText = state.objective.dist != null ? Math.round(state.objective.dist) + 'm' : '';
    ctx.font = 'bold 14px system-ui, sans-serif';
    const distW = distText ? ctx.measureText(distText).width + 14 : 0;
    const tw = labelW + distW + 36;
    panel(ctx, (w - tw) / 2, 14, tw, 40, 0.62);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, (w - tw) / 2 + 18, 40);
    if (distText) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(distText, (w - tw) / 2 + 18 + labelW + 14, 40);
    }
    if (state.timeLeft != null) {
      ctx.fillStyle = state.timeLeft < 20 ? '#ff5040' : '#ffffff';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatClock(state.timeLeft), w / 2, 76);
    }
  }
  if (state.missionTitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.missionTitle, w / 2, state.objective ? 96 : 40);
  }

  // Bust meter while the police have you cornered.
  if (state.bust > 0.02) {
    panel(ctx, w / 2 - 130, h - 120, 260, 30, 0.7);
    ctx.fillStyle = '#4d7dff';
    ctx.fillRect(w / 2 - 122, h - 112, 244 * clamp(state.bust, 0, 1), 14);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', w / 2, h - 80);
  }

  // Speed while driving, bottom-right.
  if (p.car) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.36) + '', w - 52, h - 26);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('km/h', w - 18, h - 26);
  }

  // Interaction prompt, centre-bottom.
  if (state.prompt) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    const tw = ctx.measureText(state.prompt).width + 34;
    panel(ctx, (w - tw) / 2, h - 84, tw, 36, 0.7);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(state.prompt, w / 2, h - 61);
  }

  // Toasts.
  ctx.textAlign = 'center';
  let ty = 128;
  for (const toast of state.toasts) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillStyle = `rgba(10,14,20,${0.55 * toast.alpha})`;
    const tw = ctx.measureText(toast.text).width + 36;
    ctx.beginPath();
    ctx.roundRect((w - tw) / 2, ty - 20, tw, 32, 9);
    ctx.fill();
    ctx.fillStyle = toast.colour + '';
    ctx.globalAlpha = toast.alpha;
    ctx.fillText(toast.text, w / 2, ty + 2);
    ctx.globalAlpha = 1;
    ty += 40;
  }

  drawMinimap(ctx, state, 16, h - 196, 172);

  // Damage vignette.
  if (p.hurtFlash > 0.05) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, h * 0.75);
    grad.addColorStop(0, 'rgba(200,0,0,0)');
    grad.addColorStop(1, `rgba(200,0,0,${0.4 * p.hurtFlash})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function bigCentredText(ctx, w, y, text, font, colour) {
  ctx.font = font;
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, y);
}

export function drawTitleScreen(ctx, state, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(8,10,26,0.45)');
  grad.addColorStop(0.6, 'rgba(20,8,30,0.55)');
  grad.addColorStop(1, 'rgba(46,16,8,0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  bigCentredText(ctx, w, h * 0.3, 'NEON HARBOR', 'bold 76px system-ui, sans-serif', '#ffd23e');
  bigCentredText(ctx, w, h * 0.3 + 62, 'V I C E   R U N', 'bold 34px system-ui, sans-serif', '#ff5e7a');
  bigCentredText(ctx, w, h * 0.3 + 104, 'An original open-world crime story in the port city of Port Azura', '17px system-ui, sans-serif', '#e8ecf0');
  const bx = w / 2 - 150, bw = 300;
  drawButton(ctx, bx, h * 0.52, bw, 52, state.hasSave ? 'CONTINUE — $' + state.money : 'NEW GAME', true);
  if (state.hasSave) drawButton(ctx, bx, h * 0.52 + 66, bw, 44, 'Start fresh', false);
  bigCentredText(ctx, w, h * 0.52 + 150, 'WASD drive & walk · E enter car · F punch · Mouse aim, click shoot · Shift sprint', '15px system-ui, sans-serif', 'rgba(232,236,240,0.85)');
  bigCentredText(ctx, w, h * 0.52 + 176, 'P pause · M mute · Your progress saves itself in this browser', '15px system-ui, sans-serif', 'rgba(232,236,240,0.6)');
}

export function drawButton(ctx, x, y, w, h, label, primary) {
  ctx.fillStyle = primary ? '#e8a020' : 'rgba(16,20,28,0.8)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.fillStyle = primary ? '#191104' : '#e8ecf0';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

export function drawMissionCard(ctx, state, w, h) {
  ctx.fillStyle = 'rgba(5,8,14,0.62)';
  ctx.fillRect(0, 0, w, h);
  const cw = Math.min(620, w - 60), ch = 250;
  const cx = (w - cw) / 2, cy = (h - ch) / 2;
  panel(ctx, cx, cy, cw, ch, 0.92);
  ctx.fillStyle = '#ff9d3c';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('NEW JOB — ' + state.card.giver.toUpperCase(), cx + 26, cy + 38);
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(state.card.title, cx + 26, cy + 76);
  ctx.fillStyle = '#e8ecf0';
  ctx.font = '16px system-ui, sans-serif';
  let ly = cy + 108;
  for (const line of state.card.lines) {
    ctx.fillText(line, cx + 26, ly, cw - 52);
    ly += 24;
  }
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('Reward $' + state.card.reward, cx + 26, cy + ch - 52);
  ctx.fillStyle = 'rgba(232,236,240,0.75)';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('ENTER accept · ESC walk away', cx + cw - 26, cy + ch - 52);
}

export function drawPauseMenu(ctx, state, w, h) {
  ctx.fillStyle = 'rgba(5,8,14,0.6)';
  ctx.fillRect(0, 0, w, h);
  bigCentredText(ctx, w, h * 0.34, 'PAUSED', 'bold 44px system-ui, sans-serif', '#ffffff');
  bigCentredText(ctx, w, h * 0.34 + 44, `Cash $${state.money} · Missions done ${state.stats.missionsDone} · Cars borrowed ${state.stats.carsStolen}`, '16px system-ui, sans-serif', '#e8ecf0');
  bigCentredText(ctx, w, h * 0.34 + 78, 'P or ESC resume · M ' + (state.muted ? 'unmute' : 'mute'), '15px system-ui, sans-serif', 'rgba(232,236,240,0.7)');
}

export function drawBustedWasted(ctx, state, w, h) {
  const busted = state.mode === 'busted';
  ctx.fillStyle = busted ? 'rgba(16,24,64,0.55)' : 'rgba(64,8,8,0.55)';
  ctx.fillRect(0, 0, w, h);
  bigCentredText(ctx, w, h * 0.42, busted ? 'BUSTED' : 'WASTED', 'bold 72px system-ui, sans-serif', busted ? '#7ea2ff' : '#ff5040');
  bigCentredText(ctx, w, h * 0.42 + 46,
    busted ? 'The harbour police take $150 and your afternoon.' : 'The harbour clinic patches you up for $150.',
    '17px system-ui, sans-serif', '#e8ecf0');
  bigCentredText(ctx, w, h * 0.42 + 82, 'Press ENTER to carry on', 'bold 16px system-ui, sans-serif', '#ffd23e');
}

export function drawEnding(ctx, state, w, h) {
  ctx.fillStyle = 'rgba(6,10,18,0.66)';
  ctx.fillRect(0, 0, w, h);
  bigCentredText(ctx, w, h * 0.36, 'THE HARBOUR IS YOURS', 'bold 46px system-ui, sans-serif', '#ffd23e');
  bigCentredText(ctx, w, h * 0.36 + 48, 'Rico delivers the ledger, and Port Azura breathes again.', '18px system-ui, sans-serif', '#e8ecf0');
  bigCentredText(ctx, w, h * 0.36 + 80, `Final cash $${state.money} · ${state.stats.missionsDone} missions · ${state.stats.carsStolen} cars borrowed`, '16px system-ui, sans-serif', '#7ee787');
  bigCentredText(ctx, w, h * 0.36 + 116, 'Free roam is open — quick fares still pay at the diner. Press ENTER.', '15px system-ui, sans-serif', 'rgba(232,236,240,0.75)');
}
