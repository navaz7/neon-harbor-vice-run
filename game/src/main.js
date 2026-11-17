// Neon Harbor: Vice Run — the game itself. This file wires the city, the
// cars, the people, the police, the missions and the HUD into one loop.
//
// Rico Vale, a harbour courier, takes jobs from Mama Sol at Sol's Auto
// Works: stealing cars, running crates, facing down the Bravo cannery
// crew — while the Port Azura harbour police keep score in stars.

import { WORLD, POLICE_BY_STARS, WANTED } from './config.js';
import { makeRng, clamp, distance } from './rng.js';
import { buildCity, drawCity, randomRoadPosition, nearestRoadPoint } from './city.js';
import { makeCar, makePoliceCar, updateTrafficCar, updatePoliceCar, driveCar, drawCar } from './vehicles.js';
import { makePed, updatePed, drawPed } from './people.js';
import { makePlayer, updatePlayerOnFoot, tryPunch, tryShoot, hurtPlayer, drawPlayer } from './player.js';
import { buildStoryMissions, makeSideJob, stepLabel } from './missions.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { makeInput } from './input.js';
import * as sfx from './audio.js';
import { drawHud, drawTitleScreen, drawMissionCard, drawPauseMenu, drawBustedWasted, drawEnding } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 20261117);
const SHOT = params.get('shot');
const rng = makeRng(SEED ^ 0x9e3779b9);

function resize() {
  canvas.width = Math.min(window.innerWidth, 1920);
  canvas.height = Math.min(window.innerHeight, 1080);
}
window.addEventListener('resize', resize);
resize();

const input = makeInput(canvas);
const city = buildCity(SEED);
const storyMissions = buildStoryMissions(city.places);

const state = {
  mode: 'title',           // title | card | playing | paused | busted | wasted | ending
  time: 0,
  dayTime: 0.34,           // 0..1 around the clock; 0.3 is morning
  city,
  player: makePlayer(city.places.garage.x + 60, city.places.garage.y + 90),
  cars: [],
  peds: [],
  police: [],
  bullets: [],
  particles: [],
  pickups: [],
  toasts: [],
  money: 120,
  heat: 0,
  wanted: 0,
  lastCrimeAt: -99,
  bust: 0,
  missionIndex: 0,
  mission: null,           // { def, stepIndex, progress, timer, markedCar, crew, remaining }
  card: null,              // the mission offer being read
  pendingMission: null,
  hasPistol: false,
  storyDone: false,
  objective: null,
  offerAt: null,
  sideOfferAt: null,
  prompt: null,
  timeLeft: null,
  missionTitle: null,
  stats: { carsStolen: 0, missionsDone: 0, busts: 0, cashEarned: 0 },
  hasSave: false,
  muted: false,
  camX: 0, camY: 0,
  danger: null,
  honkIn: 0,
  spawnIn: 0,
};

const saved = loadSave();
if (saved) {
  state.hasSave = true;
  state.money = saved.money;
  state.missionIndex = saved.missionIndex;
  state.hasPistol = saved.hasPistol;
  state.storyDone = saved.storyDone;
  state.stats = saved.stats;
  if (saved.hasPistol) { state.player.weapon = 'pistol'; state.player.ammo = Math.max(saved.ammo, 12); }
}

function toast(text, colour = '#ffffff', seconds = 3.2) {
  state.toasts.push({ text, colour, alpha: 1, life: seconds });
}

function addParticles(x, y, n, colour, speed = 130, life = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const v = speed * (0.3 + rng() * 0.7);
    state.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + rng()), maxLife: life, colour, size: 2 + rng() * 2.4 });
  }
}

// ---------- crime and the wanted level ----------

function witnessesNear(x, y, radius) {
  for (const ped of state.peds) if (ped.state !== 'down' && distance(x, y, ped.x, ped.y) < radius) return true;
  for (const car of state.cars) if (car.role === 'traffic' && distance(x, y, car.x, car.y) < radius) return true;
  for (const cop of state.police) if (distance(x, y, cop.x, cop.y) < radius + 160) return true;
  return false;
}

function commitCrime(amount, x, y) {
  const seen = witnessesNear(x, y, 150);
  state.heat = clamp(state.heat + amount * (seen ? 1 : 0.45), 0, 5);
  if (seen) state.lastCrimeAt = state.time;
}

function starsFromHeat() {
  return state.heat <= 0.02 ? 0 : Math.min(5, Math.ceil(state.heat));
}

// ---------- spawning ----------

function spawnParkedCars() {
  for (const lot of city.parkingLots) {
    for (const spot of lot.spots) {
      if (rng() < 0.5) {
        const car = makeCar(rng, spot.x, spot.y, spot.angle + (rng() < 0.5 ? 0 : Math.PI), { role: 'parked' });
        state.cars.push(car);
      }
    }
  }
  // A few cars parked along the kerbs.
  for (let i = 0; i < 22; i++) {
    const p = randomRoadPosition(rng);
    const car = makeCar(rng, p.x + (p.axis === 'v' ? 38 : 0), p.y + (p.axis === 'h' ? 38 : 0), p.axis === 'v' ? Math.PI / 2 : 0, { role: 'parked' });
    state.cars.push(car);
  }
}

function spawnTraffic(nearX, nearY) {
  const p = randomRoadPosition(rng);
  const d = distance(p.x, p.y, nearX, nearY);
  if (d < 480 || d > 900) return;
  const dir = rng() < 0.5 ? 1 : -1;
  const car = makeCar(rng, p.x, p.y, p.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI), { role: 'traffic', axis: p.axis, dir });
  car.speed = car.cruise * 0.7;
  state.cars.push(car);
}

function spawnPed(nearX, nearY) {
  const a = rng() * Math.PI * 2;
  const d = 380 + rng() * 260;
  const x = clamp(nearX + Math.cos(a) * d, 40, WORLD.size - 40);
  const y = clamp(nearY + Math.sin(a) * d, 40, WORLD.beachLine + 26);
  state.peds.push(makePed(rng, x, y));
}

function spawnPolice() {
  const p = state.player;
  const a = rng() * Math.PI * 2;
  const x = clamp(p.x + Math.cos(a) * 640, 60, WORLD.size - 60);
  const y = clamp(p.y + Math.sin(a) * 640, 60, WORLD.beachLine + 30);
  const road = nearestRoadPoint(x, y);
  const cop = makePoliceCar(rng, road.x, road.y);
  cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
  state.police.push(cop);
}

function spawnPickups() {
  const kinds = ['health', 'ammo', 'cash', 'health', 'ammo', 'cash'];
  for (let i = 0; i < 26; i++) {
    const p = randomRoadPosition(rng);
    state.pickups.push({ x: p.x + (rng() - 0.5) * 60, y: p.y + (rng() - 0.5) * 60, kind: kinds[i % kinds.length], taken: false, bob: rng() * 6 });
  }
}

spawnParkedCars();
spawnPickups();
for (let i = 0; i < 10; i++) spawnTraffic(state.player.x, state.player.y);
for (let i = 0; i < 14; i++) spawnPed(state.player.x, state.player.y);

// ---------- missions ----------

function currentOffer() {
  if (state.mission) return null;
  if (state.missionIndex < storyMissions.length) return storyMissions[state.missionIndex];
  return null;
}

function openCard(def) {
  state.card = { def, title: def.title, giver: def.giver, lines: def.intro, reward: def.reward };
  state.pendingMission = def;
  state.mode = 'card';
}

function startMission(def) {
  state.mission = { def, stepIndex: -1, progress: 0, timer: null, markedCar: null, crewSpawned: false, remaining: null, holdWanted: 0 };
  if (def.grantsPistol) {
    state.hasPistol = true;
    state.player.weapon = 'pistol';
    state.player.ammo = Math.max(state.player.ammo, 30);
    toast('Mama Sol hands you a Harbor Hawk pistol', '#ffd23e');
  }
  toast(def.title, '#ff9d3c', 4);
  sfx.playObjective();
  nextStep();
}

function nextStep() {
  const m = state.mission;
  m.stepIndex++;
  m.progress = 0;
  m.timer = null;
  const step = m.def.steps[m.stepIndex];
  if (!step) { completeMission(); return; }
  if (step.timeLimit) m.timer = step.timeLimit;
  if (step.setWanted) {
    state.heat = Math.max(state.heat, step.setWanted);
    state.lastCrimeAt = state.time;
  }
  if (step.holdWanted) m.holdWanted = step.holdWanted;
  if (step.type === 'stealCar') {
    const comet = { name: 'Alder Comet', kind: 'coupe', topSpeed: 342, accel: 210, grip: 3.4, colours: ['#c8402e'] };
    const car = makeCar(rng, step.x, step.y, -Math.PI / 2, { role: 'parked', model: comet, colour: '#c8402e' });
    car.missionMarked = true;
    state.cars.push(car);
    m.markedCar = car;
  }
  if (step.type === 'collect') m.remaining = step.points.map(pt => ({ ...pt, got: false }));
  if (step.type === 'checkpoints') m.remaining = step.points.map(pt => ({ ...pt }));
  if (step.type === 'shootout') m.crewSpawned = false;
}

function completeMission() {
  const def = state.mission.def;
  state.money += def.reward;
  state.stats.cashEarned += def.reward;
  state.stats.missionsDone++;
  toast(`Mission complete — $${def.reward}`, '#7ee787', 4.5);
  sfx.playMissionDone();
  sfx.playCash();
  if (def.id !== 'quick-fare') {
    state.missionIndex++;
    if (state.missionIndex >= storyMissions.length) {
      state.storyDone = true;
      state.justFinishedStory = true;
    }
  }
  state.mission = null;
  persist();
}

function failMission(reason) {
  toast('Mission failed — ' + reason, '#ff5040', 4);
  if (state.mission.markedCar) state.mission.markedCar.missionMarked = false;
  state.mission = null;
}

function stepTarget(step, m) {
  if (!step) return null;
  switch (step.type) {
    case 'collect': {
      const left = m.remaining.filter(pt => !pt.got);
      if (!left.length) return null;
      left.sort((a, b) => distance(a.x, a.y, state.player.x, state.player.y) - distance(b.x, b.y, state.player.x, state.player.y));
      return left[0];
    }
    case 'checkpoints': return m.remaining[m.progress] || null;
    case 'shootout': return { x: step.x, y: step.y };
    case 'escape': return null;
    default: return { x: step.x, y: step.y };
  }
}

function updateMission(dt) {
  const m = state.mission;
  if (!m) {
    // Offers: stand in a marker to read the job card.
    state.offerAt = null;
    state.sideOfferAt = null;
    const offer = currentOffer();
    const p = state.player;
    if (offer) {
      state.offerAt = offer.at;
      if (distance(p.x, p.y, offer.at.x, offer.at.y) < 52 && state.mode === 'playing') {
        state.prompt = 'Press ENTER — a job from ' + offer.giver;
        if (input.wasPressed('Enter')) openCard(offer);
      }
    }
    if (state.storyDone || state.missionIndex > 0) {
      const diner = city.places.diner;
      state.sideOfferAt = diner;
      if (distance(p.x, p.y, diner.x, diner.y) < 52 && state.mode === 'playing' && !state.prompt) {
        state.prompt = 'Press ENTER — a passenger wants a ride';
        if (input.wasPressed('Enter')) openCard(makeSideJob(rng, city.places));
      }
    }
    state.objective = null;
    state.missionTitle = null;
    return;
  }
  const step = m.def.steps[m.stepIndex];
  if (!step) return;
  const p = state.player;

  if (m.timer != null) {
    m.timer -= dt;
    state.timeLeft = m.timer;
    if (m.timer <= 0) { failMission('out of time'); return; }
  } else state.timeLeft = null;

  // Shootout crews appear as Rico closes in.
  if (step.type === 'shootout' && !m.crewSpawned && distance(p.x, p.y, step.x, step.y) < 330) {
    m.crewSpawned = true;
    for (let i = 0; i < step.count; i++) {
      const a = (i / step.count) * Math.PI * 2;
      const ped = makePed(rng, step.x + Math.cos(a) * 90, step.y + Math.sin(a) * 90, { state: 'hostile', crew: true, shirt: '#7a1f1a', health: 100 });
      state.peds.push(ped);
    }
    toast('The Bravo crew!', '#ff5040');
    state.danger = { x: step.x, y: step.y };
  }

  const target = stepTarget(step, m);
  let done = false;
  switch (step.type) {
    case 'goto':
    case 'pickup':
    case 'deliver': {
      if (step.needsCar && !p.car) break;
      if (step.needsMarkedCar && p.car !== m.markedCar) break;
      if (target && distance(p.x, p.y, target.x, target.y) < (step.type === 'deliver' ? 58 : 42)) {
        if (step.type === 'pickup') { sfx.playPickup(); addParticles(p.x, p.y, 10, '#ffd23e'); }
        done = true;
      }
      break;
    }
    case 'stealCar':
      if (p.car && p.car === m.markedCar) done = true;
      break;
    case 'collect': {
      for (const pt of m.remaining) {
        if (!pt.got && distance(p.x, p.y, pt.x, pt.y) < 42) {
          pt.got = true;
          m.progress++;
          sfx.playPickup();
          toast('Briefcase collected', '#ffd23e', 2);
        }
      }
      if (m.remaining.every(pt => pt.got)) done = true;
      break;
    }
    case 'checkpoints': {
      const pt = m.remaining[m.progress];
      if (pt && distance(p.x, p.y, pt.x, pt.y) < 74) {
        m.progress++;
        sfx.playObjective();
        addParticles(pt.x, pt.y, 14, '#4dff88');
        if (m.progress >= m.remaining.length) done = true;
      }
      break;
    }
    case 'shootout': {
      const alive = state.peds.filter(ped => ped.crew && ped.state !== 'down');
      m.progress = alive.length;
      if (m.crewSpawned && alive.length === 0) done = true;
      break;
    }
    case 'escape':
      if (state.wanted === 0) done = true;
      break;
  }

  const t = stepTarget(step, m);
  state.objective = t ? { x: t.x, y: t.y, label: stepLabel(step, step.type === 'shootout' ? m.progress : m.progress), dist: distance(p.x, p.y, t.x, t.y) } : null;
  if (step.type === 'escape') state.objective = { x: p.x, y: p.y, label: 'Lose the police — break their line of sight', dist: null };
  state.missionTitle = m.def.title;

  if (done) {
    sfx.playObjective();
    nextStep();
  }
}

// ---------- interaction: cars, pickups, combat ----------

function nearestEnterableCar() {
  const p = state.player;
  let best = null, bestD = 52;
  for (const car of [...state.cars, ...state.police]) {
    if (car.wrecked) continue;
    const d = distance(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const p = state.player;
  p.car = car;
  p.x = car.x; p.y = car.y;
  const wasRole = car.role;
  car.role = 'player';
  car.driverOut = null;
  sfx.playDoor();
  if (wasRole === 'parked' || wasRole === 'traffic') {
    if (!car.missionMarked) {
      commitCrime(0.7, car.x, car.y);
      state.stats.carsStolen++;
      toast('Borrowed: ' + car.model.name, '#e8ecf0', 2);
    } else {
      state.stats.carsStolen++;
    }
  }
  if (wasRole === 'police') commitCrime(1.4, car.x, car.y);
  const idx = state.police.indexOf(car);
  if (idx >= 0) state.police.splice(idx, 1);
  if (!state.cars.includes(car)) state.cars.push(car);
}

function exitCar() {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  car.role = 'parked';
  p.car = null;
  p.x = car.x + Math.cos(car.angle - Math.PI / 2) * 26;
  p.y = car.y + Math.sin(car.angle - Math.PI / 2) * 26;
  sfx.playDoor();
}

function updateCombat(dt) {
  const p = state.player;
  // Fists.
  if (!p.car && (input.wasPressed('KeyF'))) {
    if (tryPunch(p)) {
      sfx.playPunch();
      const tx = p.x + Math.cos(p.angle) * 26;
      const ty = p.y + Math.sin(p.angle) * 26;
      for (const ped of state.peds) {
        if (ped.state !== 'down' && distance(tx, ty, ped.x, ped.y) < 26) {
          damagePed(ped, 34, p.angle);
          commitCrime(ped.crew ? 0.25 : 0.55, ped.x, ped.y);
          state.danger = { x: p.x, y: p.y };
        }
      }
      for (const car of state.cars) {
        if (distance(tx, ty, car.x, car.y) < car.radius + 8) { car.health -= 3; addParticles(tx, ty, 4, '#ffd23e', 90, 0.3); }
      }
    }
  }
  // Pistol.
  if (!p.car && p.weapon === 'pistol' && input.mouseDown) {
    const wx = state.camX + input.mouseX;
    const wy = state.camY + input.mouseY;
    const shot = tryShoot(p, wx, wy);
    if (shot === 'click') { toast('Out of ammo — find an ammo box', '#ff9d3c', 2); }
    else if (shot) {
      state.bullets.push(shot);
      sfx.playGunshot();
      addParticles(shot.x, shot.y, 3, '#ffca6a', 60, 0.16);
      commitCrime(0.5, p.x, p.y);
      state.danger = { x: p.x, y: p.y };
    }
  }
  // Aim Rico at the mouse while the pistol is out.
  if (!p.car && p.weapon === 'pistol') {
    p.angle = Math.atan2(state.camY + input.mouseY - p.y, state.camX + input.mouseX - p.x);
  }
  // Weapon swap.
  if (input.wasPressed('Digit1')) p.weapon = 'fists';
  if (input.wasPressed('Digit2') && state.hasPistol) p.weapon = 'pistol';

  // Bullets.
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    for (const ped of state.peds) {
      if (b.life > 0 && ped.state !== 'down' && distance(b.x, b.y, ped.x, ped.y) < 11) {
        damagePed(ped, b.damage, Math.atan2(b.vy, b.vx));
        b.life = 0;
      }
    }
    for (const car of [...state.cars, ...state.police]) {
      if (b.life > 0 && distance(b.x, b.y, car.x, car.y) < car.radius) {
        car.health -= 6;
        addParticles(b.x, b.y, 3, '#ffd23e', 80, 0.25);
        b.life = 0;
      }
    }
  }
  state.bullets = state.bullets.filter(b => b.life > 0);
}

function damagePed(ped, amount, angle) {
  ped.health -= amount;
  ped.x += Math.cos(angle) * 8;
  ped.y += Math.sin(angle) * 8;
  addParticles(ped.x, ped.y, 5, '#c9402e', 90, 0.35);
  if (ped.health <= 0 && ped.state !== 'down') {
    ped.state = 'down';
    if (!ped.crew) commitCrime(0.9, ped.x, ped.y);
    sfx.playHurt();
  } else if (!ped.crew) {
    ped.state = 'flee';
    ped.fleeFrom = state.player;
  }
}

// ---------- the world update ----------

function updatePlaying(dt) {
  const p = state.player;
  state.danger = null;
  state.prompt = null;

  // Player movement.
  if (p.car) {
    const car = p.car;
    let throttle = 0, steer = 0, brake = false;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) throttle = 1;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) {
      if (car.speed > 26) brake = true; else throttle = -0.72;
    }
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) steer = -1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) steer = 1;
    car.braking = brake;
    const impact = driveCar(city, car, throttle, steer, dt, brake);
    if (impact > 130) {
      sfx.playCrash((impact - 130) / 300);
      addParticles(car.x, car.y, 10, '#ffb35c', 150, 0.4);
      hurtPlayer(p, (impact - 130) * 0.03);
      commitCrime(0.35, car.x, car.y);
    }
    p.x = car.x; p.y = car.y;
    p.angle = car.angle;
    sfx.setEngineSound(true, car.speed / car.model.topSpeed);
    if (input.wasPressed('KeyE')) exitCar();
  } else {
    updatePlayerOnFoot(city, p, input, dt);
    sfx.setEngineSound(false, 0);
    const near = nearestEnterableCar();
    if (near) {
      state.prompt = near.role === 'police' ? 'Press E — steal the Interceptor (!)' : 'Press E — drive the ' + near.model.name;
      if (input.wasPressed('KeyE')) enterCar(near);
    }
  }
  if (input.wasPressed('KeyE') && p.car) { /* handled above */ }

  updateCombat(dt);

  // Traffic.
  const obstacles = [...state.cars, ...state.police];
  if (p.car) obstacles.push(p.car);
  for (const car of state.cars) {
    if (car.role === 'traffic') {
      updateTrafficCar(city, car, dt, rng, obstacles);
    }
  }
  state.honkIn = Math.max(0, state.honkIn - dt);

  // Cars nudge each other and run over the careless.
  const allCars = [...state.cars, ...state.police];
  if (p.car) allCars.push(p.car);
  for (let i = 0; i < allCars.length; i++) {
    for (let j = i + 1; j < allCars.length; j++) {
      const a = allCars[i], b = allCars[j];
      const d = distance(a.x, a.y, b.x, b.y);
      const min = a.radius + b.radius - 6;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 90) {
          a.health -= rel * 0.05; b.health -= rel * 0.05;
          addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffb35c', 120, 0.3);
          if (a === p.car || b === p.car) { sfx.playCrash(0.4); commitCrime(0.3, p.x, p.y); }
        }
      }
    }
  }
  for (const car of allCars) {
    if (Math.abs(car.speed) < 55) continue;
    for (const ped of state.peds) {
      if (ped.state !== 'down' && distance(car.x, car.y, ped.x, ped.y) < car.radius + 4) {
        ped.state = 'down';
        ped.health = 0;
        car.speed *= 0.82;
        addParticles(ped.x, ped.y, 8, '#c9402e', 110, 0.4);
        if (car === p.car || car.role === 'player') commitCrime(1.1, ped.x, ped.y);
        state.danger = { x: ped.x, y: ped.y };
      }
    }
    // A police car brushing Rico on foot knocks him down a little.
    if (!p.car && car.role === 'police' && Math.abs(car.speed) > 120 && distance(car.x, car.y, p.x, p.y) < car.radius + 8) {
      hurtPlayer(p, 7);
      p.vx = Math.cos(car.angle) * 190;
      p.vy = Math.sin(car.angle) * 190;
      sfx.playHurt();
    }
  }

  // People.
  const scene = { player: p, danger: state.danger, events: [] };
  for (const ped of state.peds) updatePed(city, ped, dt, rng, scene);
  for (const ev of scene.events) {
    if (ev.type === 'crewShot') {
      const hitChance = clamp(0.62 - ev.dist / 620, 0.08, 0.6);
      addParticles(ev.from.x + Math.cos(ev.from.angle) * 12, ev.from.y + Math.sin(ev.from.angle) * 12, 2, '#ffca6a', 50, 0.14);
      sfx.playGunshot();
      if (rng() < hitChance) {
        hurtPlayer(p, 5 + rng() * 7);
        sfx.playHurt();
      }
      state.danger = { x: ev.from.x, y: ev.from.y };
    }
  }
  state.peds = state.peds.filter(ped => ped.crew || distance(ped.x, ped.y, p.x, p.y) < 980 || ped.state === 'down' && distance(ped.x, ped.y, p.x, p.y) < 500);

  // Wanted level and the police.
  const holdFloor = state.mission ? state.mission.holdWanted || 0 : 0;
  const policeSee = state.police.some(cop => distance(cop.x, cop.y, p.x, p.y) < 430);
  if (!policeSee && state.time - state.lastCrimeAt > WANTED.hideSecondsToCool && state.heat > holdFloor) {
    state.heat = Math.max(holdFloor, state.heat - dt * 0.075);
  }
  if (holdFloor) state.heat = Math.max(state.heat, holdFloor);
  state.wanted = starsFromHeat();
  const wantedCops = POLICE_BY_STARS[state.wanted];
  state.spawnIn -= dt;
  if (state.police.length < wantedCops && state.spawnIn <= 0) { spawnPolice(); state.spawnIn = 1.6; }
  if (state.police.length > wantedCops) {
    state.police.sort((a, b) => distance(b.x, b.y, p.x, p.y) - distance(a.x, a.y, p.x, p.y));
    state.police.length = Math.max(wantedCops, 0);
  }
  state.police = state.police.filter(cop => !cop.wrecked && distance(cop.x, cop.y, p.x, p.y) < 1150);
  const target = { x: p.x, y: p.y, vx: p.car ? Math.cos(p.car.angle) * p.car.speed : 0, vy: p.car ? Math.sin(p.car.angle) * p.car.speed : 0, inCar: !!p.car };
  for (const cop of state.police) {
    const impact = updatePoliceCar(city, cop, dt, target);
    if (impact > 150 && p.car && distance(cop.x, cop.y, p.x, p.y) < 70) hurtPlayer(p, 3);
  }
  sfx.setSirenSound(state.wanted > 0 && state.police.length > 0);

  // Bust check: cornered and slow with the law right there.
  const cornered = state.police.some(cop => distance(cop.x, cop.y, p.x, p.y) < WANTED.bustRange);
  const slow = !p.car || Math.abs(p.car.speed) < 26;
  if (state.wanted > 0 && cornered && slow) {
    state.bust += dt / WANTED.bustSeconds;
    if (state.bust >= 1) return busted();
  } else {
    state.bust = Math.max(0, state.bust - dt * 1.4);
  }

  // Traffic and crowds keep the city alive around Rico.
  if (state.cars.filter(c => c.role === 'traffic').length < 13) spawnTraffic(p.x, p.y);
  state.cars = state.cars.filter(car => car.role !== 'traffic' || distance(car.x, car.y, p.x, p.y) < 1000);
  if (state.peds.filter(pd => !pd.crew).length < 15) spawnPed(p.x, p.y);

  // Pickups.
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    if (distance(p.x, p.y, pk.x, pk.y) < 26) {
      pk.taken = true;
      if (pk.kind === 'health') { state.player.health = clamp(state.player.health + 30, 0, 100); toast('+30 health', '#7ee787', 1.6); }
      if (pk.kind === 'ammo') { state.player.ammo += 10; if (state.hasPistol) toast('+10 Harbor Hawk rounds', '#ffd23e', 1.6); else { state.hasPistol = true; state.player.weapon = 'pistol'; toast('Found a Harbor Hawk pistol!', '#ffd23e', 2.4); } }
      if (pk.kind === 'cash') { state.money += 25; state.stats.cashEarned += 25; toast('+$25', '#7ee787', 1.6); }
      sfx.playPickup();
      setTimeout(() => { pk.taken = false; }, 45000);
    }
  }

  updateMission(dt);

  // Particles and toasts.
  for (const pt of state.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.92; pt.vy *= 0.92;
    pt.life -= dt;
  }
  state.particles = state.particles.filter(pt => pt.life > 0);
  for (const t of state.toasts) { t.life -= dt; t.alpha = clamp(t.life / 0.8, 0, 1); }
  state.toasts = state.toasts.filter(t => t.life > 0);

  if (p.dead) return wasted();
  persistThrottled();
}

let persistAt = 0;
function persistThrottled() {
  if (state.time - persistAt > 5) { persistAt = state.time; persist(); }
}
function persist() {
  writeSave({
    money: state.money,
    missionIndex: state.missionIndex,
    hasPistol: state.hasPistol,
    storyDone: state.storyDone,
    stats: state.stats,
    player: state.player,
  });
}

function busted() {
  state.mode = 'busted';
  state.stats.busts++;
  state.money = Math.max(0, state.money - 150);
  sfx.playBusted();
  sfx.setSirenSound(false);
  sfx.setEngineSound(false, 0);
  persist();
}

function wasted() {
  state.mode = 'wasted';
  state.money = Math.max(0, state.money - 150);
  sfx.setSirenSound(false);
  sfx.setEngineSound(false, 0);
  persist();
}

function respawn() {
  const p = state.player;
  if (p.car) { p.car.role = 'parked'; p.car = null; }
  p.x = city.places.safehouse.x + 30;
  p.y = city.places.safehouse.y + 60;
  p.health = 100;
  p.dead = false;
  state.heat = 0;
  state.wanted = 0;
  state.bust = 0;
  state.police = [];
  state.bullets = [];
  state.mode = 'playing';
}

// ---------- drawing ----------

function nightAmount() {
  // dayTime 0.25..0.75 is day; the ends of the dial are night.
  const d = Math.abs(state.dayTime - 0.5) * 2; // 0 at noon, 1 at midnight
  return clamp((d - 0.35) * 2.2, 0, 1);
}

function drawObjectiveMarker(x, y, colour, label, time) {
  const bob = Math.sin(time * 3) * 6;
  const grad = ctx.createLinearGradient(0, y - 190, 0, y);
  grad.addColorStop(0, 'rgba(255,210,62,0)');
  grad.addColorStop(1, colour);
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(x - 9, y - 190, 18, 190);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, 26, 10, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - 150 + bob);
}

function drawWorld() {
  const w = canvas.width, h = canvas.height;
  const p = state.player;
  const focusX = state.mode === 'title' ? 1650 + Math.sin(state.time * 0.07) * 500 : p.x;
  const focusY = state.mode === 'title' ? 1500 + Math.cos(state.time * 0.05) * 420 : p.y;
  state.camX = clamp(focusX - w / 2, 0, Math.max(0, WORLD.size - w));
  state.camY = clamp(focusY - h / 2, 0, Math.max(0, WORLD.size - h));
  ctx.save();
  ctx.translate(-state.camX, -state.camY);
  const night = nightAmount();
  drawCity(ctx, city, { x: state.camX, y: state.camY }, w, h, night);

  // Pickups.
  for (const pk of state.pickups) {
    if (pk.taken) continue;
    const bob = Math.sin(state.time * 3 + pk.bob) * 3;
    ctx.fillStyle = pk.kind === 'health' ? '#e0483e' : pk.kind === 'ammo' ? '#e8b13a' : '#3fae6a';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bob, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'ammo' ? 'A' : '$', pk.x, pk.y + bob + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // Mission markers.
  if (state.mode === 'playing' || state.mode === 'card') {
    if (!state.mission && state.offerAt) drawObjectiveMarker(state.offerAt.x, state.offerAt.y, '#ff9d3c', '!', state.time);
    if (!state.mission && state.sideOfferAt && state.sideOfferAt !== state.offerAt) drawObjectiveMarker(state.sideOfferAt.x, state.sideOfferAt.y, '#7ee787', '$', state.time);
    if (state.objective && state.mission) drawObjectiveMarker(state.objective.x, state.objective.y, '#ffd23e', '▼', state.time);
  }

  for (const car of state.cars) if (car !== p.car) drawCar(ctx, car, state.time);
  for (const cop of state.police) drawCar(ctx, cop, state.time);
  if (p.car) drawCar(ctx, p.car, state.time);
  // A gold ring around the mission car so Rico can spot it.
  if (state.mission && state.mission.markedCar && state.mission.markedCar.role !== 'player') {
    const mc = state.mission.markedCar;
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(mc.x, mc.y, 36 + Math.sin(state.time * 4) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const ped of state.peds) drawPed(ctx, ped, state.time);
  drawPlayer(ctx, p, state.time);

  // Bullets as tracers.
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const pt of state.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.colour;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Dusk/night tint.
  const night = nightAmount();
  if (night > 0.02) {
    ctx.fillStyle = `rgba(10, 14, 44, ${0.34 * night})`;
    ctx.fillRect(0, 0, w, h);
  } else if (state.dayTime > 0.68 && state.dayTime < 0.86) {
    ctx.fillStyle = 'rgba(255, 128, 54, 0.10)';
    ctx.fillRect(0, 0, w, h);
  }
}

// ---------- the loop ----------

let lastStamp = 0;
function frame(stamp) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (stamp - lastStamp) / 1000 || 0.016);
  lastStamp = stamp;
  state.time += dt;
  const w = canvas.width, h = canvas.height;

  if (state.mode === 'playing') {
    state.dayTime = (state.dayTime + dt / 300) % 1;
    updatePlaying(dt);
  } else if (state.mode === 'title') {
    // The city idles behind the title: traffic and people carry on.
    const scene = { player: state.player, danger: null, events: [] };
    for (const ped of state.peds) updatePed(city, ped, dt, rng, scene);
    const obstacles = state.cars;
    for (const car of state.cars) if (car.role === 'traffic') updateTrafficCar(city, car, dt, rng, obstacles);
  }

  drawWorld();
  if (state.mode === 'playing' || state.mode === 'paused' || state.mode === 'card') drawHud(ctx, state, w, h);
  if (state.mode === 'title') drawTitleScreen(ctx, state, w, h);
  if (state.mode === 'card') drawMissionCard(ctx, state, w, h);
  if (state.mode === 'paused') drawPauseMenu(ctx, state, w, h);
  if (state.mode === 'busted' || state.mode === 'wasted') drawBustedWasted(ctx, state, w, h);
  if (state.mode === 'ending') drawEnding(ctx, state, w, h);

  handleModeKeys();
  input.endFrame();
}

function startRun(fresh) {
  if (fresh) {
    clearSave();
    state.money = 120;
    state.missionIndex = 0;
    state.hasPistol = false;
    state.storyDone = false;
    state.stats = { carsStolen: 0, missionsDone: 0, busts: 0, cashEarned: 0 };
    state.player.weapon = 'fists';
    state.player.ammo = 0;
  }
  const p = state.player;
  p.x = city.places.garage.x + 60;
  p.y = city.places.garage.y + 90;
  p.health = 100;
  p.dead = false;
  state.heat = 0;
  state.wanted = 0;
  state.mode = 'playing';
  sfx.initAudio();
  toast(state.storyDone ? 'Free roam — Port Azura is yours' : 'Find Mama Sol at Sol’s Auto Works', '#ffd23e', 4);
}

function handleModeKeys() {
  if (input.wasPressed('KeyM')) {
    state.muted = sfx.toggleMute();
    toast(state.muted ? 'Sound off' : 'Sound on', '#e8ecf0', 1.4);
  }
  if (state.mode === 'title') {
    if (input.wasPressed('Enter')) startRun(false);
    if (input.wasPressed('MouseLeft')) {
      const w = canvas.width, h = canvas.height;
      const bx = w / 2 - 150, bw = 300;
      if (input.mouseX > bx && input.mouseX < bx + bw) {
        if (input.mouseY > h * 0.52 && input.mouseY < h * 0.52 + 52) { sfx.initAudio(); startRun(false); }
        else if (state.hasSave && input.mouseY > h * 0.52 + 66 && input.mouseY < h * 0.52 + 110) { sfx.initAudio(); startRun(true); }
      }
    }
    return;
  }
  if (state.mode === 'card') {
    if (input.wasPressed('Enter')) {
      const def = state.pendingMission;
      state.card = null;
      state.mode = 'playing';
      startMission(def);
    } else if (input.wasPressed('Escape')) {
      state.card = null;
      state.pendingMission = null;
      state.mode = 'playing';
    }
    return;
  }
  if (state.mode === 'busted' || state.mode === 'wasted') {
    if (input.wasPressed('Enter')) respawn();
    return;
  }
  if (state.mode === 'ending') {
    if (input.wasPressed('Enter')) state.mode = 'playing';
    return;
  }
  if (input.wasPressed('KeyP') || (input.wasPressed('Escape') && state.mode !== 'card')) {
    state.mode = state.mode === 'paused' ? 'playing' : 'paused';
    if (state.mode === 'playing') sfx.initAudio();
  }
  if (state.mode === 'playing' && state.justFinishedStory && !state.mission) {
    state.justFinishedStory = false;
    state.mode = 'ending';
  }
}

// ---------- screenshot poses (used by shots.json; harmless in play) ----------

function poseShot(name) {
  const p = state.player;
  state.mode = 'playing';
  if (name === 'start') {
    state.mode = 'title';
    state.dayTime = 0.72;
    return;
  }
  if (name === 'play') {
    p.x = 1560; p.y = 1560;
    state.dayTime = 0.36;
    startMission(storyMissions[0]);
    return;
  }
  if (name === 'chase') {
    state.dayTime = 0.74;
    p.x = 1980; p.y = 1890;
    const car = makeCar(rng, p.x, p.y, 0, { role: 'parked' });
    car.model = { name: 'Falco Roadster', kind: 'sport', topSpeed: 398, accel: 252, grip: 3.8, colours: ['#e0483e'] };
    car.colour = '#e0483e';
    state.cars.push(car);
    enterCar(car);
    car.speed = 240;
    state.heat = 3;
    state.lastCrimeAt = state.time;
    spawnPolice(); spawnPolice(); spawnPolice();
    for (const cop of state.police) { cop.x = p.x - 190 - rng() * 90; cop.y = p.y + (rng() - 0.5) * 130; cop.angle = 0; cop.speed = 210; }
    startMission(storyMissions[1]);
    nextStep(); // pose the delivery leg, crate already aboard
    return;
  }
  if (name === 'mission') {
    state.dayTime = 0.5;
    const c = city.places.cannery;
    p.x = c.x - 170; p.y = c.y + 90;
    state.hasPistol = true;
    p.weapon = 'pistol';
    p.ammo = 9;
    startMission(storyMissions[3]);
    nextStep(); // jump from the drive-over step to the shootout step
    state.mission.crewSpawned = true;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      state.peds.push(makePed(rng, c.x + Math.cos(a) * 95, c.y + Math.sin(a) * 95, { state: 'hostile', crew: true, shirt: '#7a1f1a', health: 70 }));
    }
    addParticles(p.x + 22, p.y - 4, 4, '#ffca6a', 60, 0.3);
    return;
  }
}

if (SHOT) poseShot(SHOT);
requestAnimationFrame(frame);
