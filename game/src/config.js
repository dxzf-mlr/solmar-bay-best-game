// Solmar Bay shared constants and the seeded random number generator.
// Every system reads the same numbers from here so the city, the traffic
// and the screenshot staging all agree on one layout.

export const WORLD_HALF = 320; // the city spans x,z in [-320, 320]
export const ROAD_STEP = 64; // distance between parallel road centrelines
export const ROAD_WIDTH = 14; // asphalt width of a normal street
export const HIGHWAY_AT = 288; // the ring highway runs near the city edge
export const BEACH_X = -272; // west of this line is sand, then the sea
export const SEA_X = -296; // the water plane starts here
export const PIER_Z = 0; // the pier runs along z = 0 into the sea

// Road centrelines, from west to east and south to north.
export const ROADS = [-256, -192, -128, -64, 0, 64, 128, 192, 256];

// A tiny deterministic generator (mulberry32) so ?seed= replays one layout.
export function makeSeededRandom(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickFrom(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function randomIn(rng, min, max) {
  return min + rng() * (max - min);
}

// Which district a block centre belongs to: downtown towers in the middle,
// mid-rise blocks around them, low houses out near the ring road.
export function districtOf(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d < 130) return 'downtown';
  if (d < 224) return 'midtown';
  return 'residential';
}

// True when a point sits on asphalt (a street or the ring highway).
export function isOnRoad(x, z) {
  const half = ROAD_WIDTH / 2;
  for (const r of ROADS) {
    if (Math.abs(x - r) <= half || Math.abs(z - r) <= half) return true;
  }
  if (Math.abs(Math.abs(x) - HIGHWAY_AT) <= 10) return true;
  if (Math.abs(Math.abs(z) - HIGHWAY_AT) <= 10) return true;
  return false;
}

// Snap a point onto the nearest road centreline (used by traffic and peds).
export function nearestRoadCoordinate(v) {
  let best = ROADS[0];
  for (const r of ROADS) {
    if (Math.abs(v - r) < Math.abs(v - best)) best = r;
  }
  return best;
}

// Game balance numbers, all in one place so tuning is a one-line change.
export const BALANCE = {
  playerWalkSpeed: 6,
  playerRunSpeed: 10,
  playerHealth: 100,
  carTopSpeed: 38,
  carAcceleration: 16,
  carBrake: 30,
  carReverseSpeed: 12,
  policeTopSpeed: 44,
  trafficSpeed: 11,
  pedWalkSpeed: 1.6,
  wantedDecaySeconds: 18,
  pistolDamage: 34,
  punchDamage: 20,
  enemyHealth: 60,
  copPunchDamage: 8,
  carRamDamage: 12,
};

// Paint for the HUD and the minimap. One palette keeps the whole game coherent.
export const COLORS = {
  money: '#ffd94a',
  wanted: '#ff5252',
  health: '#7ee787',
  mission: '#ffd94a',
  police: '#ff5252',
  player: '#ffffff',
  traffic: '#9aa5b1',
};
