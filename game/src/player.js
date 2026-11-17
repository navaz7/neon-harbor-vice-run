// Rico Vale, the player character: a harbour courier with quick feet,
// quicker fists, and a talent for borrowing other people's cars.

import { PLAYER, WEAPONS } from './config.js';
import { collideBuildings } from './city.js';
import { clamp } from './rng.js';

export function makePlayer(x, y) {
  return {
    x, y,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    radius: PLAYER.radius,
    health: PLAYER.health,
    weapon: 'fists',
    ammo: 0,
    car: null,               // the car being driven, or null on foot
    attackIn: 0,
    hurtFlash: 0,
    walkPhase: 0,
    moving: false,
    dead: false,
  };
}

export function updatePlayerOnFoot(city, player, input, dt) {
  let mx = 0, my = 0;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) my -= 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) my += 1;
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) mx -= 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) mx += 1;
  const len = Math.hypot(mx, my) || 1;
  const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  player.moving = mx !== 0 || my !== 0;
  if (player.moving) {
    player.angle = Math.atan2(my, mx);
    const nx = player.x + (mx / len) * speed * dt + player.vx * dt;
    const ny = player.y + (my / len) * speed * dt + player.vy * dt;
    const hit = collideBuildings(city, nx, ny, player.radius);
    if (hit) { player.x = hit.x; player.y = hit.y; }
    else { player.x = nx; player.y = ny; }
    player.walkPhase += dt * (sprint ? 13 : 9);
  }
  player.vx *= Math.pow(0.001, dt);
  player.vy *= Math.pow(0.001, dt);
  player.attackIn = Math.max(0, player.attackIn - dt);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt * 3);
}

// Melee swing: returns true if the swing happened (target checks live in main).
export function tryPunch(player) {
  if (player.attackIn > 0 || player.car) return false;
  player.attackIn = WEAPONS.fists.cooldown;
  return true;
}

// Fire the Harbor Hawk toward a world point. Returns a bullet or null.
export function tryShoot(player, tx, ty) {
  if (player.weapon !== 'pistol' || player.attackIn > 0 || player.car) return null;
  if (player.ammo <= 0) { player.attackIn = 0.3; return 'click'; }
  player.attackIn = WEAPONS.pistol.cooldown;
  player.ammo--;
  const angle = Math.atan2(ty - player.y, tx - player.x);
  return {
    x: player.x + Math.cos(angle) * 14,
    y: player.y + Math.sin(angle) * 14,
    vx: Math.cos(angle) * 880,
    vy: Math.sin(angle) * 880,
    life: WEAPONS.pistol.range / 880,
    damage: WEAPONS.pistol.damage,
    fromPlayer: true,
  };
}

export function hurtPlayer(player, amount) {
  player.health = clamp(player.health - amount, 0, PLAYER.health);
  player.hurtFlash = 1;
  if (player.health <= 0) player.dead = true;
}

export function healPlayer(player, amount) {
  player.health = clamp(player.health + amount, 0, PLAYER.health);
}

export function drawPlayer(ctx, player, time) {
  if (player.car) return; // hidden inside the car
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  const stride = Math.sin(player.walkPhase) * (player.moving ? 4 : 0);
  // Legs.
  ctx.fillStyle = '#31435c';
  ctx.fillRect(-3 + stride * 0.4, -6.4, 7.5, 4.8);
  ctx.fillRect(-3 - stride * 0.4, 1.6, 7.5, 4.8);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.arc(2, 3, 11, 0, Math.PI * 2); ctx.fill();
  // Torso: Rico's teal harbour jacket.
  ctx.fillStyle = '#0f7d84';
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd964';
  ctx.fillRect(-1, -9, 3.4, 18);
  // Arms, and the pistol when it is out.
  ctx.fillStyle = '#e8b07e';
  if (player.weapon === 'pistol') {
    ctx.fillRect(4, -3, 9, 4.4);
    ctx.fillStyle = '#22262e';
    ctx.fillRect(11, -2.2, 9, 3);
  } else if (player.attackIn > 0.18) {
    ctx.fillRect(6, -2.6, 10, 4.6); // a punch mid-swing
  } else {
    ctx.fillRect(2, -9.6, 7, 4);
    ctx.fillRect(2, 5.6, 7, 4);
  }
  // Head with a flat-top cut.
  ctx.fillStyle = '#a06a3b';
  ctx.beginPath(); ctx.arc(3, 0, 5.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1d1a17';
  ctx.fillRect(-1, -5.6, 6, 11);
  ctx.restore();
  if (player.hurtFlash > 0.4) {
    ctx.strokeStyle = `rgba(255,60,50,${player.hurtFlash - 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(player.x, player.y, 15, 0, Math.PI * 2); ctx.stroke();
  }
}
