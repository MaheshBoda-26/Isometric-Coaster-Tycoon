// Guest agents (Happiness, Energy, Hunger, Thirst, Nausea, Bathroom, Money) and staff.
import { G, MAP, idx, rnd, rint, pick, clamp, toast, beep } from './core';
import { getField, neighbors, cellCenter, earn, STAFF } from './world';

export const SHIRTS = ['#e63946', '#f4a261', '#2a9d8f', '#4d8bd0', '#e9c46a', '#9b5de5', '#f15bb5', '#00bbf9', '#8ac926', '#f5f5f5', '#ff6d00', '#7b4fb0'];
const PANTS = ['#33415c', '#2b2d42', '#5c4d3c', '#264653', '#4a4e69', '#6b705c'];
const NAMES = ['Alex', 'Sam', 'Jo', 'Pat', 'Chris', 'Kim', 'Lee', 'Max', 'Robin', 'Dana', 'Ash', 'Jules', 'Tess', 'Ravi', 'Mia', 'Omar', 'Zoe', 'Finn', 'Ines', 'Hugo'];

export function installHooks() {
  G.hooks.unloadTrain = unloadTrain;
  G.hooks.boardTrain = boardTrain;
  G.hooks.dismissRiders = dismissRiders;
}

function complain(g: any, text: string, count = true) {
  g.thought = text; g.thoughtT = G.time;
  if (count) G.complaints[text] = (G.complaints[text] || 0) + 1;
}

export function newGuest(tile: number, from?: number) {
  const [x, y] = cellCenter(from ?? tile);
  const ox = (rnd() - 0.5) * 14, oy = (rnd() - 0.5) * 14;
  const cx = (from ?? tile) % MAP, cy = (((from ?? tile) / MAP) | 0);
  const g: any = {
    id: G.nextId++, name: pick(NAMES) + ' ' + String.fromCharCode(65 + rint(0, 25)) + '.', x: x + ox, y: y + oy, cx, cy, nx: tile % MAP, ny: (tile / MAP) | 0, ox, oy, px: -1, py: -1,
    tx: (tile % MAP) * 32 + 16 + ox, ty: ((tile / MAP) | 0) * 32 + 16 + oy,
    state: 'walk', intent: null, thought: 'Wow, what a nice park!', thoughtT: 0, timer: 0,
    happiness: rint(170, 240), energy: rint(170, 255), hunger: rint(10, 90), thirst: rint(10, 90), nausea: 0, bathroom: rint(0, 60), money: Math.round((30 + rnd() * 70) * 10) / 10, spent: 0,
    intMin: rnd() * 1.5, intMax: 5.5 + rnd() * 4.5, queueTol: rint(5, 20), shirt: pick(SHIRTS), pants: pick(PANTS), age: 0, stay: 240 + rnd() * 320,
    rides: {}, decideT: rnd() * 2, wait: 0, patience: 100, speed: 20 + rnd() * 8, trash: false, hasMap: false, lostT: 0, vomitCD: 0, bob: rnd() * 6, dead: false,
  };
  return g;
}

export function spawnInitial(n: number) {
  const tiles: number[] = [];
  for (let i = 0; i < G.map.path.length; i++) if (G.map.path[i] === 1) tiles.push(i);
  for (let k = 0; k < n && tiles.length; k++) {
    const g = newGuest(pick(tiles));
    g.age = rnd() * 100; g.happiness = rint(130, 240); g.hunger = rint(10, 160); g.thirst = rint(10, 140);
    G.guests.push(g);
  }
}

const rideField = (r: any) => getField('r' + r.id, r.kind === 'coaster' ? (r.approach != null ? [r.approach] : []) : r.src || [], r.chain || null);
const shopField = (r: any) => getField('s' + r.id, r.src || [], null);
const exitField = () => getField('exit', [G.gatePath], null);

function fieldFor(it: any) {
  if (it.type === 'ride') return rideField(it.ride);
  if (it.type === 'shop') return shopField(it.ride);
  if (it.type === 'exit') return exitField();
  return null;
}

// ---------------- ride evaluation (the guests' own opinion) ----------------
export function evaluateRide(g: any, r: any, novelty = true) {
  const rt = r.ratings;
  if (!rt || r.status !== 'open' || r.broken) return { ok: false, why: 'closed', score: -99 };
  if (Math.round(rt.inten * 100) > 1000) return { ok: false, why: 'int', score: -99 }; // hard refusal above 10.00
  const hap = g.happiness / 255;
  const effMax = g.intMax + hap * 2.0, effMin = Math.max(0, g.intMin - hap * 1.0);
  if (rt.inten > effMax) return { ok: false, why: 'int', score: -99 };
  if (g.nausea + rt.nau * 14 > 235) return { ok: false, why: 'nau', score: -99 };
  const price = G.entryMode === 'ride' ? r.price : 0;
  const maxP = Math.min(2 * rt.value, 20); // never more than 2x ride value, hard cap £20
  if (price > maxP + 1e-9) return { ok: false, why: 'price', score: -99 };
  if (price > g.money) return { ok: false, why: 'money', score: -99 };
  if (r.queue.length > g.queueTol) return { ok: false, why: 'queue', score: -99 };
  let score = rt.exc * 1.0 + 0.7 - Math.max(0, rt.inten - 0.85 * effMax) * 0.5 - r.queue.length * 0.12 - (price / Math.max(0.5, rt.value)) * 0.9 + rnd() * 0.7;
  if (rt.inten < effMin) score -= (effMin - rt.inten) * 0.8;
  if (novelty) score -= (g.rides[r.id] || 0) * 0.6;
  return { ok: score >= 1.5, why: 'meh', score };
}

function chooseRide(g: any) {
  let best: any = null, bs = -1e9;
  const cur = idx(g.cx, g.cy);
  for (const r of G.rides) {
    if (r.kind === 'shop' || r.status !== 'open' || !r.ratings) continue;
    const f = rideField(r);
    if (!f || f[cur] < 0) continue;
    const v = evaluateRide(g, r, true);
    if (!v.ok) {
      if (v.why === 'int' || v.why === 'price' || v.why === 'queue' || v.why === 'nau') r.refused[v.why]++;
      if (v.why === 'int' && Math.random() < 0.3) complain(g, 'This ride looks too intense for me');
      else if (v.why === 'price') complain(g, "I'm not paying that much to go on " + r.name);
      else if (v.why === 'queue') complain(g, 'The queue for ' + r.name + ' is too long');
      continue;
    }
    const sc = v.score - f[cur] * 0.012;
    if (sc > bs) { bs = sc; best = r; }
  }
  return best;
}

function seekShop(g: any, sub: string) {
  const cur = idx(g.cx, g.cy);
  let best: any = null, bd = 1e9;
  for (const r of G.rides) {
    if (r.kind !== 'shop' || r.sub !== sub) continue;
    const f = shopField(r);
    if (!f || f[cur] < 0) continue;
    if (f[cur] < bd) { bd = f[cur]; best = r; }
  }
  if (!best) return false;
  g.intent = { type: 'shop', ride: best };
  return true;
}

function decide(g: any) {
  g.decideT = 3 + rnd() * 4;
  if (g.age > g.stay || g.happiness < 28 || g.energy < 25 || (g.money < 1.5 && g.age > 90)) {
    g.intent = { type: 'exit' }; g.thought = g.money < 1.5 ? "I'm out of money, time to go home" : 'Time to go home'; g.thoughtT = G.time; return;
  }
  if (g.bathroom > 190) { if (seekShop(g, 'toilet')) { g.thought = 'I need the toilet!'; return; } complain(g, "I can't find a toilet!"); }
  if (g.thirst > 140) { if (g.money >= 1.5 && seekShop(g, 'drink')) { g.thought = "I'm thirsty"; return; } if (g.thirst > 200) complain(g, "I'm thirsty"); }
  if (g.hunger > 140) { if (g.money >= 2.2 && seekShop(g, 'burger')) { g.thought = "I'm hungry"; return; } if (g.hunger > 200) complain(g, "I'm hungry"); }
  if (g.nausea > 150 && rnd() < 0.5) { g.state = 'rest'; g.timer = 8; complain(g, 'I feel sick', true); return; }
  if (!g.hasMap && rnd() < 0.05 && g.money > 2 && seekShop(g, 'info')) { g.thought = 'I want a map'; return; }
  const r = chooseRide(g);
  if (r) { g.intent = { type: 'ride', ride: r }; g.thought = 'I want to go on ' + r.name; g.thoughtT = G.time; g.lostT = 0; return; }
  if (rnd() < 0.15) { g.state = 'rest'; g.timer = 4 + rnd() * 4; g.thought = 'Just taking a break'; }
}

// ---------------- movement ----------------
function chooseNext(g: any) {
  const cur = idx(g.cx, g.cy), m = G.map;
  const it = g.intent;
  const opts: number[] = [];
  for (const nb of neighbors(cur)) {
    const p = m.path[nb];
    if (p === 1 || (p === 2 && it && it.type === 'ride' && it.ride.chain && it.ride.chain.has(nb))) opts.push(nb);
  }
  if (!opts.length) {
    if (!m.path[cur] && !(g.cx === G.gateIdx % MAP && g.cy === ((G.gateIdx / MAP) | 0)) && !isRideCell(cur)) relocate(g);
    else { g.state = 'wait'; g.timer = 1.5; }
    return;
  }
  let nxt = -1;
  const field = it ? fieldFor(it) : null;
  if (field && field[cur] >= 0) {
    if (rnd() < (g.hasMap ? 0.02 : 0.08)) nxt = pick(opts);
    else {
      let bd = 1e9; const c: number[] = [];
      for (const o of opts) { const d = field[o]; if (d < 0) continue; if (d < bd) { bd = d; c.length = 0; c.push(o); } else if (d === bd) c.push(o); }
      nxt = c.length ? pick(c) : pick(opts);
    }
  } else {
    if (it) { g.lostT += 0.5; if (g.lostT > 25) { g.intent = null; complain(g, "I'm lost!"); g.happiness = Math.max(0, g.happiness - 6); g.lostT = 0; } }
    const prev = g.px >= 0 ? idx(g.px, g.py) : -1;
    const nr = opts.filter((o) => o !== prev);
    nxt = pick(nr.length ? nr : opts);
  }
  g.px = g.cx; g.py = g.cy; g.nx = nxt % MAP; g.ny = (nxt / MAP) | 0;
  g.tx = g.nx * 32 + 16 + g.ox; g.ty = g.ny * 32 + 16 + g.oy;
}
function isRideCell(i: number) { const o = G.map.obj[i]; return o && (o.t === 'entr' || o.t === 'exit'); }

function relocate(g: any) {
  const t = nearestPath(g.cx, g.cy);
  if (t < 0) { g.dead = true; return; }
  placeOnTile(g, t);
}
export function nearestPath(cx: number, cy: number) {
  const m = G.map; let best = -1, bd = 1e9;
  for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
    const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= MAP || y >= MAP) continue;
    const i = idx(x, y); if (m.path[i] !== 1) continue;
    const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function placeOnTile(g: any, t: number) {
  const [x, y] = cellCenter(t);
  g.cx = t % MAP; g.cy = (t / MAP) | 0; g.nx = g.cx; g.ny = g.cy; g.x = x + g.ox; g.y = y + g.oy; g.tx = g.x; g.ty = g.y; g.px = -1; g.py = -1;
  g.state = 'walk';
}

function arrive(g: any) {
  const i = idx(g.cx, g.cy), it = g.intent;
  if (it) {
    if (it.type === 'ride') {
      const r = it.ride;
      if (r.status !== 'open' || r.broken) { g.intent = null; complain(g, r.name + ' is closed', false); }
      else if (i === r.approach || (r.srcSet && r.srcSet.has(i))) {
        const v = evaluateRide(g, r, false);
        if (v.why === 'queue' || v.why === 'price' || v.why === 'money' || v.why === 'int') {
          g.intent = null; if (v.why === 'price') complain(g, "I'm not paying that much to go on " + r.name); else if (v.why === 'queue') complain(g, 'The queue for ' + r.name + ' is too long');
        } else { joinQueue(g, r); return; }
      }
    } else if (it.type === 'shop') {
      if (it.ride.srcSet && it.ride.srcSet.has(i)) { g.state = 'shop'; g.timer = 1.6; g.shop = it.ride; return; }
    } else if (it.type === 'exit') {
      if (i === G.gatePath) { g.dead = true; G.stats.left++; return; }
    }
  }
  if (!g.intent && g.decideT <= 0) decide(g);
  if (g.state === 'rest' || g.state === 'wait') return;
  chooseNext(g);
}

function joinQueue(g: any, r: any) {
  r.queue.push(g); g.state = 'queue'; g.wait = 0; g.patience = 90 + rnd() * 160; g.qRide = r;
  g.thought = 'Waiting in the queue for ' + r.name; g.thoughtT = G.time;
}
function leaveQueue(g: any, why: string) {
  const r = g.qRide;
  if (r) { const k = r.queue.indexOf(g); if (k >= 0) r.queue.splice(k, 1); }
  g.qRide = null; g.state = 'walk'; g.intent = null;
  if (why) complain(g, why);
  g.happiness = Math.max(0, g.happiness - 8);
  if (!G.map.path[idx(g.cx, g.cy)]) { const t = nearestPath(g.cx, g.cy); if (t >= 0) placeOnTile(g, t); }
  else chooseNext(g);
}

const tmp = { x: 0, y: 0 };
function polyPos(pts: number[][], d: number, slot: number) {
  let rem = d;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (rem <= sl) { const t = rem / sl; tmp.x = a[0] + (b[0] - a[0]) * t; tmp.y = a[1] + (b[1] - a[1]) * t; return; }
    rem -= sl;
  }
  const l = pts[pts.length - 1];
  tmp.x = l[0] + ((slot % 3) - 1) * 5; tmp.y = l[1] + (((slot / 3) | 0) % 3 - 1) * 5;
}
function slotPos(r: any, i: number, g: any) {
  const pts = r.queuePts;
  if (!pts || !pts.length) { tmp.x = g.x; tmp.y = g.y; return; }
  if (pts.length === 1) { const a = i * 2.4; tmp.x = pts[0][0] + Math.cos(a) * (7 + i * 0.6); tmp.y = pts[0][1] + Math.sin(a) * (7 + i * 0.6); return; }
  polyPos(pts, 7 + i * 8, i);
  tmp.x += g.ox * 0.25; tmp.y += g.oy * 0.25;
}

// ---------------- riding ----------------
function boardTrain(ride: any, tr: any) {
  if (ride.status !== 'open') return;
  const seats = tr.guests.length;
  for (let k = 0; k < seats; k++) {
    if (tr.guests[k]) continue;
    // find first queued guest that is close enough to the front
    let g: any = null;
    while (ride.queue.length) {
      const c = ride.queue.shift();
      const price = G.entryMode === 'ride' ? ride.price : 0;
      if (price > c.money) { c.qRide = null; c.state = 'walk'; c.intent = null; complain(c, "I can't afford the ticket"); chooseNext(c); continue; }
      g = c; break;
    }
    if (!g) break;
    const price = G.entryMode === 'ride' ? ride.price : 0;
    if (price > 0) { g.money -= price; g.spent += price; earn(price, 'rides'); ride.income += price; }
    ride.customers++; G.stats.ridesTaken++;
    g.state = 'ride'; g.qRide = null; g.rideRef = ride; g.seat = k; g.paid = price;
    g.thought = 'This is ' + (ride.ratings.exc > 4 ? 'great!' : 'nice'); g.thoughtT = G.time;
    tr.guests[k] = g;
  }
  if (price0(ride) > 0) beep(880, 0.04, 'square', 0.015);
}
const price0 = (r: any) => (G.entryMode === 'ride' ? r.price : 0);

function unloadTrain(ride: any, tr: any) {
  for (let k = 0; k < tr.guests.length; k++) {
    const g = tr.guests[k];
    if (!g) continue;
    tr.guests[k] = null;
    finishRide(g, ride, false);
  }
}
function dismissRiders(ride: any, killed = false) {
  const lists: any[][] = [];
  if (ride.sim) for (const t of ride.sim.trains) lists.push(t.guests);
  if (ride.flat) lists.push(ride.flat.guests);
  for (const l of lists) for (let k = 0; k < l.length; k++) { const g = l[k]; if (g) { l[k] = null; finishRide(g, ride, killed); } }
  if (ride.flat) { ride.flat.state = 'load'; ride.flat.timer = 6; ride.flat.began = false; }
}

function finishRide(g: any, r: any, bad: boolean) {
  const rt = r.ratings;
  g.rides[r.id] = (g.rides[r.id] || 0) + 1;
  let dh = clamp(rt.exc * 5 - 7, -8, 34);
  const price = g.paid || 0;
  if (price > rt.value * 1.4) dh -= 7;
  if (rt.inten > g.intMax + (g.happiness / 255) * 2 - 0.5) { dh -= 12; complain(g, 'That ride was too intense for me!'); }
  else if (rt.exc > 5) g.thought = pick(['That was amazing!', 'Wow! I want to go again!', 'Best ride in the park!']);
  else if (rt.exc > 3) g.thought = pick(['That was fun', 'I enjoyed that', 'Nice ride!']);
  else g.thought = pick(['That was OK', 'Not very exciting', 'Pretty tame']);
  g.thoughtT = G.time;
  if (bad) { dh = -60; complain(g, 'That crash was terrifying!'); }
  g.happiness = clamp(g.happiness + dh, 0, 255);
  g.nausea = clamp(g.nausea + rt.nau * 9, 0, 255);
  g.energy = Math.max(0, g.energy - 8);
  g.thirst = Math.min(255, g.thirst + 12);
  if (r.pieces && r.pieces.some((p: any) => p.photo) && g.money >= 1.5 && rnd() < 0.4) {
    g.money -= 1.5; g.spent += 1.5; earn(1.5, 'shops'); r.income += 1.5; g.happiness = Math.min(255, g.happiness + 4); g.thought = 'I bought the on-ride photo!';
  }
  g.intent = null; g.rideRef = null; g.paid = 0;
  // exit
  const t = r.exitTile;
  if (r.kind === 'coaster' && r.exit != null && t != null) {
    const [ex, ey] = cellCenter(r.exit);
    g.x = ex + g.ox * 0.4; g.y = ey + g.oy * 0.4;
    g.cx = r.exit % MAP; g.cy = (r.exit / MAP) | 0;
    g.nx = t % MAP; g.ny = (t / MAP) | 0; g.tx = g.nx * 32 + 16 + g.ox; g.ty = g.ny * 32 + 16 + g.oy; g.px = -1;
    g.state = 'walk';
  } else if (t != null) placeOnTile(g, t);
  else {
    const c = r.kind === 'coaster' ? (r.exit ?? r.entrance ?? idx(r.cx, r.cy)) : idx(r.x, r.y);
    const nt = nearestPath(c % MAP, (c / MAP) | 0);
    if (nt >= 0) placeOnTile(g, nt); else g.dead = true;
  }
}

function shopPurchase(g: any) {
  const s = g.shop; g.shop = null; g.intent = null;
  if (!s) return;
  const price = s.price;
  if (g.money < price) { complain(g, "I can't afford that"); return; }
  if (price > 0) { g.money -= price; g.spent += price; earn(price, 'shops'); s.income += price; }
  s.customers++;
  switch (s.sub) {
    case 'burger': g.hunger = Math.max(0, g.hunger - 170); g.thirst = Math.min(255, g.thirst + 35); g.happiness = Math.min(255, g.happiness + 8); g.trash = true; g.thought = 'Yum! That burger was tasty'; break;
    case 'drink': g.thirst = Math.max(0, g.thirst - 170); g.happiness = Math.min(255, g.happiness + 5); g.trash = rnd() < 0.7; g.thought = 'Ahh, refreshing'; break;
    case 'toilet': g.bathroom = 0; g.thought = 'That is better'; break;
    case 'info': g.hasMap = true; g.thought = 'Now I know where everything is'; break;
  }
  g.thoughtT = G.time;
}

// ---------------- main update ----------------
export function updateGuests(dt: number) {
  const m = G.map;
  // queue indices
  for (const r of G.rides) if (r.queue.length) {
    for (let i = 0; i < r.queue.length; i++) r.queue[i].qi = i;
    if (r.status !== 'open') { for (const g of r.queue.slice()) leaveQueue(g, r.name + ' is closed'); }
  }
  // spawn
  const attr = G.rides.filter((r: any) => r.kind !== 'shop' && r.status === 'open' && r.ratings);
  const cap = Math.min(450, 50 + 70 * attr.length + (G.parkRating - 500) / 3);
  if (G.guests.length < cap) {
    const rate = 0.34 * Math.pow(G.parkRating / 700, 2) * (0.55 + 0.45 * Math.min(attr.length, 6));
    G.spawnAcc += rate * dt;
    while (G.spawnAcc >= 1) {
      G.spawnAcc -= 1;
      let admit = true;
      if (G.entryMode === 'fee') {
        const vf = Math.min(14, 1.5 + attr.reduce((a: number, r: any) => a + r.ratings.value, 0) * 0.35);
        admit = G.entryFee <= vf * 1.6 && Math.random() < clamp(1.6 - G.entryFee / vf, 0, 1);
      }
      if (!admit) { G.stats.refusedEntry++; continue; }
      const g = newGuest(G.gatePath, G.gateIdx);
      if (G.entryMode === 'fee') { if (g.money < G.entryFee) continue; g.money -= G.entryFee; g.spent += G.entryFee; earn(G.entryFee, 'entry'); }
      G.guests.push(g); G.stats.guestsTotal++;
    }
  }
  let anyDead = false;
  const sec = G.staff.filter((s: any) => s.type === 'security').length;
  for (const g of G.guests) {
    g.age += dt; g.decideT -= dt;
    g.hunger = Math.min(255, g.hunger + 0.55 * dt); g.thirst = Math.min(255, g.thirst + 0.8 * dt); g.bathroom = Math.min(255, g.bathroom + 0.35 * dt);
    g.energy = Math.max(0, g.energy - 0.22 * dt); g.nausea = Math.max(0, g.nausea - (g.state === 'rest' ? 4 : 1) * dt);
    let dh = -0.12;
    if (g.hunger > 200 || g.thirst > 200) dh -= 0.6;
    if (g.bathroom > 220) dh -= 0.6;
    if (g.nausea > 120) dh -= 0.4;
    if (g.state === 'queue') dh -= 0.25;
    g.happiness = clamp(g.happiness + dh * dt, 0, 255);
    if (g.vomitCD > 0) g.vomitCD -= dt;
    switch (g.state) {
      case 'walk': {
        if (g.nausea > 200 && g.vomitCD <= 0) {
          g.vomitCD = 25; g.nausea -= 90; complain(g, 'I feel sick!', true);
          const i = idx(g.cx, g.cy); if (m.path[i] === 1) m.litter[i] = Math.min(3, m.litter[i] + 1);
        }
        if (g.trash && Math.random() < dt * 0.05 / (1 + 0.5 * sec)) {
          g.trash = false; const i = idx(g.cx, g.cy);
          if (m.path[i] === 1) {
            let bin = false;
            for (let dy = -2; dy <= 2 && !bin; dy++) for (let dx = -2; dx <= 2; dx++) { const x = g.cx + dx, y = g.cy + dy; if (x >= 0 && y >= 0 && x < MAP && y < MAP && m.furn[idx(x, y)] && m.furn[idx(x, y)].t === 'bin') { bin = true; break; } }
            if (!bin) m.litter[i] = Math.min(3, m.litter[i] + 1);
          }
        }
        const dx = g.tx - g.x, dy = g.ty - g.y, d = Math.hypot(dx, dy), step = g.speed * dt;
        g.bob += dt * 9;
        if (d <= step) { g.x = g.tx; g.y = g.ty; g.cx = g.nx; g.cy = g.ny; arrive(g); }
        else { g.x += (dx / d) * step; g.y += (dy / d) * step; }
        break;
      }
      case 'queue': {
        const r = g.qRide;
        if (!r) { g.state = 'walk'; break; }
        g.wait += dt;
        slotPos(r, g.qi || 0, g);
        const dx = tmp.x - g.x, dy = tmp.y - g.y, d = Math.hypot(dx, dy), step = 26 * dt;
        if (d > 0.5) { const s = Math.min(step, d); g.x += (dx / d) * s; g.y += (dy / d) * s; g.bob += dt * 6; }
        if (g.wait > g.patience) leaveQueue(g, "I've been queueing for ages!");
        break;
      }
      case 'shop': g.timer -= dt; if (g.timer <= 0) { shopPurchase(g); g.state = 'walk'; if (!g.dead) chooseNext(g); } break;
      case 'rest': case 'wait': g.timer -= dt; if (g.timer <= 0) { g.state = 'walk'; chooseNext(g); } break;
      case 'ride': break;
    }
    if (g.dead) anyDead = true;
  }
  if (anyDead) {
    for (const g of G.guests) if (g.dead && g.qRide) { const k = g.qRide.queue.indexOf(g); if (k >= 0) g.qRide.queue.splice(k, 1); }
    G.guests = G.guests.filter((g: any) => !g.dead);
    if (G.selected && G.selected.dead) G.selected = null;
  }
  // slowly forget complaints
  if (Math.random() < dt * 0.05) for (const k of Object.keys(G.complaints)) { G.complaints[k] *= 0.9; if (G.complaints[k] < 0.5) delete G.complaints[k]; }
}

// ---------------- staff ----------------
function staffNext(s: any, target: number) {
  const cur = idx(s.cx, s.cy), opts = neighbors(cur).filter((c) => G.map.path[c] > 0);
  if (!opts.length) return;
  let nxt = -1;
  if (target >= 0) {
    const f = getField('t' + target, [target], new Set(opts.concat([target])));
    if (G.fields.size > 90) { G.fields.clear(); }
    let bd = 1e9;
    if (f[cur] >= 0) for (const o of opts) { if (f[o] >= 0 && f[o] < bd) { bd = f[o]; nxt = o; } }
  }
  if (nxt < 0) {
    const prev = s.px >= 0 ? idx(s.px, s.py) : -1;
    const nr = opts.filter((o) => o !== prev);
    nxt = pick(nr.length ? nr : opts);
  }
  s.px = s.cx; s.py = s.cy; s.nx = nxt % MAP; s.ny = (nxt / MAP) | 0; s.tx = s.nx * 32 + 16; s.ty = s.ny * 32 + 16;
}

export function updateStaff(dt: number) {
  const m = G.map;
  for (const s of G.staff) {
    s.bob = (s.bob || 0) + dt * 9;
    if (s.timer > 0) {
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.job && s.job.type === 'litter') { const i = idx(s.cx, s.cy); m.litter[i] = 0; }
        if (s.job && s.job.type === 'fix') { s.job.ride.broken = false; toast(s.job.ride.name + ' was repaired by a mechanic', 'good'); }
        s.job = null;
      }
      continue;
    }
    const cur = idx(s.cx, s.cy);
    // job selection when on a node
    const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), step = s.speed * dt;
    if (d > step) { s.x += (dx / d) * step; s.y += (dy / d) * step; continue; }
    s.x = s.tx; s.y = s.ty; s.cx = s.nx; s.cy = s.ny;
    const here = idx(s.cx, s.cy);
    if (s.type === 'handyman') {
      if (m.litter[here] > 0) { s.timer = 1.4; s.job = { type: 'litter' }; continue; }
      if (!s.job || s.job.type !== 'litter' || m.litter[s.job.tile] === 0) {
        let best = -1, bd = 1e9;
        for (let i = 0; i < m.litter.length; i++) if (m.litter[i] > 0 && m.path[i] > 0) { const dd = Math.abs((i % MAP) - s.cx) + Math.abs(((i / MAP) | 0) - s.cy); if (dd < bd) { bd = dd; best = i; } }
        s.job = best >= 0 ? { type: 'seek', tile: best } : null;
      }
      staffNext(s, s.job ? s.job.tile : -1);
    } else if (s.type === 'mechanic') {
      const br = G.rides.find((r: any) => r.broken && r.approach != null && !G.staff.some((o: any) => o !== s && o.job && o.job.ride === r));
      if (br) {
        if (here === br.approach || (br.exitTile != null && here === br.exitTile)) { s.timer = 6; s.job = { type: 'fix', ride: br }; continue; }
        s.job = { type: 'seek', ride: br };
        staffNext(s, br.approach);
      } else { s.job = null; staffNext(s, -1); }
    } else {
      if (s.type === 'entertainer') {
        for (const g of G.guests) if (Math.abs(g.x - s.x) < 70 && Math.abs(g.y - s.y) < 70) g.happiness = Math.min(255, g.happiness + 1.5);
      }
      staffNext(s, -1);
    }
    void cur;
  }
}
export { STAFF };
