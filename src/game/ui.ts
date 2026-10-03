// DOM user interface, input handling and the main loop.
import { G, MAP, DIRS, rightDir, cam, camScreen, unproj, proj, P, UP, idx, clamp, gbp, toast, BANDS, BAND_COL, bandIndex, mphOf, beep, MONTHS, W } from './core';
import { newGame, tickWorld, tickRides, placePath, placeScenery, placeShop, placeFlat, createCoaster, bulldoze, rideAt, hire, fire, setLoan, removeRide, freeCell, COST, STAFF, SHOPS, FLATS, monthlyWages, runningCost, footprint } from './world';
import { validate, piecesFromSel, appendPieces, popPiece, previewPieces, curPitch, rebuild, resetRideTest, pieceName, PITCH_NAME, blockInfo, TRAIN_LEN } from './track';
import { startTest, startOperation, stopOperation } from './sim';
import { installHooks, updateGuests, updateStaff, spawnInitial } from './guests';
import { initRender, resize, render, view, cellAt, pickAt } from './render';

const CSS = `
#app{position:fixed;inset:0;overflow:hidden;font-family:'Trebuchet MS',Verdana,sans-serif;color:#eef2f7;user-select:none;-webkit-user-select:none;background:#18222e}
#app canvas{position:absolute;left:0;top:0;display:block}
#app .bar{position:absolute;left:0;right:0;display:flex;align-items:center;gap:8px;padding:0 10px;z-index:5}
#top{top:0;min-height:40px;height:auto;background:linear-gradient(#41566f,#27374b);border-bottom:2px solid #0d151f;box-shadow:0 2px 8px rgba(0,0,0,.5);font-size:13px;flex-wrap:wrap;row-gap:4px;overflow:visible;max-height:88px}
#top .stat{display:flex;flex-direction:column;line-height:1.05;padding:2px 8px;background:#16222f;border:1px solid #0b121a;border-radius:3px;min-width:70px}
#top .stat b{font-size:15px;color:#ffe9a8}#top .stat small{font-size:9px;color:#8fa6bf;letter-spacing:.08em;text-transform:uppercase}
.btn{cursor:pointer;background:linear-gradient(#5b7594,#3c516b);border:1px solid #0d151f;border-top-color:#8fb0d4;border-radius:4px;color:#f2f6fb;padding:4px 9px;font-size:12px;font-family:inherit;white-space:nowrap}
.btn:hover{filter:brightness(1.18)}.btn:active{transform:translateY(1px)}
.btn.on{background:linear-gradient(#e8b53c,#b8821c);color:#201500;border-color:#6b4a08}
.btn.dis{opacity:.45;pointer-events:auto;cursor:help}.btn.go{background:linear-gradient(#58c074,#2d8a4a)}.btn.bad{background:linear-gradient(#d4584a,#963024)}
#tools{bottom:24px;height:54px;justify-content:center;background:linear-gradient(#2b3d52,#1b2735);border-top:2px solid #0d151f;gap:6px}
#tools .tb{display:flex;flex-direction:column;align-items:center;justify-content:center;width:72px;height:44px;font-size:10px;gap:1px}
#tools .tb span{font-size:18px;line-height:1}
#sub{bottom:80px;justify-content:center;gap:6px;pointer-events:none;height:60px}
#sub .it{pointer-events:auto;display:flex;flex-direction:column;align-items:center;min-width:84px;padding:5px 8px;font-size:11px}
#sub .it small{color:#ffe9a8;font-size:10px}
#help{bottom:0;height:24px;background:#0f1822;font-size:11px;color:#9fb5cc;border-top:1px solid #000;justify-content:center}
#win,#modal{position:absolute;z-index:6;background:linear-gradient(#34475d,#243445);border:2px solid #0d151f;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.6);font-size:12px}
#win{top:48px;right:8px;width:340px;max-height:calc(100% - 150px);overflow:auto;display:none}
#modal{top:56px;left:50%;transform:translateX(-50%);width:560px;max-width:94%;max-height:calc(100% - 160px);overflow:auto;display:none}
.wh{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:linear-gradient(#4b6482,#2f4259);border-bottom:1px solid #0d151f;font-weight:bold;font-size:13px;position:sticky;top:0;z-index:2}
.wb{padding:9px 10px}.wb h4{margin:8px 0 4px;font-size:11px;color:#9fc0e4;text-transform:uppercase;letter-spacing:.07em}
.chip{display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;background:#555;color:#fff;margin-left:6px}
.steps{display:flex;gap:3px;padding:6px 8px;background:#1b2836}
.steps div{flex:1;text-align:center;padding:4px 0;font-size:10px;background:#2c3d52;border:1px solid #0d151f;border-radius:3px;cursor:pointer;color:#8aa0b8}
.steps div.cur{background:#e8b53c;color:#201500;font-weight:bold}.steps div.done{color:#9de3ae}.steps div.lock{opacity:.35;cursor:not-allowed}
.grid{display:grid;gap:3px}.g5{grid-template-columns:repeat(5,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g2{grid-template-columns:repeat(2,1fr)}
.grid .btn{text-align:center;padding:5px 2px;font-size:11px}
.row{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:3px 0}
.ok{color:#8ee6a0}.no{color:#ff8d82}.wn{color:#ffd166}.mut{color:#8fa6bf}
.pb{height:11px;background:#111b26;border:1px solid #0a1018;border-radius:2px;overflow:hidden;position:relative;flex:1}
.pb i{display:block;height:100%}
table.t{width:100%;border-collapse:collapse}table.t td,table.t th{padding:2px 5px;text-align:right;border-bottom:1px solid #1b2a3a}table.t td:first-child,table.t th:first-child{text-align:left}
#toasts{position:absolute;left:12px;bottom:92px;z-index:7;display:flex;flex-direction:column;gap:4px;pointer-events:none;max-width:420px}
.toast{background:rgba(18,28,40,.92);border-left:4px solid #6aa7e8;padding:6px 10px;border-radius:3px;font-size:12px;animation:fi .25s}
.toast.good{border-color:#58c074}.toast.bad{border-color:#e0584a}
@keyframes fi{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:none}}
input[type=range]{width:100%}
.big{font-size:22px;font-weight:bold}
#over{position:absolute;inset:0;z-index:20;background:rgba(10,14,20,.85);display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;text-align:center}
.warnbox{background:#4a2a26;border:1px solid #a04a40;padding:6px 8px;border-radius:4px;margin:6px 0}
.infobox{background:#1b2c3e;border:1px solid #2f4760;padding:6px 8px;border-radius:4px;margin:6px 0}
`;

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];
const ui: any = { tool: 'select', cat: null, placeH: 1, win: null, modal: null, special: null, mouse: { x: 0, y: 0, down: false, pan: false, sx: 0, sy: 0, moved: 0, btn: 0 }, paintLast: -1, follow: null, dragRange: false, lastWin: '', keys: {} };

const SUBMENUS: Record<string, { id: string; name: string; icon?: string }[]> = {
  scenery: [{ id: 'tree1', name: 'Oak' }, { id: 'tree2', name: 'Pine' }, { id: 'tree3', name: 'Maple' }, { id: 'bush', name: 'Bush' }, { id: 'flower', name: 'Flowers' }, { id: 'bench', name: 'Bench' }, { id: 'lamp', name: 'Lamp' }, { id: 'bin', name: 'Litter bin' }],
  shops: [{ id: 'burger', name: 'Burger Bar' }, { id: 'drink', name: 'Drinks' }, { id: 'toilet', name: 'Toilets' }, { id: 'info', name: 'Info Kiosk' }],
  rides: [{ id: 'carousel', name: 'Merry-Go-Round' }, { id: 'ferris', name: 'Ferris Wheel' }],
  coaster: [{ id: 'coaster-steel', name: 'Steel Coaster' }, { id: 'coaster-wood', name: 'Wooden Coaster' }],
};
const COASTER_COST = 240;

let root: HTMLElement, cv: HTMLCanvasElement;
let elTop: HTMLElement, elWin: HTMLElement, elModal: HTMLElement, elSub: HTMLElement, elToasts: HTMLElement, elHelp: HTMLElement, elOver: HTMLElement, elTools: HTMLElement;

const bar = (v: number, max: number, col: string) => `<div class="pb"><i style="width:${clamp((v / max) * 100, 0, 100)}%;background:${col}"></i></div>`;
const dateStr = () => { const mo = Math.floor(G.day / 30); return `${(G.day % 30) + 1} ${MONTHS[mo % 8]} Y${Math.floor(mo / 8) + 1}`; };

// ---------------- top bar ----------------
function buildChrome() {
  root.innerHTML = `<canvas id="cv"></canvas>
  <div id="top" class="bar"></div><div id="sub" class="bar"></div>
  <div id="tools" class="bar"></div><div id="help" class="bar"></div>
  <div id="win"></div><div id="modal"></div><div id="toasts"></div>
  <div id="over"></div>`;
  cv = root.querySelector('#cv') as HTMLCanvasElement;
  elTop = root.querySelector('#top')!; elWin = root.querySelector('#win')!; elModal = root.querySelector('#modal')!; elSub = root.querySelector('#sub')!;
  elToasts = root.querySelector('#toasts')!; elHelp = root.querySelector('#help')!; elOver = root.querySelector('#over')!; elTools = root.querySelector('#tools')!;
  elHelp.innerHTML = 'Drag: pan · Wheel: zoom · Q/E: rotate · R: turn placement · Enter: build piece · Backspace: undo piece · 1-3: speed · P: pause · Esc: cancel';
  const tools = [['select', '✋', 'Select'], ['path', '🛤️', 'Footpath'], ['queue', '🚧', 'Queue'], ['cat:scenery', '🌳', 'Scenery'], ['cat:shops', '🍔', 'Shops'], ['cat:rides', '🎠', 'Flat rides'], ['cat:coaster', '🎢', 'Coasters'], ['bulldoze', '💥', 'Demolish']];
  elTools.innerHTML = tools.map(([id, ic, nm]) => `<div class="btn tb" data-a="tool" data-v="${id}"><span>${ic}</span>${nm}</div>`).join('');
}
function topHtml() {
  const rc = G.parkRating >= 700 ? '#6fe08a' : G.parkRating >= 600 ? '#ffd166' : '#ff7b6b';
  const warn = G.daysBelow > 0 ? `<div class="stat" style="border-color:#a04a40"><b style="color:#ff8d82">${29 - G.daysBelow}d</b><small>until closure</small></div>` : '';
  return `<div style="font-weight:bold;font-size:15px;color:#ffe9a8;letter-spacing:.04em;white-space:nowrap;flex:none">🎡 RCT Park</div>
  <div class="stat" style="flex:none"><b style="color:${G.cash < 0 ? '#ff8d82' : '#ffe9a8'}">${gbp(G.cash, 0)}</b><small>Cash</small></div>
  <div class="stat" style="flex:none"><b>${G.guests.length}</b><small>Guests</small></div>
  <div class="stat" style="min-width:110px;flex:none"><b style="color:${rc}">${Math.round(G.parkRating)}</b><small>Park rating</small><div class="pb" style="height:4px;margin-top:1px;flex:none"><i style="width:${G.parkRating / 9.99}%;background:${rc}"></i></div></div>
  ${warn}
  <div class="stat" style="flex:none"><b style="font-size:13px">${dateStr()}</b><small>${G.entryMode === 'fee' ? 'Entry ' + gbp(G.entryFee) : 'Pay per ride'}</small></div>
  <div style="flex:1"></div>
  <div class="btn ${G.paused ? 'on' : ''}" data-a="pause">⏸</div>
  <div class="btn ${!G.paused && G.speed === 1 ? 'on' : ''}" data-a="speed" data-v="1">▶</div><div class="btn ${!G.paused && G.speed === 2 ? 'on' : ''}" data-a="speed" data-v="2">▶▶</div><div class="btn ${!G.paused && G.speed === 4 ? 'on' : ''}" data-a="speed" data-v="4">▶▶▶</div>
  <div class="btn" data-a="rot" data-v="-1" title="Rotate (E)">⟲</div><div class="btn" data-a="rot" data-v="1" title="Rotate (Q)">⟳</div>
  <div class="btn" data-a="zoom" data-v="1">＋</div><div class="btn" data-a="zoom" data-v="-1">－</div>
  <div class="btn" data-a="modal" data-v="rides">Rides</div><div class="btn" data-a="modal" data-v="finance">Finance</div><div class="btn" data-a="modal" data-v="park">Park</div><div class="btn" data-a="modal" data-v="staff">Staff</div>
  <div class="btn" data-a="sound">${G.sound ? '🔊' : '🔇'}</div><div class="mut" style="font-size:10px;width:42px">${view.fps} fps</div>`;
}

function subHtml() {
  if (!ui.cat) return '';
  return SUBMENUS[ui.cat].map((s) => {
    const cost = s.id.startsWith('coaster') ? COASTER_COST : COST[s.id];
    return `<div class="btn it ${ui.tool === s.id ? 'on' : ''}" data-a="tool" data-v="${s.id}"><b>${s.name}</b><small>${gbp(cost, 0)}${s.id.startsWith('coaster') ? '+' : ''}</small></div>`;
  }).join('');
}

// ---------------- windows ----------------
function stChip(r: any) {
  const m: any = { building: ['Under construction', '#8a6d2a'], testing: ['Testing…', '#2a6fb0'], tested: ['Tested · closed', '#4a7a4a'], open: ['OPEN', '#2f9e5a'], closed: ['Closed', '#8a3a3a'], crashed: ['FAILED', '#b02a2a'] };
  const v = m[r.status] || ['', '#555'];
  return `<span class="chip" style="background:${v[1]}">${r.broken ? 'BROKEN DOWN' : v[0]}</span>`;
}
function ratingRows(rt: any) {
  const rows: [string, number, number][] = [['Excitement', rt.exc, rt.bands[0]], ['Intensity', rt.inten, rt.bands[1]], ['Nausea', rt.nau, rt.bands[2]]];
  return rows.map(([n, v, b]) => `<div class="row"><span style="width:76px">${n}</span>${bar(v, 15, BAND_COL[b])}<b style="width:44px;text-align:right">${v.toFixed(2)}</b></div><div class="mut" style="text-align:right;margin:-2px 0 3px;color:${BAND_COL[b]}">${BANDS[b]}</div>`).join('');
}

function winCoaster(r: any) {
  const v = validate(r), step = clamp(r.step || 0, 0, 4);
  const unlocked = [true, v.ok && r.closed, !!r.ratings, !!r.ratings, !!r.ratings];
  const names = ['1 Build', '2 Test', '3 Rate', '4 Price', '5 Open'];
  const done = [r.closed, !!r.ratings, !!r.ratings, !!r.ratings && r.price > 0, r.status === 'open'];
  let h = `<div class="wh"><span>${r.sub === 'steel' ? '🎢' : '🪵'} ${r.name}${stChip(r)}</span><span class="btn" data-a="closewin">✕</span></div>
  <div class="steps">${names.map((n, i) => `<div class="${i === step ? 'cur' : done[i] ? 'done' : ''} ${unlocked[i] ? '' : 'lock'}" data-a="step" data-v="${i}">${done[i] && i !== step ? '✓ ' : ''}${n}</div>`).join('')}</div><div class="wb">`;
  if (step === 0) {
    const s = r.sel, cp = curPitch(r), wood = r.sub === 'wood';
    const tn: [number, string][] = [[-2, '◀◀ Large'], [-1, '◀ Small'], [0, '▲ Straight'], [1, 'Small ▶'], [2, 'Large ▶▶']];
    const ps: [number, string][] = [[-2, '↓ 60°'], [-1, '↓ 25°'], [0, '— Level'], [1, '↑ 25°'], [2, '↑ 60°']];
    const okPitch = (p: number) => Math.abs(p - cp) <= 1 && !(wood && p > 1);
    h += `<h4>Direction</h4><div class="grid g5">${tn.map(([k, n]) => `<div class="btn ${s.turn === k ? 'on' : ''}" data-a="turn" data-v="${k}">${n}</div>`).join('')}</div>
    <h4>Slope (track is ${PITCH_NAME[cp]})</h4><div class="grid g5">${ps.map(([k, n]) => `<div class="btn ${s.pitch === k ? 'on' : ''} ${okPitch(k) ? '' : 'dis'}" data-a="pitch" data-v="${k}" title="${okPitch(k) ? '' : 'Slopes only change one step at a time (level ↔ 25° ↔ 60°)'}">${n}</div>`).join('')}</div>
    <div class="grid g3" style="margin-top:5px"><div class="btn ${s.bank ? 'on' : ''}" data-a="tog" data-v="bank">Banked</div><div class="btn ${s.lift ? 'on' : ''}" data-a="tog" data-v="lift">Chain lift</div><div class="btn ${s.cover ? 'on' : ''}" data-a="tog" data-v="cover">Covered</div></div>
    <div class="grid g2" style="margin-top:6px"><div class="btn go ${r.closed ? 'dis' : ''}" data-a="build" style="padding:8px" title="${r.closed ? 'Circuit complete — use Undo to change the layout' : ''}">⬛ Build piece <small>(Enter)</small></div><div class="btn bad ${r.pieces.length ? '' : 'dis'}" data-a="undo" style="padding:8px" title="${r.pieces.length ? '' : 'No pieces to remove'}">↩ Remove last <small>(⌫)</small></div></div>
    <h4>Special pieces</h4><div class="grid g3">
    <div class="btn" data-a="sp" data-v="station" data-sp="station">Station</div><div class="btn" data-a="sp" data-v="brake" data-sp="brake">Brakes</div><div class="btn" data-a="sp" data-v="block" data-sp="block">Block brake</div>
    <div class="btn" data-a="sp" data-v="photo" data-sp="photo">Photo</div><div class="btn ${wood ? 'dis' : ''}" data-a="sp" data-v="loop" data-sp="loop">Vertical loop</div><div class="btn ${wood ? 'dis' : ''}" data-a="sp" data-v="helixL" data-sp="helixL">Helix ⟲</div>
    <div class="btn ${wood ? 'dis' : ''}" data-a="sp" data-v="helixR" data-sp="helixR">Helix ⟳</div><div class="btn ${wood ? 'dis' : ''}" data-a="sp" data-v="corkL" data-sp="corkL">Corkscrew ◀</div><div class="btn ${wood ? 'dis' : ''}" data-a="sp" data-v="corkR" data-sp="corkR">Corkscrew ▶</div></div>
    ${wood ? '<div class="mut" style="margin-top:4px">Wooden set: no loop / corkscrew / helix. Trains have no upstop wheels.</div>' : '<div class="mut" style="margin-top:4px">Steel set: all pieces. Trains have upstop wheels.</div>'}
    ${ui.err ? `<div class="warnbox">⚠ ${ui.err}</div>` : ''}
    ${view.ghostPiece && view.ghostPiece.err ? `<div class="mut">Preview: <span class="no">${view.ghostPiece.err}</span></div>` : ''}
    <h4>Layout (${r.pieces.length} pieces · ${r.track ? (r.track.L / 32).toFixed(1) : 0} tiles)</h4>
    ${v.checks.map((c: any) => `<div class="${c.ok ? 'ok' : c.warn ? 'wn' : 'no'}">${c.ok ? '✓' : c.warn ? '⚠' : '✗'} ${c.label}</div>`).join('')}
    <div class="row" style="margin-top:6px"><span>Trains: <b>${r.trains}</b></span><span><span class="btn" data-a="trains" data-v="-1">−</span> <span class="btn" data-a="trains" data-v="1">＋</span></span><span class="btn" data-a="side">Flip entrance side</span></div>
    <div class="row"><span class="btn" data-a="autopath">🛤 Auto-connect path</span><span class="btn bad" data-a="demolish">Demolish ride</span></div>
    <div class="mut" style="margin-top:6px">Last piece: ${r.pieces.length ? pieceName(r.pieces[r.pieces.length - 1]) : '—'}${r.pieces.length ? '' : ''}</div>`;
  } else if (step === 1) {
    if (r.status !== 'testing') h += `<div class="infobox">Run a test to measure the real physics of your layout. <b>No ratings exist until a test run completes.</b></div>`;
    else h += `<div class="infobox">Testing… the train collects stats on its first lap.</div>`;
    if (r.status === 'testing' && r.sim) {
      const lv = r.sim.live, tr = r.sim.trains[0];
      h += `<div class="big" style="text-align:center;color:#ffe9a8">${mphOf(lv.v)} mph</div>
      <div class="row"><span>Lap</span>${bar(tr ? tr.s : 0, r.track.L, '#6aa7e8')}</div>
      <div class="grid g3 mut" style="text-align:center;margin:6px 0"><div>Vertical<br><b style="color:#fff">${lv.vert.toFixed(2)}G</b></div><div>Lateral<br><b style="color:#fff">${lv.lat.toFixed(2)}G</b></div><div>Longitudinal<br><b style="color:#fff">${lv.lon.toFixed(2)}G</b></div></div>
      <div class="row"><span>Test speed</span><span class="grid g3" style="width:150px">${[1, 3, 8].map((k) => `<div class="btn ${r.testSpeed === k ? 'on' : ''}" data-a="tspeed" data-v="${k}">${k}×</div>`).join('')}</span></div>
      <div class="row"><span class="mut">Trains out: ${r.sim.trains.length}/${r.trains}</span><span class="btn bad" data-a="stoptest">Stop test</span></div>`;
    } else if (r.status === 'crashed') {
      h += `<div class="warnbox"><b>Test failed.</b><br>${r.failMsg || 'The ride failed.'}</div><div class="btn" data-a="reset">Reset & edit the track</div>`;
    } else if (r.ratings) {
      h += `<div class="ok">✓ Test completed — see the Rate tab.</div><div class="btn" style="margin-top:6px" data-a="test">Run the test again</div>`;
    } else {
      h += `<div class="btn go ${v.ok ? '' : 'dis'}" data-a="test" style="padding:9px;text-align:center" title="${v.ok ? '' : 'Complete the circuit and fix the red items first'}">▶ Start test run</div>` + (v.ok ? '' : '<div class="warnbox">Complete the circuit and fix the red items first.</div>');
    }
    h += `<div class="row" style="margin-top:8px"><span></span><span class="btn bad" data-a="demolish">Demolish ride</span></div>`;
  } else if (step === 2 && r.ratings) {
    const rt = r.ratings, f = rt.info;
    h += ratingRows(rt);
    if (rt.pen) h += `<div class="warnbox">Intensity penalty: excitement ×0.75 applied ${rt.pen}× (raw ${rt.excRaw.toFixed(2)} → ${rt.exc.toFixed(2)}, keeps ${(Math.pow(0.75, rt.pen) * 100).toFixed(1)}%).</div>`;
    if (rt.inten > 10) h += `<div class="warnbox">Guests refuse to ride anything above 10.00 intensity. Nobody will ride this.</div>`;
    h += `<div class="row"><span>Ride value</span><b>${gbp(rt.value)}</b></div>
    <h4>Test run data</h4><table class="t">
    <tr><td>Max speed</td><td>${f.mph} mph</td></tr><tr><td>Average speed</td><td>${f.avgMph} mph</td></tr><tr><td>Ride length</td><td>${f.lenTiles.toFixed(1)} tiles</td></tr>
    <tr><td>Highest drop</td><td>${f.dropLv.toFixed(1)} levels</td></tr><tr><td>Air time</td><td>${f.air.toFixed(1)} s</td></tr>
    <tr><td>Max vertical G</td><td>${f.maxVert.toFixed(2)}</td></tr><tr><td>Min vertical G</td><td>${f.minVert.toFixed(2)}</td></tr>
    <tr><td>Max lateral G</td><td>${f.maxLat.toFixed(2)}</td></tr><tr><td>Max longitudinal G</td><td>${f.maxLong.toFixed(2)}</td></tr>
    <tr><td>Inversions</td><td>${f.inv}</td></tr><tr><td>Helices</td><td>${f.hel}</td></tr>
    <tr><td>Scenery nearby</td><td>${f.prox.scen}</td></tr><tr><td>Track crossings</td><td>${f.prox.cross}</td></tr>
    <tr><td>Upstop wheels</td><td>${f.upstop ? 'Yes' : 'No (derail risk)'}</td></tr></table>
    <div class="row" style="margin-top:8px"><span></span><span class="btn bad" data-a="demolish">Demolish ride</span></div>`;
  } else if (step === 3) {
    if (!r.ratings) h += `<div class="warnbox">🔒 Test the ride first. A ride without ratings cannot be priced.</div>`;
    else {
      const maxP = Math.min(2 * r.ratings.value, 20), fee = G.entryMode === 'fee';
      h += `<div class="infobox">Ride value <b>${gbp(r.ratings.value)}</b> · guests pay at most <b>${gbp(maxP)}</b> (2× value, hard cap £20.00).</div>
      <div class="row"><span>Ticket price</span><b>${fee ? 'Free (entry-fee park)' : gbp(r.price)}</b></div>
      <input type="range" data-i="price" min="0" max="20" step="0.1" value="${r.price}" ${fee ? 'disabled' : ''}>
      ${fee ? '<div class="wn">This park charges an entry fee, so rides are free. Switch in the Park window — the two are mutually exclusive.</div>' : r.price > maxP ? `<div class="warnbox">Price is above ${gbp(maxP)} — every guest will refuse to ride!</div>` : r.price > r.ratings.value ? '<div class="wn">Above ride value: fewer guests will queue.</div>' : '<div class="ok">Fair price.</div>'}`;
    }
    h += `<div class="row" style="margin-top:8px"><span></span><span class="btn bad" data-a="demolish">Demolish ride</span></div>`;
  } else if (step === 4 && r.ratings) {
    h += `${r.status === 'open' ? `<div class="btn bad" data-a="close" style="padding:9px;text-align:center">Close ride</div>` : `<div class="btn go" data-a="open" style="padding:9px;text-align:center">🎟 Open ride to guests</div>`}
    ${r.ratings.inten > 10 ? '<div class="warnbox">Intensity is above 10.00 — guests will refuse to ride.</div>' : ''}
    <h4>Operations</h4><table class="t"><tr><td>Queue length</td><td>${r.queue.length}</td></tr><tr><td>Guests carried</td><td>${r.customers}</td></tr><tr><td>Income</td><td>${gbp(r.income, 0)}</td></tr><tr><td>Ticket</td><td>${G.entryMode === 'fee' ? 'free' : gbp(r.price)}</td></tr>
    <tr><td>Refused: too intense</td><td>${r.refused.int}</td></tr><tr><td>Refused: price</td><td>${r.refused.price}</td></tr><tr><td>Refused: queue too long</td><td>${r.refused.queue}</td></tr><tr><td>Refused: nausea</td><td>${r.refused.nau}</td></tr></table>`;
  } else h += '<div class="mut">Locked.</div>';
  return h + '</div>';
}

function winSimple(r: any) {
  const isShop = r.kind === 'shop';
  let h = `<div class="wh"><span>${r.name}${stChip(r)}</span><span class="btn" data-a="closewin">✕</span></div><div class="wb">`;
  if (r.ratings) h += ratingRows(r.ratings) + `<div class="row"><span>Ride value</span><b>${gbp(r.ratings.value)}</b></div>`;
  const fee = G.entryMode === 'fee' && !isShop;
  h += `<h4>${isShop ? 'Item price' : 'Ticket price'}</h4><div class="row"><span></span><b>${fee ? 'Free (entry-fee park)' : gbp(r.price)}</b></div><input type="range" data-i="price" min="0" max="${isShop ? 6 : 20}" step="0.1" value="${r.price}" ${fee ? 'disabled' : ''}>`;
  if (r.ratings && !fee) { const maxP = Math.min(2 * r.ratings.value, 20); h += r.price > maxP ? `<div class="warnbox">Guests refuse above ${gbp(maxP)}.</div>` : ''; }
  if (!isShop) h += `<div class="row" style="margin-top:6px">${r.status === 'open' ? '<span class="btn bad" data-a="close">Close ride</span>' : '<span class="btn go" data-a="open">Open ride</span>'}</div>`;
  h += `<table class="t" style="margin-top:6px"><tr><td>Customers</td><td>${r.customers}</td></tr><tr><td>Income</td><td>${gbp(r.income, 0)}</td></tr>${isShop ? '' : `<tr><td>Queue</td><td>${r.queue.length}</td></tr><tr><td>Refused: intense / price / queue</td><td>${r.refused.int} / ${r.refused.price} / ${r.refused.queue}</td></tr>`}<tr><td>Running cost / month</td><td>${gbp(runningCost(r), 0)}</td></tr></table>
  <div class="row" style="margin-top:8px"><span></span><span class="btn bad" data-a="demolish">Demolish</span></div></div>`;
  return h;
}

function winGuest(g: any) {
  const hap = g.happiness / 255;
  const b = (n: string, v: number, good: boolean) => `<div class="row"><span style="width:70px">${n}</span>${bar(v, 255, good ? (v > 150 ? '#58c074' : v > 80 ? '#ffd166' : '#e0584a') : (v < 100 ? '#58c074' : v < 180 ? '#ffd166' : '#e0584a'))}</div>`;
  return `<div class="wh"><span>🧍 ${g.name}</span><span class="btn" data-a="closewin">✕</span></div><div class="wb">
  <div class="infobox">“${g.thought}”</div>
  ${b('Happiness', g.happiness, true)}${b('Energy', g.energy, true)}${b('Hunger', g.hunger, false)}${b('Thirst', g.thirst, false)}${b('Nausea', g.nausea, false)}${b('Bathroom', g.bathroom, false)}
  <table class="t" style="margin-top:6px"><tr><td>Money</td><td>${gbp(g.money)}</td></tr><tr><td>Spent</td><td>${gbp(g.spent)}</td></tr>
  <tr><td>Intensity window</td><td>${Math.max(0, g.intMin - hap).toFixed(1)} – ${Math.min(10, g.intMax + hap * 2).toFixed(1)}</td></tr>
  <tr><td>Price ceiling</td><td>2× ride value, max £20</td></tr><tr><td>Queue patience</td><td>${g.queueTol} guests</td></tr>
  <tr><td>Doing</td><td>${g.state}${g.intent ? ' → ' + g.intent.type : ''}</td></tr><tr><td>Time in park</td><td>${Math.round(g.age)}s</td></tr></table>
  <div class="row" style="margin-top:6px"><span class="btn ${ui.follow === g ? 'on' : ''}" data-a="follow">📷 Follow</span></div></div>`;
}

function renderWin() {
  const w = ui.win;
  if (!w) { elWin.style.display = 'none'; ui.lastWin = ''; return; }
  if (w.dead) { ui.win = null; elWin.style.display = 'none'; return; }
  const st = elWin.scrollTop;
  let h = '';
  if (w.kind === 'coaster') h = winCoaster(w); else if (w.kind) h = winSimple(w); else h = winGuest(w);
  if (h !== ui.lastWin) { elWin.innerHTML = h; ui.lastWin = h; elWin.scrollTop = st; }
  elWin.style.display = 'block';
}

function modalHtml() {
  const m = ui.modal;
  const head = (t: string) => `<div class="wh"><span>${t}</span><span class="btn" data-a="closemodal">✕</span></div><div class="wb">`;
  if (m === 'finance') {
    const cur = G.fin.cur, tot = (o: any) => Object.values(o).reduce((a: any, b: any) => a + b, 0) as number;
    const rowsI = [['rides', 'Ride tickets'], ['shops', 'Shop sales'], ['entry', 'Park entry fees']], rowsE = [['construction', 'Construction'], ['running', 'Running costs'], ['wages', 'Staff wages'], ['interest', 'Loan interest']];
    let h = head('💷 Finances') + `<div class="row"><span>Cash</span><span class="big">${gbp(G.cash, 0)}</span></div>
    <div class="row"><span>Bank loan (10% p.a.)</span><b>${gbp(G.loan, 0)}</b><span><span class="btn" data-a="loan" data-v="1000">Borrow £1,000</span> <span class="btn" data-a="loan" data-v="-1000">Repay £1,000</span></span></div>
    <h4>This month</h4><table class="t"><tr><th></th><th>Income</th><th>Expenses</th></tr>`;
    const n = Math.max(rowsI.length, rowsE.length);
    for (let i = 0; i < n; i++) h += `<tr><td>${rowsI[i] ? rowsI[i][1] : ''}${rowsI[i] ? ' <span class="mut">' + gbp(cur.inc[rowsI[i][0]] || 0, 0) + '</span>' : ''}</td><td></td><td>${rowsE[i] ? rowsE[i][1] + ' <span class="mut">' + gbp(cur.exp[rowsE[i][0]] || 0, 0) + '</span>' : ''}</td></tr>`;
    h += `<tr><td><b>Total</b></td><td class="ok">${gbp(tot(cur.inc), 0)}</td><td class="no">${gbp(tot(cur.exp), 0)}</td></tr></table>
    <h4>Fixed costs per month</h4><div class="row"><span>Staff wages (Handyman £50, Mechanic £80, Security £60, Entertainer £55)</span><b>${gbp(monthlyWages(), 0)}</b></div>
    <div class="row"><span>Interest</span><b>${gbp(G.loan * 0.1 / 12, 0)}</b></div>
    <div class="row"><span>Ride running costs</span><b>${gbp(G.rides.reduce((a: number, r: any) => a + runningCost(r), 0), 0)}</b></div>
    <h4>History (profit)</h4>${G.fin.hist.length ? G.fin.hist.map((x: any) => `<div class="row"><span style="width:70px">${x.label}</span>${bar(Math.abs(x.profit), 3000, x.profit >= 0 ? '#58c074' : '#e0584a')}<b style="width:70px;text-align:right" class="${x.profit >= 0 ? 'ok' : 'no'}">${gbp(x.profit, 0)}</b></div>`).join('') : '<div class="mut">No completed months yet.</div>'}</div>`;
    return h;
  }
  if (m === 'park') {
    const p = G.ratingParts || {}, hist = G.ratingHist;
    const pts = hist.map((v: number, i: number) => `${(i / Math.max(1, hist.length - 1)) * 300},${60 - (v / 999) * 60}`).join(' ');
    const comp = Object.entries(G.complaints).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5);
    const fee = G.entryMode === 'fee';
    return head('🏞 Park') + `<div class="row"><span>Park rating</span><span class="big" style="color:${G.parkRating >= 700 ? '#6fe08a' : '#ff7b6b'}">${Math.round(G.parkRating)}</span></div>
    <svg width="100%" viewBox="0 0 300 60" style="background:#111b26;border-radius:3px"><line x1="0" x2="300" y1="${60 - (700 / 999) * 60}" y2="${60 - (700 / 999) * 60}" stroke="#a04a40" stroke-dasharray="3 3"/><polyline fill="none" stroke="#6fe08a" stroke-width="1.5" points="${pts}"/></svg>
    <div class="mut">Dashed line = 700. The park closes after <b>29 consecutive days</b> below 700 (now: ${G.daysBelow}).</div>
    <table class="t" style="margin-top:6px"><tr><td>Base</td><td>${p.base}</td></tr><tr><td>Guest happiness (${p.n} guests)</td><td>+${p.happy}</td></tr><tr><td>Ride quality (avg exc ${(p.avgE || 0).toFixed(2)}, int ${(p.avgI || 0).toFixed(2)})</td><td>+${p.rides}</td></tr><tr><td>Guest count</td><td>+${p.guests}</td></tr><tr><td>Litter</td><td>${p.litter}</td></tr><tr><td>Crowding</td><td>${p.crowd}</td></tr><tr><td><b>Target</b></td><td><b>${p.target}</b></td></tr></table>
    <div class="mut">The formula prefers average excitement ≈ 3.68 and intensity ≈ 5.20 — not maximums.</div>
    <h4>Admission (pick ONE)</h4><div class="grid g2"><div class="btn ${fee ? '' : 'on'}" data-a="mode" data-v="ride">Pay per ride</div><div class="btn ${fee ? 'on' : ''}" data-a="mode" data-v="fee">Park entry fee</div></div>
    <div class="row" style="margin-top:6px"><span>Entry fee</span><b>${fee ? gbp(G.entryFee) : '—'}</b></div><input type="range" data-i="fee" min="0" max="20" step="0.5" value="${G.entryFee}" ${fee ? '' : 'disabled'}>
    <div class="mut">Entry-fee mode makes every ride free; per-ride mode makes entry free. They are mutually exclusive.</div>
    <h4>Guests say</h4>${comp.length ? comp.map(([k, v]: any) => `<div class="row"><span>“${k}”</span><span class="mut">${Math.round(v)}</span></div>`).join('') : '<div class="mut">Nobody is complaining.</div>'}
    <table class="t" style="margin-top:6px"><tr><td>Total guests entered</td><td>${G.stats.guestsTotal}</td></tr><tr><td>Rides taken</td><td>${G.stats.ridesTaken}</td></tr><tr><td>Turned away at the gate</td><td>${G.stats.refusedEntry}</td></tr><tr><td>Crashes</td><td>${G.stats.crashes}</td></tr></table></div>`;
  }
  if (m === 'staff') {
    return head('👷 Staff') + Object.entries(STAFF).map(([k, v]) => `<div class="row"><span style="width:140px"><b>${v.name}</b> <span class="mut">£${v.wage}/month</span></span><span>${G.staff.filter((s: any) => s.type === k).length} hired</span><span><span class="btn go" data-a="hire" data-v="${k}">Hire</span> <span class="btn bad" data-a="fire" data-v="${k}">Fire</span></span></div>`).join('') +
      `<div class="mut" style="margin-top:8px">Handymen sweep litter · Mechanics repair broken rides · Security guards deter litterbugs · Entertainers cheer up guests nearby.</div><div class="row"><span>Monthly wage bill</span><b>${gbp(monthlyWages(), 0)}</b></div></div>`;
  }
  if (m === 'rides') {
    const rs = G.rides.filter((r: any) => r.kind !== 'shop');
    return head('🎢 Rides') + `<table class="t"><tr><th>Ride</th><th>Status</th><th>Exc</th><th>Int</th><th>Nau</th><th>Queue</th></tr>${rs.map((r: any) => `<tr style="cursor:pointer" data-a="selride" data-v="${r.id}"><td>${r.name}</td><td>${r.broken ? 'broken' : r.status}</td><td>${r.ratings ? r.ratings.exc.toFixed(2) : '—'}</td><td>${r.ratings ? r.ratings.inten.toFixed(2) : '—'}</td><td>${r.ratings ? r.ratings.nau.toFixed(2) : '—'}</td><td>${r.queue.length}</td></tr>`).join('')}</table></div>`;
  }
  return '';
}
function renderModal() {
  if (!ui.modal) { elModal.style.display = 'none'; return; }
  const st = elModal.scrollTop;
  const h = modalHtml();
  if (h !== ui.lastModal) { elModal.innerHTML = h; ui.lastModal = h; elModal.scrollTop = st; }
  elModal.style.display = 'block';
}

// ---------------- actions ----------------
function openWin(w: any) { ui.win = w; ui.lastWin = ''; ui.err = ''; ui.follow = null; view.selRide = w && w.kind ? w : null; if (w && w.kind === 'coaster') { if (w.step === undefined) w.step = 0; if (w.status === 'open') w.step = 4; else if (w.ratings && w.step === 0) w.step = 2; } refreshGhost(); renderWin(); }
function setTool(t: string) {
  if (t.startsWith('cat:')) { const c = t.slice(4); ui.cat = ui.cat === c ? null : c; ui.tool = 'select'; }
  else { ui.tool = t; if (!Object.values(SUBMENUS).some((l) => l.some((s) => s.id === t))) ui.cat = null; }
  updateHover();
}
function doBuild(special: string | null) {
  const r = ui.win; if (!r || r.kind !== 'coaster') return;
  const { pieces, err } = piecesFromSel(r, r.sel, special);
  if (err) { ui.err = err; beep(160, 0.1); return; }
  const e2 = appendPieces(r, pieces);
  if (e2) { ui.err = e2; beep(160, 0.1); refreshGhost(); return; }
  ui.err = '';
  const cp = curPitch(r); if (Math.abs(r.sel.pitch - cp) > 1) r.sel.pitch = cp;
  if (cp <= 0) r.sel.lift = false;
  if (r.closed) toast(r.name + ': circuit complete! Now run the test.', 'good');
  beep(520, 0.05, 'square', 0.03);
  refreshGhost(); ui.lastWin = '';
}
export function refreshGhost() {
  view.ghostPiece = null;
  const r = ui.win;
  if (!r || r.kind !== 'coaster' || (r.step || 0) !== 0 || r.closed) return;
  const { pieces, err } = piecesFromSel(r, r.sel, ui.special);
  if (err || !pieces.length) { view.ghostPiece = null; return; }
  const pv = previewPieces(r, pieces);
  if (pv) view.ghostPiece = { T: pv.T, err: pv.err, ride: r };
}
function connectFrom(cell: number, type: number): string | null {
  const m = G.map;
  const nb4 = (i: number) => { const x = i % MAP, y = (i / MAP) | 0, o: number[] = []; if (x > 0) o.push(i - 1); if (x < MAP - 1) o.push(i + 1); if (y > 0) o.push(i - MAP); if (y < MAP - 1) o.push(i + MAP); return o; };
  if (nb4(cell).some((c) => m.path[c] > 0)) return null;
  const par = new Map<number, number>([[cell, -1]]);
  const q = [cell];
  for (let h = 0; h < q.length && h < 900; h++) {
    const c = q[h];
    for (const n of nb4(c)) {
      if (par.has(n)) continue;
      if (m.path[n] === 1) {
        const route: number[] = []; let k = c;
        while (k !== cell && k !== -1) { route.push(k); k = par.get(k)!; }
        for (const rc of route) { const e = placePath(rc % MAP, (rc / MAP) | 0, type); if (e) return e; }
        return null;
      }
      if (freeCell(n % MAP, (n / MAP) | 0)) { par.set(n, c); q.push(n); }
    }
  }
  return 'No route to an existing footpath found';
}

function act(a: string, v: string, el: HTMLElement) {
  const r = ui.win;
  switch (a) {
    case 'tool': setTool(v); break;
    case 'pause': G.paused = !G.paused; break;
    case 'speed': G.speed = +v; G.paused = false; break;
    case 'rot': cam.rot = (cam.rot + +v + 4) & 3; break;
    case 'zoom': zoomBy(+v); break;
    case 'sound': G.sound = !G.sound; break;
    case 'modal': ui.modal = ui.modal === v ? null : v; ui.lastModal = ''; break;
    case 'closemodal': ui.modal = null; break;
    case 'closewin': openWin(null); break;
    case 'selride': { const rr = G.rides.find((x: any) => x.id === +v); if (rr) { openWin(rr); ui.modal = null; centerOn(rr); } break; }
    case 'step': if (r && !el.classList.contains('lock')) { r.step = +v; ui.lastWin = ''; refreshGhost(); } break;
    case 'turn': r.sel.turn = +v; refreshGhost(); break;
    case 'pitch': r.sel.pitch = +v; refreshGhost(); break;
    case 'tog': r.sel[v] = !r.sel[v]; refreshGhost(); break;
    case 'build': doBuild(null); break;
    case 'sp': doBuild(v); break;
    case 'undo': popPiece(r); { const cp = curPitch(r); if (Math.abs(r.sel.pitch - cp) > 1) r.sel.pitch = cp; } ui.err = ''; refreshGhost(); break;
    case 'trains': { const n = clamp(r.trains + +v, 1, 3); if (n !== r.trains) { r.trains = n; resetRideTest(r); } break; }
    case 'side': { r.side *= -1; rebuild(r); if (r.entrance == null || r.exit == null) { r.side *= -1; rebuild(r); ui.err = 'No room on that side for the entrance and exit'; } else resetRideTest(r); break; }
    case 'autopath': { const e1 = r.entrance != null ? connectFrom(r.entrance, 2) : 'No entrance'; const e2 = r.exit != null ? connectFrom(r.exit, 1) : null; ui.err = e1 || e2 || ''; if (!ui.err) toast('Entrance and exit connected to the footpath', 'good'); break; }
    case 'demolish': if (confirm('Demolish ' + r.name + '? You will get 50% of the build cost back.')) { removeRide(r); openWin(null); } break;
    case 'test': if (validate(r).ok && r.closed && r.status !== 'open') { r.ratings = null; startTest(r); r.step = 1; } break;
    case 'stoptest': r.status = 'building'; r.sim = null; r.step = 1; break;
    case 'tspeed': r.testSpeed = +v; break;
    case 'reset': r.sim = null; r.status = 'building'; r.failMsg = ''; r.step = 0; refreshGhost(); break;
    case 'open': if (r.ratings && r.status !== 'open') { if (r.kind === 'coaster') startOperation(r); else r.status = 'open'; r.step = 4; toast(r.name + ' is now open!', 'good'); beep(740, 0.1, 'triangle', 0.05); } break;
    case 'close': if (r.kind === 'coaster') stopOperation(r, 'tested'); else { r.status = 'closed'; if (r.flat) { G.hooks.dismissRiders(r); } } break;
    case 'follow': ui.follow = ui.follow === r ? null : r; break;
    case 'loan': setLoan(+v); break;
    case 'mode': G.entryMode = v; if (v === 'fee' && G.entryFee === 0) G.entryFee = 2; break;
    case 'hire': hire(v); break;
    case 'fire': fire(v); break;
  }
  ui.lastWin = ''; ui.lastModal = '';
  renderWin(); renderModal(); refreshChrome();
}
function zoomBy(d: number) {
  let k = ZOOMS.findIndex((z) => Math.abs(z - cam.zoomT) < 0.01); if (k < 0) k = 2;
  cam.zoomT = ZOOMS[clamp(k + d, 0, ZOOMS.length - 1)];
}
function centerOn(r: any) {
  if (r.kind === 'coaster') { cam.fx = (r.cx + 1) * 32; cam.fy = (r.cy + 4) * 32; } else { cam.fx = r.x * 32 + 16; cam.fy = r.y * 32 + 16; }
}

// ---------------- input ----------------
function validPlaceCell(tool: string, x: number, y: number): boolean {
  const m = G.map, i = idx(x, y);
  if (x < 1 || y < 1 || x > MAP - 2 || y > MAP - 2) return false;
  if (tool === 'path' || tool === 'queue') { const ob = m.obj[i]; return m.ground[i] !== 1 && !(ob && !['tree', 'bush', 'flower'].includes(ob.t)) && !(m.occ[i] && m.occ[i].some((e: any) => e.z0 < 24)); }
  if (tool === 'bench' || tool === 'lamp' || tool === 'bin') return !!m.path[i] && !m.furn[i];
  if (SHOPS[tool]) return freeCell(x, y);
  return freeCell(x, y);
}
function updateHover() {
  const c = cellAt(ui.mouse.x, ui.mouse.y);
  view.hx = c.x; view.hy = c.y; view.cells = []; view.ghostKind = null; view.ghostCell = null;
  const t = ui.tool;
  const topH = elTop.getBoundingClientRect().bottom;
  const toolsTop = elTools.getBoundingClientRect().top;
  if (ui.mouse.y < topH || ui.mouse.y > toolsTop) return;
  if (t === 'path' || t === 'queue') view.cells = [[c.x, c.y, validPlaceCell(t, c.x, c.y)]];
  else if (t === 'bulldoze') view.cells = [[c.x, c.y, false]];
  else if (['tree1', 'tree2', 'tree3', 'bush', 'flower', 'bench', 'lamp', 'bin'].includes(t)) { view.ghostKind = t; view.ghostCell = [c.x, c.y]; view.cells = [[c.x, c.y, validPlaceCell(t, c.x, c.y)]]; }
  else if (SHOPS[t]) { const ok = freeCell(c.x, c.y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => G.map.path[idx(c.x + dx, c.y + dy)] === 1); view.ghostKind = t; view.ghostCell = [c.x, c.y]; view.cells = [[c.x, c.y, ok]]; }
  else if (t === 'carousel' || t === 'ferris') {
    const cells: any[] = []; let ok = true;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) { const f = freeCell(c.x + dx, c.y + dy); ok = ok && f; cells.push([c.x + dx, c.y + dy, f]); }
    const adj = cells.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => G.map.path[idx(x + dx, y + dy)] === 1));
    view.cells = cells.map(([x, y]) => [x, y, ok && adj]); view.ghostKind = t; view.ghostCell = [c.x, c.y];
  } else if (t.startsWith('coaster')) {
    const d = DIRS[ui.placeH], rt = rightDir(ui.placeH);
    const cells: any[] = [];
    for (let k = 0; k < 3; k++) cells.push([c.x + d[0] * k, c.y + d[1] * k, freeCell(c.x + d[0] * k, c.y + d[1] * k)]);
    cells.push([c.x - rt[0], c.y - rt[1], freeCell(c.x - rt[0], c.y - rt[1])], [c.x + d[0] * 2 - rt[0], c.y + d[1] * 2 - rt[1], freeCell(c.x + d[0] * 2 - rt[0], c.y + d[1] * 2 - rt[1])]);
    view.cells = cells;
  }
}

function applyTool(x: number, y: number, drag = false) {
  const t = ui.tool; let err: string | null = null;
  if (t === 'path') err = placePath(x, y, 1);
  else if (t === 'queue') err = placePath(x, y, 2);
  else if (t === 'bulldoze') err = bulldoze(x, y);
  else if (['tree1', 'tree2', 'tree3', 'bush', 'flower', 'bench', 'lamp', 'bin'].includes(t)) err = placeScenery(t, x, y);
  else if (SHOPS[t]) err = placeShop(t, x, y);
  else if (t === 'carousel' || t === 'ferris') err = placeFlat(t, x, y);
  else if (t.startsWith('coaster')) {
    if (G.cash < COASTER_COST) err = 'Not enough cash';
    else { const res = createCoaster(t.slice(8), x, y, ui.placeH); if (res.err) err = res.err; else { ui.tool = 'select'; ui.cat = null; openWin(res.ride); res.ride.step = 0; toast('Build the circuit piece by piece. Use ✓ checks below, then Test.', 'info'); beep(500, 0.08); refreshChrome(); } }
  }
  if (err) { if (!drag || Math.random() < 0.1) toast(err, 'bad'); beep(150, 0.08); } else if (t !== 'select') beep(400, 0.03, 'square', 0.02);
  updateHover(); ui.lastWin = '';
}

function onDown(e: PointerEvent) {
  const m = ui.mouse; m.x = e.offsetX; m.y = e.offsetY; m.down = true; m.btn = e.button; m.sx = e.offsetX; m.sy = e.offsetY; m.moved = 0;
  cv.setPointerCapture(e.pointerId);
  const topH = elTop.getBoundingClientRect().bottom;
  const toolsTop = elTools.getBoundingClientRect().top;
  if (m.y < topH || m.y > toolsTop) return;
  if (e.button === 0 && ui.tool !== 'select') { const c = cellAt(m.x, m.y); applyTool(c.x, c.y); ui.paintLast = idx(c.x, c.y); }
}
function onMove(e: PointerEvent) {
  const m = ui.mouse; const dx = e.offsetX - m.x, dy = e.offsetY - m.y; m.x = e.offsetX; m.y = e.offsetY;
  if (m.down) {
    m.moved += Math.abs(dx) + Math.abs(dy);
    if (m.btn !== 0 || ui.tool === 'select') {
      if (m.moved > 4) { const c = camScreen(); unproj(c.x - dx / cam.zoom, c.y - dy / cam.zoom, 0); cam.fx = clamp(UP.x, 0, W); cam.fy = clamp(UP.y, 0, W); ui.follow = null; }
    } else if (['path', 'queue', 'bulldoze'].includes(ui.tool)) {
      const topH = elTop.getBoundingClientRect().bottom;
      const toolsTop = elTools.getBoundingClientRect().top;
      if (m.y >= topH && m.y <= toolsTop) {
        const c = cellAt(m.x, m.y), i = idx(c.x, c.y);
        if (i !== ui.paintLast && c.x >= 0 && c.y >= 0 && c.x < MAP && c.y < MAP) { ui.paintLast = i; applyTool(c.x, c.y, true); }
      }
    }
  }
  updateHover();
}
function onUp(e: PointerEvent) {
  const m = ui.mouse; m.down = false; ui.paintLast = -1;
  if (e.button === 0 && ui.tool === 'select' && m.moved <= 4) {
    const p = pickAt(e.offsetX, e.offsetY);
    if (p.type === 'guest') { G.selected = p.g; openWin(p.g); }
    else if (p.type === 'ride') { G.selected = p.ride; openWin(p.ride); }
    else if (p.type === 'staff') toast('A ' + STAFF[p.s.type].name + ' on duty', 'info');
    else { const r = rideAt(p.x, p.y); if (r) openWin(r); }
  }
}
let wheelAcc = 0;
function onWheel(e: WheelEvent) {
  e.preventDefault();
  // Normalize: deltaMode 1 = lines, 2 = pages
  const d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 120 : 1);
  // Reset if scroll direction reversed
  if (wheelAcc !== 0 && Math.sign(d) !== Math.sign(wheelAcc)) wheelAcc = 0;
  wheelAcc += d;
  // Only step zoom after a real scroll gesture (~one wheel notch); absorbs trackpad momentum flicker
  if (Math.abs(wheelAcc) >= 60) {
    zoomBy(wheelAcc < 0 ? 1 : -1);
    wheelAcc = 0;
  }
}
function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  ui.keys[k] = e.type === 'keydown';
  if (e.type !== 'keydown') return;
  if (k === 'q') cam.rot = (cam.rot + 1) & 3;
  else if (k === 'e') cam.rot = (cam.rot + 3) & 3;
  else if (k === 'r') { ui.placeH = (ui.placeH + 1) & 3; updateHover(); }
  else if (k === 'p') G.paused = !G.paused;
  else if (k === '1' || k === '2' || k === '3') { G.speed = k === '3' ? 4 : +k; G.paused = false; }
  else if (k === '+' || k === '=') zoomBy(1);
  else if (k === '-') zoomBy(-1);
  else if (k === 'enter') { if (ui.win && ui.win.kind === 'coaster' && (ui.win.step || 0) === 0) { e.preventDefault(); doBuild(null); } }
  else if (k === 'backspace') { if (ui.win && ui.win.kind === 'coaster' && (ui.win.step || 0) === 0) { e.preventDefault(); act('undo', '', document.body); } }
  else if (k === 'escape') { ui.tool = 'select'; ui.cat = null; ui.modal = null; openWin(null); G.selected = null; view.cells = []; view.ghostKind = null; refreshChrome(); }
}

function refreshChrome() {
  elTop.innerHTML = topHtml();
  elSub.innerHTML = subHtml();
  elTools.querySelectorAll('.tb').forEach((b) => {
    const v = (b as HTMLElement).dataset.v!;
    const on = v === ui.tool || (v.startsWith('cat:') && (ui.cat === v.slice(4) || (ui.cat === null && SUBMENUS[v.slice(4)].some((s) => s.id === ui.tool))));
    b.classList.toggle('on', on);
  });
}

function updateToasts() {
  const now = performance.now();
  G.toasts = G.toasts.filter((t: any) => now - t.t < 7000);
  const h = G.toasts.map((t: any) => `<div class="toast ${t.kind}">${t.msg}</div>`).join('');
  if (h !== ui.lastToast) { elToasts.innerHTML = h; ui.lastToast = h; }
}

function overlay() {
  if (G.closed) {
    elOver.style.display = 'flex';
    elOver.innerHTML = `<div class="big" style="font-size:42px;color:#ff7b6b">PARK CLOSED</div><div style="font-size:16px;max-width:520px">The park rating stayed below 700 for 29 consecutive days and the authorities shut you down.<br><br>Guests entered: ${G.stats.guestsTotal} · Rides taken: ${G.stats.ridesTaken}</div><div class="btn go" style="font-size:16px;padding:10px 24px" data-a="restart">Start a new park</div>`;
  } else if (elOver.style.display !== 'none') elOver.style.display = 'none';
}

// ---------------- boot ----------------
export function startGame(host: HTMLElement): () => void {
  root = host;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  root.id = 'app';
  buildChrome();
  newGame(); installHooks(); spawnInitial(48);
  initRender(cv);
  const doResize = () => { resize(root.clientWidth, root.clientHeight); };
  doResize(); window.addEventListener('resize', doResize);
  cam.fx = 40 * 32; cam.fy = 24 * 32; cam.rot = 0; cam.zoom = 1; cam.zoomT = 1;
  const handler = (e: Event) => {
    const t = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!t) return;
    e.preventDefault();
    if (t.dataset.a === 'restart') { newGame(); installHooks(); spawnInitial(48); openWin(null); ui.modal = null; startWelcome(); refreshChrome(); return; }
    act(t.dataset.a!, t.dataset.v || '', t);
  };
  root.addEventListener('pointerdown', handler);
  const onInput = (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.i === 'price' && ui.win) { ui.win.price = parseFloat(t.value); }
    if (t.dataset.i === 'fee') { G.entryFee = parseFloat(t.value); }
    // update the label live without rebuilding the slider
    const lab = t.previousElementSibling ? t.previousElementSibling.querySelector('b') : null;
    if (lab) lab.textContent = gbp(parseFloat(t.value));
    ui.lastWin = ''; ui.lastModal = '';
  };
  root.addEventListener('input', onInput);
  const over = (e: Event) => { const t = (e.target as HTMLElement).closest('[data-sp]') as HTMLElement | null; const sp = t ? t.dataset.sp! : null; if (sp !== ui.special) { ui.special = sp; refreshGhost(); } };
  elWin.addEventListener('mouseover', over); elWin.addEventListener('mouseleave', () => { if (ui.special) { ui.special = null; refreshGhost(); } });
  elWin.addEventListener('pointerdown', () => { ui.dragRange = true; });
  elModal.addEventListener('pointerdown', () => { ui.dragRange = true; });
  const onUpWin = () => { ui.dragRange = false; };
  window.addEventListener('pointerup', onUpWin);
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false }); cv.addEventListener('contextmenu', (e) => e.preventDefault());
  (window as any).__rct = { G, cam, view, proj, P };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
  function startWelcome() {
    const r = G.rides.find((x: any) => x.kind === 'coaster');
    if (r) { openWin(r); r.step = 1; centerOn(r); cam.fy = 20 * 32; cam.fx = 34 * 32; }
    toast('Welcome! Your Mini Steel Coaster is built. Press “Start test run”, then Rate → Price → Open.', 'good');
    toast('Guests will decide for themselves whether it is worth riding.', 'info');
  }
  startWelcome();
  refreshChrome();
  let raf = 0, last = performance.now(), uiT = 0;
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (t - last) / 1000); last = t;
    try {
      tickWorld(dt, updateGuests, updateStaff); tickRides(dt);
      const dz = cam.zoomT - cam.zoom;
      if (Math.abs(dz) > 2e-4) cam.zoom += dz * (1 - Math.pow(0.03, dt)); else cam.zoom = cam.zoomT;
      const kx = (ui.keys['d'] || ui.keys['arrowright'] ? 1 : 0) - (ui.keys['a'] || ui.keys['arrowleft'] ? 1 : 0), ky = (ui.keys['s'] || ui.keys['arrowdown'] ? 1 : 0) - (ui.keys['w'] || ui.keys['arrowup'] ? 1 : 0);
      if (kx || ky) { const c = camScreen(); unproj(c.x + (kx * 500 * dt) / cam.zoom, c.y + (ky * 500 * dt) / cam.zoom, 0); cam.fx = clamp(UP.x, 0, W); cam.fy = clamp(UP.y, 0, W); ui.follow = null; }
      if (ui.follow && !ui.follow.dead) { cam.fx += (ui.follow.x - cam.fx) * 0.1; cam.fy += (ui.follow.y - cam.fy) * 0.1; }
      render();
      uiT += dt;
      if (uiT > 0.25) { uiT = 0; refreshChrome(); if (!ui.dragRange) { renderWin(); renderModal(); } if (ui.win && ui.win.kind === 'coaster' && (ui.win.step || 0) === 0) refreshGhost(); updateToasts(); overlay(); }
    } catch (err) { if (!ui.errLogged) { console.error(err); ui.errLogged = true; } }
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', doResize); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
    window.removeEventListener('pointerup', onUpWin);
    root.removeEventListener('pointerdown', handler); root.removeEventListener('input', onInput);
    style.remove(); root.innerHTML = '';
  };
}
void bandIndex; void blockInfo; void TRAIN_LEN; void footprint; void COASTER_COST; void FLATS;
