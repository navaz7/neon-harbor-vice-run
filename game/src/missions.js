// The story of Rico Vale, in six jobs for Mama Sol — plus endless quick
// fares for spending money. Pure data and text; main.js runs the steps.
//
// Step types: goto | stealCar | pickup | deliver | collect | shootout |
// escape | checkpoints. A step may carry timeLimit (seconds) and setWanted.

export function buildStoryMissions(places) {
  return [
    {
      id: 'first-wheels',
      title: 'First Wheels',
      giver: 'Mama Sol',
      at: places.garage,
      intro: [
        'Mama Sol: Rico! You walk everywhere like a tourist.',
        'A customer left a Comet coupe by the marina lot. Bring it to my garage — gently, ah?',
        'Walk up to a car and press E to get in. WASD drives.',
      ],
      reward: 250,
      steps: [
        { type: 'stealCar', x: 1180, y: 700, label: 'Take the Alder Comet by the marina lot' },
        { type: 'deliver', x: places.garage.x, y: places.garage.y, label: 'Deliver the Comet to Sol’s Auto Works', needsMarkedCar: true },
      ],
    },
    {
      id: 'harbor-run',
      title: 'Harbor Run',
      giver: 'Mama Sol',
      at: places.garage,
      intro: [
        'Mama Sol: A crate came in on the night boat. It sits on Muelle Viejo Pier.',
        'Pick it up and take it to Cannery No. 9. The harbour patrol has sharp eyes tonight.',
      ],
      reward: 400,
      steps: [
        { type: 'pickup', x: places.pier.x, y: places.pier.y, label: 'Collect the crate on Muelle Viejo Pier', setWanted: 1 },
        { type: 'deliver', x: places.cannery.x, y: places.cannery.y, label: 'Deliver the crate to Cannery No. 9', timeLimit: 170 },
      ],
    },
    {
      id: 'hot-property',
      title: 'Hot Property',
      giver: 'Mama Sol',
      at: places.garage,
      intro: [
        'Mama Sol: Three briefcases, three careless owners, one afternoon.',
        'The diner, the south shore and Faro Point. Collect all three and come back to me.',
      ],
      reward: 600,
      steps: [
        {
          type: 'collect', label: 'Collect the briefcases',
          points: [
            { x: places.diner.x, y: places.diner.y, name: 'Sol’s Diner' },
            { x: 760, y: 1990, name: 'the south shore' },
            { x: places.overlook.x, y: places.overlook.y, name: 'Faro Point' },
          ],
        },
        { type: 'goto', x: places.garage.x, y: places.garage.y, label: 'Return to Sol’s Auto Works' },
      ],
    },
    {
      id: 'cannery-job',
      title: 'The Cannery Job',
      giver: 'Mama Sol',
      at: places.garage,
      intro: [
        'Mama Sol: The Bravo crew robbed my brother’s takings from Cannery No. 9.',
        'Take this Harbor Hawk pistol. Get the cash bag back — and come home whole.',
        'Aim with the mouse, click to shoot. F is your fists.',
      ],
      reward: 900,
      grantsPistol: true,
      steps: [
        { type: 'goto', x: places.cannery.x, y: places.cannery.y, label: 'Go to Cannery No. 9' },
        { type: 'shootout', x: places.cannery.x, y: places.cannery.y, count: 4, label: 'Clear out the Bravo crew' },
        { type: 'pickup', x: 2760, y: 1180, label: 'Grab the cash bag', setWanted: 3 },
        { type: 'escape', label: 'Lose the police' },
        { type: 'goto', x: places.safehouse.x, y: places.safehouse.y, label: 'Lay low at Rico’s Flat' },
      ],
    },
    {
      id: 'grand-tour',
      title: 'Midnight Grand Tour',
      giver: 'Mama Sol',
      at: places.garage,
      intro: [
        'Mama Sol: A film crew wants proof this city is alive at night.',
        'Hit every checkpoint before the clock dies. Any car you like — faster is better.',
      ],
      reward: 1200,
      steps: [
        {
          type: 'checkpoints', label: 'Hit every checkpoint',
          timeLimit: 185,
          points: [
            { x: 630, y: 2310 }, { x: 1470, y: 1890 }, { x: 2310, y: 2310 },
            { x: 2730, y: 1470 }, { x: 1890, y: 630 }, { x: 700, y: 760 },
          ],
        },
      ],
    },
    {
      id: 'vice-run',
      title: 'Vice Run',
      giver: 'Mama Sol',
      at: places.garage,
      intro: [
        'Mama Sol: Last job, Rico. My ledger is at the diner — every debt in Port Azura.',
        'Carry it to Faro Point and give it to the man by the lighthouse.',
        'The whole harbour police will want it too. Do not stop.',
      ],
      reward: 2500,
      steps: [
        { type: 'pickup', x: places.diner.x, y: places.diner.y, label: 'Pick up the ledger at Sol’s Diner', setWanted: 3, holdWanted: 3 },
        { type: 'deliver', x: places.overlook.x, y: places.overlook.y, label: 'Deliver the ledger to Faro Point' },
      ],
    },
  ];
}

// A repeatable little earner: fetch a passenger, drive them across town.
export function makeSideJob(rng, places) {
  const spots = [
    { x: 640, y: 1150 }, { x: 1150, y: 1560 }, { x: 1980, y: 1150 },
    { x: 2380, y: 1980 }, { x: 1560, y: 2380 }, { x: 820, y: 2740 },
    { x: 2740, y: 700 }, { x: 2380, y: 2820 },
  ];
  const from = spots[Math.floor(rng() * spots.length)];
  let to = spots[Math.floor(rng() * spots.length)];
  if (to === from) to = spots[(spots.indexOf(from) + 3) % spots.length];
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    id: 'quick-fare',
    title: 'Quick Fare',
    giver: 'A waiting passenger',
    at: places.diner,
    intro: ['A passenger waves you down: “Across town, friend — and quickly, please!”'],
    reward: Math.round(60 + dist / 14),
    steps: [
      { type: 'pickup', x: from.x, y: from.y, label: 'Pick up the passenger', needsCar: true },
      { type: 'deliver', x: to.x, y: to.y, label: 'Drop the passenger off', needsCar: true },
    ],
  };
}

export function stepLabel(step, progress) {
  if (!step) return '';
  if (step.type === 'collect') return `${step.label} (${progress || 0}/${step.points.length})`;
  if (step.type === 'checkpoints') return `${step.label} (${progress || 0}/${step.points.length})`;
  if (step.type === 'shootout') return `${step.label} (${progress || 0} left)`;
  return step.label;
}
