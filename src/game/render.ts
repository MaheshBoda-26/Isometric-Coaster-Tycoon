// Isometric canvas renderer (2:1 dimetric). All sprites are drawn procedurally.
import { G, W, MAP, cam, P, R, proj, projR, rot2, depthOf, camScreen, hash2, unproj, UP, screenToP } from './core';
import { frameAt, stationCount, CARS, CAR_SP, F_LIFT, F_BRAKE, F_BLOCK, F_STATION, F_PHOTO, F_COVER, F_NOSUP } from './track';
import { SHOPS } from './world';

export const view: any = { hx: -1, hy: -1, cells: [], ghostKind: null, ghostCell: null, ghostPiece: null, selRide: null, fps: 60 };

let cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D, dpr = 1;
const OX = W, OY = 150;
let groundCv: HTMLCanvasElement;
let groundRot = -1;
let waterCells: number[] = [];
const SPR: any = {};

// ---------- helpers ----------
const shadeCache = new Map<string, string>();
export function shade(hex: string, f: number) {
  const key = hex + f;
  let v = shadeCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f) | 0, g = Math.min(255, ((n >> 8) & 255) * f) | 0, b = Math.min(255, (n & 255) * f) | 0;
  v = `rgb(${r},${g},${b})`;
  shadeCache.set(key, v);
  return v;
}
function polyR(col: string, p: number[]) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let k = 0; k < p.length; k += 3) { projR(p[k], p[k + 1], p[k + 2]); if (k) ctx.lineTo(P.x, P.y); else ctx.moveTo(P.x, P.y); }
  ctx.closePath(); ctx.fill();
}
function polyW(col: string, p: number[]) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let k = 0; k < p.length; k += 3) { proj(p[k], p[k + 1], p[k + 2]); if (k) ctx.lineTo(P.x, P.y); else ctx.moveTo(P.x, P.y); }
  ctx.closePath(); ctx.fill();
}
let bx0 = 0, bx1 = 0, by0 = 0, by1 = 0;
function box(wx0: number, wy0: number, wx1: number, wy1: number, z0: number, z1: number, top: string, left: string, right: string) {
  rot2(wx0, wy0); const ax = R.x, ay = R.y; rot2(wx1, wy1);
  bx0 = Math.min(ax, R.x); bx1 = Math.max(ax, R.x); by0 = Math.min(ay, R.y); by1 = Math.max(ay, R.y);
  polyR(left, [bx1, by0, z0, bx1, by1, z0, bx1, by1, z1, bx1, by0, z1]);
  polyR(right, [bx0, by1, z0, bx1, by1, z0, bx1, by1, z1, bx0, by1, z1]);
  polyR(top, [bx0, by0, z1, bx1, by0, z1, bx1, by1, z1, bx0, by1, z1]);
}
function circPoly(x: number, y: number, r: number, z: number, col: string, n = 18) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; proj(x + Math.cos(a) * r, y + Math.sin(a) * r, z); if (k) ctx.lineTo(P.x, P.y); else ctx.moveTo(P.x, P.y); }
  ctx.closePath(); ctx.fill();
}
function line(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, col: string, w: number) {
  proj(x1, y1, z1); const a = P.x, b = P.y; proj(x2, y2, z2);
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(P.x, P.y); ctx.stroke();
}
const mk = (w: number, h: number, fn: (c: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d')!); return c;
};
const blob = (c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, col: string) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
const tri = (c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, col: string) => { c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); };

function makeSprites() {
  const oak = (cols: string[], trunk: string) => ({
    ax: 20, ay: 50, c: mk(40, 54, (c) => {
      blob(c, 20, 51, 13, 4, 'rgba(0,0,0,.25)');
      c.fillStyle = trunk; c.fillRect(18, 34, 5, 17);
      blob(c, 20, 26, 15, 14, cols[0]); blob(c, 12, 30, 10, 9, cols[1]); blob(c, 28, 30, 10, 9, cols[0]);
      blob(c, 20, 19, 12, 11, cols[2]); blob(c, 15, 15, 6, 5, cols[3]); blob(c, 26, 22, 4, 3, cols[3]);
    }),
  });
  SPR.tree = [
    oak(['#2e7d32', '#276b2b', '#3a9140', '#66bb6a'], '#6b4524'),
    {
      ax: 16, ay: 58, c: mk(32, 62, (c) => {
        blob(c, 16, 59, 11, 3.5, 'rgba(0,0,0,.25)'); c.fillStyle = '#5a3a1c'; c.fillRect(14, 48, 4, 11);
        tri(c, 16, 2, 3, 24, 29, 24, '#1b5e20'); tri(c, 16, 14, 1, 38, 31, 38, '#216b25'); tri(c, 16, 26, 0, 52, 32, 52, '#2a7d2e');
        tri(c, 16, 2, 16, 24, 29, 24, '#276f2b'); tri(c, 16, 14, 16, 38, 31, 38, '#2d7a31'); tri(c, 16, 26, 16, 52, 32, 52, '#34893a');
      }),
    },
    oak(['#e0a030', '#d9822b', '#f2c14e', '#ffe08a'], '#d8d2c4'),
  ];
  SPR.bush = [['#2e7d32', '#3b9440', '#43a047'], ['#3a7d44', '#4f9d5a', '#5cb86a'], ['#2f6f3a', '#3d8a49', '#d94f70']].map((cl) => ({
    ax: 12, ay: 14, c: mk(24, 18, (c) => { blob(c, 12, 15, 10, 3, 'rgba(0,0,0,.22)'); blob(c, 12, 10, 10, 7, cl[0]); blob(c, 8, 11, 6, 5, cl[1]); blob(c, 16, 9, 6, 5, cl[2]); c.fillStyle = '#ffd1dc'; c.fillRect(9, 7, 2, 2); c.fillRect(15, 11, 2, 2); }),
  }));
  SPR.flower = ['#e63946', '#ffd166', '#c77dff'].map((col) => ({
    ax: 10, ay: 8, c: mk(20, 12, (c) => { blob(c, 10, 8, 8, 3, '#3f8f3a'); for (const [x, y] of [[5, 6], [10, 4], [15, 6], [8, 8], [13, 8]]) { c.fillStyle = col; c.fillRect(x, y, 3, 3); c.fillStyle = '#fff3b0'; c.fillRect(x + 1, y + 1, 1, 1); } }),
  }));
  SPR.lamp = { ax: 5, ay: 36, c: mk(10, 40, (c) => { blob(c, 5, 37, 3, 1.5, 'rgba(0,0,0,.3)'); c.fillStyle = '#2f343f'; c.fillRect(4, 10, 2, 27); c.fillStyle = '#3d4350'; c.fillRect(3, 34, 4, 3); blob(c, 5, 8, 4.5, 4.5, '#fff1a8'); blob(c, 5, 8, 2.5, 2.5, '#ffffff'); c.fillStyle = '#2f343f'; c.fillRect(2, 3, 6, 2); }) };
  SPR.bench = { ax: 13, ay: 12, c: mk(26, 16, (c) => { c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(3, 12, 20, 3); c.fillStyle = '#5b3b1e'; c.fillRect(4, 9, 2, 4); c.fillRect(20, 9, 2, 4); c.fillStyle = '#b07a44'; c.fillRect(3, 6, 20, 4); c.fillStyle = '#8a5a2c'; c.fillRect(3, 2, 20, 3); c.fillStyle = '#c99256'; c.fillRect(3, 6, 20, 1); }) };
  SPR.bin = { ax: 6, ay: 14, c: mk(12, 16, (c) => { blob(c, 6, 14, 5, 2, 'rgba(0,0,0,.25)'); c.fillStyle = '#4f7d6a'; c.fillRect(2, 5, 8, 9); c.fillStyle = '#2f5a49'; c.fillRect(1, 3, 10, 3); c.fillStyle = '#7bb89f'; c.fillRect(3, 7, 1, 6); }) };
  SPR.litter = { ax: 4, ay: 3, c: mk(8, 6, (c) => { c.fillStyle = '#f4f4f0'; c.fillRect(0, 2, 3, 2); c.fillStyle = '#e63946'; c.fillRect(4, 1, 3, 2); c.fillStyle = '#ffd166'; c.fillRect(2, 4, 2, 1); }) };
}

// ---------- ground cache ----------
function buildGround() {
  const gc = groundCv.getContext('2d')!;
  gc.setTransform(1, 0, 0, 1, 0, 0);
  gc.clearRect(0, 0, groundCv.width, groundCv.height);
  gc.translate(OX, OY);
  const sv = ctx; ctx = gc;
  const m = G.map;
  polyR('#5e4128', [W, 0, 0, W, W, 0, W, W, -30, W, 0, -30]);
  polyR('#74502f', [0, W, 0, W, W, 0, W, W, -30, 0, W, -30]);
  polyR('#4c7f2f', [W, 0, 0, W, W, 0, W, W, -5, W, 0, -5]);
  polyR('#5e9a38', [0, W, 0, W, W, 0, W, W, -5, 0, W, -5]);
  waterCells = [];
  const grass = ['#5fae3d', '#5aa83a', '#64b241', '#5ba63a'];
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const i = y * MAP + x, gnd = m.ground[i], pth = m.path[i];
    const x0 = x * 32, y0 = y * 32, x1 = x0 + 32, y1 = y0 + 32;
    let col: string;
    if (gnd === 1) col = '#3b8ed6'; else if (pth === 1) col = '#c8bca6'; else if (pth === 2) col = '#d8b46e'; else if (gnd === 2) col = '#e3d4a0';
    else col = grass[(x + y * 3 + ((hash2(x, y) * 4) | 0)) & 3];
    polyW(col, [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0]);
    if (gnd === 1) {
      waterCells.push(i);
      polyW('#4a9ee6', [x0 + 6, y0 + 6, 0, x1 - 6, y0 + 6, 0, x1 - 6, y1 - 6, 0, x0 + 6, y1 - 6, 0]);
    } else if (pth) {
      gc.strokeStyle = pth === 1 ? 'rgba(120,108,88,.55)' : 'rgba(140,100,40,.6)'; gc.lineWidth = 1;
      proj(x0, y0, 0); gc.beginPath(); gc.moveTo(P.x, P.y); proj(x1, y0, 0); gc.lineTo(P.x, P.y); proj(x1, y1, 0); gc.lineTo(P.x, P.y); proj(x0, y1, 0); gc.lineTo(P.x, P.y); gc.closePath(); gc.stroke();
      for (let k = 0; k < 4; k++) { const u = hash2(x * 7 + k, y), v = hash2(x, y * 5 + k); proj(x0 + u * 28 + 2, y0 + v * 28 + 2, 0); gc.fillStyle = pth === 1 ? 'rgba(110,100,84,.5)' : 'rgba(150,110,50,.5)'; gc.fillRect(P.x, P.y, 1.5, 1); }
      if (pth === 2) {
        // queue railings on open edges
        const nq = (nx: number, ny: number) => nx >= 0 && ny >= 0 && nx < MAP && ny < MAP && (m.path[ny * MAP + nx] > 0 || (m.obj[ny * MAP + nx] && (m.obj[ny * MAP + nx].t === 'entr' || m.obj[ny * MAP + nx].t === 'exit')));
        const edges: [number, number, number, number, number, number][] = [[x0, y0, x1, y0, x, y - 1], [x1, y0, x1, y1, x + 1, y], [x0, y1, x1, y1, x, y + 1], [x0, y0, x0, y1, x - 1, y]];
        for (const [ax, ay, bx, by, nx, ny] of edges) {
          if (m.path[ny * MAP + nx] === 2 || (nx >= 0 && ny >= 0 && nx < MAP && ny < MAP && nq(nx, ny))) continue;
          const ox = ax === bx ? (ax === x0 ? 1.5 : -1.5) : 0, oy = ay === by ? (ay === y0 ? 1.5 : -1.5) : 0;
          proj(ax + ox, ay + oy, 0); const p1x = P.x, p1y = P.y; proj(bx + ox, by + oy, 0); const p2x = P.x, p2y = P.y;
          gc.strokeStyle = '#5a4630'; gc.lineWidth = 1.2; gc.beginPath(); gc.moveTo(p1x, p1y - 5); gc.lineTo(p2x, p2y - 5); gc.stroke();
          gc.strokeStyle = '#8a6a3c'; gc.beginPath(); gc.moveTo(p1x, p1y - 2.5); gc.lineTo(p2x, p2y - 2.5); gc.stroke();
          gc.fillStyle = '#4a3a26'; gc.fillRect(p1x - 0.5, p1y - 5, 1.2, 5); gc.fillRect(p2x - 0.5, p2y - 5, 1.2, 5);
        }
      }
    } else if (gnd !== 2) {
      for (let k = 0; k < 6; k++) { const u = hash2(x * 3 + k, y * 11), v = hash2(x * 13, y * 3 + k); proj(x0 + u * 30 + 1, y0 + v * 30 + 1, 0); gc.fillStyle = k & 1 ? '#4f9b34' : '#76c24f'; gc.fillRect(P.x, P.y, 2, 1); }
    } else {
      for (let k = 0; k < 4; k++) { const u = hash2(x * 5 + k, y * 2), v = hash2(x * 2, y * 7 + k); proj(x0 + u * 30 + 1, y0 + v * 30 + 1, 0); gc.fillStyle = '#cdbb86'; gc.fillRect(P.x, P.y, 2, 1); }
    }
  }
  ctx = sv;
  groundRot = cam.rot & 3;
  G.groundDirty = false;
}

// ---------- init / resize ----------
export function initRender(canvas: HTMLCanvasElement) {
  cv = canvas; ctx = canvas.getContext('2d')!;
  groundCv = document.createElement('canvas'); groundCv.width = 2 * W; groundCv.height = W + OY + 60;
  makeSprites();
}
export function resize(w: number, h: number) {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cam.vw = w; cam.vh = h;
}

// ---------- objects ----------
function drawShop(sub: string, x: number, y: number) {
  const d = SHOPS[sub], h = 11;
  const c = d.color;
  box(x - h, y - h, x + h, y + h, 0, 15, shade(c, 1.1), shade(c, 0.85), shade(c, 0.65));
  const X1 = bx1, Y1 = by1, X0 = bx0, Y0 = by0;
  // serving windows
  polyR('#20242c', [X1, Y0 + 5, 5, X1, Y1 - 5, 5, X1, Y1 - 5, 11, X1, Y0 + 5, 11]);
  polyR('#20242c', [X0 + 5, Y1, 5, X1 - 5, Y1, 5, X1 - 5, Y1, 11, X0 + 5, Y1, 11]);
  // striped awnings
  for (let k = 0; k < 4; k++) {
    const a = Y0 + 2 + (k * (Y1 - Y0 - 4)) / 4, b = Y0 + 2 + ((k + 1) * (Y1 - Y0 - 4)) / 4;
    polyR(k & 1 ? '#ffffff' : d.roof, [X1, a, 15, X1, b, 15, X1 + 5, b, 10, X1 + 5, a, 10]);
    const a2 = X0 + 2 + (k * (X1 - X0 - 4)) / 4, b2 = X0 + 2 + ((k + 1) * (X1 - X0 - 4)) / 4;
    polyR(k & 1 ? '#ffffff' : d.roof, [a2, Y1, 15, b2, Y1, 15, b2, Y1 + 5, 10, a2, Y1 + 5, 10]);
  }
  polyR(shade(d.roof, 0.95), [X0 - 1, Y0 - 1, 15, X1, Y0 - 1, 15, X1, Y1, 15, X0 - 1, Y1, 15]);
  proj(x, y, 21);
  ctx.fillStyle = '#f7f2e0'; ctx.fillRect(P.x - 7, P.y - 5, 14, 9); ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.strokeRect(P.x - 7, P.y - 5, 14, 9);
  ctx.fillStyle = '#222'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(sub === 'burger' ? 'BURGER' : sub === 'drink' ? 'DRINK' : sub === 'toilet' ? 'WC' : 'INFO', P.x, P.y + 2);
  ctx.fillStyle = '#d0c9a8'; ctx.fillRect(P.x - 1, P.y + 4, 2, 5);
}

function drawCarousel(x: number, y: number, anim: number) {
  circPoly(x, y, 27, 0, '#6b7080'); circPoly(x, y, 27, 2, '#8a8f9c'); circPoly(x, y, 26, 4, '#cfd3dc'); circPoly(x, y, 25, 5, '#b8bcc8');
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = anim * 2 + (k / n) * Math.PI * 2, hx = x + Math.cos(a) * 17, hy = y + Math.sin(a) * 17, bob = Math.sin(anim * 6 + k * 2) * 3;
    line(hx, hy, 5, hx, hy, 24 + bob, '#f4f0d0', 1);
    proj(hx, hy, 14 + bob); ctx.fillStyle = ['#f2f2f2', '#d97a3a', '#8a5a2c', '#e8c860', '#c0408a', '#4a80d0'][k]; ctx.fillRect(P.x - 3, P.y - 3, 6, 5); ctx.fillRect(P.x + 1, P.y - 6, 2.5, 3);
  }
  line(x, y, 5, x, y, 36, '#e8d27a', 3);
  const wedges: { k: number; a: number }[] = [];
  const nw = 12;
  for (let k = 0; k < nw; k++) { const a = ((k + 0.5) / nw) * Math.PI * 2; wedges.push({ k, a: depthOf(x + Math.cos(a) * 20, y + Math.sin(a) * 20) }); }
  circPoly(x, y, 29, 31, '#8a2a2a');
  wedges.sort((p, q) => p.a - q.a);
  for (const w of wedges) {
    const a0 = (w.k / nw) * Math.PI * 2, a1 = ((w.k + 1) / nw) * Math.PI * 2;
    polyW(w.k & 1 ? '#f4f1e6' : '#d6403a', [x + Math.cos(a0) * 29, y + Math.sin(a0) * 29, 31, x + Math.cos(a1) * 29, y + Math.sin(a1) * 29, 31, x, y, 50]);
  }
  proj(x, y, 53); ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(P.x, P.y, 2.2, 0, 7); ctx.fill();
}

function drawFerris(x: number, y: number, anim: number) {
  const zc = 48, Rr = 38;
  box(x - 36, y - 14, x + 36, y + 14, 0, 3, '#9aa0ac', '#6e7482', '#575c69');
  const sides = [-9, 9].sort((a, b) => depthOf(x, y + a) - depthOf(x, y + b));
  for (const s of sides) {
    line(x - 30, y + s, 3, x, y + s, zc, '#e8e4d8', 2); line(x + 30, y + s, 3, x, y + s, zc, '#e8e4d8', 2);
    ctx.strokeStyle = '#d6403a'; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 0; k <= 32; k++) { const a = (k / 32) * Math.PI * 2; proj(x + Math.cos(a) * Rr, y + s, zc + Math.sin(a) * Rr); if (k) ctx.lineTo(P.x, P.y); else ctx.moveTo(P.x, P.y); }
    ctx.stroke();
    ctx.strokeStyle = '#f0ece0'; ctx.lineWidth = 1;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2 + anim * 0.3; line(x, y + s, zc, x + Math.cos(a) * Rr, y + s, zc + Math.sin(a) * Rr, '#f0ece0', 1); }
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + anim * 0.3, gx = x + Math.cos(a) * Rr, gz = zc + Math.sin(a) * Rr;
    line(gx, y - 9, gz, gx, y + 9, gz, '#444', 1);
    proj(gx, y, gz - 7); ctx.fillStyle = ['#f2c14e', '#4d8bd0', '#e63946', '#8ac926', '#c77dff'][k % 5]; ctx.fillRect(P.x - 5, P.y - 3, 10, 7); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(P.x - 4, P.y - 2, 8, 2);
  }
  proj(x, y, zc); ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(P.x, P.y, 3, 0, 7); ctx.fill();
}

function drawBooth(t: string, ride: any, x: number, y: number) {
  const col = t === 'entr' ? '#2f9e5a' : '#c0392b';
  box(x - 10, y - 10, x + 10, y + 10, 0, 16, shade(ride.color || '#888', 1.1), '#d9d2bd', '#b3ac98');
  polyR(shade(col, 1), [bx0 - 2, by0 - 2, 16, bx1 + 2, by0 - 2, 16, bx1 + 2, by1 + 2, 16, bx0 - 2, by1 + 2, 16]);
  polyR(shade(col, 0.8), [bx1 + 2, by0 - 2, 16, bx1 + 2, by1 + 2, 16, bx1 + 2, by1 + 2, 13, bx1 + 2, by0 - 2, 13]);
  proj(x, y, 22); ctx.fillStyle = col; ctx.fillRect(P.x - 8, P.y - 4, 16, 8); ctx.fillStyle = '#fff'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(t === 'entr' ? 'ENTER' : 'EXIT', P.x, P.y + 2);
}

function drawGate(x: number, y: number) {
  box(x - 17, y - 4, x - 9, y + 4, 0, 36, '#e8d8a8', '#c9b57e', '#a99660');
  box(x + 9, y - 4, x + 17, y + 4, 0, 36, '#e8d8a8', '#c9b57e', '#a99660');
  box(x - 17, y - 4, x + 17, y + 4, 36, 46, '#d6403a', '#b32f2a', '#8f2420');
  proj(x, y + 5, 41); ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('RCT PARK', P.x, P.y + 1);
  proj(x - 13, y, 50); ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(P.x, P.y, 3, 0, 7); ctx.fill();
  proj(x + 13, y, 50); ctx.beginPath(); ctx.arc(P.x, P.y, 3, 0, 7); ctx.fill();
}

function jitter(x: number, y: number) { const cx = (x / 32) | 0, cy = (y / 32) | 0; return [(hash2(cx, cy) - 0.5) * 12, (hash2(cy, cx + 3) - 0.5) * 12]; }

function drawObj(ob: any, x: number, y: number) {
  switch (ob.t) {
    case 'tree': { const [jx, jy] = jitter(x, y); proj(x + jx, y + jy, 0); const s = SPR.tree[ob.v % 3]; ctx.drawImage(s.c, Math.round(P.x - s.ax), Math.round(P.y - s.ay)); break; }
    case 'bush': { const [jx, jy] = jitter(x, y); proj(x + jx, y + jy, 0); const s = SPR.bush[ob.v % 3]; ctx.drawImage(s.c, Math.round(P.x - s.ax), Math.round(P.y - s.ay)); break; }
    case 'flower': { const [jx, jy] = jitter(x, y); proj(x + jx * 0.5, y + jy * 0.5, 0); const s = SPR.flower[ob.v % 3]; ctx.drawImage(s.c, Math.round(P.x - s.ax), Math.round(P.y - s.ay)); break; }
    case 'shop': drawShop(ob.ride.sub, x, y); break;
    case 'flat': if (ob.ride.sub === 'carousel') drawCarousel(x, y, ob.ride.anim || 0); else drawFerris(x, y, ob.ride.anim || 0); break;
    case 'entr': case 'exit': drawBooth(ob.t, ob.ride, x, y); break;
    case 'gate': drawGate(x, y); break;
  }
}
function drawFurn(f: any, x: number, y: number) {
  const s = SPR[f.t]; proj(x + (f.t === 'bench' ? 8 : 10), y - (f.t === 'bench' ? 0 : 10), 0);
  ctx.drawImage(s.c, Math.round(P.x - s.ax), Math.round(P.y - s.ay));
}

// ---------- track ----------
function pt(T: any, i: number, sr: number, su: number) {
  proj(T.X[i] + T.RX[i] * sr + T.UX[i] * su, T.Y[i] + T.RY[i] * sr + T.UY[i] * su, T.Z[i] + T.RZ[i] * sr + T.UZ[i] * su);
}
function drawSeg(ride: any, T: any, i: number, ghost: string | null) {
  const n = T.n;
  const j = T.closed ? (i + 2) % n : Math.min(i + 2, n - 1);
  if (j === i) return;
  const fl = T.flag[i];
  const wood = ride.sub === 'wood';
  // pillar
  if (!(fl & F_NOSUP) && T.Z[i] > 5 && (i & 3) === 0) {
    proj(T.X[i], T.Y[i], T.Z[i] - 4); const a = P.x, b = P.y; proj(T.X[i], T.Y[i], 0);
    ctx.strokeStyle = ghost || (wood ? '#6b4423' : '#aeb4c2'); ctx.lineWidth = wood ? 2.6 : 2; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(P.x, P.y); ctx.stroke();
    if (!ghost) { ctx.strokeStyle = wood ? '#93663a' : '#e4e8f0'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(a - 0.8, b); ctx.lineTo(P.x - 0.8, P.y); ctx.stroke(); }
    if (wood && !ghost && (i & 7) === 0 && T.Z[i] > 20) {
      for (let zz = 12; zz < T.Z[i] - 6; zz += 14) { proj(T.X[i], T.Y[i], zz); const q = P.y; ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.x - 4, q + 3); ctx.lineTo(P.x + 4, q - 3); ctx.stroke(); }
    }
  }
  pt(T, i, -5, 2); const lx0 = P.x, ly0 = P.y; pt(T, i, 5, 2); const rx0 = P.x, ry0 = P.y;
  pt(T, j, -5, 2); const lx1 = P.x, ly1 = P.y; pt(T, j, 5, 2); const rx1 = P.x, ry1 = P.y;
  // sleeper band
  let band = wood ? '#4a3420' : '#262a38';
  if (fl & F_BLOCK) band = '#c0262a'; else if (fl & F_BRAKE) band = '#e08a10'; else if (fl & F_PHOTO) band = '#3a8fd0';
  if (fl & F_STATION) band = '#6b7280';
  ctx.fillStyle = ghost ? ghost : band; ctx.beginPath(); ctx.moveTo(lx0, ly0); ctx.lineTo(rx0, ry0); ctx.lineTo(rx1, ry1); ctx.lineTo(lx1, ly1); ctx.closePath(); ctx.fill();
  const rc = ghost || (wood ? '#c58c4a' : ride.color);
  ctx.strokeStyle = rc; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(lx0, ly0); ctx.lineTo(lx1, ly1); ctx.moveTo(rx0, ry0); ctx.lineTo(rx1, ry1); ctx.stroke();
  if (!ghost) {
    ctx.strokeStyle = wood ? '#7a5230' : shade(ride.color, 0.6); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx0, ly0); ctx.lineTo(rx0, ry0); ctx.stroke();
    if (fl & F_LIFT) { ctx.fillStyle = '#111'; ctx.fillRect((lx0 + rx0) / 2 - 1, (ly0 + ry0) / 2 - 1, 2, 2); ctx.fillRect((lx1 + rx1) / 2 - 1, (ly1 + ry1) / 2 - 1, 2, 2); }
    if (fl & F_COVER) {
      pt(T, i, -6, 14); const a1 = P.x, a2 = P.y; pt(T, i, 6, 14); const b1 = P.x, b2 = P.y; pt(T, j, 6, 14); const c1 = P.x, c2 = P.y; pt(T, j, -6, 14); const d1 = P.x, d2 = P.y;
      ctx.fillStyle = 'rgba(52,58,76,.88)'; ctx.beginPath(); ctx.moveTo(a1, a2); ctx.lineTo(b1, b2); ctx.lineTo(c1, c2); ctx.lineTo(d1, d2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(38,42,56,.9)'; ctx.beginPath(); ctx.moveTo(lx0, ly0); ctx.lineTo(a1, a2); ctx.lineTo(d1, d2); ctx.lineTo(lx1, ly1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.lineTo(b1, b2); ctx.lineTo(c1, c2); ctx.lineTo(rx1, ry1); ctx.closePath(); ctx.fill();
    }
    if (fl & F_PHOTO && (i & 7) === 0) { pt(T, i, 12, 0); const px = P.x, py = P.y; ctx.fillStyle = '#2a2f3a'; ctx.fillRect(px - 1, py - 14, 2, 14); ctx.fillStyle = '#9ad0ff'; ctx.fillRect(px - 4, py - 19, 8, 6); ctx.fillStyle = '#fff'; ctx.fillRect(px - 1, py - 17, 2, 2); }
  }
}

function drawPlatform(ride: any, j: number) {
  const T = ride.track;
  const i0 = ride.pieceSamp0[j], i1 = ride.pieceSamp0[j + 1] ?? T.n, im = (i0 + i1) >> 1;
  const cx = T.X[im], cy = T.Y[im], z = T.Z[im], tx = Math.round(T.TX[im]), ty = Math.round(T.TY[im]);
  const sx = -ty * 0 + (-T.RX[im]) * -ride.side * -1, sy = (-T.RY[im]) * -ride.side * -1;
  void sx; void sy;
  const lx = Math.round(T.RX[im]) * ride.side, ly = Math.round(T.RY[im]) * ride.side;
  const ex = (a: number, b: number) => [cx + tx * a + lx * b, cy + ty * a + ly * b];
  const p1 = ex(-16, 6), p2 = ex(16, 20);
  box(Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1]), z - 8, z - 2, '#c9ccd6', '#9a9eab', '#7e8290');
  // safety rail on outer side
  const r1 = ex(-16, 19), r2 = ex(16, 19);
  line(r1[0], r1[1], z - 2, r2[0], r2[1], z - 2, '#444b57', 1);
  line(r1[0], r1[1], z + 3, r2[0], r2[1], z + 3, '#e0e4ec', 1);
  // roof
  const q1 = ex(-17, -9), q2 = ex(17, 21);
  const mnx = Math.min(q1[0], q2[0]), mxx = Math.max(q1[0], q2[0]), mny = Math.min(q1[1], q2[1]), mxy = Math.max(q1[1], q2[1]);
  for (const [px, py] of [[mnx + 1, mny + 1], [mxx - 2, mny + 1], [mnx + 1, mxy - 2], [mxx - 2, mxy - 2]]) line(px, py, z - 2, px, py, z + 24, '#c8ccd6', 1.6);
  ctx.globalAlpha = 0.82;
  box(mnx, mny, mxx, mxy, z + 24, z + 28, shade(ride.color, 1.05), shade(ride.color, 0.8), shade(ride.color, 0.62));
  ctx.globalAlpha = 1;
}

function drawCar(it: any) {
  const o = it.f, ride = it.ride, tr = it.tr;
  const col = it.ci === 0 ? shade(ride.color, 0.72) : ride.color;
  const rx = o.x - o.tx * 6.5 + o.ux * 3.5, ry = o.y - o.ty * 6.5 + o.uy * 3.5, rz = o.z - o.tz * 6.5 + o.uz * 3.5;
  const fx = o.x + o.tx * 6.5 + o.ux * 3.5, fy = o.y + o.ty * 6.5 + o.uy * 3.5, fz = o.z + o.tz * 6.5 + o.uz * 3.5;
  proj(rx, ry, rz); const a = P.x, b = P.y; proj(fx, fy, fz); const c = P.x, d = P.y;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#15151d'; ctx.lineWidth = 8.2; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = 6.2; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(a, b - 1.8); ctx.lineTo(c, d - 1.8); ctx.stroke();
  ctx.lineCap = 'butt';
  for (let s = 0; s < 2; s++) {
    const g = tr.guests[it.ci * 2 + s];
    if (!g) continue;
    const sg = s ? 2.4 : -2.4;
    proj(o.x + o.rx * sg + o.ux * 9.5, o.y + o.ry * sg + o.uy * 9.5, o.z + o.rz * sg + o.uz * 9.5);
    ctx.fillStyle = g.shirt; ctx.fillRect(P.x - 2, P.y, 4, 3.5);
    ctx.fillStyle = '#f1c9a0'; ctx.beginPath(); ctx.arc(P.x, P.y - 1.2, 2.1, 0, 7); ctx.fill();
  }
}

// ---------- people ----------
function drawGuest(g: any, sel: boolean) {
  proj(g.x, g.y, 0);
  const sx = Math.round(P.x), bob = g.state === 'walk' ? Math.abs(Math.sin(g.bob)) * 1.3 : 0, sy = Math.round(P.y - bob);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(sx - 3, Math.round(P.y) - 1, 6, 2);
  ctx.fillStyle = g.pants; ctx.fillRect(sx - 2, sy - 4, 4, 4);
  ctx.fillStyle = g.shirt; ctx.fillRect(sx - 3, sy - 8, 6, 5);
  ctx.fillStyle = g.nausea > 150 ? '#a8d98a' : '#f1c9a0'; ctx.fillRect(sx - 2, sy - 11, 4, 3);
  if (g.state === 'queue' && (g.qi || 0) % 2) { ctx.fillStyle = g.pants; ctx.fillRect(sx - 2, sy - 12, 4, 1); }
  if (sel) { ctx.strokeStyle = '#ffe45e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx - 4, sy - 22 - Math.sin(performance.now() / 150) * 2); ctx.lineTo(sx, sy - 16); ctx.lineTo(sx + 4, sy - 22 - Math.sin(performance.now() / 150) * 2); ctx.stroke(); }
}
const STAFF_COL: any = { handyman: ['#f28c28', '#3a3a3a'], mechanic: ['#2b6cb0', '#222'], security: ['#1f2a44', '#1f2a44'], entertainer: ['#c04be0', '#ffd23a'] };
function drawStaff(s: any) {
  proj(s.x, s.y, 0);
  const sx = Math.round(P.x), sy = Math.round(P.y - Math.abs(Math.sin(s.bob || 0)));
  const c = STAFF_COL[s.type];
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(sx - 3, Math.round(P.y) - 1, 7, 2);
  ctx.fillStyle = c[1]; ctx.fillRect(sx - 2, sy - 4, 4, 4);
  ctx.fillStyle = c[0]; ctx.fillRect(sx - 3, sy - 9, 6, 6);
  ctx.fillStyle = '#f1c9a0'; ctx.fillRect(sx - 2, sy - 12, 4, 3);
  ctx.fillStyle = s.type === 'entertainer' ? '#ffd23a' : c[0]; ctx.fillRect(sx - 3, sy - 14, 6, s.type === 'entertainer' ? 4 : 2);
  if (s.type === 'handyman') { ctx.fillStyle = '#c9a063'; ctx.fillRect(sx + 3, sy - 10, 1, 9); }
}

function drawEffect(e: any) {
  const t = e.t;
  proj(e.x, e.y, e.z + 6);
  if (e.kind === 'roll') { ctx.fillStyle = `rgba(255,70,50,${0.6 + Math.sin(t * 8) * 0.3})`; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', P.x, P.y - 10); return; }
  if (t < 1.8) {
    for (let k = 0; k < 9; k++) {
      const a = k * 0.7 + 0.3, r = t * 34 * (0.5 + (k % 3) * 0.3);
      ctx.fillStyle = `rgba(${255 - k * 8},${150 - (k % 3) * 40},30,${Math.max(0, 1 - t / 1.8)})`;
      ctx.beginPath(); ctx.arc(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * 0.6 - t * 16, 7 - t * 2.5 + (k % 2) * 2, 0, 7); ctx.fill();
    }
  } else { ctx.fillStyle = 'rgba(60,60,60,.5)'; ctx.beginPath(); ctx.arc(P.x, P.y - 12 - (t - 1.8) * 6, 6 + (t - 1.8) * 2, 0, 7); ctx.fill(); }
}

// ---------- ghost / overlays ----------
function diamond(x: number, y: number, w: number, h: number, fill: string, stroke: string) {
  proj(x * 32, y * 32, 0); const a = P.x, b = P.y; proj((x + w) * 32, y * 32, 0); const c = P.x, d = P.y;
  proj((x + w) * 32, (y + h) * 32, 0); const e = P.x, f = P.y; proj(x * 32, (y + h) * 32, 0);
  ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e, f); ctx.lineTo(P.x, P.y); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
}
function drawGhostObj(kind: string, cx: number, cy: number) {
  const x = cx * 32 + 16, y = cy * 32 + 16;
  ctx.globalAlpha = 0.65;
  if (kind.startsWith('tree')) drawObj({ t: 'tree', v: +kind.slice(4) - 1 }, x, y);
  else if (kind === 'bush' || kind === 'flower') drawObj({ t: kind, v: 0 }, x, y);
  else if (kind === 'bench' || kind === 'lamp' || kind === 'bin') drawFurn({ t: kind }, x, y);
  else if (SHOPS[kind]) drawShop(kind, x, y);
  else if (kind === 'carousel') drawCarousel(x + 16, y + 16, 0);
  else if (kind === 'ferris') drawFerris(x + 16, y + 16, 0);
  ctx.globalAlpha = 1;
}

// ---------- main render ----------
const items: any[] = [];
let lastT = performance.now(), fpsAcc = 0, fpsN = 0;

export function render() {
  const now = performance.now();
  fpsAcc += now - lastT; fpsN++; lastT = now;
  if (fpsAcc > 500) { view.fps = Math.round((fpsN * 1000) / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (groundRot !== (cam.rot & 3) || G.groundDirty) buildGround();
  const vw = cam.vw, vh = cam.vh, z = cam.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#18222e'; ctx.fillRect(0, 0, cv.width, cv.height);
  const c = camScreen();
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - c.x * z), dpr * (vh / 2 - c.y * z));
  ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality !== undefined) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(groundCv, -OX, -OY);
  const vx0 = c.x - vw / (2 * z) - 70, vx1 = c.x + vw / (2 * z) + 70, vy0 = c.y - vh / (2 * z) - 280, vy1 = c.y + vh / (2 * z) + 80;
  // water shimmer
  const tt = now / 1000;
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let k = 0; k < waterCells.length; k++) {
    const i = waterCells[k], x = i % MAP, y = (i / MAP) | 0;
    const u = hash2(x, y), ph = Math.sin(tt * 1.3 + u * 20);
    if (ph < 0.3) continue;
    proj(x * 32 + u * 24 + 4, y * 32 + hash2(y, x) * 24 + 4, 0);
    if (P.x < vx0 || P.x > vx1 || P.y < vy0 || P.y > vy1) continue;
    ctx.fillRect(P.x, P.y, 5, 1);
  }
  collect(vx0, vx1, vy0, vy1);
  items.sort((a, b) => a.k - b.k);
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    switch (it.t) {
      case 0: drawObj(it.a, it.x, it.y); break;
      case 1: drawSeg(it.ride, it.ride.track, it.i, null); break;
      case 2: drawGuest(it.g, G.selected === it.g); break;
      case 3: drawCar(it); break;
      case 4: drawStaff(it.s); break;
      case 5: drawFurn(it.a, it.x, it.y); break;
      case 6: { proj(it.x + ((it.i * 7) % 11) - 5, it.y + ((it.i * 3) % 9) - 4, 0); ctx.drawImage(SPR.litter.c, Math.round(P.x - 4), Math.round(P.y - 3)); if (it.a > 1) ctx.drawImage(SPR.litter.c, Math.round(P.x + 6), Math.round(P.y + 2)); break; }
      case 7: drawPlatform(it.ride, it.j); break;
      case 8: drawEffect(it.e); break;
    }
  }
  // selected ride marker
  const sr = view.selRide || (G.selected && G.selected.kind ? G.selected : null);
  if (sr) {
    const cells: number[][] = [];
    if (sr.kind === 'coaster') { if (sr.entrance != null) cells.push([sr.entrance % MAP, (sr.entrance / MAP) | 0]); if (sr.exit != null) cells.push([sr.exit % MAP, (sr.exit / MAP) | 0]); }
    else for (let dx = 0; dx < sr.w; dx++) for (let dy = 0; dy < sr.h2; dy++) cells.push([sr.x + dx, sr.y + dy]);
    const pulse = 0.25 + 0.15 * Math.sin(now / 200);
    for (const [x, y] of cells) diamond(x, y, 1, 1, `rgba(255,228,94,${pulse})`, '#ffe45e');
  }
  // ghost track
  if (view.ghostPiece && view.ghostPiece.T) {
    const T = view.ghostPiece.T, col = view.ghostPiece.err ? 'rgba(255,70,70,.8)' : 'rgba(80,255,130,.85)';
    const ride = view.ghostPiece.ride;
    for (let i = 0; i < T.n; i += 2) drawSeg(ride, T, i, col);
  }
  for (const [x, y, ok] of view.cells) diamond(x, y, 1, 1, ok ? 'rgba(80,255,120,.28)' : 'rgba(255,60,60,.32)', ok ? '#5dff88' : '#ff5c5c');
  if (view.ghostKind && view.ghostCell) drawGhostObj(view.ghostKind, view.ghostCell[0], view.ghostCell[1]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function collect(vx0: number, vx1: number, vy0: number, vy1: number) {
  items.length = 0;
  const m = G.map;
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const i = y * MAP + x, ob = m.obj[i], fu = m.furn[i], li = m.litter[i];
    if (!ob && !fu && !li) continue;
    const wx = x * 32 + 16, wy = y * 32 + 16;
    proj(wx, wy, 0);
    if (P.x < vx0 || P.x > vx1 || P.y < vy0 || P.y > vy1) continue;
    const k = depthOf(wx, wy);
    if (ob) {
      if (ob.t === 'flat') { if (ob.main) items.push({ k: depthOf(wx + 16, wy + 16), t: 0, a: ob, x: wx + 16, y: wy + 16 }); }
      else items.push({ k, t: 0, a: ob, x: wx, y: wy });
    }
    if (fu) items.push({ k: k + 0.1, t: 5, a: fu, x: wx, y: wy });
    if (li) items.push({ k: k + 0.05, t: 6, a: li, x: wx, y: wy, i });
  }
  for (const r of G.rides) {
    if (r.kind !== 'coaster' || !r.track) continue;
    const T = r.track;
    for (let i = 0; i < T.n; i += 2) {
      proj(T.X[i], T.Y[i], T.Z[i]);
      if (P.x < vx0 || P.x > vx1 || P.y < vy0 || P.y > vy1) continue;
      items.push({ k: depthOf(T.X[i], T.Y[i]) + T.Z[i] * 0.02, t: 1, ride: r, i });
    }
    for (let j = 0; j < r.pieces.length; j++) if (r.pieces[j].station) {
      const i0 = r.pieceSamp0[j], im = i0 + 3;
      proj(T.X[im], T.Y[im], T.Z[im]);
      if (P.x < vx0 || P.x > vx1 || P.y < vy0 || P.y > vy1) continue;
      items.push({ k: depthOf(T.X[im], T.Y[im]) + T.Z[im] * 0.02 + 0.5, t: 7, ride: r, j });
    }
    if (!r.sim && r.closed) {
      const ns = stationCount(r);
      const stop = T.S[r.pieceSamp0[ns]] - 2;
      const tr = { s: stop, guests: [] as any[] };
      for (let k = 0; k < CARS; k++) {
        const f: any = frameAt(T, tr.s - k * CAR_SP, {});
        items.push({ k: depthOf(f.x, f.y) + f.z * 0.02 + 0.3, t: 3, ride: r, tr, f, ci: k });
      }
    }
    if (r.sim) {
      for (const tr of r.sim.trains) {
        for (let k = 0; k < CARS; k++) {
          const f: any = frameAt(T, tr.s - k * CAR_SP, {});
          items.push({ k: depthOf(f.x, f.y) + f.z * 0.02 + 0.3, t: 3, ride: r, tr, f, ci: k });
        }
      }
      for (const e of r.sim.effects) items.push({ k: depthOf(e.x, e.y) + 5000, t: 8, e });
    }
  }
  for (const g of G.guests) {
    if (g.state === 'ride') continue;
    proj(g.x, g.y, 0);
    if (P.x < vx0 || P.x > vx1 || P.y < vy0 || P.y > vy1) continue;
    items.push({ k: depthOf(g.x, g.y) + 0.2, t: 2, g });
  }
  for (const s of G.staff) items.push({ k: depthOf(s.x, s.y) + 0.2, t: 4, s });
}

// ---------- picking ----------
export function cellAt(mx: number, my: number, z = 0) {
  const p = screenToP(mx, my);
  unproj(p.x, p.y, z);
  return { x: Math.floor(UP.x / 32), y: Math.floor(UP.y / 32) };
}
export function pickAt(mx: number, my: number): any {
  const p = screenToP(mx, my);
  let best: any = null, bd = 1e9;
  for (const g of G.guests) {
    if (g.state === 'ride') continue;
    proj(g.x, g.y, 0);
    const dx = P.x - p.x, dy = P.y - 6 - p.y;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 9) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { type: 'guest', g }; } }
  }
  if (best) return best;
  for (const s of G.staff) {
    proj(s.x, s.y, 0);
    if (Math.abs(P.x - p.x) < 6 && Math.abs(P.y - 7 - p.y) < 10) return { type: 'staff', s };
  }
  for (const r of G.rides) {
    if (r.kind !== 'coaster' || !r.track) continue;
    const T = r.track;
    for (let i = 0; i < T.n; i += 2) {
      proj(T.X[i], T.Y[i], T.Z[i]);
      const dx = P.x - p.x, dy = P.y - p.y, d = dx * dx + dy * dy;
      if (d < 64 && d < bd) { bd = d; best = { type: 'ride', ride: r }; }
    }
  }
  if (best) return best;
  // flat rides / shops: test sprite above the tile
  for (let dz = 0; dz <= 40; dz += 8) {
    unproj(p.x, p.y, dz);
    const cx = Math.floor(UP.x / 32), cy = Math.floor(UP.y / 32);
    if (cx >= 0 && cy >= 0 && cx < MAP && cy < MAP) {
      const ob = G.map.obj[cy * MAP + cx];
      if (ob && ob.ride) return { type: 'ride', ride: ob.ride };
    }
  }
  const c = cellAt(mx, my);
  return { type: 'cell', x: c.x, y: c.y };
}
