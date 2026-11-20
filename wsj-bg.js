(() => {
  'use strict';

  // ---- Constants (matching WSJ's 360p pixel-art scale & exact geometry) ----
  const SCREEN_H = 360;
  const BASE_SCREEN_W = 640;
  const MIN_SCREEN_W = 280;
  const MAX_SCREEN_W = 960;
  const ZOOM = 8.0;
  const JUMPER_SIZE = 1.7;
  const SKI_LEN = 2.4;
  const SKI_TAIL = 0.95;
  const SHIN_LEN = 0.47;
  const THIGH_LEN = 0.47;
  const TORSO_LEN = 0.58;
  const NECK_LEN = 0.25;
  const ARM_LEN = 0.60;
  const DECK_DEPTH = 1.0;
  const GIRDER_DEPTH = 2.6;
  const PILLAR_GAP = 24.0;
  const BOARD_LEN = 4.0;
  const TAKEOFF_WIDTH = 12.0;
  const DEG = Math.PI / 180;

  // Exact WSJ flight & pose timing constants
  const START_OPEN = 68.0;
  const BEST_OPEN = 20.0;
  const OVER_LEAN = 11.0;
  const MIN_OPEN = -25.0;
  const OPEN_GAIN = 2.6;
  const BEST_PITCH = -2.0;
  const SKI_LAG = 0.18;
  const DRAWN_STANDING = 80.0;
  const DRAWN_BEST = 15.0;
  const DRAWN_EDGE = 7.0;
  const DRAWN_TUMBLED = -70.0;
  const POP_TIME = 0.07;
  const POP_HOLD = 0.22;
  const POP_BLEND = 0.55;
  const PREP_TIME = 0.30;
  const LAND_SETTLE = 0.30;
  const LAND_DIP = 0.16;
  const LAND_HOLD = 1.0;
  const LAND_RISE = 0.55;
  const REACT_AT = 1.8;
  const HOP_EVERY = 0.6;

  // ---- Color utilities (little-endian ABGR for Uint32Array ImageData) ----
  const rgb = (hex) => ({
    r: (hex >> 16) & 255,
    g: (hex >> 8) & 255,
    b: hex & 255,
    u32: (255 << 24) | ((hex & 255) << 16) | (((hex >> 8) & 255) << 8) | ((hex >> 16) & 255),
  });

  const makeColor = (r, g, b) => {
    const cr = r < 0 ? 0 : r > 255 ? 255 : r | 0;
    const cg = g < 0 ? 0 : g > 255 ? 255 : g | 0;
    const cb = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    return {
      r: cr,
      g: cg,
      b: cb,
      u32: (255 << 24) | (cb << 16) | (cg << 8) | cr,
    };
  };

  const mix = (a, b, t) => {
    const k = t < 0 ? 0 : t > 1 ? 1 : t;
    return makeColor(
      Math.round(a.r + (b.r - a.r) * k),
      Math.round(a.g + (b.g - a.g) * k),
      Math.round(a.b + (b.b - a.b) * k)
    );
  };

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smooth = (t) => {
    const k = clamp(t, 0, 1);
    return k * k * (3 - 2 * k);
  };

  // ---- WSJ UI Colors ----
  const UI_INK = rgb(0x0c1224);
  const UI_EDGE = rgb(0x5f7fb8);
  const UI_TEXT = rgb(0xf2f5fa);
  const UI_DIM = rgb(0x9fb0cc);
  const UI_GOLD = rgb(0xffd23a);
  const UI_SHADOW = rgb(0x060810);

  const SNOW_DUST = rgb(0xf4f8ff);
  const SPARK_GOLD = rgb(0xffe066);
  const TRAIL_NEUTRAL = rgb(0xf2f5fa);
  const TRAIL_GOOD = rgb(0x6fe08a);
  const OUTLINE_COL = rgb(0x141a2c);

  // ---- WSJ 4x4 Bayer Dithering Matrix ----
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  const dither = (x, y, a, b, t) =>
    t * 16.0 > BAYER[y & 3][x & 3] + 0.5 ? b : a;

  // ---- WSJ 5x7 Pixel Bitmap Font (from engine/font.cpp) ----
  const GLYPH_SRC = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
    B: '####.|#...#|#...#|####.|#...#|#...#|####.',
    C: '.###.|#...#|#....|#....|#....|#...#|.###.',
    D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
    E: '#####|#....|#....|####.|#....|#....|#####',
    F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
    H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
    J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
    K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
    L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
    N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
    O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    P: '####.|#...#|#...#|####.|#....|#....|#....',
    Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
    R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.',
    T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
    X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
    Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
    1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
    3: '####.|....#|....#|.###.|....#|....#|####.',
    4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
    5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '.###.|#....|#....|####.|#...#|#...#|.###.',
    7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
    8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
    9: '.###.|#...#|#...#|.####|....#|....#|.###.',
    '.': '.....|.....|.....|.....|.....|.##..|.##..',
    '-': '.....|.....|.....|#####|.....|.....|.....',
    '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
    ':': '.....|.##..|.##..|.....|.##..|.##..|.....',
  };

  const GLYPHS = {};
  for (const [ch, str] of Object.entries(GLYPH_SRC)) {
    const rows = str.split('|');
    const bits = new Uint8Array(7);
    for (let y = 0; y < 7; y++) {
      let rowBits = 0;
      for (let x = 0; x < 5; x++) {
        if (rows[y][x] === '#') rowBits |= 1 << x;
      }
      bits[y] = rowBits;
    }
    GLYPHS[ch] = bits;
  }

  // ---- Deterministic PRNG & 1D ridge noise (from render.cpp) ----
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function hash1(seed, n) {
    let v = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca77)) >>> 0;
    v = Math.imul(v ^ (v >>> 15), 0x2c1b3c6d) >>> 0;
    v = Math.imul(v ^ (v >>> 12), 0x297a2d39) >>> 0;
    v = (v ^ (v >>> 15)) >>> 0;
    return (v % 10000) / 10000;
  }

  function noise1(seed, x) {
    const i = Math.floor(x);
    let f = x - i;
    f = f * f * (3 - 2 * f);
    return hash1(seed, i) * (1 - f) + hash1(seed, i + 1) * f;
  }

  function ridge(seed, x) {
    return (
      0.55 * noise1(seed, x) +
      0.3 * noise1(seed + 1, x * 2.3) +
      0.15 * noise1(seed + 2, x * 5.1)
    );
  }

  // ---- WSJ Palettes (from render.cpp) ----
  const PALETTES = {
    day: {
      skyTop: rgb(0x3f7fd0),
      skyBot: rgb(0xbfe0f5),
      far: rgb(0x8fa9cc),
      farSnow: rgb(0xe6eef8),
      near: rgb(0x2f5d4a),
      nearTop: rgb(0x3d7359),
      snowLight: rgb(0xffffff),
      snow: rgb(0xe8f0f8),
      snowShade: rgb(0xc3d3e6),
      tree: rgb(0x1f4a38),
      treeSnow: rgb(0xdfeaf2),
      wood: rgb(0x6b4a34),
      mark: rgb(0x4a78b8),
      text: rgb(0x7890b0),
      sun: rgb(0xfff6c8),
      sunX: 520,
      sunY: 56,
      sunR: 14,
      stars: false,
      floodlight: false,
      fall: rgb(0xffffff),
      fallA: 0.72,
    },
    sunset: {
      skyTop: rgb(0x3b3a7a),
      skyBot: rgb(0xf7a65e),
      far: rgb(0x7d5f8e),
      farSnow: rgb(0xf3c9a6),
      near: rgb(0x2e2f4f),
      nearTop: rgb(0x41406a),
      snowLight: rgb(0xfff1e0),
      snow: rgb(0xf0d9d2),
      snowShade: rgb(0xc2a8c0),
      tree: rgb(0x23263f),
      treeSnow: rgb(0xe9cfc6),
      wood: rgb(0x4f3a3a),
      mark: rgb(0x6a5a9a),
      text: rgb(0x94809f),
      sun: rgb(0xffe08a),
      sunX: 485,
      sunY: 195,
      sunR: 18,
      stars: true,
      floodlight: false,
      fall: rgb(0xfff0e4),
      fallA: 0.65,
    },
    night: {
      skyTop: rgb(0x070b1e),
      skyBot: rgb(0x1c2a52),
      far: rgb(0x1b2647),
      farSnow: rgb(0x3c4c78),
      near: rgb(0x0d1528),
      nearTop: rgb(0x15203a),
      snowLight: rgb(0xeef4ff),
      snow: rgb(0xbfcdea),
      snowShade: rgb(0x7f90bd),
      tree: rgb(0x0c1626),
      treeSnow: rgb(0x7c8db8),
      wood: rgb(0x3a3340),
      mark: rgb(0x3d5aa0),
      text: rgb(0x6074a8),
      sun: rgb(0xe8ecf5),
      sunX: 112,
      sunY: 52,
      sunR: 11,
      stars: true,
      floodlight: true,
      fall: rgb(0xdce8ff),
      fallA: 0.75,
    },
    alpine: {
      skyTop: rgb(0x1d4fa8),
      skyBot: rgb(0x9fd4f2),
      far: rgb(0x6f8fc2),
      farSnow: rgb(0xf2f7fc),
      near: rgb(0x55708f),
      nearTop: rgb(0xd7e3ef),
      snowLight: rgb(0xffffff),
      snow: rgb(0xe4eefa),
      snowShade: rgb(0xb5cbe6),
      tree: rgb(0x244a4a),
      treeSnow: rgb(0xe2ecf5),
      wood: rgb(0x5a4a44),
      mark: rgb(0x3f70b8),
      text: rgb(0x7391b8),
      sun: rgb(0xfffbe0),
      sunX: 95,
      sunY: 48,
      sunR: 12,
      stars: false,
      floodlight: false,
      fall: rgb(0xffffff),
      fallA: 0.75,
    },
    overcast: {
      skyTop: rgb(0x7d8a99),
      skyBot: rgb(0xcfd6dc),
      far: rgb(0x9aa5b1),
      farSnow: rgb(0xdde2e8),
      near: rgb(0x3b4f4d),
      nearTop: rgb(0x4b625f),
      snowLight: rgb(0xf6f8fa),
      snow: rgb(0xdfe5ea),
      snowShade: rgb(0xb9c4cf),
      tree: rgb(0x2a403c),
      treeSnow: rgb(0xd5dde3),
      wood: rgb(0x5c463a),
      mark: rgb(0x4d6f96),
      text: rgb(0x7b8a9c),
      sun: null,
      sunX: 0,
      sunY: 0,
      sunR: 0,
      stars: false,
      floodlight: false,
      fall: rgb(0xf6f8fa),
      fallA: 0.78,
    },
  };

  const HILL_PRESETS = [
    { theme: 'alpine', inrun: 'concrete', stands: 2, boards: 0, K: 125, HS: 140, seed: 107 },
    { theme: 'sunset', inrun: 'steel', stands: 3, boards: 4, K: 120, HS: 137, seed: 106 },
    { theme: 'night', inrun: 'steel', stands: 2, boards: 0, K: 125, HS: 142, seed: 102 },
    { theme: 'day', inrun: 'wooden', stands: 2, boards: 1, K: 120, HS: 134, seed: 103 },
    { theme: 'night', inrun: 'concrete', stands: 3, boards: 3, K: 118, HS: 132, seed: 108 },
    { theme: 'day', inrun: 'natural', stands: 3, boards: 2, K: 125, HS: 140, seed: 110 },
    { theme: 'overcast', inrun: 'steel', stands: 2, boards: 2, K: 123, HS: 140, seed: 104 },
  ];

  const SUIT_COLORS = [
    0xd93838, 0x2f6fd6, 0xe8b838, 0x2f9e58, 0xe87a2a, 0x8d52c4, 0x26a69a, 0xd84374,
  ];
  const HELMET_COLORS = [0xf2c94c, 0xf2f5fa, 0xe84848, 0x4a90e2, 0xf2f5fa];
  const SKI_COLORS = [0xf29028, 0xf2b830, 0xd93838, 0x303848, 0x3a82d8];
  const BOARD_COLORS = [0x2c5fb4, 0x9a2a3a, 0x2f8f58, 0x2a2f3c, 0xe8862a];
  const SHIRT_COLORS = [0xd94a4a, 0x4a7fd9, 0xe8c84a, 0x58b368, 0xf0f0f0, 0x9a5fc0, 0xe88a3a, 0x40464f];
  const FLAG_COLORS = [0xd94a4a, 0xf0f0f0, 0x4a7fd9, 0xe8c84a, 0x58b368, 0xe88a3a];

  // ---- Software Pixel Buffer ----
  class PixelCanvas {
    constructor(canvasEl) {
      this.el = canvasEl;
      this.ctx = canvasEl.getContext('2d', { alpha: false });
      this.w = BASE_SCREEN_W;
      this.h = SCREEN_H;
      this.resize();
    }

    resize() {
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 720;
      const w = clamp(Math.round((vw * SCREEN_H) / Math.max(vh, 1)), MIN_SCREEN_W, MAX_SCREEN_W);
      if (w === this.w && this.img) return;
      this.w = w;
      this.h = SCREEN_H;
      this.el.width = w;
      this.el.height = SCREEN_H;
      this.ctx.imageSmoothingEnabled = false;
      this.img = this.ctx.createImageData(w, SCREEN_H);
      this.data = this.img.data;
      this.u32 = new Uint32Array(this.img.data.buffer);
    }

    present() {
      this.ctx.putImageData(this.img, 0, 0);
    }

    set(x, y, col) {
      const ix = x | 0;
      const iy = y | 0;
      if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
      this.u32[iy * this.w + ix] = col.u32;
    }

    blend(x, y, col, a) {
      const ix = x | 0;
      const iy = y | 0;
      if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h || a <= 0) return;
      if (a >= 1) {
        this.u32[iy * this.w + ix] = col.u32;
        return;
      }
      const idx = (iy * this.w + ix) * 4;
      const d = this.data;
      const inv = 1 - a;
      d[idx] = (d[idx] * inv + col.r * a) | 0;
      d[idx + 1] = (d[idx + 1] * inv + col.g * a) | 0;
      d[idx + 2] = (d[idx + 2] * inv + col.b * a) | 0;
    }

    hLine(x0, x1, y, col) {
      const iy = y | 0;
      if (iy < 0 || iy >= this.h) return;
      let a = Math.min(x0, x1) | 0;
      let b = Math.max(x0, x1) | 0;
      if (b < 0 || a >= this.w) return;
      if (a < 0) a = 0;
      if (b >= this.w) b = this.w - 1;
      const row = iy * this.w;
      const u = this.u32;
      const c = col.u32;
      for (let x = a; x <= b; x++) u[row + x] = c;
    }

    vLine(x, y0, y1, col) {
      const ix = x | 0;
      if (ix < 0 || ix >= this.w) return;
      let a = Math.min(y0, y1) | 0;
      let b = Math.max(y0, y1) | 0;
      if (b < 0 || a >= this.h) return;
      if (a < 0) a = 0;
      if (b >= this.h) b = this.h - 1;
      const u = this.u32;
      const w = this.w;
      const c = col.u32;
      for (let y = a; y <= b; y++) u[y * w + ix] = c;
    }

    fillRect(x, y, rw, rh, col) {
      if (rw <= 0 || rh <= 0) return;
      let x0 = x | 0;
      let y0 = y | 0;
      let x1 = (x0 + rw) | 0;
      let y1 = (y0 + rh) | 0;
      if (x1 <= 0 || y1 <= 0 || x0 >= this.w || y0 >= this.h) return;
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 > this.w) x1 = this.w;
      if (y1 > this.h) y1 = this.h;
      const u = this.u32;
      const w = this.w;
      const c = col.u32;
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * w;
        for (let xx = x0; xx < x1; xx++) u[row + xx] = c;
      }
    }

    blendRect(x, y, rw, rh, col, a) {
      if (rw <= 0 || rh <= 0 || a <= 0) return;
      if (a >= 1) {
        this.fillRect(x, y, rw, rh, col);
        return;
      }
      let x0 = x | 0;
      let y0 = y | 0;
      let x1 = (x0 + rw) | 0;
      let y1 = (y0 + rh) | 0;
      if (x1 <= 0 || y1 <= 0 || x0 >= this.w || y0 >= this.h) return;
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 > this.w) x1 = this.w;
      if (y1 > this.h) y1 = this.h;
      const d = this.data;
      const w = this.w;
      const inv = 1 - a;
      const cr = col.r * a;
      const cg = col.g * a;
      const cb = col.b * a;
      for (let yy = y0; yy < y1; yy++) {
        let idx = (yy * w + x0) * 4;
        for (let xx = x0; xx < x1; xx++, idx += 4) {
          d[idx] = (d[idx] * inv + cr) | 0;
          d[idx + 1] = (d[idx + 1] * inv + cg) | 0;
          d[idx + 2] = (d[idx + 2] * inv + cb) | 0;
        }
      }
    }

    line(x0, y0, x1, y1, col) {
      let ix0 = Math.round(x0);
      let iy0 = Math.round(y0);
      const ix1 = Math.round(x1);
      const iy1 = Math.round(y1);
      const dx = Math.abs(ix1 - ix0);
      const dy = -Math.abs(iy1 - iy0);
      const sx = ix0 < ix1 ? 1 : -1;
      const sy = iy0 < iy1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.set(ix0, iy0, col);
        if (ix0 === ix1 && iy0 === iy1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          ix0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          iy0 += sy;
        }
      }
    }

    fillCircle(cx, cy, r, col) {
      const ix = Math.round(cx);
      const iy = Math.round(cy);
      const ir = Math.ceil(r);
      const r2 = r * r;
      for (let dy = -ir; dy <= ir; dy++) {
        const y = iy + dy;
        if (y < 0 || y >= this.h) continue;
        const dxMax = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
        this.hLine(ix - dxMax, ix + dxMax, y, col);
      }
    }

    fillCapsule(x0, y0, x1, y1, r, col) {
      const minX = Math.max(0, Math.floor(Math.min(x0, x1) - r));
      const maxX = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1) + r));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1) - r));
      const maxY = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1) + r));
      if (minX > maxX || minY > maxY) return;
      const vx = x1 - x0;
      const vy = y1 - y0;
      const l2 = vx * vx + vy * vy;
      const r2 = r * r;
      const u = this.u32;
      const w = this.w;
      const c = col.u32;
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5 - y0;
        const row = y * w;
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5 - x0;
          let t = 0;
          if (l2 > 1e-6) {
            t = (px * vx + py * vy) / l2;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
          }
          const dx = px - t * vx;
          const dy = py - t * vy;
          if (dx * dx + dy * dy <= r2) {
            u[row + x] = c;
          }
        }
      }
    }

    fillTri(x0, y0, x1, y1, x2, y2, col) {
      let ax = x0, ay = y0, bx = x1, by = y1, cx = x2, cy = y2;
      if (ay > by) { [ax, bx] = [bx, ax]; [ay, by] = [by, ay]; }
      if (ay > cy) { [ax, cx] = [cx, ax]; [ay, cy] = [cy, ay]; }
      if (by > cy) { [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; }
      const yStart = Math.max(0, Math.ceil(ay));
      const yEnd = Math.min(this.h - 1, Math.floor(cy));
      for (let y = yStart; y <= yEnd; y++) {
        const tAC = cy !== ay ? (y - ay) / (cy - ay) : 0;
        const xAC = ax + (cx - ax) * tAC;
        let xB;
        if (y < by) {
          const tAB = by !== ay ? (y - ay) / (by - ay) : 0;
          xB = ax + (bx - ax) * tAB;
        } else {
          const tBC = cy !== by ? (y - by) / (cy - by) : 0;
          xB = bx + (cx - bx) * tBC;
        }
        this.hLine(Math.round(xAC), Math.round(xB), y, col);
      }
    }

    fillQuad(xs, ys, col) {
      this.fillTri(xs[0], ys[0], xs[1], ys[1], xs[2], ys[2], col);
      this.fillTri(xs[0], ys[0], xs[2], ys[2], xs[3], ys[3], col);
    }

    textWidth(str, scale) {
      if (!str.length) return 0;
      return (str.length * 6 - 1) * scale;
    }

    text(x, y, str, scale, col) {
      const s = str.toUpperCase();
      let cx = x | 0;
      const cy = y | 0;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        const bits = GLYPHS[ch];
        if (bits) {
          for (let gy = 0; gy < 7; gy++) {
            const row = bits[gy];
            for (let gx = 0; gx < 5; gx++) {
              if (row & (1 << gx)) {
                this.fillRect(cx + gx * scale, cy + gy * scale, scale, scale, col);
              }
            }
          }
        }
        cx += 6 * scale;
      }
    }

    textShadow(x, y, str, scale, col, shadowCol, off = Math.max(1, Math.ceil(scale * 0.45))) {
      this.text(x + off, y + off, str, scale, shadowCol);
      this.text(x, y, str, scale, col);
    }

    textCentered(cx, y, str, scale, col) {
      const w = this.textWidth(str, scale);
      this.text(Math.round(cx - w / 2), y, str, scale, col);
    }

    panel(x, y, w, h, alpha = 0.62) {
      this.blendRect(x, y, w, h, UI_INK, alpha);
      this.hLine(x, x + w - 1, y, UI_EDGE);
      this.hLine(x, x + w - 1, y + h - 1, UI_EDGE);
      this.vLine(x, y, y + h - 1, UI_EDGE);
      this.vLine(x + w - 1, y, y + h - 1, UI_EDGE);
    }
  }

  // ---- Hill Geometry (faithful to WSJ ski jumping hills) ----
  class Hill {
    constructor(spec) {
      this.K = spec.K;
      this.HS = spec.HS;
      this.seed = spec.seed;
      this.style = spec;
      this.tableHeight = 3.2;
      this.topU = 90.0;
      this.gateU = 84.0;
      this.outrunS = this.HS + 28.0;
      this.maxS = this.outrunS + 95.0;

      // Build inrun table (u = 0 at takeoff edge, positive going up-left)
      this.inrunPts = [];
      const stepsIn = 220;
      let ix = 0, iy = 0;
      const du = this.topU / stepsIn;
      for (let i = 0; i <= stepsIn; i++) {
        const u = i * du;
        // Slope: 10.5 deg at table (0..7m), transitions smoothly to 35 deg by u=34m
        const blend = smooth((u - 7.0) / 27.0);
        const slope = (10.5 + 24.5 * blend) * DEG;
        this.inrunPts.push({ u, x: ix, y: iy, slope });
        ix -= Math.cos(slope) * du;
        iy += Math.sin(slope) * du;
      }
      this.topX = this.inrunPts[this.inrunPts.length - 1].x;
      this.topY = this.inrunPts[this.inrunPts.length - 1].y;

      // Build landing + outrun table (s = 0 at x=0, y=-tableHeight)
      this.landPts = [];
      const stepsLand = 520;
      let lx = 0, ly = -this.tableHeight;
      const ds = this.maxS / stepsLand;
      for (let i = 0; i <= stepsLand; i++) {
        const s = i * ds;
        let deg;
        if (s < 32) {
          // Knolls gently from 13 deg into 35 deg landing zone
          deg = 13.0 + 22.0 * smooth(s / 32.0);
        } else if (s < this.K * 0.98) {
          deg = 35.0;
        } else if (s < this.outrunS) {
          // Smooth transition radius into flat outrun
          deg = 35.0 * (1 - smooth((s - this.K * 0.98) / (this.outrunS - this.K * 0.98)));
        } else {
          deg = 0.0;
        }
        const slope = -deg * DEG;
        this.landPts.push({ s, x: lx, y: ly, slope });
        lx += Math.cos(slope) * ds;
        ly += Math.sin(slope) * ds;
      }
      this.maxX = this.landPts[this.landPts.length - 1].x;
    }

    inrunPoint(u) {
      const clamped = clamp(u, 0, this.topU);
      const f = (clamped / this.topU) * (this.inrunPts.length - 1);
      const i = Math.min(Math.floor(f), this.inrunPts.length - 2);
      const t = f - i;
      const a = this.inrunPts[i];
      const b = this.inrunPts[i + 1];
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        slope: a.slope + (b.slope - a.slope) * t,
      };
    }

    inrunAtX(wx) {
      if (wx < this.topX || wx > 0) return null;
      // Binary search (inrunPts x decreases with index)
      let lo = 0, hi = this.inrunPts.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (this.inrunPts[mid].x >= wx) lo = mid;
        else hi = mid;
      }
      const a = this.inrunPts[lo];
      const b = this.inrunPts[hi];
      const t = a.x !== b.x ? (wx - a.x) / (b.x - a.x) : 0;
      return {
        y: a.y + (b.y - a.y) * t,
        u: a.u + (b.u - a.u) * t,
      };
    }

    landPoint(dist) {
      const clamped = clamp(dist, 0, this.maxS);
      const f = (clamped / this.maxS) * (this.landPts.length - 1);
      const i = Math.min(Math.floor(f), this.landPts.length - 2);
      const t = f - i;
      const a = this.landPts[i];
      const b = this.landPts[i + 1];
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        slope: a.slope + (b.slope - a.slope) * t,
        s: a.s + (b.s - a.s) * t,
      };
    }

    landAtX(wx) {
      if (wx <= 0) {
        return { y: -this.tableHeight, slope: -13 * DEG, s: 0 };
      }
      if (wx >= this.maxX) {
        const last = this.landPts[this.landPts.length - 1];
        return { y: last.y, slope: 0, s: last.s };
      }
      let lo = 0, hi = this.landPts.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (this.landPts[mid].x <= wx) lo = mid;
        else hi = mid;
      }
      const a = this.landPts[lo];
      const b = this.landPts[hi];
      const t = b.x !== a.x ? (wx - a.x) / (b.x - a.x) : 0;
      return {
        y: a.y + (b.y - a.y) * t,
        slope: a.slope + (b.slope - a.slope) * t,
        s: a.s + (b.s - a.s) * t,
      };
    }

    mountainY(wx) {
      if (wx >= 0) return this.landAtX(wx).y;
      if (this.style.inrun === 'natural') {
        const ir = this.inrunAtX(wx);
        if (ir) return ir.y - DECK_DEPTH - 0.15;
        return this.topY - DECK_DEPTH - 0.15 + (this.topX - wx) * Math.tan(33 * DEG);
      }
      // Hillside sits lower beneath raised towers/trusses
      const baseSlope = Math.tan(26 * DEG);
      return -this.tableHeight + (-wx) * baseSlope - 2.0 * Math.sin(clamp(-wx / 25, 0, Math.PI));
    }

    groundY(wx) {
      return wx >= 0 ? this.landAtX(wx).y : this.mountainY(wx);
    }
  }

  // ---- Scenery (matching render.cpp) ----
  class Scenery {
    constructor(hill) {
      this.hill = hill;
      this.pal = PALETTES[hill.style.theme];
      this.seed = hill.seed;
      const rng = makeRng(hill.seed * 99 + 17);

      // Trees along mountainside
      this.trees = [];
      const landEnd = hill.landPoint(hill.HS + 25).x;
      for (let x = -220; x < hill.maxX + 120; ) {
        let gap = 3.5 + rng() * 6.5;
        if (x > -8 && x < landEnd) gap = 15 + rng() * 22;
        x += gap;
        if (x > -14 && x < 6) continue;
        this.trees.push({ x, height: 5.0 + rng() * 6.0, sink: 0.5 + rng() * 2.0 });
      }

      // Stars
      this.stars = [];
      for (let i = 0; i < 95; i++) {
        this.stars.push({
          x: Math.floor(rng() * BASE_SCREEN_W),
          y: Math.floor(rng() * (SCREEN_H * 0.65)),
          dim: i % 3 === 0,
        });
      }

      // Crowd colors
      this.crowd = [];
      for (let i = 0; i < 512; i++) {
        this.crowd.push(rgb(SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)]));
      }

      // Snowflakes
      this.flakes = [];
      for (let i = 0; i < 115; i++) {
        this.flakes.push({
          x: rng() * MAX_SCREEN_W,
          y: rng() * SCREEN_H,
          speed: 18 + rng() * 30,
        });
      }
    }

    step(dt, wind, camDX, camDY, screenW) {
      for (let i = 0; i < this.flakes.length; i++) {
        const f = this.flakes[i];
        const depth = 0.4 + (0.6 * (f.speed - 18)) / 30;
        f.x += (-wind * 14 * dt - camDX * ZOOM) * depth;
        f.y += (f.speed * dt + camDY * ZOOM) * depth;
        f.x = ((f.x % screenW) + screenW) % screenW;
        f.y = ((f.y % SCREEN_H) + SCREEN_H) % SCREEN_H;
      }
    }

    drawWorld(c, cam) {
      const p = this.pal;
      const h = this.hill;
      const W = c.w;
      const H = c.h;

      // 1. Banded Bayer-dithered sky gradient
      const bands = 9.0;
      const u = c.u32;
      for (let y = 0; y < H; y++) {
        const t = (y / H) * 1.25 * bands;
        const band = Math.floor(t);
        const colA = mix(p.skyTop, p.skyBot, Math.min(1, band / bands));
        const colB = mix(p.skyTop, p.skyBot, Math.min(1, (band + 1) / bands));
        const frac = t - band;
        const row = y * W;
        const bRow = BAYER[y & 3];
        const thresh = frac * 16.0;
        const uA = colA.u32;
        const uB = colB.u32;
        for (let x = 0; x < W; x++) {
          u[row + x] = thresh > bRow[x & 3] + 0.5 ? uB : uA;
        }
      }

      // 2. Stars
      if (p.stars) {
        const bright = rgb(0xcfd8ff);
        const dim = rgb(0x7f8fc0);
        for (let i = 0; i < this.stars.length; i++) {
          const st = this.stars[i];
          const col = st.dim ? dim : bright;
          for (let x = st.x; x < W; x += BASE_SCREEN_W) {
            c.set(x, st.y, col);
          }
        }
      }

      // 3. Sun / Moon
      if (p.sun && p.sunR > 0) {
        const sx = Math.round((p.sunX / BASE_SCREEN_W) * W);
        c.fillCircle(sx, p.sunY, p.sunR, p.sun);
      }

      // 4. Far snow-capped mountains (slow parallax)
      for (let x = 0; x < W; x++) {
        const mu = (x + cam.x * ZOOM * 0.08) * 0.007;
        const r = ridge(this.seed, mu);
        const top = Math.max(0, 205 - Math.floor(r * 130) + Math.floor(cam.y * ZOOM * 0.06));
        const capLine = top + 10 + Math.floor(18 * noise1(this.seed + 7, mu * 9));
        for (let y = top; y < H; y++) {
          u[y * W + x] = y < capLine ? p.farSnow.u32 : p.far.u32;
        }
      }

      // 5. Near spiky forested hills
      for (let x = 0; x < W; x++) {
        const mu = (x + cam.x * ZOOM * 0.25) * 0.011;
        const top = 255 - Math.floor(ridge(this.seed + 20, mu) * 85) + Math.floor(cam.y * ZOOM * 0.2);
        const mod7 = (((x + cam.x * ZOOM * 0.25) % 7) + 7) % 7;
        const spike = Math.floor(3 * Math.abs(mod7 - 3.5));
        const y0 = Math.max(0, top - spike);
        for (let y = y0; y < H; y++) {
          u[y * W + x] = y < top + 6 ? p.nearTop.u32 : p.near.u32;
        }
      }

      // 6. Trees, tower, stands, inrun structure
      this.drawTrees(c, cam);
      this.drawTower(c, cam);
      this.drawStands(c, cam);
      this.drawInrunFrame(c, cam);

      // 7. Snow slope body with Bayer-dithered shading
      for (let x = 0; x < W; x++) {
        const wx = cam.wx(x + 0.5);
        const gy = Math.round(cam.sy(h.groundY(wx)));
        const y0 = Math.max(0, gy);
        for (let y = y0; y < H; y++) {
          const d = y - gy;
          let col;
          if (d < 2) col = p.snowLight;
          else if (d < 16) col = p.snow;
          else if (d < 40) col = dither(x, y, p.snow, p.snowShade, (d - 16) / 24);
          else col = p.snowShade;
          u[y * W + x] = col.u32;
        }
      }

      // 8. Inrun track & distance marks
      this.drawInrunTrack(c, cam);
      this.drawMarks(c, cam);
    }

    drawTrees(c, cam) {
      const p = this.pal;
      const h = this.hill;
      const lo = cam.wx(-40);
      const hi = cam.wx(c.w + 40);
      for (let i = 0; i < this.trees.length; i++) {
        const t = this.trees[i];
        if (t.x < lo || t.x > hi) continue;
        const bx = Math.floor(cam.sx(t.x));
        const by = Math.floor(cam.sy(h.groundY(t.x) - t.sink));
        const ht = Math.floor(t.height * ZOOM);
        c.vLine(bx, by - Math.floor(ht / 4), by, p.wood);
        for (let k = 0; k < 3; k++) {
          const top = by - ht + Math.floor((k * ht) / 4);
          const bot = top + Math.floor(ht / 2);
          const half = Math.floor(ht / 7) + Math.floor((k * ht) / 12);
          c.fillTri(bx, top, bx - half, bot, bx + half, bot, p.tree);
          c.line(bx, top, bx - half + 1, bot - 1, p.treeSnow);
          c.line(bx, top + 1, bx - Math.floor(half / 2), bot - Math.floor(ht / 5), p.treeSnow);
        }
      }
    }

    drawTower(c, cam) {
      const p = this.pal;
      const pt = this.hill.landPoint(this.hill.HS + 16);
      const x = Math.floor(cam.sx(pt.x));
      const y = Math.floor(cam.sy(pt.y));
      if (x < -60 || x > c.w + 60) return;
      const w = 30, ht = 84;
      c.fillRect(x - 7, y - ht + 20, w - 16, ht, mix(p.wood, p.near, 0.3));
      c.fillRect(x - 15, y - ht, w, 22, p.wood);
      c.fillRect(x - 17, y - ht - 3, w + 4, 3, p.snowLight);
      const win = p.floodlight ? rgb(0xffe9a0) : mix(p.skyBot, rgb(0x203040), 0.5);
      for (let i = 0; i < 5; i++) {
        c.fillRect(x - 12 + i * 5, y - ht + 6, 3, 7, win);
      }
    }

    drawStands(c, cam) {
      const p = this.pal;
      const h = this.hill;
      const st = h.style.stands;
      if (!st) return;
      let rows = 9, width = h.K * 0.45 + 25, flagCount = 4, roof = false;
      if (st === 1) { rows = 5; width = h.K * 0.2 + 14; flagCount = 2; }
      else if (st === 3) { rows = 14; width = h.K * 0.6 + 35; flagCount = 6; roof = true; }
      const pt = h.landPoint(h.outrunS + 10);
      const x0 = Math.floor(cam.sx(pt.x));
      const y0 = Math.floor(cam.sy(pt.y));
      const w = Math.floor(width * ZOOM);
      if (x0 > c.w || x0 + w < 0) return;
      const body = mix(p.wood, p.near, 0.5);
      let top = y0 - rows * 4 - 6;
      c.fillRect(x0, top, w, rows * 4 + 10, body);
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < Math.floor(w / 3); i++) {
          let col = this.crowd[(r * 131 + i * 17) % this.crowd.length];
          if (p.floodlight) col = mix(col, rgb(0x101830), 0.35);
          c.fillRect(x0 + i * 3 + (r & 1), y0 - 6 - r * 4, 2, 2, col);
        }
      }
      c.fillRect(x0 - 2, top - 3, w + 4, 3, p.snowLight);
      if (roof) {
        const steel = mix(p.wood, rgb(0x1c222c), 0.55);
        for (let fx = x0 + 4; fx < x0 + w; fx += 60) {
          c.fillRect(fx, top - 22, 2, 22, steel);
        }
        c.fillRect(x0 - 8, top - 26, w + 16, 5, steel);
        c.fillRect(x0 - 9, top - 29, w + 18, 3, p.snowLight);
        top -= 26;
      }
      for (let i = 0; i < flagCount; i++) {
        const fx = x0 + 8 + Math.floor((i * (w - 16)) / Math.max(flagCount - 1, 1));
        c.vLine(fx, top - 28, top - 3, rgb(0x30343c));
        c.fillRect(fx + 1, top - 28, 9, 6, rgb(FLAG_COLORS[i % FLAG_COLORS.length]));
      }
    }

    drawInrunFrame(c, cam) {
      const p = this.pal;
      const h = this.hill;
      const steel = mix(p.wood, rgb(0x1c222c), 0.55);
      const concrete = mix(p.snowShade, rgb(0x5a6270), 0.6);
      const concreteDark = mix(concrete, rgb(0x1c222c), 0.35);

      const raised = (u) => {
        const pt = h.inrunPoint(u);
        return pt.y - h.mountainY(pt.x) > DECK_DEPTH + 0.8;
      };
      const under = (u, depth) => {
        const pt = h.inrunPoint(u);
        return [cam.sx(pt.x), cam.sy(pt.y - DECK_DEPTH - depth)];
      };

      if (h.style.inrun === 'steel') {
        for (let u = TAKEOFF_WIDTH + 14; u < h.topU - 4; u += PILLAR_GAP) {
          if (!raised(u)) continue;
          const pt = h.inrunPoint(u);
          const x = Math.floor(cam.sx(pt.x));
          if (x < -30 || x > c.w + 30) continue;
          const top = Math.floor(cam.sy(pt.y - DECK_DEPTH));
          const bot = Math.floor(cam.sy(h.mountainY(pt.x))) + 6;
          c.fillRect(x - 7, top, 14, bot - top, concrete);
          c.fillRect(x + 3, top, 4, bot - top, concreteDark);
          c.fillRect(x - 10, top, 20, 5, concreteDark);
        }
        const bay = 3.0;
        for (let u = TAKEOFF_WIDTH; u + bay <= h.topU; u += bay) {
          if (!raised(u) || !raised(u + bay)) continue;
          const [ax, ay] = under(u, 0);
          if (ax < -40 || ax > c.w + 40) continue;
          const [cx, cy] = under(u, GIRDER_DEPTH);
          const [dx, dy] = under(u + bay, GIRDER_DEPTH);
          const [mx, my] = under(u + bay * 0.5, 0);
          c.fillCapsule(cx, cy, dx, dy, 1.1, steel);
          c.fillCapsule(cx, cy, mx, my, 0.8, steel);
          c.fillCapsule(mx, my, dx, dy, 0.8, steel);
          c.fillCapsule(ax, ay, cx, cy, 0.8, steel);
        }
      } else if (h.style.inrun === 'concrete') {
        const xFrom = Math.max(Math.floor(cam.sx(h.topX)), 0);
        const xTo = Math.min(Math.floor(cam.sx(0)), c.w - 1);
        for (let x = xFrom; x <= xTo; x++) {
          const wx = cam.wx(x + 0.5);
          const ir = h.inrunAtX(wx);
          if (!ir || ir.y - h.mountainY(wx) < DECK_DEPTH + 0.8) continue;
          const span = 26.0, half = 9.0;
          const off = ((-wx) % span) - span * 0.5;
          const y0 = Math.floor(cam.sy(ir.y - DECK_DEPTH));
          const y1 = Math.floor(cam.sy(h.mountainY(wx))) + 6;
          for (let y = Math.max(0, y0); y <= Math.min(c.h - 1, y1); y++) {
            const below = (y - y0) / ZOOM;
            if (Math.abs(off) < half && below > 3.0 + 7.0 * (off / half) * (off / half)) continue;
            let col = concrete;
            if (below < 0.8 || Math.abs(Math.abs(off) - half) < 0.6 || Math.abs(off) > span * 0.5 - 0.5) {
              col = concreteDark;
            }
            c.set(x, y, col);
          }
        }
      } else if (h.style.inrun === 'wooden') {
        const timber = mix(p.wood, rgb(0xb07a48), 0.45);
        const timberDark = mix(p.wood, rgb(0x1c1410), 0.3);
        const bay = 3.5;
        for (let u = TAKEOFF_WIDTH; u + bay <= h.topU; u += bay) {
          if (!raised(u) || !raised(u + bay)) continue;
          const [ax, ay] = under(u, 0);
          if (ax < -50 || ax > c.w + 50) continue;
          const [bx, by] = under(u + bay, 0);
          const pt1 = h.inrunPoint(u);
          const pt2 = h.inrunPoint(u + bay);
          const ga = cam.sy(h.mountainY(pt1.x)) + 5;
          const gb = cam.sy(h.mountainY(pt2.x)) + 5;
          c.fillCapsule(ax, ay, ax, ga, 1.1, timber);
          for (let lvl = 0; lvl < 12; lvl++) {
            const d = lvl * 3.2 * ZOOM;
            if (ay + d > ga || by + d > gb) break;
            c.fillCapsule(ax, ay + d, bx, by + d, 0.8, timberDark);
            const y2a = Math.min(ay + d + 3.2 * ZOOM, ga);
            const y2b = Math.min(by + d + 3.2 * ZOOM, gb);
            if (lvl % 2 === 0) c.fillCapsule(ax, ay + d, bx, y2b, 0.6, timberDark);
            else c.fillCapsule(ax, y2a, bx, by + d, 0.6, timberDark);
          }
        }
      }

      // Start house at the top of the inrun
      const topPt = h.inrunPoint(h.topU);
      const sx = Math.floor(cam.sx(topPt.x));
      const sy = Math.floor(cam.sy(topPt.y));
      if (sx > -80 && sx < c.w + 80) {
        const leg = Math.floor(cam.sy(h.mountainY(topPt.x - 3))) + 6;
        if (h.style.inrun === 'wooden') {
          const timber = mix(p.wood, rgb(0xb07a48), 0.45);
          c.fillRect(sx - 26, sy, 4, leg - sy, timber);
          c.fillRect(sx - 17, sy, 4, leg - sy, timber);
          for (let yy = sy + 10; yy < leg; yy += 22) {
            c.line(sx - 26, yy, sx - 14, yy + 12, p.wood);
          }
        } else if (h.style.inrun !== 'natural') {
          c.fillRect(sx - 26, sy, 12, leg - sy, concrete);
          c.fillRect(sx - 18, sy, 4, leg - sy, concreteDark);
        }
        const wall = mix(p.wood, rgb(0xa06a40), 0.35);
        c.fillRect(sx - 40, sy - 30, 46, 34, wall);
        for (let i = 0; i < 5; i++) c.hLine(sx - 40, sx + 5, sy - 24 + i * 7, p.wood);
        c.fillRect(sx - 40, sy + 2, 46, 3, steel);
        c.fillQuad([sx - 46, sx + 12, sx + 4, sx - 30], [sy - 30, sy - 30, sy - 44, sy - 44], p.wood);
        c.fillQuad([sx - 47, sx + 13, sx + 5, sx - 31], [sy - 33, sy - 33, sy - 47, sy - 47], p.snowLight);
        const lit = rgb(0xffe9a0);
        c.fillRect(sx - 34, sy - 22, 9, 9, lit);
        c.fillRect(sx - 20, sy - 22, 9, 9, lit);
        c.vLine(sx - 30, sy - 22, sy - 14, p.wood);
        c.vLine(sx - 16, sy - 22, sy - 14, p.wood);
        c.fillRect(sx - 6, sy - 20, 8, 22, mix(p.wood, rgb(0x101418), 0.4));
        c.vLine(sx - 22, sy - 62, sy - 47, steel);
        c.fillRect(sx - 21, sy - 62, 11, 7, rgb(0xd03030));
      }

      // Night floodlights
      if (p.floodlight) {
        const dists = [h.K * 0.2, h.K * 0.55, h.K * 0.9, h.HS + 20];
        for (let dIdx = 0; dIdx < dists.length; dIdx++) {
          const lp = h.landPoint(dists[dIdx]);
          const fx = Math.floor(cam.sx(lp.x));
          const fy = Math.floor(cam.sy(lp.y));
          if (fx < -40 || fx > c.w + 40) continue;
          c.vLine(fx, fy - 120, fy, steel);
          c.fillRect(fx - 5, fy - 124, 11, 5, rgb(0xfff8d0));
          for (let i = 1; i < 7; i++) {
            c.blendRect(fx - 5 - i * 4, fy - 124 + i * 6, 11 + i * 8, 6, rgb(0xfff8d0), 0.1 - i * 0.012);
          }
        }
      }
    }

    drawInrunTrack(c, cam) {
      const p = this.pal;
      const h = this.hill;
      const dim = (col) => (p.floodlight ? mix(col, rgb(0x0c1224), 0.3) : col);
      const steel = mix(p.wood, rgb(0x1c222c), 0.55);
      let concrete = mix(p.snowShade, rgb(0x5a6270), 0.6);
      let concreteDark = mix(concrete, rgb(0x1c222c), 0.35);
      if (h.style.inrun === 'wooden') {
        concrete = mix(p.wood, rgb(0xb07a48), 0.45);
        concreteDark = mix(p.wood, rgb(0x1c1410), 0.3);
      }
      const boardA = dim(rgb(BOARD_COLORS[h.style.boards % BOARD_COLORS.length]));
      const boardB = dim(rgb(0xeef2f8));
      const zoneA = dim(rgb(0xd23232));
      const zoneB = dim(rgb(0xf2c230));
      const ice = dim(rgb(0xf4fbff));
      const groove = dim(rgb(0x9fd4f0));
      const depth = Math.floor(DECK_DEPTH * ZOOM);

      const xFrom = Math.max(Math.floor(cam.sx(h.topX)), 0);
      const xTo = Math.min(Math.floor(cam.sx(0)), c.w - 1);
      for (let x = xFrom; x <= xTo; x++) {
        const wx = cam.wx(x + 0.5);
        const ir = h.inrunAtX(wx);
        if (!ir) continue;
        const y = Math.round(cam.sy(ir.y));
        const u = ir.u;

        // Solid concrete/timber block under takeoff table
        if (u < TAKEOFF_WIDTH + 2.0) {
          const base = Math.floor(cam.sy(h.mountainY(wx)));
          for (let yy = y + depth; yy <= base; yy++) {
            c.set(x, yy, dither(x, yy, concrete, concreteDark, 0.25 + (0.5 * (yy - y - depth)) / Math.max(1, base - y - depth + 1)));
          }
        }

        let board = Math.floor(u / BOARD_LEN) % 2 === 1 ? boardB : boardA;
        if (u < TAKEOFF_WIDTH) {
          board = u < 0.6 || Math.floor((u - 0.6) / 1.5) % 2 === 1 ? zoneB : zoneA;
        }
        c.vLine(x, y, y + 1, ice);
        c.set(x, y + 2, groove);
        c.vLine(x, y + 3, y + depth - 2, board);
        c.set(x, y + depth - 1, steel);
      }

      // Takeoff edge face
      const ex = Math.floor(cam.sx(0));
      const ey = Math.floor(cam.sy(0));
      if (ex > -10 && ex < c.w + 10) {
        c.fillRect(ex - 1, ey, 3, Math.floor(h.tableHeight * ZOOM) + 3, concreteDark);
        c.fillRect(ex - 1, ey, 3, depth, zoneB);
      }

      // Upper inrun railing
      let px = 0, py = 0;
      for (let u = TAKEOFF_WIDTH + 6; u <= h.topU - 1; u += BOARD_LEN) {
        const pt = h.inrunPoint(u);
        const x = cam.sx(pt.x);
        const y = cam.sy(pt.y + 1.2);
        c.line(x, y, x, cam.sy(pt.y), steel);
        if (u > TAKEOFF_WIDTH + 6) c.line(px, py, x, y, steel);
        px = x;
        py = y;
      }

      // Start bar
      const gp = h.inrunPoint(h.gateU + 0.45);
      const bx = Math.floor(cam.sx(gp.x));
      const by = Math.floor(cam.sy(gp.y));
      c.fillRect(bx - 1, by - 6, 2, 7, steel);
      c.fillRect(bx - 3, by - 8, 7, 3, rgb(0xd03030));
    }

    drawMarks(c, cam) {
      const p = this.pal;
      const h = this.hill;
      const first = Math.ceil((h.K * 0.5) / 5) * 5;
      for (let d = first; d <= h.HS + 15; d += 5) {
        const pt = h.landPoint(d);
        const x = Math.floor(cam.sx(pt.x));
        const y = Math.floor(cam.sy(pt.y));
        if (x < -20 || x > c.w + 20) continue;
        c.vLine(x, y + 1, y + 4, p.mark);
        if (d % 10 === 0) {
          c.textCentered(x, y + 8, String(d), 1, p.text);
        }
      }
      const drawLine = (d, col, label) => {
        const pt = h.landPoint(d);
        const x = Math.floor(cam.sx(pt.x));
        const y = Math.floor(cam.sy(pt.y));
        if (x < -20 || x > c.w + 20) return;
        c.fillRect(x - 1, y, 2, 8, col);
        c.textCentered(x + 1, y + 19, label, 1, col);
      };
      drawLine(h.K, rgb(0xd03030), 'K');
      drawLine(h.HS, rgb(0x2a2f3a), 'HS');
    }

    drawSnowfall(c) {
      const p = this.pal;
      for (let i = 0; i < this.flakes.length; i++) {
        const f = this.flakes[i];
        const x = f.x | 0;
        const y = f.y | 0;
        c.blend(x, y, p.fall, p.fallA);
        if (f.speed > 36) c.blend(x + 1, y, p.fall, p.fallA * 0.7);
      }
    }
  }

  // ---- Jointed Ski Jumper Poses (exact coordinates from jumper_draw.cpp) ----
  const v2 = (x, y) => ({ x, y });
  const addV = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const scaleV = (a, s) => ({ x: a.x * s, y: a.y * s });
  const lerpV = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const dirV = (a) => ({ x: Math.cos(a), y: Math.sin(a) });

  const makePose = (o) => ({
    foot: o.foot || v2(0, 0),
    knee: o.knee,
    hip: o.hip,
    foot2: o.foot2 || v2(0, 0),
    knee2: o.knee2 || o.knee,
    sh: o.sh,
    head: o.head,
    hand: o.hand,
    hand2: o.hand2 || o.hand,
  });

  const POSE_SIT = makePose({
    knee: v2(0.32, 0.36), hip: v2(-0.12, 0.50), sh: v2(-0.02, 1.06),
    head: v2(0.02, 1.30), hand: v2(-0.18, 0.50),
  });
  const POSE_REACH = makePose({
    knee: v2(0.34, 0.36), hip: v2(0.00, 0.48), sh: v2(0.50, 0.84),
    head: v2(0.68, 0.97), hand: v2(-0.34, 0.50),
  });
  const POSE_CROUCH = makePose({
    knee: v2(0.36, 0.33), hip: v2(-0.12, 0.41), sh: v2(0.45, 0.54),
    head: v2(0.69, 0.57), hand: v2(-0.14, 0.62),
  });
  const POSE_PUSH = makePose({
    knee: v2(0.22, 0.415), hip: v2(0.44, 0.83), sh: v2(0.81, 1.27),
    head: v2(0.99, 1.45), hand: v2(0.47, 0.78),
  });
  const POSE_PREP = makePose({
    knee: v2(0.26, 0.40), hip: v2(0.16, 0.86), sh: v2(0.38, 1.38),
    head: v2(0.44, 1.62), hand: v2(0.92, 1.30), hand2: v2(-0.18, 1.26),
  });
  const POSE_TELEMARK = makePose({
    foot: v2(0.30, 0), knee: v2(0.62, 0.36), hip: v2(0.18, 0.60),
    foot2: v2(-0.45, 0), knee2: v2(-0.12, 0.22), sh: v2(0.36, 1.14),
    head: v2(0.42, 1.38), hand: v2(0.92, 1.06), hand2: v2(-0.28, 1.02),
  });
  const POSE_TELE_DEEP = makePose({
    foot: v2(0.34, 0), knee: v2(0.70, 0.30), hip: v2(0.24, 0.40),
    foot2: v2(-0.52, 0), knee2: v2(-0.10, 0.12), sh: v2(0.46, 0.92),
    head: v2(0.54, 1.15), hand: v2(1.00, 0.88), hand2: v2(-0.18, 0.80),
  });
  const POSE_STAND = makePose({
    knee: v2(0.08, 0.46), hip: v2(0.00, 0.93), sh: v2(0.06, 1.50),
    head: v2(0.08, 1.75), hand: v2(0.20, 0.96), hand2: v2(-0.10, 0.96),
  });
  const POSE_CHEER = makePose({
    knee: v2(0.08, 0.46), hip: v2(0.00, 0.93), sh: v2(0.06, 1.50),
    head: v2(0.08, 1.75), hand: v2(0.42, 2.04), hand2: v2(-0.26, 2.04),
  });

  function clonePose(p) {
    return {
      foot: v2(p.foot.x, p.foot.y),
      knee: v2(p.knee.x, p.knee.y),
      hip: v2(p.hip.x, p.hip.y),
      foot2: v2(p.foot2.x, p.foot2.y),
      knee2: v2(p.knee2.x, p.knee2.y),
      sh: v2(p.sh.x, p.sh.y),
      head: v2(p.head.x, p.head.y),
      hand: v2(p.hand.x, p.hand.y),
      hand2: v2(p.hand2.x, p.hand2.y),
    };
  }

  // Exact shapeFor(lean) from jumper_draw.cpp
  function shapeFor(lean) {
    let body = DRAWN_BEST;
    let v = 1.0;
    let dive = 0.0;
    if (lean >= BEST_OPEN) {
      const f = clamp((lean - BEST_OPEN) / (START_OPEN - BEST_OPEN), 0, 1);
      body = DRAWN_BEST + f * (DRAWN_STANDING - DRAWN_BEST);
      v = 1.0 - f;
    } else if (lean >= OVER_LEAN) {
      const f = (lean - OVER_LEAN) / (BEST_OPEN - OVER_LEAN);
      body = DRAWN_EDGE + f * (DRAWN_BEST - DRAWN_EDGE);
      v = 1.0;
    } else {
      dive = clamp((OVER_LEAN - lean) / (OVER_LEAN - MIN_OPEN), 0, 1);
      body = DRAWN_EDGE + dive * (DRAWN_TUMBLED - DRAWN_EDGE);
      v = 1.0;
    }
    return { body: body * DEG, v, dive };
  }

  // Exact flightPose(sh) from jumper_draw.cpp
  function flightPose(sh) {
    const hips = 4.0 * DEG * clamp(sh.body / (DRAWN_BEST * DEG), -1, 1);
    const leg = dirV(sh.body - hips);
    const torso = sh.body + hips;
    const knee = scaleV(leg, SHIN_LEN);
    const hip = scaleV(leg, SHIN_LEN + THIGH_LEN);
    const shPt = addV(hip, scaleV(dirV(torso), TORSO_LEN));
    const head = addV(shPt, scaleV(dirV(torso + 4.0 * DEG), NECK_LEN));
    const up = clamp((sh.body - 30.0 * DEG) / (40.0 * DEG), 0, 1);
    const back = torso + Math.PI + 8.0 * DEG;
    let hand = addV(shPt, scaleV(dirV(back - up * 105.0 * DEG), ARM_LEN));
    let hand2 = addV(shPt, scaleV(dirV(back + up * 60.0 * DEG), ARM_LEN));
    if (sh.dive > 0) {
      const ahead = addV(shPt, scaleV(dirV(torso - 25.0 * DEG), ARM_LEN));
      hand = lerpV(hand, ahead, sh.dive);
      hand2 = lerpV(hand2, addV(shPt, scaleV(dirV(torso + 35.0 * DEG), ARM_LEN)), sh.dive);
    }
    return makePose({ knee, hip, knee2: knee, sh: shPt, head, hand, hand2 });
  }

  function lerpPose(a, b, t) {
    const raw = clamp(t, 0, 1);
    const k = raw * raw * (3 - 2 * raw);
    return {
      foot: lerpV(a.foot, b.foot, k),
      knee: lerpV(a.knee, b.knee, k),
      hip: lerpV(a.hip, b.hip, k),
      foot2: lerpV(a.foot2, b.foot2, k),
      knee2: lerpV(a.knee2, b.knee2, k),
      sh: lerpV(a.sh, b.sh, k),
      head: lerpV(a.head, b.head, k),
      hand: lerpV(a.hand, b.hand, k),
      hand2: lerpV(a.hand2, b.hand2, k),
    };
  }

  function reactionPose(dist, hill, t) {
    if (dist >= hill.HS) {
      const p = clonePose(POSE_CHEER);
      const hopT = t - 0.25;
      if (hopT > 0) {
        const ph = (hopT % HOP_EVERY) / HOP_EVERY;
        if (ph < 0.3) {
          const sq = 0.12 * Math.sin((Math.PI * ph) / 0.3);
          for (const k of ['hip', 'sh', 'head', 'hand', 'hand2']) p[k].y -= sq;
          p.knee.x += 0.6 * sq; p.knee2.x += 0.6 * sq;
          p.knee.y -= 0.4 * sq; p.knee2.y -= 0.4 * sq;
        } else {
          const up = 0.38 * Math.sin((Math.PI * (ph - 0.3)) / 0.7);
          for (const k of ['foot', 'knee', 'hip', 'foot2', 'knee2', 'sh', 'head', 'hand', 'hand2']) {
            p[k].y += up;
          }
          p.hand.y += 0.4 * up;
          p.hand2.y += 0.4 * up;
        }
      }
      return p;
    }
    return POSE_CHEER;
  }

  function drawJumper(c, cam, jump, kit, tick) {
    // Ground shadow during flight (green when low enough for telemark, just like WSJ)
    if (jump.phase === 'flight') {
      const gx = Math.floor(cam.sx(jump.x));
      const gy = Math.floor(cam.sy(jump.hill.groundY(jump.x)));
      const hAbove = Math.max(0, jump.y - jump.hill.groundY(jump.x));
      const sw = Math.floor(clamp(14 - hAbove * 0.8, 4, 14));
      let shade = rgb(0x203050);
      let a = 0.35;
      if (jump.prepT === 0 && hAbove <= 3.0 && jump.x > 0) {
        shade = rgb(0x18c060);
        a = 0.75;
      }
      for (let i = -sw; i <= sw; i++) {
        c.blend(gx + i, gy, shade, a);
        c.blend(gx + i, gy + 1, shade, a * 0.6);
      }
    }

    // Exact WSJ currentPose & ski V-opening
    let pose = POSE_CROUCH;
    let farTilt = 0, nearTilt = 0, bend = 0;
    let ang = jump.pitch;

    if (jump.phase === 'gate') {
      pose = clonePose(POSE_SIT);
      const breath = 0.012 * Math.sin(tick * 0.07);
      pose.sh.y += breath;
      pose.head.y += breath * 1.5;
      const ph = tick % 320;
      if (ph < 56) {
        pose.hand = lerpV(pose.hand, addV(pose.head, v2(0.17, 0.02)), Math.sin((Math.PI * ph) / 56));
      }
    } else if (jump.phase === 'inrun') {
      const t = jump.phaseT;
      if (t < 0.16) pose = lerpPose(POSE_SIT, POSE_REACH, t / 0.16);
      else if (t < 0.50) pose = lerpPose(POSE_REACH, POSE_CROUCH, (t - 0.16) / 0.34);
      else if (t < 0.80) {
        pose = clonePose(POSE_CROUCH);
        const d = 0.05 * Math.sin((Math.PI * (t - 0.50)) / 0.30);
        pose.hip.y -= d; pose.sh.y -= d * 1.2; pose.head.y -= d * 1.2;
        pose.hand.y -= d; pose.hand2.y -= d;
      } else {
        pose = POSE_CROUCH;
      }
    } else if (jump.phase === 'flight') {
      const t = jump.phaseT;
      const sh = shapeFor(jump.open);
      const fly = flightPose(sh);
      if (t < POP_TIME) pose = lerpPose(POSE_CROUCH, POSE_PUSH, t / POP_TIME);
      else if (t < POP_HOLD) pose = POSE_PUSH;
      else pose = lerpPose(POSE_PUSH, fly, (t - POP_HOLD) / (POP_BLEND - POP_HOLD));

      let vIn = clamp((t - POP_HOLD) / (POP_BLEND - POP_HOLD), 0, 1);
      if (jump.prepT > 0) {
        const pf = clamp(jump.prepT / PREP_TIME, 0, 1);
        pose = lerpPose(pose, POSE_PREP, pf);
        vIn *= 1 - pf;
      }
      const v = sh.v * vIn;
      const dive = sh.dive * vIn;
      const wobble = (9 - 4 * jump.takeoffQ) * DEG * Math.exp(-t / 0.55) * Math.sin(2 * Math.PI * 5.5 * t);
      farTilt = 6 * DEG * v + 46 * DEG * dive - wobble * 0.7;
      nearTilt = -13 * DEG * v + 43 * DEG * dive + wobble;
      bend = 5 * DEG * v + 55 * DEG * dive;
      ang -= 18 * DEG * dive;
    } else {
      // Outrun / done (exact WSJ touchdown settle + dip + arm sway + stand + reaction)
      const t = jump.outrunT;
      ang += 3 * DEG * Math.exp(-t / 0.06);
      const from = lerpPose(flightPose(shapeFor(jump.open)), POSE_PREP, clamp(jump.prepT / PREP_TIME, 0, 1));
      pose = lerpPose(from, POSE_TELEMARK, t / LAND_SETTLE);
      const depth = 0.65;
      const k = t / LAND_DIP;
      pose = lerpPose(pose, POSE_TELE_DEEP, depth * k * Math.exp(1 - k));
      const sway = 0.07 * depth * Math.sin(t * 13) * Math.exp(-t / 0.35) * clamp(t / 0.08, 0, 1);
      pose.hand.y += sway;
      pose.hand2.y -= 0.7 * sway;
      if (t > LAND_HOLD) {
        pose = lerpPose(pose, POSE_STAND, (t - LAND_HOLD) / LAND_RISE);
      }
      if (t > REACT_AT) {
        pose = lerpPose(pose, reactionPose(jump.landDist, jump.hill, t - REACT_AT), (t - REACT_AT) / 0.35);
      }
    }

    const ox = cam.sx(jump.x);
    const oy = cam.sy(jump.y) - 1.5;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const at = (v) => [
      ox + (v.x * ca - v.y * sa) * JUMPER_SIZE * ZOOM,
      oy - (v.x * sa + v.y * ca) * JUMPER_SIZE * ZOOM,
    ];

    const outline = OUTLINE_COL;
    const far = mix(kit.suit, outline, 0.45);
    const light = mix(kit.suit, rgb(0xffffff), 0.28);
    const boot = rgb(0x2a2f3c);
    const farSki = mix(kit.skis, outline, 0.28);
    const bib = rgb(0xf4f6fa);

    const buildSki = (foot, tilt, bnd, col) => {
      const ps = [];
      const tail = addV(foot, v2(-SKI_TAIL, 0));
      let pt = tail;
      const n = 8;
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        const next = addV(pt, scaleV(dirV(tilt + bnd * f * f), SKI_LEN / n));
        ps.push({ a: pt, b: next, r: 0.95, col });
        pt = next;
      }
      ps.push({ a: pt, b: addV(pt, scaleV(dirV(tilt + bnd + 35 * DEG), 0.2)), r: 0.95, col });
      const newFoot = addV(tail, scaleV(dirV(tilt + bnd * 0.04), SKI_TAIL));
      return [ps, newFoot];
    };

    const bootOf = (foot) => ({
      a: addV(foot, v2(-0.04, 0.06)),
      b: addV(foot, v2(0.20, 0.06)),
      r: 1.6,
      col: boot,
    });

    const [farParts, farFoot] = buildSki(addV(pose.foot2, v2(0.05, 0)), farTilt, bend, farSki);
    const [nearParts, nearFoot] = buildSki(pose.foot, nearTilt, bend, kit.skis);

    const parts = [
      ...farParts,
      { a: pose.sh, b: pose.hand2, r: 1.25, col: far },
      bootOf(farFoot),
      { a: farFoot, b: pose.knee2, r: 1.55, col: far },
      { a: pose.knee2, b: pose.hip, r: 1.9, col: far },
      ...nearParts,
      bootOf(nearFoot),
      { a: nearFoot, b: pose.knee, r: 1.6, col: kit.suit },
      { a: pose.knee, b: pose.hip, r: 2.0, col: kit.suit },
      { a: pose.hip, b: pose.sh, r: 2.5, col: kit.suit },
      { a: lerpV(pose.hip, pose.sh, 0.38), b: lerpV(pose.hip, pose.sh, 0.80), r: 1.9, col: bib },
      { a: pose.sh, b: pose.hand, r: 1.3, col: light },
      { a: pose.hand, b: pose.hand, r: 1.5, col: boot },
    ];

    const [hx, hy] = at(pose.head);

    // Outline pass
    for (let i = 0; i < parts.length; i++) {
      const q = parts[i];
      const [x0, y0] = at(q.a);
      const [x1, y1] = at(q.b);
      c.fillCapsule(x0, y0, x1, y1, q.r + 1.0, outline);
    }
    c.fillCapsule(hx, hy, hx, hy, 3.9, outline);

    // Fill pass
    for (let i = 0; i < parts.length; i++) {
      const q = parts[i];
      const [x0, y0] = at(q.a);
      const [x1, y1] = at(q.b);
      c.fillCapsule(x0, y0, x1, y1, q.r, q.col);
    }

    // Helmet + goggles + shine
    c.fillCapsule(hx, hy, hx, hy, 2.9, kit.helmet);
    c.fillCapsule(
      hx + (ca * 1.3 - sa * 0.2), hy - (sa * 1.3 + ca * 0.2),
      hx + (ca * 2.4 - sa * 0.2), hy - (sa * 2.4 + ca * 0.2),
      1.0, outline
    );
    c.set(Math.floor(hx - 1), Math.floor(hy - 2), mix(kit.helmet, rgb(0xffffff), 0.7));
  }

  // ---- Background AI Jump Demo ----
  class DemoFlight {
    constructor(presetIndex, rng) {
      const spec = HILL_PRESETS[presetIndex % HILL_PRESETS.length];
      this.hill = new Hill(spec);
      this.scen = new Scenery(this.hill);
      this.rng = rng;
      this.wind = -0.5 + rng() * 2.6;
      this.kit = {
        suit: rgb(SUIT_COLORS[Math.floor(rng() * SUIT_COLORS.length)]),
        helmet: rgb(HELMET_COLORS[Math.floor(rng() * HELMET_COLORS.length)]),
        skis: rgb(SKI_COLORS[Math.floor(rng() * SKI_COLORS.length)]),
      };

      const startPt = this.hill.inrunPoint(this.hill.gateU);
      this.jump = {
        hill: this.hill,
        phase: 'gate',
        phaseT: 0,
        outrunT: 0,
        prepT: 0,
        u: this.hill.gateU,
        s: 0,
        x: startPt.x,
        y: startPt.y,
        vx: 0,
        vy: 0,
        speed: 0,
        pitch: -startPt.slope,
        open: START_OPEN,
        takeoffQ: 0.92,
        landDist: 0,
      };

      this.gateWait = 0.55 + rng() * 0.35;
      this.takeoffSkill = 0.85 + rng() * 0.15;
      this.takeoffMarkU = null;
      this.particles = [];
      this.trail = [];
      this.tick = 0;
      this.rest = 0;

      // Camera frames the jumper in the lower-middle so the Emes Games card
      // floats cleanly in the sky above without ever overlapping the jumper.
      this.cam = this.camTarget();
    }

    camTarget() {
      const j = this.jump;
      let ahead = 14.0, below = -3.5;
      if (j.phase === 'flight') {
        ahead = 18.0;
        below = -1.0;
      } else if (j.phase === 'outrun' || j.phase === 'done') {
        ahead = 11.0;
        below = -3.0;
      }
      return {
        x: j.x + ahead,
        y: j.y - below,
        sx(wx) { return (wx - this.x) * ZOOM + this._w * 0.5; },
        sy(wy) { return (this.y - wy) * ZOOM + SCREEN_H * 0.5; },
        wx(sx) { return (sx - this._w * 0.5) / ZOOM + this.x; },
        _w: BASE_SCREEN_W,
      };
    }

    emit(x, y, vx, vy, life, col, big) {
      if (this.particles.length < 360) {
        this.particles.push({ x, y, vx, vy, life, maxLife: life, col, big });
      }
    }

    step(dt, screenW) {
      const j = this.jump;
      const h = this.hill;
      this.tick++;
      j.phaseT += dt;

      if (j.phase === 'gate') {
        if (j.phaseT >= this.gateWait) {
          j.phase = 'inrun';
          j.phaseT = 0;
          j.speed = 2.6;
          for (let i = 0; i < 12; i++) {
            this.emit(j.x - 0.3 - this.rng() * 0.9, j.y + 0.05, -1 + 3 * this.rng(), 0.4 + 2 * this.rng(), 0.25 + 0.35 * this.rng(), SNOW_DUST, this.rng() < 0.3);
          }
        }
      } else if (j.phase === 'inrun') {
        const pt = h.inrunPoint(j.u);
        const acc = 9.81 * Math.sin(pt.slope) - 0.0014 * j.speed * j.speed - 0.22;
        j.speed = Math.max(2.0, j.speed + acc * dt);
        j.u -= j.speed * dt;
        const pushAt = 0.5 + (1 - this.takeoffSkill) * 2.2;
        if (j.u <= pushAt) {
          // Takeoff! (matches Jump::takeOff in jumper.cpp)
          const edge = h.inrunPoint(Math.max(0, j.u));
          this.takeoffMarkU = Math.max(0, j.u);
          j.phase = 'flight';
          j.phaseT = 0;
          j.x = edge.x;
          j.y = edge.y + 0.05;
          j.takeoffQ = clamp(0.8 + 0.2 * this.takeoffSkill, 0.7, 1.0);
          const popV = 3.1 + 1.4 * this.takeoffSkill;
          j.vx = j.speed * Math.cos(edge.slope) + popV * Math.sin(edge.slope);
          j.vy = -j.speed * Math.sin(edge.slope) + popV * Math.cos(edge.slope);
          j.pitch = -edge.slope;
          j.open = START_OPEN;

          // Takeoff snow burst + golden sparks
          for (let i = 0; i < 30; i++) {
            this.emit(j.x - this.rng() * 1.2, j.y + this.rng() * 0.3, j.vx * (0.1 + 0.45 * this.rng()), 0.5 + this.rng() * 7.5, 0.3 + 0.55 * this.rng(), SNOW_DUST, this.rng() < 0.4);
          }
          for (let i = 0; i < 20; i++) {
            const a = this.rng() * Math.PI * 2;
            this.emit(j.x, j.y + 0.8, j.vx * 0.65 + 6.8 * Math.cos(a), j.vy + 6.8 * Math.sin(a), 0.34 + 0.28 * this.rng(), SPARK_GOLD, true);
          }
        } else {
          const np = h.inrunPoint(j.u);
          j.x = np.x;
          j.y = np.y;
          j.pitch = -np.slope;
        }
      } else if (j.phase === 'flight') {
        const speed = Math.hypot(j.vx, j.vy);
        const airSpeed = speed + this.wind * 0.8;
        const lift = 0.0086 * airSpeed * airSpeed * (0.92 + 0.14 * this.takeoffSkill);
        const drag = 0.0044 * airSpeed * airSpeed;
        const flightDir = Math.atan2(j.vy, j.vx);

        const ax = -drag * Math.cos(flightDir) - lift * Math.sin(flightDir);
        const ay = -9.81 - drag * Math.sin(flightDir) + lift * Math.cos(flightDir);

        j.vx += ax * dt;
        j.vy += ay * dt;
        j.x += j.vx * dt;
        j.y += j.vy * dt;

        const ground = h.landAtX(j.x);
        const heightAbove = j.y - ground.y;
        const landing = heightAbove < 3.4 && j.x > 25;

        if (!landing && j.prepT === 0) {
          // Lay smoothly from START_OPEN (68 deg) down to BEST_OPEN (20 deg) like WSJ's AI pilot
          const layTarget = BEST_OPEN + 1.5 * Math.sin(j.phaseT * 2.2);
          if (j.phaseT > 0.12) {
            j.open += (layTarget - j.open) * (1 - Math.exp(-dt * 2.8));
          }
          // Exact WSJ ski pitch tracking from jumper.cpp
          const targetPitch = (BEST_PITCH + (j.open - BEST_OPEN) / OPEN_GAIN) * DEG;
          j.pitch += (targetPitch - j.pitch) * (1 - Math.exp(-dt / SKI_LAG));
        } else {
          j.prepT += dt;
          const targetPitch = ground.slope + 3.0 * DEG;
          j.pitch += (targetPitch - j.pitch) * (1 - Math.exp(-dt / 0.10));
        }

        // Exact WSJ dotted flight trail
        if (this.tick % 2 === 0) {
          const good = j.phaseT > 0.65 && j.open < BEST_OPEN + 12 && j.prepT === 0;
          this.trail.push({ x: j.x, y: j.y + 0.6, col: good ? TRAIL_GOOD : TRAIL_NEUTRAL });
          if (this.trail.length > 90) this.trail.shift();
        }

        if (j.y <= ground.y) {
          j.y = ground.y;
          j.s = ground.s;
          j.landDist = ground.s;
          j.phase = 'outrun';
          j.phaseT = 0;
          j.outrunT = 0;
          j.speed = Math.hypot(j.vx, j.vy) * 0.92;
          j.pitch = ground.slope;
          for (let i = 0; i < 32; i++) {
            this.emit(
              j.x - 0.5 + this.rng() * 1.2,
              j.y + 0.1,
              j.speed * (0.15 + 0.45 * this.rng()) * Math.cos(ground.slope),
              1.0 + this.rng() * 5.2,
              0.3 + 0.5 * this.rng(),
              SNOW_DUST,
              this.rng() < 0.45
            );
          }
        }
      } else {
        j.outrunT += dt;
        const lp = h.landPoint(j.s);
        const brake = j.s > h.outrunS ? 8.5 : 1.4;
        const slopeAcc = -9.81 * Math.sin(lp.slope);
        j.speed = Math.max(0, j.speed + (slopeAcc - brake) * dt);
        j.s = Math.min(h.maxS - 2, j.s + j.speed * dt);
        const np = h.landPoint(j.s);
        j.x = np.x;
        j.y = np.y;
        j.pitch = np.slope;

        if (j.speed > 4 && this.tick % 2 === 0) {
          this.emit(j.x - 0.6, j.y + 0.05, -2 + this.rng() * 3, 0.5 + this.rng() * 2, 0.25 + 0.25 * this.rng(), SNOW_DUST, false);
        }
        if (j.speed < 0.2 || j.outrunT > 3.2) {
          j.phase = 'done';
          this.rest += dt;
        }
      }

      // Update particles (matching effects.cpp)
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.life -= dt;
        if (pt.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        pt.vy -= 7.0 * dt;
        pt.vx *= 0.97;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
      }

      // Smooth exponential camera tracking
      const target = this.camTarget();
      const ox = this.cam.x, oy = this.cam.y;
      const k = 1 - Math.exp(-dt * 4.8);
      this.cam.x += (target.x - this.cam.x) * k;
      this.cam.y += (target.y - this.cam.y) * k;
      this.cam._w = screenW;

      this.scen.step(dt, this.wind, this.cam.x - ox, this.cam.y - oy, screenW);
    }

    draw(c) {
      this.cam._w = c.w;
      this.scen.drawWorld(c, this.cam);

      // Exact WSJ dotted '+' flight trail behind jumper (from effects.cpp)
      for (let i = 0; i < this.trail.length; i++) {
        const tr = this.trail[i];
        const tx = Math.floor(this.cam.sx(tr.x));
        const ty = Math.floor(this.cam.sy(tr.y));
        if (tx < -4 || tx > c.w + 4 || ty < -4 || ty > c.h + 4) continue;
        c.fillRect(tx - 1, ty - 1, 3, 3, OUTLINE_COL);
        c.set(tx, ty, tr.col);
        c.set(tx - 1, ty, tr.col);
        c.set(tx + 1, ty, tr.col);
        c.set(tx, ty - 1, tr.col);
        c.set(tx, ty + 1, tr.col);
      }

      // Takeoff pennant flag at takeoff spot (from effects.cpp)
      if (this.takeoffMarkU !== null) {
        const mp = this.hill.inrunPoint(this.takeoffMarkU);
        const mx = Math.floor(this.cam.sx(mp.x));
        const my = Math.floor(this.cam.sy(mp.y));
        if (mx > -20 && mx < c.w + 20) {
          c.vLine(mx, my - 16, my, OUTLINE_COL);
          c.fillTri(mx + 1, my - 16, mx + 1, my - 9, mx + 9, my - 12, UI_GOLD);
        }
      }

      drawJumper(c, this.cam, this.jump, this.kit, this.tick);

      // Snow dust & takeoff sparks
      for (let i = 0; i < this.particles.length; i++) {
        const pt = this.particles[i];
        const a = 0.9 * clamp(pt.life / pt.maxLife, 0, 1);
        const px = Math.floor(this.cam.sx(pt.x));
        const py = Math.floor(this.cam.sy(pt.y));
        c.blend(px, py, pt.col, a);
        if (pt.big) {
          c.blend(px + 1, py, pt.col, a * 0.85);
          c.blend(px, py + 1, pt.col, a * 0.85);
        }
      }

      this.scen.drawSnowfall(c);
    }
  }

  // ---- Emes Games — Coming Soon Pixel Overlay ----
  function drawOverlay(c, elapsed) {
    const W = c.w;
    const title = 'EMES GAMES';
    const sub = 'COMING SOON';

    // Responsive integer pixel font scale
    const titleScale = W < 360 ? 3 : W < 480 ? 4 : 5;
    const subScale = W < 360 ? 2 : 2;

    const titleW = c.textWidth(title, titleScale);
    const titleH = 7 * titleScale;
    const subW = c.textWidth(sub, subScale);
    const subH = 7 * subScale;

    const padX = W < 360 ? 16 : 24;
    const padY = W < 360 ? 14 : 18;
    const gap = W < 360 ? 10 : 14;

    const boxW = Math.max(titleW, subW) + padX * 2;
    const boxH = titleH + gap + subH + padY * 2;
    const boxX = Math.floor((W - boxW) * 0.5);
    const boxY = Math.floor(SCREEN_H * 0.11);

    // Subtle pixel drop shadow under the panel
    c.blendRect(boxX + 3, boxY + 3, boxW, boxH, UI_SHADOW, 0.45);

    // WSJ translucent dark-ink panel with blue-steel 1px pixel border
    c.panel(boxX, boxY, boxW, boxH, 0.62);

    // Crisp pixel corner accents (2x2 gold rivets)
    c.fillRect(boxX + 2, boxY + 2, 2, 2, UI_GOLD);
    c.fillRect(boxX + boxW - 4, boxY + 2, 2, 2, UI_GOLD);
    c.fillRect(boxX + 2, boxY + boxH - 4, 2, 2, UI_GOLD);
    c.fillRect(boxX + boxW - 4, boxY + boxH - 4, 2, 2, UI_GOLD);

    // EMES GAMES title
    const tx = Math.floor((W - titleW) * 0.5);
    const ty = boxY + padY;
    c.textShadow(tx, ty, title, titleScale, UI_TEXT, UI_SHADOW, Math.max(2, Math.floor(titleScale * 0.4)));

    // Subtle pixel divider line
    const divY = ty + titleH + Math.floor(gap * 0.45);
    c.blendRect(boxX + padX, divY, boxW - padX * 2, 1, UI_EDGE, 0.65);

    // COMING SOON subtitle with gentle retro animated dots
    const dotCount = Math.max(0, Math.floor(elapsed * 1.6)) % 4;
    const dots = '.'.repeat(dotCount);
    const sx = Math.floor((W - subW) * 0.5);
    const sy = ty + titleH + gap;
    c.textShadow(sx, sy, sub, subScale, UI_GOLD, UI_SHADOW, 1);
    if (dots.length) {
      c.textShadow(sx + subW + subScale * 2, sy, dots, subScale, UI_DIM, UI_SHADOW, 1);
    }
  }

  // ---- Main Loop ----
  const canvasEl = document.getElementById('scene');
  const pxCanvas = new PixelCanvas(canvasEl);
  const masterRng = makeRng((Date.now() ^ 0x5f3759df) >>> 0);

  let presetIdx = Math.floor(masterRng() * HILL_PRESETS.length);
  let demo = new DemoFlight(presetIdx, masterRng);
  let fade = 1.0; // starts fading in from UI_INK
  let fadingOut = false;
  let elapsed = 0;

  window.addEventListener('resize', () => pxCanvas.resize(), { passive: true });

  let lastTime = performance.now();
  const FIXED_DT = 1 / 60;
  let accum = 0;

  function frame(now) {
    const rawDt = clamp((now - lastTime) / 1000, 0, 0.1);
    lastTime = now;
    elapsed += rawDt;
    accum += rawDt;

    while (accum >= FIXED_DT) {
      demo.step(FIXED_DT, pxCanvas.w);
      if (fadingOut) {
        fade += FIXED_DT * 2.2;
        if (fade >= 1.0) {
          fade = 1.0;
          fadingOut = false;
          presetIdx = (presetIdx + 1) % HILL_PRESETS.length;
          demo = new DemoFlight(presetIdx, masterRng);
        }
      } else {
        if (fade > 0) fade = Math.max(0, fade - FIXED_DT * 2.0);
        if (demo.rest > 2.4) fadingOut = true;
      }
      accum -= FIXED_DT;
    }

    demo.draw(pxCanvas);
    if (fade > 0.005) {
      pxCanvas.blendRect(0, 0, pxCanvas.w, pxCanvas.h, UI_INK, fade);
    }
    pxCanvas.present();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
