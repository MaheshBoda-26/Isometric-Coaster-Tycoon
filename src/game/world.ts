// World state, map editing, economy, park rating and the starter park.
import { G, MAP, DIRS, rightDir, idx, inb, hash2, toast, MONTHS, clamp, DAY_SEC, beep } from './core';
import { newPiece, rebuild, appendPieces, releaseTrack, stationCount, SEATS } from './track';
import { stepRide, stopOperation } from './sim';

export const COST: Record<string, number> = { path: 10, queue: 8, tree1: 12, tree2: 12, tree3: 14, bush: 8, flower: 6, bench: 15, lamp: 12, bin: 10, burger: 150, drink: 120, toilet: 200, info: 100, carousel: 600, ferris: 1100 };
export const STAFF: Record<string, { name: string; wage: number }> = {
  handyman: { name: 'Handyman', wage: 50 }, mechanic: { name: 'Mechanic', wage: 80 }, security: { name: 'Security Guard', wage: 60 }, entertainer: { name: 'Entertainer', wage: 55 },
};
export const SHOPS: Record<string, any> = {
  burger: { name: 'Burger Bar', price: 2.2, color: '#d9452f', roof: '#f5c542' },
  drink: { name: 'Drinks Stall', price: 1.5, color: '#2f7fd6', roof: '#f2f2f2' },
  toilet: { name: 'Toilets', price: 0, color: '#9aa3ad', roof: '#5d6b7a' },
  info: { name: 'Information Kiosk', price: 0.5, color: '#3aa56a', roof: '#f0e6c8' },
};
export const FLATS: Record<string, any> = {
  carousel: { name: 'Merry-Go-Round', exc: 2.4, inten: 0.9, nau: 0.3, price: 1.2, cycle: 24 },
  ferris: { name: 'Ferris Wheel', exc: 3.1, inten: 1.2, nau: 0.4, price: 1.8, cycle: 34 },
};
export const COASTER_COLORS = ['#d6403a', '#2f6fd6', '#2fa86b', '#e8a02c', '#8e4ed0'];

const cellCenter = (i: number) => [(i % MAP) * 32 + 16, Math.floor(i / MAP) * 32 + 16];
export { cellCenter };

export function spend(amount: number, cat: string) {
  G.cash -= amount;
  G.fin.cur.exp[cat] = (G.fin.cur.exp[cat] || 0) + amount;
}
export function earn(amount: number, cat: string, refund = false) {
  G.cash += amount;
  if (refund) G.fin.cur.exp[cat] = (G.fin.cur.exp[cat] || 0) - amount;
  else G.fin.cur.inc[cat] = (G.fin.cur.inc[cat] || 0) + amount;
}

function freshFin() { return { cur: { inc: {}, exp: {} }, hist: [] as any[] }; }

export function newGame() {
  const n = MAP * MAP;
  for (const k of Object.keys(G)) if (k !== 'hooks' && k !== 'sound') delete G[k];
  Object.assign(G, {
    map: { ground: new Uint8Array(n), path: new Uint8Array(n), obj: new Array(n).fill(null), furn: new Array(n).fill(null), litter: new Uint8Array(n), occ: new Array(n).fill(null) },
    rides: [], guests: [], staff: [], toasts: [], cash: 9000, loan: 10000, maxLoan: 40000, day: 0, dayT: 0, halfT: 0, speed: 1, paused: false,
    parkRating: 735, ratingHist: [735], daysBelow: 0, closed: false, entryMode: 'ride', entryFee: 0, fin: freshFin(),
    stats: { crashes: 0, guestsTotal: 0, ridesTaken: 0, left: 0, refusedEntry: 0 }, groundDirty: true, pathVer: 0, fields: new Map(), nextId: 1,
    gate: { x: 24, y: 46 }, ratingParts: {}, complaints: {}, spawnAcc: 0, time: 0, selected: null,
  });
  if (G.sound === undefined) G.sound = true;
  G.gateIdx = idx(24, 46); G.gatePath = idx(24, 45);
  G.hooks.onRideChanged = (r: any) => { computeQueue(r); G.pathVer++; G.fields.clear(); };
  G.hooks.spend = spend; G.hooks.earn = earn;
  buildStarter();
  computeAllQueues();
}

// ---------------- map helpers ----------------
export function neighbors(i: number) {
  const x = i % MAP, y = (i / MAP) | 0, o: number[] = [];
  if (x > 0) o.push(i - 1); if (x < MAP - 1) o.push(i + 1); if (y > 0) o.push(i - MAP); if (y < MAP - 1) o.push(i + MAP);
  return o;
}
export function pathChanged() {
  G.pathVer++; G.fields.clear(); G.groundDirty = true;
  computeAllQueues();
}
export function computeAllQueues() { for (const r of G.rides) computeQueue(r); }

export function computeQueue(ride: any) {
  const m = G.map;
  ride.approach = null; ride.queuePts = []; ride.chain = new Set(); ride.exitTile = null;
  if (ride.kind === 'coaster') {
    if (ride.entrance != null) {
      const E = ride.entrance, pts = [cellCenter(E)], visited = new Set([E]), chain: number[] = [];
      let cur = E;
      for (let k = 0; k < 80; k++) {
        const nb = neighbors(cur).filter((c) => !visited.has(c) && m.path[c] > 0);
        let nxt = nb.find((c) => m.path[c] === 2);
        if (nxt === undefined) { if (k === 0 && nb.length) nxt = nb[0]; else break; }
        visited.add(nxt); chain.push(nxt); pts.push(cellCenter(nxt));
        if (m.path[nxt] !== 2) break;
        cur = nxt;
      }
      if (chain.length) { ride.approach = chain[chain.length - 1]; ride.queuePts = pts; ride.chain = new Set(chain); }
      else ride.queuePts = pts;
    }
    if (ride.exit != null) {
      const nb = neighbors(ride.exit).filter((c) => m.path[c] > 0);
      ride.exitTile = nb.find((c) => m.path[c] === 1) ?? nb[0] ?? null;
    }
  } else {
    const src: number[] = [];
    const cells = footprint(ride);
    for (const c of cells) for (const nb of neighbors(c)) if (m.path[nb] === 1 && !src.includes(nb)) src.push(nb);
    ride.src = src; ride.srcSet = new Set(src);
    ride.approach = src.length ? src[0] : null;
    ride.queuePts = src.length ? [cellCenter(src[0])] : [];
    ride.exitTile = ride.approach;
  }
}

export function footprint(ride: any): number[] {
  const out: number[] = [];
  const w = ride.w || 1, h = ride.h2 || 1;
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) out.push(idx(ride.x + dx, ride.y + dy));
  return out;
}

/** BFS distance field over the footpath network. */
export function getField(key: string, sources: number[], chain: Set<number> | null) {
  const f = G.fields.get(key);
  if (f && f.ver === G.pathVer) return f.d as Int16Array;
  const m = G.map, d = new Int16Array(MAP * MAP).fill(-1);
  const q: number[] = [];
  for (const s of sources) if (s != null && m.path[s] > 0) { d[s] = 0; q.push(s); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    for (const nb of neighbors(c)) {
      if (d[nb] >= 0) continue;
      const p = m.path[nb];
      if (p === 1 || (p === 2 && chain && chain.has(nb))) { d[nb] = d[c] + 1; q.push(nb); }
    }
  }
  G.fields.set(key, { d, ver: G.pathVer });
  return d;
}

// ---------------- building ----------------
const REMOVABLE = ['tree', 'bush', 'flower'];
function trackLow(i: number, limit = 24) {
  const oc = G.map.occ[i];
  return oc && oc.some((e: any) => e.z0 < limit);
}
export function freeCell(x: number, y: number) {
  if (x < 1 || y < 1 || x > MAP - 2 || y > MAP - 2) return false;
  const i = idx(x, y), m = G.map;
  return m.ground[i] !== 1 && !m.obj[i] && !m.path[i] && !trackLow(i, 70);
}

export function placePath(x: number, y: number, type: number): string | null {
  if (x < 1 || y < 1 || x > MAP - 2 || y > MAP - 2) return 'Out of bounds';
  const m = G.map, i = idx(x, y);
  if (m.ground[i] === 1) return "Can't build on water";
  const ob = m.obj[i];
  if (ob && !REMOVABLE.includes(ob.t)) return 'Something is in the way';
  if (trackLow(i)) return 'Track is in the way';
  if (m.path[i] === type) return 'ALREADY_EXISTS';
  const c = COST[type === 1 ? 'path' : 'queue'];
  if (G.cash < c) return 'Not enough cash';
  spend(c, 'construction');
  m.path[i] = type; m.obj[i] = null;
  pathChanged();
  return null;
}

export function placeScenery(kind: string, x: number, y: number): string | null {
  const m = G.map;
  if (x < 1 || y < 1 || x > MAP - 2 || y > MAP - 2) return 'Out of bounds';
  const i = idx(x, y);
  const c = COST[kind];
  if (kind === 'bench' || kind === 'lamp' || kind === 'bin') {
    if (!m.path[i]) return 'Must be placed on a footpath';
    if (m.furn[i]) return 'Already something here';
    if (G.cash < c) return 'Not enough cash';
    spend(c, 'construction'); m.furn[i] = { t: kind, v: rint2(i) };
    return null;
  }
  if (!freeCell(x, y)) return 'Cannot build here';
  if (G.cash < c) return 'Not enough cash';
  spend(c, 'construction');
  if (kind.startsWith('tree')) m.obj[i] = { t: 'tree', v: +kind.slice(4) - 1 };
  else m.obj[i] = { t: kind, v: rint2(i) };
  return null;
}
const rint2 = (i: number) => Math.floor(hash2(i, 7) * 3);

function adjacentPath(cells: number[]) {
  for (const c of cells) for (const nb of neighbors(c)) if (G.map.path[nb] === 1) return true;
  return false;
}

export function placeShop(kind: string, x: number, y: number): string | null {
  if (!freeCell(x, y)) return 'Cannot build here';
  const i = idx(x, y);
  if (!adjacentPath([i])) return 'Shops must be built next to a footpath';
  if (G.cash < COST[kind]) return 'Not enough cash';
  spend(COST[kind], 'construction');
  const d = SHOPS[kind];
  const ride: any = { id: G.nextId++, kind: 'shop', sub: kind, name: d.name, x, y, w: 1, h2: 1, status: 'open', price: d.price, queue: [], customers: 0, income: 0, spent: COST[kind], refused: { int: 0, price: 0, queue: 0, nau: 0 }, age: 0 };
  G.rides.push(ride);
  G.map.obj[i] = { t: 'shop', ride };
  computeQueue(ride); G.pathVer++; G.fields.clear();
  return null;
}

export function placeFlat(kind: string, x: number, y: number): string | null {
  const cells = [idx(x, y), idx(x + 1, y), idx(x, y + 1), idx(x + 1, y + 1)];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (!freeCell(x + dx, y + dy)) return 'Cannot build here';
  if (!adjacentPath(cells)) return 'Rides must be built next to a footpath';
  if (G.cash < COST[kind]) return 'Not enough cash';
  spend(COST[kind], 'construction');
  const d = FLATS[kind];
  const ride: any = { id: G.nextId++, kind: 'flat', sub: kind, name: d.name, x, y, w: 2, h2: 2, status: 'open', ratings: { exc: d.exc, inten: d.inten, nau: d.nau, excRaw: d.exc, pen: 0, value: Math.round((d.exc * 0.9 + d.inten * 0.3 + d.nau * 0.1) * 10) / 10, bands: [0, 0, 0] }, price: d.price, cap: 8, cycle: d.cycle, queue: [], customers: 0, income: 0, spent: COST[kind], refused: { int: 0, price: 0, queue: 0, nau: 0 }, age: 0, anim: 0 };
  ride.ratings.bands = [bandOf(ride.ratings.exc), bandOf(ride.ratings.inten), bandOf(ride.ratings.nau)];
  G.rides.push(ride);
  for (const c of cells) G.map.obj[c] = { t: 'flat', ride, main: c === cells[0] };
  computeQueue(ride); G.pathVer++; G.fields.clear();
  return null;
}
const bandOf = (r: number) => Math.min(5, Math.round(r * 100) >> 8);


// Placement validation helpers (for ghost preview)
export function getPathBlockReason(x: number, y: number, type: number): string | null {
  if (x < 1 || y < 1 || x > MAP - 2 || y > MAP - 2) return 'Out of bounds';
  const m = G.map, i = idx(x, y);
  if (m.ground[i] === 1) return "Can't build on water";
  const ob = m.obj[i];
  if (ob && !REMOVABLE.includes(ob.t)) return 'Something is in the way';
  if (trackLow(i)) return 'Track is in the way';
  if (m.path[i] === type) return 'ALREADY_EXISTS';
  const c = COST[type === 1 ? 'path' : 'queue'];
  if (G.cash < c) return 'Not enough cash';
  return null;
}

export function getSceneryBlockReason(kind: string, x: number, y: number): string | null {
  if (x < 1 || y < 1 || x > MAP - 2 || y > MAP - 2) return 'Out of bounds';
  const m = G.map, i = idx(x, y);
  const c = COST[kind];
  if (kind === 'bench' || kind === 'lamp' || kind === 'bin') {
    if (!m.path[i]) return 'Must be placed on a footpath';
    if (m.furn[i]) return 'Already something here';
    if (G.cash < c) return 'Not enough cash';
    return null;
  }
  if (!freeCell(x, y)) return 'Cannot build here';
  if (G.cash < c) return 'Not enough cash';
  return null;
}

export function getShopBlockReason(kind: string, x: number, y: number): string | null {
  if (!freeCell(x, y)) return 'Cannot build here';
  const i = idx(x, y);
  if (!adjacentPath([i])) return 'Shops must be built next to a footpath';
  if (G.cash < COST[kind]) return 'Not enough cash';
  return null;
}

export function getFlatBlockReason(kind: string, x: number, y: number): string | null {
  const cells = [idx(x, y), idx(x + 1, y), idx(x, y + 1), idx(x + 1, y + 1)];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (!freeCell(x + dx, y + dy)) return 'Cannot build here';
  if (!adjacentPath(cells)) return 'Rides must be built next to a footpath';
  if (G.cash < COST[kind]) return 'Not enough cash';
  return null;
}

export function getCoasterBlockReason(sub: string, x: number, y: number): string | null {
  if (G.cash < COASTER_COST) return 'Not enough cash';
  return null;
}

export function createCoaster(sub: string, x: number, y: number, h: number): { ride?: any; err?: string } {
  if (x < 2 || y < 2 || x > MAP - 3 || y > MAP - 3) return { err: 'Too close to the edge of the park' };
  const n = G.rides.filter((r: any) => r.kind === 'coaster').length + 1;
  const ride: any = {
    id: G.nextId++, kind: 'coaster', sub, name: (sub === 'steel' ? 'Steel Coaster ' : 'Wooden Coaster ') + n, cx: x, cy: y, h, z0: 16, side: -1, pieces: [], trains: 1, status: 'building', step: 0,
    sel: { turn: 0, pitch: 0, bank: false, lift: false, cover: false }, price: 0, queue: [], queuePts: [], cap: SEATS, customers: 0, income: 0, spent: 0,
    color: COASTER_COLORS[(n - 1) % COASTER_COLORS.length], testSpeed: 3, refused: { int: 0, price: 0, queue: 0, nau: 0 }, age: 0, x, y,
  };
  const st = [0, 1, 2].map(() => newPiece({ station: true }));
  rebuild(ride);
  const err = appendPieces(ride, st);
  if (err) { releaseTrack(ride); return { err }; }
  // all entrance cells must exist
  if (ride.entrance == null || ride.exit == null) {
    releaseTrack(ride);
    earn(ride.spent || 0, 'construction', true);
    return { err: 'Station entrance/exit needs free ground beside the station' };
  }
  G.rides.push(ride);
  computeQueue(ride);
  return { ride };
}

export function removeRide(ride: any) {
  const m = G.map;
  G.hooks.dismissRiders && G.hooks.dismissRiders(ride);
  for (const g of ride.queue.slice()) { g.state = 'walk'; g.intent = null; }
  ride.queue.length = 0;
  if (ride.kind === 'coaster') { releaseTrack(ride); ride.sim = null; }
  else for (const c of footprint(ride)) if (m.obj[c] && m.obj[c].ride === ride) m.obj[c] = null;
  G.rides = G.rides.filter((r: any) => r !== ride);
  earn(Math.round((ride.spent || 0) * 0.5), 'construction', true);
  if (G.selected === ride) G.selected = null;
  pathChanged();
}

export function bulldoze(x: number, y: number): string | null {
  const m = G.map;
  if (!inb(x, y)) return null;
  const i = idx(x, y);
  const ob = m.obj[i];
  if (ob && (ob.t === 'shop' || ob.t === 'flat' || ob.t === 'entr' || ob.t === 'exit')) { removeRide(ob.ride); return null; }
  if (ob && ob.t === 'gate') return "Can't remove the park entrance";
  if (ob) { m.obj[i] = null; G.groundDirty = true; return null; }
  if (m.furn[i]) { m.furn[i] = null; return null; }
  if (m.litter[i]) { m.litter[i] = 0; return null; }
  if (i === G.gatePath) return "Can't remove the entrance footpath";
  if (m.path[i]) { m.path[i] = 0; pathChanged(); return null; }
  const oc = m.occ[i];
  if (oc && oc.length) { removeRide(oc[0].ride); return null; }
  return null;
}

export function rideAt(x: number, y: number) {
  if (!inb(x, y)) return null;
  const i = idx(x, y), ob = G.map.obj[i];
  if (ob && ob.ride) return ob.ride;
  const oc = G.map.occ[i];
  if (oc && oc.length) return oc[0].ride;
  return null;
}

// ---------------- staff ----------------
export function hire(type: string) {
  const [gx, gy] = cellCenter(G.gatePath);
  G.staff.push({ id: G.nextId++, type, x: gx, y: gy, cx: G.gatePath % MAP, cy: (G.gatePath / MAP) | 0, nx: G.gatePath % MAP, ny: (G.gatePath / MAP) | 0, tx: gx, ty: gy, px: -1, py: -1, timer: 0, job: null, speed: 22 });
  toast('Hired a ' + STAFF[type].name + ' (' + STAFF[type].wage + '/month)', 'info');
}
export function fire(type: string) {
  const k = G.staff.findIndex((s: any) => s.type === type);
  if (k >= 0) G.staff.splice(k, 1);
}

// ---------------- finance & park rating ----------------
export function runningCost(r: any) {
  if (r.kind === 'coaster') return (r.status === 'open' ? 1 : 0.25) * (18 + 1.4 * r.pieces.length + 10 * r.trains);
  if (r.kind === 'flat') return 45;
  return 22;
}
export function monthlyWages() { return G.staff.reduce((a: number, s: any) => a + STAFF[s.type].wage, 0); }

function monthEnd() {
  const interest = Math.round(G.loan * 0.10 / 12);
  const wages = monthlyWages();
  const run = Math.round(G.rides.reduce((a: number, r: any) => a + runningCost(r), 0));
  if (wages) spend(wages, 'wages');
  if (run) spend(run, 'running');
  if (interest) spend(interest, 'interest');
  const cur = G.fin.cur;
  const inc = Object.values(cur.inc).reduce((a: any, b: any) => a + b, 0) as number;
  const exp = Object.values(cur.exp).reduce((a: any, b: any) => a + b, 0) as number;
  const mo = Math.floor(G.day / 30);
  G.fin.hist.push({ label: MONTHS[(mo - 1 + 80) % 8] + ' Y' + (Math.floor((mo - 1) / 8) + 1), inc: cur.inc, exp: cur.exp, profit: inc - exp });
  if (G.fin.hist.length > 12) G.fin.hist.shift();
  G.fin.cur = { inc: {}, exp: {} };
  toast('Month closed: profit ' + (inc - exp >= 0 ? '+' : '') + Math.round(inc - exp), inc - exp >= 0 ? 'good' : 'bad');
}

export function computeParkRating() {
  const n = G.guests.length;
  const happy = n ? G.guests.filter((g: any) => g.happiness >= 150).length / n : 0.6;
  const open = G.rides.filter((r: any) => (r.kind === 'coaster' || r.kind === 'flat') && r.status === 'open' && r.ratings);
  let ridePart = 0, avgE = 0, avgI = 0;
  if (open.length) {
    avgE = open.reduce((a: number, r: any) => a + r.ratings.exc, 0) / open.length;
    avgI = open.reduce((a: number, r: any) => a + r.ratings.inten, 0) / open.length;
    // prefers average excitement ~3.68 and intensity ~5.20, not maximums
    const es = Math.max(0, 1 - Math.abs(avgE - 3.68) / 4.5), is = Math.max(0, 1 - Math.abs(avgI - 5.2) / 5.5);
    ridePart = 300 * (0.55 * es + 0.45 * is) * Math.min(1, 0.4 + 0.15 * open.length);
  }
  const happyPart = 250 * happy;
  const guestPart = Math.min(n, 300) / 3;
  let litter = 0, paths = 0;
  const m = G.map;
  for (let i = 0; i < m.path.length; i++) { if (m.path[i]) { paths++; litter += m.litter[i]; } }
  const litterPen = Math.min(150, litter * 3);
  const crowd = n / Math.max(1, paths);
  const crowdPen = Math.min(100, Math.max(0, crowd - 2) * 40);
  const target = clamp(430 + happyPart + ridePart + guestPart - litterPen - crowdPen, 0, 999);
  G.ratingParts = { base: 430, happy: Math.round(happyPart), rides: Math.round(ridePart), guests: Math.round(guestPart), litter: -Math.round(litterPen), crowd: -Math.round(crowdPen), avgE, avgI, target: Math.round(target), n };
  return target;
}

function dayTick() {
  G.day++;
  if (G.rating !== undefined) delete G.rating;
  if (G.parkRating < 700) G.daysBelow++; else G.daysBelow = 0;
  G.ratingHist.push(Math.round(G.parkRating));
  if (G.ratingHist.length > 90) G.ratingHist.shift();
  if (G.daysBelow === 10) toast('Park rating has been under 700 for 10 days! The park will close at 29.', 'bad');
  if (G.daysBelow >= 29 && !G.closed) {
    G.closed = true;
    toast('The park has been closed: rating under 700 for 29 consecutive days', 'bad');
    beep(90, 0.8, 'sawtooth', 0.06);
  }
  if (G.day % 30 === 0) monthEnd();
  // breakdowns
  for (const r of G.rides) {
    r.age++;
    if ((r.kind === 'coaster' || r.kind === 'flat') && r.status === 'open' && !r.broken && Math.random() < 0.025 + Math.min(0.04, r.age / 3000)) {
      r.broken = true; r.brokenT = 0;
      toast(r.name + ' has broken down!', 'bad');
    }
  }
}

export function tickWorld(dtReal: number, updateGuests: (dt: number) => void, updateStaff: (dt: number) => void) {
  if (G.closed || G.paused) return;
  if (G.ratingParts.base === undefined) computeParkRating();
  let dt = dtReal * G.speed;
  const step = 1 / 20;
  while (dt > 0) {
    const d = Math.min(step, dt); dt -= d;
    G.time += d;
    G.dayT += d; G.halfT += d;
    if (G.halfT >= DAY_SEC / 2) {
      G.halfT -= DAY_SEC / 2;
      const target = computeParkRating();
      G.parkRating = clamp(G.parkRating + clamp(target - G.parkRating, -9, 9), 0, 999);
    }
    if (G.dayT >= DAY_SEC) { G.dayT -= DAY_SEC; dayTick(); }
    for (const r of G.rides) {
      if (r.broken) { r.brokenT += d; if (r.brokenT > 55 && !G.staff.some((s: any) => s.type === 'mechanic')) { r.broken = false; toast(r.name + ' was repaired', 'info'); } }
    }
    updateGuests(d); updateStaff(d);
  }
}
export function tickRides(dtReal: number) {
  if (G.closed || G.paused) return;
  const dt = dtReal * G.speed;
  for (const r of G.rides) if (r.kind !== 'shop') stepRide(r, dt);
}

export function setLoan(delta: number) {
  const nl = clamp(G.loan + delta, 0, G.maxLoan);
  const d = nl - G.loan;
  if (d < 0 && G.cash < -d) return;
  G.loan = nl; G.cash += d;
}

export function closeRide(r: any) { stopOperation(r, 'tested'); }

// ---------------- starter park ----------------
function buildStarter() {
  const m = G.map;
  const water = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy < 1) m.ground[idx(x, y)] = 1;
    }
  };
  water(24, 22, 5.6, 3.6); water(9, 38, 4, 3); water(41, 38, 3.2, 2.6);
  for (let y = 1; y < MAP - 1; y++) for (let x = 1; x < MAP - 1; x++) {
    const i = idx(x, y);
    if (m.ground[i] === 1) continue;
    for (const nb of neighbors(i)) if (m.ground[nb] === 1) { m.ground[i] = 2; break; }
  }
  const P = (x: number, y: number, t = 1) => { m.path[idx(x, y)] = t; m.ground[idx(x, y)] = 0; };
  for (let y = 31; y <= 45; y++) P(24, y);
  for (let x = 14; x <= 34; x++) { P(x, 14); P(x, 30); }
  for (let y = 14; y <= 30; y++) { P(14, y); P(34, y); }
  P(34, 13); P(34, 12);
  for (let x = 35; x <= 38; x++) P(x, 12, 2);
  for (let x = 35; x <= 38; x++) P(x, 14, 1);
  // gate
  m.obj[G.gateIdx] = { t: 'gate' };
  // starter coaster: station -> lift -> drop -> banked sweepers -> two hills -> brakes -> station
  const ride: any = {
    id: G.nextId++, kind: 'coaster', sub: 'steel', name: 'Mini Steel Coaster', cx: 40, cy: 12, h: 1, z0: 16, side: -1, pieces: [], trains: 1, status: 'building', step: 0,
    sel: { turn: 0, pitch: 0, bank: false, lift: false, cover: false }, price: 0, queue: [], queuePts: [], cap: SEATS, customers: 0, income: 0, spent: 1200,
    color: COASTER_COLORS[0], testSpeed: 3, refused: { int: 0, price: 0, queue: 0, nau: 0 }, age: 0, x: 40, y: 12,
  };
  const S = (o: any) => ride.pieces.push(newPiece(o));
  for (let k = 0; k < 3; k++) S({ station: true });
  S({ a: 0, b: 1, lift: true }); S({ a: 1, b: 1, lift: true }); S({ a: 1, b: 1, lift: true }); S({ a: 1, b: 0, lift: true });
  S({});
  S({ a: 0, b: -1 }); S({ a: -1, b: -1 }); S({ a: -1, b: -1 }); S({ a: -1, b: 0 });
  S({ kind: 'turnL', dir: 1, bank: true });
  S({});
  S({ kind: 'turnL', dir: 1, bank: true });
  for (let k = 0; k < 2; k++) { S({ a: 0, b: 1 }); S({ a: 1, b: 0 }); S({ a: 0, b: -1 }); S({ a: -1, b: 0 }); }
  for (let k = 0; k < 4; k++) S({});
  S({ kind: 'turnS', dir: 1 });
  S({});
  S({ brake: true }); S({ brake: true });
  S({ kind: 'turnS', dir: 1 });
  G.rides.push(ride);
  rebuild(ride);
  // inside-the-loop decoration + scatter scenery
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const i = idx(x, y);
    if (m.ground[i] === 1 || m.path[i] || m.obj[i] || m.occ[i]) continue;
    const dg = Math.abs(x - 24) + Math.abs(y - 46);
    if (dg < 4) continue;
    if (ride.entrance != null && Math.abs(i % MAP - ride.entrance % MAP) + Math.abs(((i / MAP) | 0) - ((ride.entrance / MAP) | 0)) < 2) continue;
    if (ride.exit != null && Math.abs(i % MAP - ride.exit % MAP) + Math.abs(((i / MAP) | 0) - ((ride.exit / MAP) | 0)) < 2) continue;
    const h = hash2(x, y), border = x < 5 || y < 4 || x > MAP - 6 || y > MAP - 5;
    let nearPath = false, nearWater = false;
    for (const nb of neighbors(i)) { if (m.path[nb]) nearPath = true; if (m.ground[nb] === 1) nearWater = true; }
    if (x >= 25 && x <= 36 && y >= 31 && y <= 38) continue; // plaza
    if (border && h < 0.38) m.obj[i] = { t: 'tree', v: Math.floor(hash2(y, x) * 3) };
    else if (nearWater && h < 0.2) m.obj[i] = { t: 'tree', v: 0 };
    else if (h < 0.05) m.obj[i] = { t: 'tree', v: Math.floor(hash2(y + 3, x) * 3) };
    else if (nearPath && h < 0.09) m.obj[i] = { t: 'flower', v: Math.floor(hash2(x, y + 9) * 3) };
    else if (h < 0.115) m.obj[i] = { t: 'bush', v: Math.floor(hash2(x + 5, y) * 3) };
  }
  // furniture
  for (const [x, y, t] of [[24, 33, 'lamp'], [24, 36, 'bench'], [24, 39, 'lamp'], [24, 42, 'bin'], [24, 44, 'lamp'], [20, 30, 'lamp'], [28, 30, 'bench'], [14, 22, 'bench'], [34, 22, 'lamp'], [20, 14, 'bin'], [30, 14, 'lamp'], [14, 18, 'lamp'], [34, 26, 'bench']] as any[]) m.furn[idx(x, y)] = { t, v: 0 };
  // attractions around the plaza
  const sh = (k: string, x: number, y: number) => { placeShopFree(k, x, y); };
  sh('burger', 25, 34); sh('drink', 23, 37); sh('toilet', 25, 41); sh('info', 23, 43); sh('drink', 20, 13);
  placeFlatFree('carousel', 29, 31); placeFlatFree('ferris', 17, 31);
  G.pathVer++; G.fields.clear();
}
function placeShopFree(kind: string, x: number, y: number) {
  const m = G.map, d = SHOPS[kind];
  m.obj[idx(x, y)] = null;
  const ride: any = { id: G.nextId++, kind: 'shop', sub: kind, name: d.name, x, y, w: 1, h2: 1, status: 'open', price: d.price, queue: [], customers: 0, income: 0, spent: COST[kind], refused: { int: 0, price: 0, queue: 0, nau: 0 }, age: 0 };
  G.rides.push(ride); m.obj[idx(x, y)] = { t: 'shop', ride };
}
function placeFlatFree(kind: string, x: number, y: number) {
  const m = G.map, d = FLATS[kind];
  const cells = [idx(x, y), idx(x + 1, y), idx(x, y + 1), idx(x + 1, y + 1)];
  const value = Math.round((d.exc * 0.9 + d.inten * 0.3 + d.nau * 0.1) * 10) / 10;
  const ride: any = { id: G.nextId++, kind: 'flat', sub: kind, name: d.name, x, y, w: 2, h2: 2, status: 'open', ratings: { exc: d.exc, inten: d.inten, nau: d.nau, excRaw: d.exc, pen: 0, value, bands: [bandOf(d.exc), bandOf(d.inten), bandOf(d.nau)] }, price: d.price, cap: 8, cycle: d.cycle, queue: [], customers: 0, income: 0, spent: COST[kind], refused: { int: 0, price: 0, queue: 0, nau: 0 }, age: 0, anim: 0 };
  G.rides.push(ride);
  for (const c of cells) m.obj[c] = { t: 'flat', ride, main: c === cells[0] };
}

export { DIRS, rightDir, stationCount };
