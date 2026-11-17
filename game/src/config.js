// Neon Harbor: Vice Run — central tuning and world constants.
// Everything in Port Azura is original: the city, its people, its cars.

export const WORLD = {
  size: 3360,            // the city is a square, this many pixels across
  roadSpacing: 420,      // distance between road centrelines
  roadWidth: 104,        // asphalt width
  sidewalk: 16,          // pavement rim around each block
  waterLine: 2950,       // south of this y the harbour water begins
  beachLine: 2890,       // sand strip between the last street and the water
};

export const PLAYER = {
  radius: 11,
  walkSpeed: 148,
  sprintSpeed: 238,
  health: 100,
  punchRange: 30,
  punchDamage: 34,
};

export const WANTED = {
  maxStars: 5,
  hideSecondsToCool: 9,  // stay unseen this long and one star fades
  bustSeconds: 2.4,      // police this close, this long, and you are busted
  bustRange: 64,
};

// Civilian traffic and parked-car liveries, all fictional marques.
export const CAR_MODELS = [
  { name: 'Alder Comet',    kind: 'coupe',   topSpeed: 342, accel: 210, grip: 3.4, colours: ['#c8402e', '#e8b13a', '#3f7fbf', '#d8d8dc'] },
  { name: 'Bravo Family',   kind: 'sedan',   topSpeed: 288, accel: 168, grip: 3.0, colours: ['#7a8894', '#42506b', '#8c2f39', '#2e4f43'] },
  { name: 'Cuda Pickup',    kind: 'pickup',  topSpeed: 262, accel: 158, grip: 2.7, colours: ['#b8622d', '#5d6e46', '#37424e', '#946b54'] },
  { name: 'Duna Hatch',     kind: 'hatch',   topSpeed: 252, accel: 172, grip: 3.2, colours: ['#4fa3a5', '#c9c25e', '#a55ba0', '#d9d9d9'] },
  { name: 'Estrella Van',   kind: 'van',     topSpeed: 232, accel: 138, grip: 2.5, colours: ['#e3e0d8', '#6b7f9e', '#7d7466', '#546e5a'] },
  { name: 'Falco Roadster', kind: 'sport',   topSpeed: 398, accel: 252, grip: 3.8, colours: ['#e0483e', '#f2c230', '#22262e', '#7e3ff2'] },
];

export const POLICE_MODEL = { name: 'Interceptor', kind: 'police', topSpeed: 356, accel: 224, grip: 3.6 };

// How many police cars hunt at each wanted level.
export const POLICE_BY_STARS = [0, 1, 2, 3, 5, 7];

export const WEAPONS = {
  fists:  { name: 'Fists',        damage: 34, range: PLAYER.punchRange, cooldown: 0.34, ammo: Infinity },
  pistol: { name: 'Harbor Hawk',  damage: 46, range: 460, cooldown: 0.24, ammo: 12 },
};

export const COLOURS = {
  asphalt: '#33373d',
  asphaltEdge: '#2b2f34',
  laneMark: '#d8c95c',
  sidewalk: '#9aa0a3',
  grass: '#4d7c4f',
  sand: '#d9bd7f',
  water: '#1d5f7a',
  waterDeep: '#174c63',
  roofShadow: 'rgba(0,0,0,0.25)',
};

export const SAVE_KEY = 'neon-harbor-vice-run-v1';
