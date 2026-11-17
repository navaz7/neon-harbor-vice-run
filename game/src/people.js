// The people of Port Azura: neighbours out for a stroll, and the Bravo
// cannery crew, who are considerably less friendly.

import { WORLD } from './config.js';
import { collideBuildings } from './city.js';
import { pick, randRange, clamp } from './rng.js';

const SKIN = ['#f2c79b', '#d9a066', '#a06a3b', '#6e4525', '#ffe0bd'];
const SHIRTS = ['#c9563c', '#3c6ec9', '#3fae6a', '#e0b83c', '#8a5fc0', '#e6e6e6', '#3a3f47', '#d166a8'];
const PANTS = ['#2e3a4a', '#54443a', '#22262e', '#6b4f35', '#3d4a3a'];

let nextPedId = 1;

export function makePed(rng, x, y, opts = {}) {
  return {
    id: nextPedId++,
    x, y,
    angle: randRange(rng, 0, Math.PI * 2),
    speed: 0,
    walkSpeed: randRange(rng, 42, 78),
    skin: pick(rng, SKIN),
    shirt: opts.shirt || pick(rng, SHIRTS),
    pants: pick(rng, PANTS),
    state: opts.state || 'walk',       // walk | flee | hostile | down
    health: opts.health || 100,
    targetX: x, targetY: y,
    retargetIn: 0,
    walkPhase: randRange(rng, 0, 6),
    fleeFrom: null,
    shootIn: randRange(rng, 0.4, 1.4),
    crew: !!opts.crew,
    homeX: x, homeY: y,
  };
}

function stepToward(city, ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) { ped.speed = 0; return true; }
  ped.angle = Math.atan2(dy, dx);
  ped.speed = speed;
  const nx = ped.x + Math.cos(ped.angle) * speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * speed * dt;
  const hit = collideBuildings(city, nx, ny, 10);
  if (hit) { ped.x = hit.x; ped.y = hit.y; ped.retargetIn = 0; }
  else { ped.x = nx; ped.y = ny; }
  ped.walkPhase += dt * speed * 0.11;
  return false;
}

export function updatePed(city, ped, dt, rng, scene) {
  if (ped.state === 'down') return;
  const player = scene.player;
  const distToPlayer = Math.hypot(player.x - ped.x, player.y - ped.y);

  if (ped.state === 'hostile') {
    // Cannery crew: keep a firing distance, strafe, shoot in bursts.
    const desired = 170;
    let tx = ped.x, ty = ped.y;
    if (distToPlayer > desired + 30) { tx = player.x; ty = player.y; }
    else if (distToPlayer < desired - 40) { tx = ped.x - (player.x - ped.x); ty = ped.y - (player.y - ped.y); }
    else {
      const side = Math.sin(ped.id * 3.7) > 0 ? 1 : -1;
      tx = ped.x + -Math.sin(Math.atan2(player.y - ped.y, player.x - ped.x)) * side * 40;
      ty = ped.y + Math.cos(Math.atan2(player.y - ped.y, player.x - ped.x)) * side * 40;
    }
    stepToward(city, ped, tx, ty, 92, dt);
    ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
    ped.shootIn -= dt;
    if (distToPlayer < 330 && ped.shootIn <= 0) {
      ped.shootIn = randRange(rng, 0.55, 1.25);
      scene.events.push({ type: 'crewShot', from: ped, dist: distToPlayer });
    }
    return;
  }

  // Flee from danger: a fast car, gunfire, or a body on the ground.
  if (scene.danger && Math.hypot(scene.danger.x - ped.x, scene.danger.y - ped.y) < 210) {
    ped.state = 'flee';
    ped.fleeFrom = scene.danger;
  }
  if (ped.state === 'flee') {
    const from = ped.fleeFrom || player;
    const away = Math.atan2(ped.y - from.y, ped.x - from.x);
    stepToward(city, ped, ped.x + Math.cos(away) * 120, ped.y + Math.sin(away) * 120, 168, dt);
    if (!scene.danger || Math.hypot(scene.danger.x - ped.x, scene.danger.y - ped.y) > 320) {
      ped.state = 'walk';
      ped.retargetIn = 0;
    }
    return;
  }

  // A stroll: pick pavement points near home and amble between them.
  ped.retargetIn -= dt;
  if (ped.retargetIn <= 0 || Math.hypot(ped.targetX - ped.x, ped.targetY - ped.y) < 8) {
    ped.retargetIn = randRange(rng, 3, 8);
    ped.targetX = clamp(ped.homeX + randRange(rng, -260, 260), 40, WORLD.size - 40);
    ped.targetY = clamp(ped.homeY + randRange(rng, -260, 260), 40, WORLD.beachLine + 30);
  }
  stepToward(city, ped, ped.targetX, ped.targetY, ped.walkSpeed, dt);
}

export function drawPed(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-11, -5, 22, 10);
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(14, 0, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  const stride = Math.sin(ped.walkPhase) * (ped.speed > 4 ? 4 : 0);
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-3 + stride * 0.4, -6, 7, 4.6);
  ctx.fillRect(-3 - stride * 0.4, 1.4, 7, 4.6);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.arc(2, 3, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  if (ped.crew) {
    ctx.fillStyle = '#b3312a';
    ctx.fillRect(-2, -8, 5, 16);
  }
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(2.5, 0, 5.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (ped.crew && ped.state === 'hostile' && ped.health < 100) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ped.x - 14, ped.y - 20, 28, 4);
    ctx.fillStyle = '#e0483e';
    ctx.fillRect(ped.x - 14, ped.y - 20, 28 * clamp(ped.health / 100, 0, 1), 4);
  }
}
