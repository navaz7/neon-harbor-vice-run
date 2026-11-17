// Port Azura: an original harbour city on a grid — diners, a cannery, a
// radio station, palm parks and one long pier. Generated once from a seed.

import { WORLD, COLOURS } from './config.js';
import { makeRng, pick, randRange } from './rng.js';

export const ROAD_CENTRES = [];
for (let i = 0; i < 8; i++) ROAD_CENTRES.push(210 + i * WORLD.roadSpacing);

const BUSINESS_NAMES = [
  'Sol’s Diner', 'Harbor Bank', 'Azura Motors', 'Hotel Marisol', 'Vice Ink',
  'Radio Brisa FM', 'Mercado Central', 'Palm Court', 'Ferretería Luna',
  'Café Oleaje', 'Discos Coral', 'Farmacia Sol', 'Taller Bravo', 'Joyas Mar',
  'Panadería Azul', 'Gym Tiburón', 'Cine Faro', 'Libros Brisa', 'Hotel Ancla',
  'Mariscos Pepe', 'Bar La Ola', 'Peluquería Nube', 'Banco del Puerto',
  'Seguros Faro', 'Imprenta Coral', 'Zapatería Mar', 'Flores Lola',
];

const ROOF_COLOURS = ['#8a4f43', '#707a86', '#97784f', '#5f7263', '#7d5a78', '#4f6d8a', '#a08b62', '#86552f'];

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const parks = [];
  const parkingLots = [];
  const trees = [];
  const lamps = [];
  const usedNames = new Set();

  const halfRoad = WORLD.roadWidth / 2;
  const rim = WORLD.sidewalk + 6;

  // Blocks sit between neighbouring road centrelines, above the beach.
  for (let cx = 0; cx < ROAD_CENTRES.length - 1; cx++) {
    for (let cy = 0; cy < ROAD_CENTRES.length - 1; cy++) {
      const x0 = ROAD_CENTRES[cx] + halfRoad + rim;
      const y0 = ROAD_CENTRES[cy] + halfRoad + rim;
      const x1 = ROAD_CENTRES[cx + 1] - halfRoad - rim;
      const y1 = ROAD_CENTRES[cy + 1] - halfRoad - rim;
      if (y0 > WORLD.beachLine - 200) continue; // keep the south row open
      const w = x1 - x0;
      const h = y1 - y0;
      const roll = rng();
      if (roll < 0.14) {
        parks.push({ x: x0, y: y0, w, h });
        for (let t = 0; t < 9; t++) {
          trees.push({ x: randRange(rng, x0 + 24, x1 - 24), y: randRange(rng, y0 + 24, y1 - 24), r: randRange(rng, 13, 22), palm: rng() < 0.5 });
        }
      } else if (roll < 0.26) {
        const spots = [];
        for (let sx = x0 + 26; sx < x1 - 30; sx += 52) {
          for (let sy = y0 + 24; sy < y1 - 20; sy += 64) spots.push({ x: sx, y: sy, angle: Math.PI / 2 });
        }
        parkingLots.push({ x: x0, y: y0, w, h, spots });
      } else {
        const cols = rng() < 0.5 ? 1 : 2;
        const rows = rng() < 0.5 ? 1 : 2;
        for (let bx = 0; bx < cols; bx++) {
          for (let by = 0; by < rows; by++) {
            const bw = (w / cols) * randRange(rng, 0.78, 0.92);
            const bh = (h / rows) * randRange(rng, 0.78, 0.92);
            const bxPos = x0 + (w / cols) * bx + (w / cols - bw) / 2;
            const byPos = y0 + (h / rows) * by + (h / rows - bh) / 2;
            let name = null;
            if (rng() < 0.3) {
              const fresh = BUSINESS_NAMES.filter(n => !usedNames.has(n));
              if (fresh.length) { name = pick(rng, fresh); usedNames.add(name); }
            }
            buildings.push({
              x: bxPos, y: byPos, w: bw, h: bh,
              colour: pick(rng, ROOF_COLOURS),
              floors: 2 + Math.floor(rng() * 6),
              name,
            });
          }
        }
      }
    }
  }

  // Street lamps along every road, both sides.
  for (const c of ROAD_CENTRES) {
    for (let p = 90; p < WORLD.size - 60; p += 210) {
      lamps.push({ x: c - halfRoad - 8, y: p });
      lamps.push({ x: c + halfRoad + 8, y: p + 105 });
      if (c < WORLD.beachLine) {
        lamps.push({ x: p, y: c - halfRoad - 8 });
        lamps.push({ x: p + 105, y: c + halfRoad + 8 });
      }
    }
  }
  // Palms along the beach.
  for (let x = 80; x < WORLD.size - 60; x += 130) {
    trees.push({ x: x + randRange(rng, -14, 14), y: WORLD.beachLine + 22, r: randRange(rng, 14, 20), palm: true });
  }

  // Named places the story visits. Coordinates are doorstep points.
  const places = {
    garage:   { name: 'Sol’s Auto Works', x: 700, y: 760, blurb: 'Mama Sol’s garage. Where every job starts.' },
    pier:     { name: 'Muelle Viejo Pier', x: 1470, y: 3060, blurb: 'The old pier. Crates come in at night.' },
    cannery:  { name: 'Cannery No. 9', x: 2790, y: 1120, blurb: 'The Bravo crew’s fish cannery.' },
    safehouse:{ name: 'Rico’s Flat', x: 1120, y: 2380, blurb: 'A quiet flat above the bakery.' },
    diner:    { name: 'Sol’s Diner', x: 1960, y: 700, blurb: 'Coffee, gossip and job offers.' },
    overlook: { name: 'Faro Point', x: 3150, y: 2820, blurb: 'The lighthouse headland east of the harbour.' },
  };
  // Give the garage and cannery real solid buildings to stand beside.
  buildings.push({ x: 648, y: 668, w: 150, h: 76, colour: '#4f6d8a', floors: 1, name: 'Sol’s Auto Works' });
  buildings.push({ x: 2700, y: 1020, w: 190, h: 110, colour: '#86552f', floors: 2, name: 'Cannery No. 9' });

  return { buildings, parks, parkingLots, trees, lamps, places };
}

export function isWater(x, y) {
  if (y < WORLD.waterLine) return false;
  // The pier is walkable deck over the water.
  if (x > 1428 && x < 1512 && y < 3180) return false;
  return true;
}

export function isOnRoad(x, y) {
  if (isWater(x, y)) return false;
  const half = WORLD.roadWidth / 2;
  for (const c of ROAD_CENTRES) {
    if (Math.abs(x - c) < half || Math.abs(y - c) < half) return true;
  }
  return false;
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const c of ROAD_CENTRES) {
    const dV = Math.abs(x - c);
    if (dV < bestDist) { bestDist = dV; best = { x: c, y, axis: 'v' }; }
    const dH = Math.abs(y - c);
    if (dH < bestDist) { bestDist = dH; best = { x, y: c, axis: 'h' }; }
  }
  return best;
}

export function randomRoadPosition(rng) {
  const c = pick(rng, ROAD_CENTRES);
  const along = randRange(rng, 80, WORLD.beachLine - 60);
  return rng() < 0.5 ? { x: c, y: along, axis: 'v' } : { x: along, y: c, axis: 'h' };
}

// Circle against the building list: returns a push-out correction or null.
export function collideBuildings(city, x, y, radius) {
  if (isWater(x, y)) return { x, y: WORLD.waterLine - radius };
  let out = null;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 < 0.01) {
        out = { x, y: b.y - radius };
      } else {
        const d = Math.sqrt(d2);
        out = { x: nx + (dx / d) * radius, y: ny + (dy / d) * radius };
      }
      x = out.x; y = out.y;
    }
  }
  return out;
}

export function drawCity(ctx, city, cam, viewW, viewH, nightAmount) {
  const x0 = cam.x - 60, y0 = cam.y - 60, x1 = cam.x + viewW + 60, y1 = cam.y + viewH + 60;
  ctx.fillStyle = COLOURS.grass;
  ctx.fillRect(cam.x, cam.y, viewW, viewH);

  // Harbour water and beach.
  ctx.fillStyle = COLOURS.sand;
  ctx.fillRect(0, WORLD.beachLine, WORLD.size, WORLD.waterLine - WORLD.beachLine + 400);
  ctx.fillStyle = COLOURS.water;
  ctx.fillRect(0, WORLD.waterLine, WORLD.size, WORLD.size - WORLD.waterLine + 400);
  ctx.fillStyle = COLOURS.waterDeep;
  for (let y = WORLD.waterLine + 46; y < WORLD.size + 200; y += 74) {
    ctx.fillRect(0, y, WORLD.size, 16);
  }
  // The pier: wooden deck on posts.
  ctx.fillStyle = '#8a6b48';
  ctx.fillRect(1428, WORLD.beachLine, 84, 330);
  ctx.fillStyle = '#77592f';
  for (let y = WORLD.beachLine + 12; y < WORLD.beachLine + 330; y += 30) ctx.fillRect(1428, y, 84, 5);

  // Roads.
  ctx.fillStyle = COLOURS.asphalt;
  const half = WORLD.roadWidth / 2;
  for (const c of ROAD_CENTRES) {
    if (c > x0 - half && c < x1 + half) ctx.fillRect(c - half, 0, WORLD.roadWidth, WORLD.beachLine + 60);
    if (c > y0 - half && c < y1 + half && c < WORLD.beachLine) ctx.fillRect(0, c - half, WORLD.size, WORLD.roadWidth);
  }
  // Lane dashes.
  ctx.fillStyle = COLOURS.laneMark;
  for (const c of ROAD_CENTRES) {
    for (let p = 26; p < WORLD.beachLine; p += 56) {
      if (p > y0 && p < y1 && c > x0 && c < x1) ctx.fillRect(c - 2, p, 4, 26);
      if (p > x0 && p < x1 && c > y0 && c < y1 && c < WORLD.beachLine) ctx.fillRect(p, c - 2, 26, 4);
    }
  }
  // Sidewalk rims around blocks.
  ctx.fillStyle = COLOURS.sidewalk;
  const rim = WORLD.sidewalk;
  for (let cx = 0; cx < ROAD_CENTRES.length - 1; cx++) {
    for (let cy = 0; cy < ROAD_CENTRES.length - 1; cy++) {
      const bx = ROAD_CENTRES[cx] + half + 4;
      const by = ROAD_CENTRES[cy] + half + 4;
      const bw = WORLD.roadSpacing - WORLD.roadWidth - 8;
      if (bx > x1 || by > y1 || bx + bw < x0 || by + bw < y0) continue;
      if (by > WORLD.beachLine - 160) continue;
      ctx.fillRect(bx, by, bw, bw);
    }
  }
  // Parks.
  for (const p of city.parks) {
    if (p.x > x1 || p.y > y1 || p.x + p.w < x0 || p.y + p.h < y0) continue;
    ctx.fillStyle = '#5d8a58';
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  // Parking lots.
  for (const lot of city.parkingLots) {
    if (lot.x > x1 || lot.y > y1 || lot.x + lot.w < x0 || lot.y + lot.h < y0) continue;
    ctx.fillStyle = '#565b61';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = '#c9c9c9';
    ctx.lineWidth = 2;
    for (const s of lot.spots) {
      ctx.strokeRect(s.x - 20, s.y - 12, 40, 24);
    }
  }
  // Buildings: rooftop, parapet lip and a drop shadow.
  for (const b of city.buildings) {
    if (b.x > x1 || b.y > y1 || b.x + b.w < x0 || b.y + b.h < y0) continue;
    ctx.fillStyle = COLOURS.roofShadow;
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.colour;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(b.x, b.y, b.w, 7);
    ctx.fillRect(b.x, b.y, 7, b.h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const inner = 12 + (b.floors % 3) * 5;
    ctx.fillRect(b.x + inner, b.y + inner, b.w - inner * 2, b.h - inner * 2);
    if (b.name) {
      ctx.fillStyle = 'rgba(12,16,22,0.72)';
      const label = b.name;
      ctx.font = 'bold 12px system-ui, sans-serif';
      const tw = Math.min(ctx.measureText(label).width + 12, b.w);
      ctx.fillRect(b.x + (b.w - tw) / 2, b.y + b.h / 2 - 10, tw, 20);
      ctx.fillStyle = '#ffd964';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1, b.w - 8);
    }
  }
  // Trees and palms.
  for (const t of city.trees) {
    if (t.x < x0 || t.y < y0 || t.x > x1 || t.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.palm ? '#5f9e52' : '#3e6e3a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  // Lamps glow at night.
  if (nightAmount > 0.25) {
    ctx.fillStyle = `rgba(255, 196, 92, ${0.16 * nightAmount})`;
    for (const l of city.lamps) {
      if (l.x < x0 || l.y < y0 || l.x > x1 || l.y > y1) continue;
      ctx.beginPath(); ctx.arc(l.x, l.y, 30, 0, Math.PI * 2); ctx.fill();
    }
  }
}
