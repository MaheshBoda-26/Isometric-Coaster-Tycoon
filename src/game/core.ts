// Core constants, 2:1 dimetric projection (4 rotations), shared helpers & global state.
export const TILE = 32; // world units per tile  -> 64x32 px footprint
export const MAP = 48;
export const W = TILE * MAP;
export const HSTEP = 8; // height units per level
export const DIRS: number[][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const rightDir = (h: number) => DIRS[(h + 3) & 3];
export const GRAV = 24.5; // u/s^2   (1u = 0.4m)
export const VCONV = 26062; // u/s -> internal velocity units, mph = (v*9)>>18
export const DAY_SEC = 6; // real seconds per game day at 1x

export const cam = { rot: 0, fx: W / 2, fy: W / 2 + 200, zoom: 1, zoomT: 1, vw: 800, vh: 600 };
export const R = { x: 0, y: 0 };
export const P = { x: 0, y: 0 };

/** rotate world (x,y) into camera space using `cam.rot & 3` */
export function rot2(x: number, y: number) {
  switch (cam.rot & 3) {
    case 0: R.x = x; R.y = y; break;
    case 1: R.x = W - y; R.y = x; break;
    case 2: R.x = W - x; R.y = W - y; break;
    default: R.x = y; R.y = W - x; break;
  }
}
/** screenX = y - x ; screenY = (x + y)/2 - z   (in rotated space) */
export function proj(x: number, y: number, z: number) {
  rot2(x, y);
  P.x = R.y - R.x;
  P.y = (R.x + R.y) / 2 - z;
}
export function projR(rx: number, ry: number, z: number) {
  P.x = ry - rx;
  P.y = (rx + ry) / 2 - z;
}
export function depthOf(x: number, y: number) {
  rot2(x, y);
  return R.x + R.y;
}
export const UP = { x: 0, y: 0 };
export function unproj(sx: number, sy: number, z = 0) {
  const sum = (sy + z) * 2;
  const ry = (sum + sx) / 2, rx = (sum - sx) / 2;
  switch (cam.rot & 3) {
    case 0: UP.x = rx; UP.y = ry; break;
    case 1: UP.x = ry; UP.y = W - rx; break;
    case 2: UP.x = W - rx; UP.y = W - ry; break;
    default: UP.x = W - ry; UP.y = rx; break;
  }
}
export function camScreen() { proj(cam.fx, cam.fy, 0); return { x: P.x, y: P.y }; }
/** screen pixel -> P-frame */
export function screenToP(mx: number, my: number) {
  const c = camScreen();
  return { x: (mx - cam.vw / 2) / cam.zoom + c.x, y: (my - cam.vh / 2) / cam.zoom + c.y };
}
export function mphOf(v: number) { return (Math.floor(v * VCONV) * 9) >> 18; }

export const BANDS = ['Low', 'Medium', 'High', 'Very High', 'Extreme', 'Ultra Extreme'];
export const BAND_COL = ['#7ec850', '#b6d646', '#f1c232', '#f08a24', '#e0402a', '#b01c6e'];
/** rating >> 8 on the x100 integer rating => thresholds at multiples of 2.56 */
export function bandIndex(r: number) { return Math.max(0, Math.min(5, Math.round(r * 100) >> 8)); }
export const PENALTY_AT = [10.0, 11.0, 12.0, 13.2, 14.5];
export function applyPenalty(exc: number, inten: number): [number, number] {
  let n = 0;
  for (const t of PENALTY_AT) if (Math.round(inten * 100) >= Math.round(t * 100)) { exc *= 0.75; n++; }
  return [exc, n];
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const rnd = () => Math.random();
export const rint = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
export function hash2(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 10000) / 10000;
}
export const gbp = (n: number, d = 2) => (n < 0 ? '-' : '') + '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
export const idx = (x: number, y: number) => y * MAP + x;
export const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP && y < MAP;
export const MONTHS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];

// Global mutable game state (filled by world.newGame)
export const G: any = { hooks: {} };

export function toast(msg: string, kind = 'info') {
  if (!G.toasts) return;
  G.toasts.push({ msg, kind, t: performance.now() });
  if (G.toasts.length > 6) G.toasts.shift();
}

// tiny WebAudio blips
let actx: AudioContext | null = null;
export function beep(freq = 440, dur = 0.06, type: OscillatorType = 'square', vol = 0.03) {
  try {
    if (!G.sound) return;
    if (!actx) actx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(actx.destination);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.start(); o.stop(actx.currentTime + dur);
  } catch { /* ignore */ }
}
