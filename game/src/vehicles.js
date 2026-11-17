// Cars for Port Azura: civilian traffic that minds its lanes, parked cars
// waiting to be borrowed, and Harbor Police Interceptors that hunt.

import { CAR_MODELS, POLICE_MODEL, WORLD } from './config.js';
import { ROAD_CENTRES, collideBuildings } from './city.js';
import { pick, randRange, clamp, angleLerp } from './rng.js';

const KIND_SIZE = {
  coupe: { len: 46, wid: 22 }, sedan: { len: 48, wid: 23 }, pickup: { len: 51, wid: 24 },
  hatch: { len: 42, wid: 21 }, van: { len: 55, wid: 25 }, sport: { len: 47, wid: 22 },
  police: { len: 49, wid: 23 },
};

let nextCarId = 1;

export function makeCar(rng, x, y, angle, opts = {}) {
  const model = opts.model || pick(rng, CAR_MODELS);
  const size = KIND_SIZE[model.kind] || KIND_SIZE.sedan;
  return {
    id: nextCarId++,
    x, y, angle,
    speed: 0,
    steer: 0,
    model,
    colour: opts.colour || pick(rng, model.colours),
    len: size.len,
    wid: size.wid,
    radius: size.len * 0.42,
    role: opts.role || 'traffic',   // traffic | parked | police | player
    axis: opts.axis || 'v',
    dir: opts.dir || 1,
    cruise: randRange(rng, 105, 165),
    health: 100,
    sirenPhase: randRange(rng, 0, 6),
    honkAt: 0,
    wrecked: false,
  };
}

export function makePoliceCar(rng, x, y) {
  const car = makeCar(rng, x, y, 0, { model: POLICE_MODEL, colour: '#e8ecf0', role: 'police' });
  car.cruise = 320;
  return car;
}

function laneOffset(car) {
  // Right-hand traffic: offset from the road centreline to this car's lane.
  return 16;
}

function trafficTargetPoint(car) {
  // The point this traffic car is steering for: far ahead in its lane.
  if (car.axis === 'v') {
    const centre = ROAD_CENTRES.reduce((best, c) => (Math.abs(c - car.x) < Math.abs(best - car.x) ? c : best), ROAD_CENTRES[0]);
    // Facing south (dir +1) your right hand is west; facing north it is east.
    return { x: centre - car.dir * laneOffset(car), y: car.y + car.dir * 300, centre };
  }
  const centre = ROAD_CENTRES.reduce((best, c) => (Math.abs(c - car.y) < Math.abs(best - car.y) ? c : best), ROAD_CENTRES[0]);
  return { x: car.x + car.dir * 300, y: centre + (car.dir > 0 ? 1 : -1) * laneOffset(car), centre };
}

// Move a car with simple arcade physics; returns impact speed if it hit a wall.
export function driveCar(city, car, throttle, steerInput, dt, brake) {
  const accel = throttle * car.model.accel;
  car.speed += accel * dt;
  const drag = car.speed * 0.55;
  car.speed -= drag * dt * (throttle === 0 ? 1.6 : 0.55);
  if (brake) car.speed -= Math.sign(car.speed) * 320 * dt;
  const top = car.model.topSpeed;
  car.speed = clamp(car.speed, -top * 0.36, top);
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;
  car.steer = steerInput;
  const turnRate = steerInput * car.model.grip * clamp(car.speed / 130, -1, 1);
  car.angle += turnRate * dt * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const hit = collideBuildings(city, nx, ny, car.radius);
  let impact = 0;
  if (hit) {
    impact = Math.abs(car.speed);
    car.x = hit.x; car.y = hit.y;
    car.speed *= -0.22;
    car.health -= impact * 0.06;
  } else {
    car.x = nx; car.y = ny;
  }
  car.x = clamp(car.x, 30, WORLD.size - 30);
  car.y = clamp(car.y, 30, WORLD.beachLine + 46);
  if (car.health <= 0) car.wrecked = true;
  return impact;
}

export function updateTrafficCar(city, car, dt, rng, obstacles) {
  if (car.wrecked || car.role !== 'traffic') return 0;
  // Obstacle ahead? Slow down or stop, and honk now and then.
  let throttle = 1;
  if (car.speed > car.cruise) throttle = 0; // coast back down to cruising speed
  const aheadX = car.x + Math.cos(car.angle) * (car.len * 0.9);
  const aheadY = car.y + Math.sin(car.angle) * (car.len * 0.9);
  for (const o of obstacles) {
    if (o === car) continue;
    const dx = o.x - aheadX;
    const dy = o.y - aheadY;
    if (dx * dx + dy * dy < 52 * 52) {
      throttle = car.speed > 24 ? -0.4 : 0;
      if (rng() < 0.004 && car.honkAt <= 0) car.honkAt = 1;
      break;
    }
  }
  car.honkAt = Math.max(0, car.honkAt - dt);
  const target = trafficTargetPoint(car);
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  const before = car.angle;
  car.angle = angleLerp(car.angle, desired, clamp(dt * 2.4, 0, 1));
  const steer = clamp((car.angle - before) * 4, -1, 1);
  const impact = driveCar(city, car, throttle * 0.62, steer, dt, false);
  // At an intersection, sometimes change road.
  for (const c of ROAD_CENTRES) {
    const along = car.axis === 'v' ? car.y : car.x;
    if (Math.abs(along - c) < 7 && rng() < 0.012) {
      if (car.axis === 'v') { car.axis = 'h'; car.dir = car.x < c ? car.dir : car.dir; car.dir = rng() < 0.5 ? 1 : -1; }
      else { car.axis = 'v'; car.dir = rng() < 0.5 ? 1 : -1; }
    }
  }
  // Turn around at the water or the world edge rather than leaving town.
  if (car.y > WORLD.beachLine - 30 && car.axis === 'v' && car.dir > 0) car.dir = -1;
  if (car.y < 70 && car.axis === 'v' && car.dir < 0) car.dir = 1;
  if (car.x > WORLD.size - 70 && car.axis === 'h' && car.dir > 0) car.dir = -1;
  if (car.x < 70 && car.axis === 'h' && car.dir < 0) car.dir = 1;
  return impact;
}

export function updatePoliceCar(city, car, dt, target) {
  if (car.wrecked) return 0;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  const lead = clamp(dist / 240, 0, 0.55);
  const aimX = target.x + (target.vx || 0) * lead;
  const aimY = target.y + (target.vy || 0) * lead;
  const desired = Math.atan2(aimY - car.y, aimX - car.x);
  const before = car.angle;
  car.angle = angleLerp(car.angle, desired, clamp(dt * 3.1, 0, 1));
  const steer = clamp((car.angle - before) * 4.4, -1, 1);
  let throttle = 1;
  if (dist < 42) throttle = target.inCar ? 0.35 : -0.25; // pull up beside a suspect on foot
  const impact = driveCar(city, car, throttle, steer, dt, false);
  car.sirenPhase += dt * 9;
  return impact;
}

export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.len, W = car.wid;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  // Wheels.
  ctx.fillStyle = '#14161a';
  const ww = 9, wh = 5;
  ctx.fillRect(-L / 2 + 5, -W / 2 - 2, ww, wh);
  ctx.fillRect(-L / 2 + 5, W / 2 - 3, ww, wh);
  ctx.fillRect(L / 2 - 14, -W / 2 - 2, ww, wh);
  ctx.fillRect(L / 2 - 14, W / 2 - 3, ww, wh);
  // Body.
  ctx.fillStyle = car.wrecked ? '#3a3a3a' : car.colour;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, -L / 2 + 3, -W / 2 + 2, L * 0.4, W - 4, 5);
  ctx.fill();
  // Cabin and glass.
  ctx.fillStyle = '#1b2733';
  if (car.model.kind === 'van' || car.model.kind === 'pickup') {
    roundRect(ctx, L * 0.08, -W / 2 + 3, L * 0.3, W - 6, 3);
  } else {
    roundRect(ctx, -L * 0.12, -W / 2 + 3, L * 0.42, W - 6, 4);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(140,200,235,0.5)';
  ctx.fillRect(L * 0.24, -W / 2 + 4, 4, W - 8);
  // Police livery and light bar.
  if (car.role === 'police') {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-L * 0.1, -W / 2, L * 0.34, W);
    ctx.fillStyle = '#ffd964';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POLICE', L * 0.07, 0);
    const flash = Math.sin(time * 10 + car.sirenPhase) > 0;
    ctx.fillStyle = flash ? '#ff4040' : '#5a1616';
    ctx.fillRect(-4, -W / 2 + 3, 8, 5);
    ctx.fillStyle = flash ? '#274bff' : '#4090ff';
    ctx.fillRect(-4, W / 2 - 8, 8, 5);
  }
  // Headlights and brake glow.
  ctx.fillStyle = 'rgba(255,240,180,0.9)';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 4);
  ctx.fillRect(L / 2 - 2, W / 2 - 6, 3, 4);
  if (car.braking) {
    ctx.fillStyle = 'rgba(255,60,50,0.95)';
    ctx.fillRect(-L / 2 - 1, -W / 2 + 2, 3, 4);
    ctx.fillRect(-L / 2 - 1, W / 2 - 6, 3, 4);
  }
  // Damage smoke.
  if (car.health < 45 && !car.wrecked) {
    ctx.fillStyle = 'rgba(60,60,60,0.35)';
    ctx.beginPath();
    ctx.arc(L / 2 - 4, 0, 6 + Math.sin(time * 7 + car.id) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
