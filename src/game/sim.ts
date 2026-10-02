// Ride physics, test runs, crash conditions and the Excitement / Intensity / Nausea ratings.
import { G, GRAV, mphOf, applyPenalty, bandIndex, toast, beep, inb, idx } from './core';
import { frameAt, blockInfo, CARS, CAR_SP, TRAIN_LEN, SEATS, F_LIFT, F_BRAKE, F_BLOCK, F_COVER } from './track';

export const LIFT_V = 14, BRAKE_V = 11, DRAG = 0.0005, FRIC = 0.35;
const SUBDT = 1 / 120;

function newStats() {
  return { time: 0, maxV: 0, sumV: 0, maxVert: 1, minVert: 1, maxLat: 0, maxLong: 0, air: 0, inversions: 0, inv: false, drops: [] as number[], down: false, dropTop: 0, started: false };
}

function newSim(ride: any, mode: string) {
  const bi = blockInfo(ride);
  const sim: any = { mode, bi, trains: [], t: 0, nextId: 0, fr: {}, fr2: {}, stats: newStats(), fail: null, effects: [], dwell: mode === 'test' ? 3 : 8, live: { v: 0, vert: 1, lat: 0, lon: 0, maxV: 0 } };
  ride.sim = sim;
  spawnTrain(ride);
  return sim;
}

function spawnTrain(ride: any) {
  const sim = ride.sim;
  sim.trains.push({ id: sim.nextId++, s: sim.bi.stopS, v: 0, state: 'dwell', timer: sim.dwell, phase: 'in', lap: 0, guests: new Array(SEATS).fill(null), boarded: false, began: false, done: false });
}

export function startTest(ride: any) {
  ride.status = 'testing';
  ride.ratings = null; ride.failMsg = '';
  newSim(ride, 'test');
}
export function startOperation(ride: any) {
  ride.status = 'open';
  newSim(ride, 'run');
}
export function stopOperation(ride: any, status = 'closed') {
  G.hooks.dismissRiders && G.hooks.dismissRiders(ride);
  ride.sim = null; ride.status = status;
}

const circ = (a: number, b: number, L: number) => ((a - b + L * 1.5) % L) - L / 2;
function blockOf(ends: number[], s: number, L: number) {
  s = ((s % L) + L) % L;
  for (let i = 0; i < ends.length; i++) if (s <= ends[i]) return i;
  return 0;
}
function occupied(sim: any, k: number, except: any, L: number) {
  for (const o of sim.trains) {
    if (o === except || o.state === 'crash') continue;
    if (blockOf(sim.bi.ends, o.s, L) === k || blockOf(sim.bi.ends, o.s - TRAIN_LEN, L) === k) return true;
  }
  return false;
}

function crash(ride: any, tr: any, msg: string) {
  const sim = ride.sim;
  if (sim.fail) return;
  sim.fail = msg;
  tr.state = 'crash';
  const fr = frameAt(ride.track, tr.s, {});
  sim.effects.push({ x: fr.x, y: fr.y, z: fr.z, t: 0 });
  for (const t of sim.trains) if (t.state !== 'crash' && msg.startsWith('Collision')) t.state = 'crash';
  ride.failMsg = msg;
  const wasRun = sim.mode === 'run';
  ride.status = 'crashed';
  G.hooks.dismissRiders && G.hooks.dismissRiders(ride, true);
  toast(ride.name + ': ' + msg, 'bad');
  beep(120, 0.4, 'sawtooth', 0.05);
  if (wasRun) G.stats.crashes++;
}

function stepTrain(ride: any, tr: any, dt: number) {
  const sim = ride.sim, T = ride.track, L = T.L, bi = sim.bi, fr = sim.fr;
  if (tr.state === 'crash') return;
  if (tr.state === 'dwell') {
    tr.v = 0;
    if (!tr.began) {
      tr.began = true;
      G.hooks.unloadTrain(ride, tr);
      if (sim.mode === 'test' && tr.lap >= 1) tr.done = true;
    }
    tr.timer -= dt;
    if (sim.mode === 'run' && !tr.boarded && tr.timer <= sim.dwell - 2) { G.hooks.boardTrain(ride, tr); tr.boarded = true; }
    if (tr.timer <= 0 && !tr.done && !ride.broken) {
      if (bi.ends.length > 1 && occupied(sim, 1, tr, L)) return;
      tr.state = 'run'; tr.phase = 'out'; tr.began = false; tr.boarded = false;
    }
    return;
  }
  if (tr.state === 'hold') {
    const br = bi.brakes.find((b: any) => tr.s >= b.s0 - 1 && tr.s <= b.s1 + 1);
    const nxt = br ? (br.k + 1) % bi.ends.length : 1;
    if (!occupied(sim, nxt, tr, L)) { tr.state = 'run'; tr.v = BRAKE_V * 0.9; }
    else return;
  }
  // ---- running ----
  let gsum = 0, onLift = false, onBrake = false, blockF = false;
  for (let k = 0; k < CARS; k++) {
    frameAt(T, tr.s - k * CAR_SP, fr);
    gsum += -GRAV * fr.tz;
    if (fr.flag & F_LIFT) onLift = true;
    if (k === 0) { onBrake = !!(fr.flag & F_BRAKE); blockF = !!(fr.flag & F_BLOCK); }
  }
  const vOld = tr.v;
  let a = gsum / CARS - DRAG * tr.v * Math.abs(tr.v) - FRIC * Math.sign(tr.v);
  if (onLift && tr.v < LIFT_V) { tr.v = Math.min(LIFT_V, tr.v + 40 * dt); a = 0; }
  if (tr.phase === 'out' && tr.s < bi.ends[0] && tr.v < 12) { tr.v += 25 * dt; }
  tr.v += a * dt;
  if (onBrake) {
    if (blockF) {
      const br = bi.brakes.find((b: any) => tr.s >= b.s0 && tr.s <= b.s1);
      if (br) {
        const nxt = (br.k + 1) % bi.ends.length;
        if (occupied(sim, nxt, tr, L)) {
          const dh = br.s1 - 2.5 - tr.s;
          if (dh <= 0.05 && tr.v < 8) { tr.v = 0; tr.state = 'hold'; tr.s = Math.max(tr.s, br.s1 - 2.5); }
          else { const cap = Math.sqrt(2 * 45 * Math.max(dh, 0)); if (tr.v > cap) tr.v = Math.max(cap, tr.v - 70 * dt); if (tr.v < 2 && dh > 0.05) tr.v = 2; }
        } else if (tr.v > BRAKE_V) tr.v = Math.max(BRAKE_V, tr.v - 45 * dt);
      }
    } else if (tr.v > BRAKE_V) tr.v = Math.max(BRAKE_V, tr.v - 30 * dt);
  }
  if (onLift && tr.v < LIFT_V && tr.v >= 0) tr.v = LIFT_V;
  // station arrival
  if (tr.phase === 'in') {
    const dh = bi.stopS - tr.s;
    if (tr.s <= bi.stopS + 1 && tr.v > 0) {
      if (dh <= 0.4) { tr.v = 0; tr.s = Math.min(tr.s, bi.stopS); tr.state = 'dwell'; tr.timer = sim.dwell; tr.began = false; return; }
      const vt = Math.sqrt(2 * 8 * Math.max(dh, 0.3));
      if (tr.v > vt) tr.v = Math.max(vt, tr.v - 80 * dt);
      if (tr.v < 3) tr.v = 3;
    } else if (tr.s > bi.stopS + 1) {
      tr.v = Math.max(0, tr.v - 60 * dt);
      if (tr.v <= 0.05) { tr.state = 'dwell'; tr.timer = sim.dwell; tr.began = false; tr.v = 0; return; }
      if (tr.s > bi.ends[0] + 40) { crash(ride, tr, 'Train overran the station — add brakes before the station'); return; }
    }
  }
  tr.s += tr.v * dt;
  if (tr.s >= L) { tr.s -= L; tr.lap++; tr.phase = 'in'; }
  else if (tr.s < 0) tr.s += L;
  const aT = (tr.v - vOld) / dt;
  // rollback
  if (tr.v < -0.4 && !onLift) {
    const f0 = frameAt(T, tr.s, sim.fr2);
    sim.effects.push({ x: f0.x, y: f0.y, z: f0.z, t: 0, kind: 'roll' });
    sim.fail = 'Train rolled back — it could not cross the hill at piece ' + (f0.pc + 1);
    ride.failMsg = sim.fail; tr.state = 'crash';
    ride.status = 'crashed';
    toast(ride.name + ': ' + sim.fail, 'bad');
    G.hooks.dismissRiders && G.hooks.dismissRiders(ride, true);
    return;
  }
  // G-forces at the second car
  const f2 = frameAt(T, tr.s - CAR_SP, sim.fr2);
  const v2 = tr.v * tr.v;
  const px = v2 * f2.kx, py = v2 * f2.ky, pz = v2 * f2.kz + GRAV;
  const vert = (px * f2.ux + py * f2.uy + pz * f2.uz) / GRAV;
  const lat = Math.abs(px * f2.rx + py * f2.ry + pz * f2.rz) / GRAV;
  const lon = (aT + GRAV * f2.tz) / GRAV;
  if (tr.id === 0) { const lv = sim.live; lv.v = tr.v; lv.vert = vert; lv.lat = lat; lv.lon = lon; if (tr.v > lv.maxV) lv.maxV = tr.v; }
  // derailment: only trains WITHOUT upstop wheels, on UNCOVERED track
  const upstop = ride.sub === 'steel';
  if (!upstop && !(f2.flag & F_COVER) && tr.v > 5 && (lat > 1.5 || vert < -0.4)) {
    crash(ride, tr, 'Derailed — ' + (lat > 1.5 ? 'lateral ' + lat.toFixed(2) + 'G' : 'vertical ' + vert.toFixed(2) + 'G') + ' on a train without upstop wheels (piece ' + (f2.pc + 1) + ')');
    return;
  }
  // stats from train 0, first lap
  if (tr.id === 0 && tr.lap === 0 && tr.phase === 'out') {
    const st = sim.stats;
    st.started = true; st.time += dt; st.sumV += tr.v * dt;
    if (tr.v > st.maxV) st.maxV = tr.v;
    if (tr.v > 3) {
      if (vert > st.maxVert) st.maxVert = vert;
      if (vert < st.minVert) st.minVert = vert;
      if (lat > st.maxLat) st.maxLat = lat;
      if (Math.abs(lon) > st.maxLong && !onLift) st.maxLong = Math.abs(lon);
      if (vert < 0.05) st.air += dt;
    }
    const inv = f2.uz < -0.15;
    if (inv && !st.inv) st.inversions++;
    st.inv = inv;
    // drops
    const z = f2.z;
    if (f2.tz < -0.25) { if (!st.down) { st.down = true; st.dropTop = z; } }
    else if (f2.tz > -0.1 && st.down) { st.down = false; const h = st.dropTop - z; if (h >= 16) st.drops.push(h); }
  }
}

export function stepRide(ride: any, dtIn: number) {
  if (ride.kind === 'flat') return stepFlat(ride, dtIn);
  const sim = ride.sim;
  if (sim) for (const e of sim.effects) e.t += dtIn;
  if (!sim || !ride.track || (ride.status !== 'testing' && ride.status !== 'open')) return;
  const speed = ride.status === 'testing' ? (ride.testSpeed || 3) : 1;
  let rem = dtIn * speed;
  let guard = 0;
  while (rem > 1e-6 && guard++ < 600) {
    const dt = Math.min(SUBDT, rem); rem -= dt;
    sim.t += dt;
    if (sim.trains.length < ride.trains) {
      const L = ride.track.L;
      if (sim.trains.every((o: any) => Math.abs(circ(o.s, sim.bi.stopS, L)) > TRAIN_LEN + 18 && o.state !== 'crash')) spawnTrain(ride);
    }
    for (const tr of sim.trains) { stepTrain(ride, tr, dt); if (ride.status === 'crashed') return; }
    // collisions
    const L = ride.track.L;
    for (let i = 0; i < sim.trains.length; i++) for (let j = i + 1; j < sim.trains.length; j++) {
      const A = sim.trains[i], B = sim.trains[j];
      if (A.state === 'crash' || B.state === 'crash') continue;
      if (Math.abs(circ(A.s, B.s, L)) < TRAIN_LEN - 4) { crash(ride, A, 'Collision — two trains occupied one block'); return; }
    }
    if (sim.mode === 'test') {
      if (sim.t > 900) { sim.fail = 'Test timed out'; ride.failMsg = 'Test timed out — a train got stuck'; ride.status = 'crashed'; toast(ride.failMsg, 'bad'); return; }
      if (sim.trains.length >= ride.trains && sim.trains.every((o: any) => o.done)) { finishTest(ride); return; }
    }
  }
}

// ---------- flat rides ----------
function stepFlat(ride: any, dt: number) {
  if (ride.status !== 'open') return;
  const f = ride.flat || (ride.flat = { state: 'load', timer: 6, guests: new Array(8).fill(null), began: false });
  ride.anim = (ride.anim || 0) + dt * (f.state === 'run' ? 1 : 0.15);
  if (ride.broken) return;
  f.timer -= dt;
  if (f.state === 'load') {
    if (!f.began) { f.began = true; G.hooks.unloadTrain(ride, f); G.hooks.boardTrain(ride, f); }
    if (f.timer <= 0) { G.hooks.boardTrain(ride, f); f.state = 'run'; f.timer = ride.cycle; f.began = false; }
  } else if (f.state === 'run') {
    if (f.timer <= 0) { f.state = 'load'; f.timer = 7; }
  }
}

// ---------- ratings ----------
function proximity(ride: any) {
  const T = ride.track, m = G.map;
  const scen = new Set<number>(), water = new Set<number>(), path = new Set<number>(), cross = new Set<number>();
  for (let i = 0; i < T.n; i += 4) {
    const cx = Math.floor(T.X[i] / 32), cy = Math.floor(T.Y[i] / 32), z = T.Z[i];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = cx + dx, y = cy + dy;
      if (!inb(x, y)) continue;
      const id = idx(x, y), ob = m.obj[id];
      if (ob && (ob.t === 'tree' || ob.t === 'bush' || ob.t === 'flower' || ob.t === 'shop' || ob.t === 'flat')) scen.add(id);
      if (m.furn[id]) scen.add(id);
      if (m.ground[id] === 1) water.add(id);
      if (m.path[id] && z < 48) path.add(id);
      if (dx === 0 && dy === 0 && m.occ[id]) for (const e of m.occ[id]) {
        if ((e.ride !== ride || Math.abs(e.pc - T.pc[i]) > 4) && z < e.z1 + 70 && z > e.z0 - 70) cross.add(id);
      }
    }
  }
  return { scen: scen.size, water: water.size, path: path.size, cross: cross.size };
}

export function rideValue(exc: number, inten: number, nau: number) {
  return Math.max(0.5, Math.round((exc * 0.9 + inten * 0.3 + nau * 0.1) * 10) / 10);
}

export function computeRatings(ride: any, st: any) {
  const T = ride.track, wood = ride.sub === 'wood';
  const mph = mphOf(st.maxV);
  const lenT = T.L / 32;
  const dropLv = Math.max(0, ...st.drops, 0) / 8;
  const nDrops = st.drops.filter((h: number) => h >= 24).length;
  const hel = ride.pieces.filter((p: any) => p.kind === 'helix').length / 4;
  const prox = proximity(ride);
  const covered = ride.pieces.some((p: any) => p.covered);
  const maxVert = Math.max(1, st.maxVert), minVert = Math.min(1, st.minVert);
  const inv = st.inversions, air = st.air;
  let exc = (wood ? 1.3 : 1.0)
    + (Math.min(mph, 80) / 50) * 1.1
    + (Math.min(lenT, 70) / 70) * 1.7
    + (Math.min(dropLv, 20) / 20) * 1.5 + Math.min(nDrops, 5) * 0.12
    + (Math.min(air, 10) / 10) * 1.3 * (wood ? 1.2 : 1)
    + Math.min(inv, 5) * 0.38 + Math.min(hel, 3) * 0.22
    + (Math.min(prox.scen, 40) / 40) * 0.8 + (Math.min(prox.cross, 8) / 8) * 0.5 + (Math.min(prox.water, 10) / 10) * 0.2
    + (covered ? 0.15 : 0) + (Math.min(maxVert, 4) / 4) * 0.25;
  if (lenT < 10) exc *= 0.6;
  let inten = 1.0 + Math.min(mph, 100) * 0.045 + Math.max(0, maxVert - 1) * 0.7 + Math.max(0, -minVert) * 0.9
    + Math.max(0, st.maxLat - 0.5) * 1.1 + dropLv * 0.11 + inv * 0.55 + air * 0.08 + hel * 0.15 + Math.max(0, st.maxLong - 0.5) * 0.5;
  if (wood) inten *= 0.92;
  let nau = 0.4 + mph * 0.025 + inv * 0.65 + st.maxLat * 0.5 + Math.max(0, maxVert - 1) * 0.25 + Math.max(0, -minVert) * 0.6 + hel * 0.3 + lenT * 0.015 + nDrops * 0.08;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  inten = r2(inten); nau = r2(nau);
  const excRaw = r2(exc);
  const [excP, pen] = applyPenalty(excRaw, inten);
  exc = r2(excP);
  const value = rideValue(exc, inten, nau);
  return {
    exc, inten, nau, excRaw, pen, value,
    bands: [bandIndex(exc), bandIndex(inten), bandIndex(nau)],
    info: { mph, avgMph: mphOf(st.sumV / Math.max(1, st.time)), lenTiles: lenT, dropLv, nDrops, air, maxVert, minVert, maxLat: st.maxLat, maxLong: st.maxLong, inv, hel, time: st.time, prox, upstop: !wood },
  };
}

function finishTest(ride: any) {
  const sim = ride.sim;
  const r = computeRatings(ride, sim.stats);
  ride.ratings = r;
  ride.price = Math.min(20, Math.round(r.value * 10) / 10);
  ride.status = 'tested';
  ride.step = 2;
  ride.sim = null;
  ride.testsDone = (ride.testsDone || 0) + 1;
  toast(ride.name + ' passed its test run: Excitement ' + r.exc.toFixed(2) + ', Intensity ' + r.inten.toFixed(2), 'good');
  beep(660, 0.12, 'triangle', 0.05);
}
