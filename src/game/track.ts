// Track geometry, pieces, validation. Local piece frame: f = forward, r = right (units), z = height.
import { TILE, MAP, DIRS, rightDir, G, idx, inb } from './core';

export const RISE: Record<number, number> = { [-2]: -48, [-1]: -16, 0: 0, 1: 16, 2: 48 }; // rise per 32u tile at each discrete pitch
export const PITCH_NAME: Record<number, string> = { [-2]: '60° down', [-1]: '25° down', 0: 'Level', 1: '25° up', 2: '60° up' };
export const F_LIFT = 1, F_BRAKE = 2, F_BLOCK = 4, F_STATION = 8, F_PHOTO = 16, F_COVER = 32, F_NOSUP = 64;
export const CARS = 4, CAR_SP = 14, TRAIN_LEN = 3 * CAR_SP + 10;
export const SEATS = 8;

export function newPiece(o: any) {
  return Object.assign({ kind: 'straight', dir: 0, a: 0, b: 0, bank: false, lift: false, brake: false, block: false, station: false, photo: false, covered: false, hx: 0 }, o);
}

export function pieceShape(p: any) {
  const s = p.dir || 1;
  switch (p.kind) {
    case 'turnS': return { cells: [[0, 0]], next: [0, s], dh: -s };
    case 'turnL': case 'helix': return { cells: [[0, 0], [1, 0], [1, s]], next: [1, 2 * s], dh: -s };
    case 'loop': return { cells: [[0, 0], [1, 0]], next: [2, 0], dh: 0 };
    case 'cork': return { cells: [[0, 0], [1, 0], [1, s], [2, s]], next: [3, s], dh: 0 };
    default: return { cells: [[0, 0]], next: [1, 0], dh: 0 };
  }
}

function zOf(p: any, t: number) {
  const ra = RISE[p.a], rb = RISE[p.b];
  return ra * t + ((rb - ra) * t * t) / 2;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

export function pieceParam(p: any, t: number, o: any) {
  const s = p.dir || 1;
  o.alpha = NaN; o.roll = 0;
  switch (p.kind) {
    case 'straight': o.f = 32 * t; o.r = 0; o.z = zOf(p, t); break;
    case 'turnS': {
      const th = (t * Math.PI) / 2;
      o.f = 16 * Math.sin(th); o.r = s * 16 * (1 - Math.cos(th)); o.z = zOf(p, t);
      if (p.bank) o.roll = s * 0.6 * Math.sin(Math.PI * t);
      break;
    }
    case 'turnL': case 'helix': {
      const th = (t * Math.PI) / 2;
      o.f = 48 * Math.sin(th); o.r = s * 48 * (1 - Math.cos(th)); o.z = zOf(p, t);
      if (p.kind === 'helix') {
        const bs = p.hx === 0 ? 0 : 1, be = p.hx === 3 ? 0 : 1;
        o.roll = s * 0.7 * (bs + (be - bs) * smooth(t));
      } else if (p.bank) o.roll = s * 0.78 * Math.sin(Math.PI * t);
      break;
    }
    case 'loop': {
      const th = t * 2 * Math.PI, Rr = 40, c = 64 / (2 * Math.PI);
      o.f = Rr * Math.sin(th) + c * th; o.r = 0; o.z = Rr * (1 - Math.cos(th));
      o.alpha = Math.atan2(Rr * Math.sin(th), Rr * Math.cos(th) + c);
      break;
    }
    case 'cork': {
      const rho = 2.5, env = Math.sin(Math.PI * t), ph = 2 * Math.PI * t;
      o.f = 96 * t; o.r = s * (32 * (3 * t * t - 2 * t * t * t)) + s * rho * env * Math.sin(ph);
      o.z = rho * env * (1 - Math.cos(ph)); o.roll = s * ph;
      break;
    }
  }
}

export function genPiece(p: any, st: any, pc: number) {
  const o: any = { f: 0, r: 0, z: 0, roll: 0, alpha: NaN };
  const d = DIRS[st.h], rt = rightDir(st.h);
  const ex = (st.cx + 0.5) * TILE - 16 * d[0], ey = (st.cy + 0.5) * TILE - 16 * d[1];
  const pos = (t: number) => {
    pieceParam(p, t, o);
    return [ex + o.f * d[0] + o.r * rt[0], ey + o.f * d[1] + o.r * rt[1], st.z + o.z];
  };
  let len = 0, prev = pos(0);
  for (let k = 1; k <= 40; k++) { const q = pos(k / 40); len += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]); prev = q; }
  const n = Math.max(2, Math.round(len / 4));
  const out: any[] = [];
  let flag = 0;
  if (p.lift) flag |= F_LIFT;
  if (p.brake) flag |= F_BRAKE;
  if (p.block) flag |= F_BRAKE | F_BLOCK;
  if (p.station) flag |= F_STATION;
  if (p.photo) flag |= F_PHOTO;
  if (p.covered) flag |= F_COVER;
  let zmin = 1e9, zmax = -1e9;
  for (let j = 0; j < n; j++) {
    const t = j / n;
    const p0 = pos(t);
    const roll = o.roll, alpha = o.alpha;
    const e = 1e-3;
    const pa = pos(Math.max(0, t - e)), pb = pos(Math.min(1, t + e));
    let tx = pb[0] - pa[0], ty = pb[1] - pa[1], tz = pb[2] - pa[2];
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    let Hx: number, Hy: number, al: number;
    if (!isNaN(alpha)) { Hx = d[0]; Hy = d[1]; al = alpha; }
    else { const hh = Math.hypot(tx, ty); Hx = tx / hh; Hy = ty / hh; al = Math.atan2(tz, hh); }
    const u0x = -Math.sin(al) * Hx, u0y = -Math.sin(al) * Hy, u0z = Math.cos(al);
    const lx = Hy, ly = -Hx;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    let ux = u0x * cr + lx * sr, uy = u0y * cr + ly * sr, uz = u0z * cr;
    const dt = ux * tx + uy * ty + uz * tz; ux -= dt * tx; uy -= dt * ty; uz -= dt * tz;
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const rx = ty * uz - tz * uy, ry = tz * ux - tx * uz, rz = tx * uy - ty * ux;
    let fl = flag;
    if (p.kind === 'loop' && j >= 3 && j <= n - 3) fl |= F_NOSUP;
    out.push({ x: p0[0], y: p0[1], z: p0[2], tx, ty, tz, ux, uy, uz, rx, ry, rz, flag: fl, pc });
    if (p0[2] < zmin) zmin = p0[2];
    if (p0[2] > zmax) zmax = p0[2];
  }
  const endp = pos(1);
  if (endp[2] < zmin) zmin = endp[2];
  if (endp[2] > zmax) zmax = endp[2];
  const shape = pieceShape(p);
  const end = {
    cx: st.cx + shape.next[0] * d[0] + shape.next[1] * rt[0],
    cy: st.cy + shape.next[0] * d[1] + shape.next[1] * rt[1],
    h: (st.h + shape.dh + 4) & 3,
    z: Math.round(endp[2]),
    pitch: p.b,
  };
  return { samples: out, end, len, shape, zmin, zmax };
}

export function flatten(list: any[], closed: boolean) {
  const n = list.length;
  const T: any = { n, closed };
  const keys = ['X', 'Y', 'Z', 'TX', 'TY', 'TZ', 'UX', 'UY', 'UZ', 'RX', 'RY', 'RZ', 'KX', 'KY', 'KZ', 'S'];
  for (const k of keys) T[k] = new Float64Array(n + 1);
  T.flag = new Uint8Array(n); T.pc = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = list[i];
    T.X[i] = s.x; T.Y[i] = s.y; T.Z[i] = s.z; T.TX[i] = s.tx; T.TY[i] = s.ty; T.TZ[i] = s.tz;
    T.UX[i] = s.ux; T.UY[i] = s.uy; T.UZ[i] = s.uz; T.RX[i] = s.rx; T.RY[i] = s.ry; T.RZ[i] = s.rz;
    T.flag[i] = s.flag; T.pc[i] = s.pc;
  }
  const dist = (i: number, j: number) => Math.hypot(T.X[i] - T.X[j], T.Y[i] - T.Y[j], T.Z[i] - T.Z[j]);
  for (let i = 0; i < n; i++) T.S[i + 1] = T.S[i] + (closed || i < n - 1 ? dist(i, (i + 1) % n) : 0);
  T.L = T.S[n];
  const L = T.L;
  for (let i = 0; i < n; i++) {
    const a = closed ? (i - 2 + n) % n : Math.max(0, i - 2);
    const b = closed ? (i + 2) % n : Math.min(n - 1, i + 2);
    let ds = b > a ? T.S[b] - T.S[a] : T.S[b] + L - T.S[a];
    if (a === b || ds < 1e-6) ds = 1;
    T.KX[i] = (T.TX[b] - T.TX[a]) / ds; T.KY[i] = (T.TY[b] - T.TY[a]) / ds; T.KZ[i] = (T.TZ[b] - T.TZ[a]) / ds;
  }
  return T;
}

/** interpolated frame at arc length s */
export function frameAt(T: any, s: number, o: any) {
  const n = T.n, L = T.L;
  s = ((s % L) + L) % L;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (T.S[mid] <= s) lo = mid; else hi = mid - 1; }
  const i = lo, j = (i + 1) % n;
  const dd = T.S[i + 1] - T.S[i];
  const f = dd > 1e-9 ? (s - T.S[i]) / dd : 0;
  const l = (a: Float64Array) => a[i] + (a[j] - a[i]) * f;
  o.i = i; o.f = f;
  o.x = l(T.X); o.y = l(T.Y); o.z = l(T.Z);
  let tx = l(T.TX), ty = l(T.TY), tz = l(T.TZ);
  const tl = Math.hypot(tx, ty, tz) || 1; o.tx = tx / tl; o.ty = ty / tl; o.tz = tz / tl;
  o.ux = l(T.UX); o.uy = l(T.UY); o.uz = l(T.UZ);
  o.rx = l(T.RX); o.ry = l(T.RY); o.rz = l(T.RZ);
  o.kx = l(T.KX); o.ky = l(T.KY); o.kz = l(T.KZ);
  o.flag = T.flag[i]; o.pc = T.pc[i];
  return o;
}

export function pieceCost(p: any, sub: string) {
  const base: any = { straight: 35, turnS: 45, turnL: 70, helix: 110, loop: 700, cork: 550 };
  let c = base[p.kind];
  if (p.a || p.b) c += 15;
  if (p.bank) c += 20;
  if (p.lift) c += 10;
  if (p.brake) c += 25;
  if (p.block) c += 45;
  if (p.photo) c += 60;
  if (p.covered) c += 25;
  if (p.station) c += 45;
  return Math.round(c * (sub === 'wood' ? 0.7 : 1));
}

export function stationCount(ride: any) {
  let n = 0;
  for (const p of ride.pieces) { if (p.station) n++; else break; }
  return n;
}

export function pieceName(p: any) {
  if (p.station) return 'Station';
  if (p.block) return 'Block brake';
  if (p.brake) return 'Brakes';
  if (p.photo) return 'Photo section';
  const side = p.dir > 0 ? 'right' : 'left';
  switch (p.kind) {
    case 'loop': return 'Vertical loop';
    case 'cork': return 'Corkscrew ' + side;
    case 'helix': return 'Helix ' + side + ' (' + (p.hx + 1) + '/4)';
    case 'turnS': return (p.bank ? 'Banked ' : 'Flat ') + 'small turn ' + side;
    case 'turnL': return (p.bank ? 'Banked ' : 'Flat ') + 'large turn ' + side;
  }
  return (p.lift ? 'Chain lift ' : 'Straight ') + (p.a === p.b ? PITCH_NAME[p.a] : PITCH_NAME[p.a] + ' → ' + PITCH_NAME[p.b]);
}

/** type rules (steel vs wooden piece sets) */
export function checkRules(ride: any, p: any): string | null {
  const wood = ride.sub === 'wood';
  if (p.a !== curPitch(ride)) return 'Track slope does not match — level the track out (or pick a valid slope) first';
  if (wood && (p.kind === 'loop' || p.kind === 'cork' || p.kind === 'helix')) return 'Wooden coasters have no loops, corkscrews or helices';
  if (wood && p.kind === 'turnS' && p.bank) return 'Wooden coasters cannot bank small turns';
  if (wood && (p.a > 1 || p.b > 1)) return 'Wooden coasters can climb at most 25° (60° drops are fine)';
  if (Math.abs(p.a - p.b) > 1) return 'Slope must change one step at a time (60° ↔ 25° ↔ level)';
  if ((p.kind === 'turnS' || p.kind === 'turnL') && (Math.abs(p.a) > 1 || Math.abs(p.b) > 1)) return 'Turns cannot be built on 60° slopes';
  if (p.bank && (p.a !== 0 || p.b !== 0)) return 'Banked turns must be level';
  if ((p.kind === 'loop' || p.kind === 'cork') && (p.a !== 0 || p.b !== 0)) return 'Level the track before this element';
  if (p.kind === 'helix' && Math.abs(p.a) !== 1) return 'Helix needs a 25° slope (up or down) first';
  if (p.lift && (p.kind !== 'straight' || p.a < 0 || p.b < 0 || Math.max(p.a, p.b) < 1)) return 'Chain lift needs an uphill straight piece';
  if ((p.station || p.brake || p.block || p.photo) && (p.kind !== 'straight' || p.a !== 0 || p.b !== 0)) return 'Level the track first (this piece is flat only)';
  if (p.station && ride.pieces.some((q: any) => !q.station)) return 'Station pieces must come first';
  if (p.covered && p.kind !== 'straight') return 'Only straight pieces can be covered';
  return null;
}

function lastState(ride: any) {
  return ride.endState || { cx: ride.cx, cy: ride.cy, h: ride.h, z: ride.z0, pitch: 0 };
}
export function curPitch(ride: any) { return lastState(ride).pitch || 0; }

/** map/occupancy conflicts for a generated piece */
export function checkGen(_ride: any, g: any): string | null {
  const m = G.map;
  if (g.zmin < 0) return 'Track would go underground';
  if (g.zmax > 230) return 'Track is too high';
  const st = g.st, d = DIRS[st.h], rt = rightDir(st.h);
  for (const c of g.shape.cells) {
    const x = st.cx + c[0] * d[0] + c[1] * rt[0], y = st.cy + c[0] * d[1] + c[1] * rt[1];
    if (x < 1 || y < 1 || x > MAP - 2 || y > MAP - 2) return 'Track would leave the park';
    const i = idx(x, y);
    if (m.ground[i] === 1 && g.zmin < 24) return 'Water in the way';
    const ob = m.obj[i];
    if (ob && g.zmin < 70) {
      if (ob.t === 'tree' || ob.t === 'bush' || ob.t === 'flower') { /* auto-cleared when built */ }
      else return 'Blocked by ' + (ob.t === 'entr' ? 'ride entrance' : ob.t === 'exit' ? 'ride exit' : ob.t);
    }
    if (m.path[i] && g.zmin < 24) return 'A footpath is in the way';
    const oc = m.occ[i];
    if (oc) for (const e of oc) {
      if (g.zmin < e.z1 + 16 && e.z0 < g.zmax + 16) return 'Too close to other track';
    }
  }
  return null;
}

export function canAppend(ride: any, p: any) {
  const e = checkRules(ride, p);
  if (e) return { err: e, g: null };
  const st = lastState(ride);
  if (ride.closed) return { err: 'The circuit is already complete', g: null };
  const g: any = genPiece(p, st, ride.pieces.length);
  g.st = st;
  return { err: checkGen(ride, g), g };
}

function clearOcc(ride: any) {
  const m = G.map;
  if (ride.occCells) for (const i of ride.occCells) { const a = m.occ[i]; if (a) { m.occ[i] = a.filter((e: any) => e.ride !== ride); if (!m.occ[i].length) m.occ[i] = null; } }
  ride.occCells = [];
}

export function releaseTrack(ride: any) {
  clearOcc(ride);
  const m = G.map;
  for (const c of [ride.entrance, ride.exit]) if (c != null && m.obj[c] && m.obj[c].ride === ride) m.obj[c] = null;
}

export function rebuild(ride: any) {
  const m = G.map;
  clearOcc(ride);
  const all: any[] = [];
  ride.pieceSamp0 = [];
  let st: any = { cx: ride.cx, cy: ride.cy, h: ride.h, z: ride.z0, pitch: 0 };
  let zmaxAll = 0, drop = 0;
  for (let j = 0; j < ride.pieces.length; j++) {
    const p = ride.pieces[j];
    const g: any = genPiece(p, st, j);
    ride.pieceSamp0.push(all.length);
    for (const s of g.samples) all.push(s);
    const d = DIRS[st.h], rt = rightDir(st.h);
    for (const c of g.shape.cells) {
      const x = st.cx + c[0] * d[0] + c[1] * rt[0], y = st.cy + c[0] * d[1] + c[1] * rt[1];
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (!m.occ[i]) m.occ[i] = [];
      m.occ[i].push({ ride, pc: j, z0: g.zmin, z1: g.zmax });
      ride.occCells.push(i);
      // clear low scenery under the track
      const ob = m.obj[i];
      if (ob && g.zmin < 70 && (ob.t === 'tree' || ob.t === 'bush' || ob.t === 'flower')) { m.obj[i] = null; G.groundDirty = true; }
    }
    zmaxAll = Math.max(zmaxAll, g.zmax);
    st = g.end;
  }
  void drop;
  ride.endState = st;
  ride.closed = ride.pieces.length >= 3 && st.cx === ride.cx && st.cy === ride.cy && st.h === ride.h && Math.abs(st.z - ride.z0) < 0.5 && st.pitch === 0;
  ride.track = all.length ? flatten(all, ride.closed) : null;
  ride.maxZ = zmaxAll;
  updateEntrance(ride);
  G.hooks.onRideChanged && G.hooks.onRideChanged(ride);
}

function updateEntrance(ride: any) {
  const m = G.map;
  for (const c of [ride.entrance, ride.exit]) if (c != null && m.obj[c] && m.obj[c].ride === ride) m.obj[c] = null;
  ride.entrance = null; ride.exit = null;
  const ns = stationCount(ride);
  if (ns < 1) return;
  const d = DIRS[ride.h], rt = rightDir(ride.h), side = ride.side;
  const cellAt = (k: number) => {
    const x = ride.cx + d[0] * k + side * rt[0], y = ride.cy + d[1] * k + side * rt[1];
    return inb(x, y) ? idx(x, y) : -1;
  };
  const put = (c: number, t: string) => {
    if (c < 0) return null;
    const ob = m.obj[c];
    if (ob && !(ob.t === 'tree' || ob.t === 'bush' || ob.t === 'flower')) return null;
    if (m.occ[c] && m.occ[c].some((e: any) => e.ride !== ride)) return null;
    m.obj[c] = { t, ride };
    m.path[c] = 0;
    m.furn[c] = null;
    return c;
  };
  ride.entrance = put(cellAt(0), 'entr');
  ride.exit = put(cellAt(ns - 1), 'exit');
  G.groundDirty = true;
}

export function appendPieces(ride: any, pieces: any[]): string | null {
  let cost = 0;
  for (const p of pieces) cost += pieceCost(p, ride.sub);
  if (G.cash < cost) return 'Not enough cash (' + cost + ' needed)';
  const added: any[] = [];
  for (const p of pieces) {
    const r = canAppend(ride, p);
    if (r.err) {
      for (let k = 0; k < added.length; k++) ride.pieces.pop();
      rebuild(ride);
      return r.err;
    }
    ride.pieces.push(p); added.push(p);
    rebuild(ride);
  }
  G.hooks.spend(cost, 'construction');
  ride.spent = (ride.spent || 0) + cost;
  resetRideTest(ride);
  return null;
}

export function popPiece(ride: any) {
  if (!ride.pieces.length) return;
  const p = ride.pieces.pop();
  const refund = Math.round(pieceCost(p, ride.sub) * 0.8);
  G.hooks.earn(refund, 'construction', true);
  rebuild(ride);
  resetRideTest(ride);
}

/** any layout change invalidates the test & ratings */
export function resetRideTest(ride: any) {
  if (ride.status === 'open' || ride.status === 'closed' || ride.status === 'tested' || ride.status === 'testing' || ride.status === 'crashed') {
    G.hooks.dismissRiders && G.hooks.dismissRiders(ride);
  }
  ride.sim = null; ride.ratings = null; ride.stats = null; ride.failMsg = '';
  ride.status = 'building';
  ride.step = 0;
}

export function blockInfo(ride: any) {
  const T = ride.track;
  if (!T || !ride.closed) return null;
  const ns = stationCount(ride), L = T.L, np = ride.pieces.length;
  const sOf = (j: number) => (j < np ? T.S[ride.pieceSamp0[j]] : L);
  const ends = [sOf(ns)];
  const brakes: any[] = [];
  for (let j = ns; j < np; j++) {
    if (ride.pieces[j].block) { const e = sOf(j + 1); ends.push(e); brakes.push({ s0: sOf(j), s1: e, k: ends.length - 1 }); }
  }
  const lengths = ends.map((e, i) => e - (i === 0 ? ends[ends.length - 1] - L : ends[i - 1]));
  return { ends, brakes, lengths, stopS: ends[0] - 2, ns, L };
}

export function validate(ride: any) {
  const checks: any[] = [];
  const ns = stationCount(ride);
  checks.push({ ok: ns >= 2, label: 'Station is at least 2 tiles long (' + ns + ')' });
  checks.push({ ok: ride.closed, label: 'Circuit is complete and returns to the station' + (ride.closed ? '' : ride.pieces.length ? ' — track is open' : '') });
  if (ride.closed) {
    const bi: any = blockInfo(ride);
    const m = bi.ends.length;
    const minLen = TRAIN_LEN + 14;
    let ok = true, msg = '';
    if (ride.trains > m) { ok = false; msg = ride.trains + ' trains need ≥ ' + ride.trains + ' blocks (have ' + m + ') — add block brakes'; }
    if (m > 1 || ride.trains > 1) {
      bi.lengths.forEach((len: number, i: number) => { if (len < minLen) { ok = false; msg = 'Block ' + (i + 1) + ' is only ' + Math.round(len) + 'u long; trains need ' + minLen + 'u so two can never share a block'; } });
    }
    checks.push({ ok, label: ok ? 'Block brakes spaced correctly (' + m + ' block' + (m > 1 ? 's' : '') + ', ' + ride.trains + ' train' + (ride.trains > 1 ? 's' : '') + ')' : msg });
  }
  const hasLift = ride.pieces.some((p: any) => p.lift);
  checks.push({ ok: hasLift, warn: true, label: hasLift ? 'Chain lift hill present' : 'No chain lift: the train may not be able to climb' });
  const conn = ride.entrance != null && ride.approach != null;
  checks.push({ ok: conn, warn: true, label: conn ? 'Entrance connected to the footpath' : 'Entrance is not connected to a path (guests cannot reach it)' });
  const ok = checks.every((c) => c.ok || c.warn);
  return { ok, checks };
}

/** build piece(s) from builder selection */
export function piecesFromSel(ride: any, sel: any, special: string | null): { pieces: any[]; err?: string } {
  const cp = curPitch(ride);
  const lvl = (o: any) => newPiece(Object.assign({ a: 0, b: 0 }, o));
  switch (special) {
    case 'station': return { pieces: [lvl({ station: true })] };
    case 'brake': return { pieces: [lvl({ brake: true, covered: sel.cover })] };
    case 'block': return { pieces: [lvl({ block: true })] };
    case 'photo': return { pieces: [lvl({ photo: true })] };
    case 'loop': return { pieces: [lvl({ kind: 'loop' })] };
    case 'corkL': return { pieces: [lvl({ kind: 'cork', dir: -1 })] };
    case 'corkR': return { pieces: [lvl({ kind: 'cork', dir: 1 })] };
    case 'helixL': case 'helixR': {
      if (Math.abs(cp) !== 1) return { pieces: [], err: 'Helix needs a 25° slope (up or down) first' };
      const dir = special === 'helixL' ? -1 : 1;
      return { pieces: [0, 1, 2, 3].map((k) => newPiece({ kind: 'helix', dir, a: cp, b: cp, hx: k })) };
    }
  }
  const turn = sel.turn;
  const kind = turn === 0 ? 'straight' : Math.abs(turn) === 1 ? 'turnS' : 'turnL';
  const dir = turn === 0 ? 0 : turn > 0 ? 1 : -1;
  const p = newPiece({ kind, dir, a: cp, b: sel.pitch, bank: sel.bank && turn !== 0, lift: sel.lift, covered: sel.cover });
  return { pieces: [p] };
}

/** samples for a ghost preview */
export function previewPieces(ride: any, pieces: any[]) {
  if (!pieces.length) return null;
  let st = lastState(ride);
  const all: any[] = [];
  let err: string | null = null;
  if (ride.closed) err = 'The circuit is already complete';
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k];
    if (!err) err = checkRules(ride, p);
    const g: any = genPiece(p, st, ride.pieces.length + k);
    g.st = st;
    if (!err) err = checkGen(ride, g);
    for (const s of g.samples) all.push(s);
    st = g.end;
  }
  return { T: flatten(all, false), err };
}
