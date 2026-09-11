"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------
   Lab Run — a monochrome pixel runner for loading screens.
   A white lab mouse runs along a shelf and jumps over pills.
   Space / up / tap to jump. Down arrow, or hold below the line, to duck.
   All sprites are built from code at startup (no image files).
------------------------------------------------------------------- */

const W = 1000;
const H = 500;
const GROUND = 380;
const PX = 2.6; // world units per sprite pixel
const MOUSE_X = 60;
const GRAVITY = 2600;
const JUMP_V = 880;
const JUMP_CUT = 500;
const START_SPEED = 520;
const MAX_SPEED = 1150;
const ACCEL = 11;

const BG = "#F7F7F7";
const DARK = "#535353";
const PALETTE = { 1: "#FFFFFF", 2: DARK, 3: "#F2A0B4", 4: "#D6334C", 5: DARK, 6: "#D4D4D4", 8: BG };

/* ---------------------------- sprite building ---------------------------- */

const grid = (w, h) => Array.from({ length: h }, () => new Array(w).fill(0));

function fillEll(g, cx, cy, rx, ry, v, onlyEmpty = false) {
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (!onlyEmpty || g[y][x] === 0)) g[y][x] = v;
    }
}

function outline(g, test = (v) => v !== 0, v = 2) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) {
      if (g[y][x] !== 0) continue;
      const hit = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const r = g[y + dy];
        return r && r[x + dx] !== undefined && test(r[x + dx]);
      });
      if (hit) out[y][x] = v;
    }
  return out;
}

const setPx = (g, pts, v) =>
  pts.forEach(([x, y]) => {
    if (g[y] && g[y][x] !== undefined) g[y][x] = v;
  });

function crop(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  g.forEach((r, y) =>
    r.forEach((v, x) => {
      if (v) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    })
  );
  return g.slice(y0, y1 + 1).map((r) => r.slice(x0, x1 + 1));
}

function mouseGrid({ duck = false, legs = 0, dead = false, tailUp = false, blink = false }) {
  let g;
  if (!duck) {
    g = grid(36, 16);
    fillEll(g, 16, 9, 8.5, 4.2, 1);
    fillEll(g, 26, 8, 5, 3.6, 1);
    fillEll(g, 30, 8.8, 3, 2.1, 1);
    g = outline(g);
    fillEll(g, 23.5, 3.6, 2.4, 2.4, 3, true);
    g = outline(g, (v) => v === 3);
    if (dead) setPx(g, [[27, 5], [29, 5], [28, 6], [27, 7], [29, 7]], 2);
    else setPx(g, [[28, 6]], blink ? 2 : 4);
    const L =
      legs === 0 ? [[10, 13], [10, 14], [9, 15], [23, 13], [23, 14], [23, 15]]
      : legs === 1 ? [[13, 13], [13, 14], [13, 15], [20, 13], [20, 14], [20, 15]]
      : [[9, 13], [8, 14], [25, 13], [26, 14]];
    const F = legs === 0 ? [[10, 15], [24, 15]] : legs === 1 ? [[14, 15], [21, 15]] : [[7, 14], [27, 14]];
    setPx(g, L, 2);
    setPx(g, F, 3);
    setPx(
      g,
      tailUp
        ? [[6, 10], [5, 10], [4, 9], [3, 9], [2, 8], [1, 8], [0, 7]]
        : [[6, 11], [5, 12], [4, 12], [3, 12], [2, 12], [1, 11], [0, 11]],
      2
    );
    const row = g[9];
    for (let x = row.length - 1; x >= 0; x--) if (row[x]) { row[x] = 3; break; }
  } else {
    g = grid(38, 12);
    fillEll(g, 17, 7.2, 10, 3.2, 1);
    fillEll(g, 28, 7.4, 4.6, 2.8, 1);
    fillEll(g, 32, 8, 2.6, 1.8, 1);
    g = outline(g);
    fillEll(g, 24, 3.6, 2.8, 1.6, 3, true);
    g = outline(g, (v) => v === 3);
    if (dead) setPx(g, [[28, 5], [30, 5], [29, 6], [28, 7], [30, 7]], 2);
    else setPx(g, [[29, 6]], 4);
    setPx(g, legs === 0 ? [[10, 10], [9, 11], [25, 10], [25, 11]] : [[12, 10], [12, 11], [23, 10], [22, 11]], 2);
    setPx(
      g,
      tailUp ? [[6, 7], [5, 7], [4, 6], [3, 6], [2, 5], [1, 5]] : [[6, 8], [5, 9], [4, 9], [3, 9], [2, 9], [1, 8]],
      2
    );
    const row = g[8];
    for (let x = row.length - 1; x >= 0; x--) if (row[x]) { row[x] = 3; break; }
  }
  return g;
}

function capsuleGrid(len, r, deg, flip = false) {
  const a = (deg * Math.PI) / 180;
  const hx = (Math.cos(a) * len) / 2;
  const hy = (Math.sin(a) * len) / 2;
  const w = Math.ceil(Math.abs(hx) * 2 + r * 2 + 3);
  const h = Math.ceil(Math.abs(hy) * 2 + r * 2 + 3);
  const cx = w / 2;
  const cy = h / 2;
  const g = grid(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;
      const t = Math.max(0, Math.min(1, ((px + hx) * hx + (py + hy) * hy) / (2 * (hx * hx + hy * hy))));
      const qx = -hx + 2 * hx * t;
      const qy = -hy + 2 * hy * t;
      if (Math.hypot(px - qx, py - qy) <= r) g[y][x] = (t < 0.5) !== flip ? 1 : 5;
    }
  return crop(outline(g));
}

function tabletsGrid(n) {
  const w = 16;
  const h = 4 * n + 4;
  const g = grid(w, h);
  for (let i = 0; i < n; i++) {
    const cy = h - 3 - i * 4;
    const cx = 8 + (i % 2 ? 0.6 : -0.6);
    const tmp = grid(w, h);
    fillEll(tmp, cx, cy, 6.6, 2.1, 1);
    const ring = outline(tmp);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ring[y][x]) g[y][x] = ring[y][x];
  }
  return crop(g);
}

function bottleGrid() {
  const w = 14;
  const h = 24;
  const g = grid(w, h);
  for (let y = 0; y < 5; y++) for (let x = 0; x < w; x++) g[y][x] = 2;
  for (let y = 1; y < 4; y++) for (let x = 2; x < w - 2; x += 2) g[y][x] = 1;
  g[0][0] = 0;
  g[0][w - 1] = 0;
  for (let y = 5; y < h; y++)
    for (let x = 1; x < w - 1; x++) g[y][x] = x === 1 || x === w - 2 || y === h - 1 ? 2 : 1;
  g[h - 1][1] = 0;
  g[h - 1][w - 2] = 0;
  setPx(g, [[2, h - 2], [w - 3, h - 2]], 2);
  for (let x = 1; x < w - 1; x++) {
    g[9][x] = 2;
    g[18][x] = 2;
  }
  setPx(g, [[6, 11], [7, 11], [6, 12], [7, 12], [4, 13], [5, 13], [6, 13], [7, 13], [8, 13], [9, 13],
    [4, 14], [5, 14], [6, 14], [7, 14], [8, 14], [9, 14], [6, 15], [7, 15], [6, 16], [7, 16]], 2);
  return g;
}

function cloudGrid() {
  const g = grid(28, 11);
  fillEll(g, 8, 7, 5.5, 3, 1);
  fillEll(g, 14, 5.5, 6, 4, 1);
  fillEll(g, 20, 7.2, 5, 2.6, 1);
  for (let x = 3; x < 25; x++) for (let y = 8; y < 10; y++) if (g[y - 1][x]) g[y][x] = 1;
  return outline(g, (v) => v !== 0, 6);
}

const BUMP = ["..2222..", ".2....2.", "28888882"].map((r) => [...r].map((c) => (c === "." ? 0 : +c)));

function toSprite(g, inset = 1) {
  const h = g.length;
  const w = g[0].length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = g[y][x];
      if (!v) continue;
      ctx.fillStyle = PALETTE[v];
      ctx.fillRect(x, y, 1, 1);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
  return { canvas: c, w, h, box: { x: x0 + inset, y: y0 + inset, w: x1 - x0 - inset * 2, h: y1 - y0 - inset * 2 } };
}

function buildSprites() {
  const m = (o) => toSprite(mouseGrid(o), 0);
  return {
    run: [m({ legs: 0 }), m({ legs: 1, tailUp: true })],
    jump: m({ legs: 2, tailUp: true }),
    duck: [m({ duck: true, legs: 0 }), m({ duck: true, legs: 1, tailUp: true })],
    blink: m({ legs: 0, blink: true }),
    dead: m({ dead: true, legs: 0 }),
    deadDuck: m({ duck: true, dead: true }),
    cap: toSprite(capsuleGrid(14, 3.4, 0)),
    capFlip: toSprite(capsuleGrid(12, 3.4, 0, true)),
    stand: toSprite(capsuleGrid(12, 3.6, 90)),
    standFlip: toSprite(capsuleGrid(9, 3.6, 90, true)),
    lean: toSprite(capsuleGrid(13, 3.4, -24)),
    stack2: toSprite(tabletsGrid(2)),
    stack3: toSprite(tabletsGrid(3)),
    bottle: toSprite(bottleGrid()),
    fly: [0, 45, 90, 135].map((d) => toSprite(capsuleGrid(12, 3.2, d), 2.5)),
    cloud: toSprite(cloudGrid(), 0),
    bump: toSprite(BUMP, 0),
  };
}

// Mouse hitboxes in sprite pixels (ears and tail are left out, to be forgiving)
const MOUSE_BOXES = [
  { x: 9, y: 4, w: 16, h: 8 },
  { x: 23, y: 5, w: 9, h: 5 },
];
const DUCK_BOXES = [
  { x: 8, y: 5, w: 18, h: 5 },
  { x: 25, y: 5, w: 9, h: 4 },
];

/* ---------------------------- pixel font ---------------------------- */

const FONT = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
};

/* ---------------------------- scenery ---------------------------- */

const GROUND_PERIOD = 1600;
const GROUND_BITS = (() => {
  let s = 3;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const bits = [];
  for (let x = 0; x < GROUND_PERIOD; x += 18 + rnd() * 40) {
    bits.push({ x, y: 2 + Math.floor(rnd() * 5), w: rnd() < 0.3 ? 2 + Math.floor(rnd() * 2) : 1 });
  }
  const bumps = [];
  for (let x = 200; x < GROUND_PERIOD - 60; x += 380 + rnd() * 420) bumps.push(x);
  return { bits, bumps };
})();

/* ---------------------------- game ---------------------------- */

function makeGame(best = 0) {
  return {
    state: "idle",
    t: 0,
    h: 0,
    vy: 0,
    jumpHeld: false,
    duckHeld: false,
    speed: START_SPEED,
    dist: 0,
    groundOff: 0,
    obstacles: [],
    lastType: null,
    repeat: 0,
    clouds: [
      { x: 180, y: 120 },
      { x: 560, y: 70 },
      { x: 860, y: 160 },
    ],
    best,
    overAt: 0,
    flash: 0,
    lastMilestone: 0,
  };
}

const scoreOf = (g) => Math.floor(g.dist / 45);

function spawn(g, spr) {
  const score = scoreOf(g);
  const pool = ["cap", "stand", "stack2"];
  if (score > 60) pool.push("stack3", "lean", "group2");
  if (score > 150) pool.push("bottle", "group3");
  if (score > 250) pool.push("fly", "fly");
  let type = pool[Math.floor(Math.random() * pool.length)];
  if (type === g.lastType && g.repeat >= 1) type = pool[(pool.indexOf(type) + 1) % pool.length];
  g.repeat = type === g.lastType ? g.repeat + 1 : 0;
  g.lastType = type;

  const one = (s) => [{ spr: s, dx: 0 }];
  let parts;
  switch (type) {
    case "cap": parts = one(spr.cap); break;
    case "stand": parts = one(Math.random() < 0.5 ? spr.stand : spr.standFlip); break;
    case "stack2": parts = one(spr.stack2); break;
    case "stack3": parts = one(spr.stack3); break;
    case "lean": parts = one(spr.lean); break;
    case "bottle": parts = one(spr.bottle); break;
    case "group2":
      parts = [{ spr: spr.stand, dx: 0 }, { spr: spr.capFlip, dx: spr.stand.w + 1 }];
      break;
    case "group3":
      parts = [
        { spr: spr.standFlip, dx: 0 },
        { spr: spr.stand, dx: spr.standFlip.w + 1 },
        { spr: spr.stack2, dx: spr.standFlip.w + spr.stand.w + 2 },
      ];
      break;
    default: {
      const heights = [18, 36, 80]; // center heights above the ground: jump, duck, run under
      g.obstacles.push({ fly: true, x: W + 40, cy: GROUND - heights[Math.floor(Math.random() * 3)], w: 50 });
      return;
    }
  }
  const w = parts.reduce((m, p) => Math.max(m, (p.dx + p.spr.w) * PX), 0);
  g.obstacles.push({ x: W + 20, parts, w });
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function mousePose(g, spr) {
  if (g.state === "over") return g.duckHeld && g.h === 0 ? spr.deadDuck : spr.dead;
  if (g.state === "idle") return Math.floor(g.t * 10) % 32 === 0 ? spr.blink : spr.run[0];
  if (g.h > 0) return spr.jump;
  const frame = Math.floor(g.t * (8 + g.speed / 90)) % 2;
  return g.duckHeld ? spr.duck[frame] : spr.run[frame];
}

function mouseBoxes(g, pose, spr) {
  const ducking = pose === spr.duck[0] || pose === spr.duck[1];
  const top = GROUND + PX - pose.h * PX - g.h;
  return (ducking ? DUCK_BOXES : MOUSE_BOXES).map((b) => ({
    x: MOUSE_X + b.x * PX,
    y: top + b.y * PX,
    w: b.w * PX,
    h: b.h * PX,
  }));
}

function update(g, dt, spr, reduced) {
  g.t += dt;
  if (g.state !== "run") return;

  g.speed = Math.min(MAX_SPEED, g.speed + ACCEL * dt);
  const move = g.speed * dt;
  g.dist += move;
  g.groundOff = (g.groundOff + move) % GROUND_PERIOD;

  // Jump physics
  if (g.h > 0 || g.vy > 0) {
    if (!g.jumpHeld && g.vy > JUMP_CUT) g.vy = JUMP_CUT;
    g.vy -= GRAVITY * dt * (g.duckHeld ? 2.2 : 1);
    g.h += g.vy * dt;
    if (g.h <= 0) {
      g.h = 0;
      g.vy = 0;
    }
  }

  // Clouds drift slowly
  if (!reduced)
    for (const c of g.clouds) {
      c.x -= move * 0.12;
      if (c.x < -90) {
        c.x = W + Math.random() * 300;
        c.y = 50 + Math.random() * 150;
      }
    }

  // Obstacles
  for (const o of g.obstacles) o.x -= move + (o.fly ? 60 * dt : 0);
  g.obstacles = g.obstacles.filter((o) => o.x + o.w > -20);
  const last = g.obstacles[g.obstacles.length - 1];
  const gap = g.speed * (0.55 + Math.random() * 0.6) + 120;
  if (!last || last.x + last.w < W - gap) spawn(g, spr);

  // Collisions
  const pose = mousePose(g, spr);
  const mb = mouseBoxes(g, pose, spr);
  for (const o of g.obstacles) {
    let boxes;
    if (o.fly) {
      const f = spr.fly[0];
      const size = f.w * PX * 0.55;
      boxes = [{ x: o.x + (o.w - size) / 2, y: o.cy - size / 2, w: size, h: size }];
    } else {
      boxes = o.parts.map((p) => ({
        x: o.x + (p.dx + p.spr.box.x) * PX,
        y: GROUND + PX - (p.spr.h - p.spr.box.y) * PX,
        w: p.spr.box.w * PX,
        h: p.spr.box.h * PX,
      }));
    }
    if (boxes.some((b) => mb.some((m) => overlap(b, m)))) {
      g.state = "over";
      g.overAt = g.t;
      g.best = Math.max(g.best, scoreOf(g));
      return;
    }
  }

  // Score blinks at every 100
  const sc = scoreOf(g);
  const milestone = Math.floor(sc / 100) * 100;
  if (milestone > g.lastMilestone) {
    g.lastMilestone = milestone;
    if (!reduced) g.flash = 1;
  }
  g.flash = Math.max(0, g.flash - dt);
}

/* ---------------------------- drawing ---------------------------- */

function draw(ctx, s, g, spr) {
  const rect = (x, y, w, h) => {
    const X = Math.round(x * s);
    const Y = Math.round(y * s);
    ctx.fillRect(X, Y, Math.round((x + w) * s) - X, Math.round((y + h) * s) - Y);
  };
  const blit = (sp, x, y) => {
    const X = Math.round(x * s);
    const Y = Math.round(y * s);
    ctx.drawImage(sp.canvas, X, Y, Math.round((x + sp.w * PX) * s) - X, Math.round((y + sp.h * PX) * s) - Y);
  };
  const text = (str, x, y, cell, color, align = "left") => {
    const adv = 6 * cell;
    let cx = align === "right" ? x - (str.length * adv - cell) : align === "center" ? x - (str.length * adv - cell) / 2 : x;
    ctx.fillStyle = color;
    for (const ch of str) {
      const glyph = FONT[ch];
      if (glyph)
        glyph.forEach((row, ry) => {
          for (let rx = 0; rx < 5; rx++) if (row[rx] === "1") rect(cx + rx * cell, y + ry * cell, cell, cell);
        });
      cx += adv;
    }
  };

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const c of g.clouds) blit(spr.cloud, c.x, c.y);

  // Ground line, bumps and specks
  ctx.fillStyle = DARK;
  rect(0, GROUND, W, PX);
  const off = g.groundOff;
  for (const k of [0, GROUND_PERIOD]) {
    for (const b of GROUND_BITS.bits) {
      const x = b.x - off + k;
      if (x > -10 && x < W + 10) rect(x, GROUND + b.y * PX, b.w * PX, PX);
    }
    for (const bx of GROUND_BITS.bumps) {
      const x = bx - off + k;
      if (x > -30 && x < W + 30) blit(spr.bump, x, GROUND - 2 * PX);
    }
  }

  // Obstacles
  for (const o of g.obstacles) {
    if (o.fly) {
      const f = spr.fly[Math.floor(g.t * 9) % 4];
      blit(f, o.x + (o.w - f.w * PX) / 2, o.cy - (f.h * PX) / 2);
    } else {
      for (const p of o.parts) blit(p.spr, o.x + p.dx * PX, GROUND + PX - p.spr.h * PX);
    }
  }

  // Mouse
  const pose = mousePose(g, spr);
  blit(pose, MOUSE_X, GROUND + PX - pose.h * PX - g.h);

  // Score
  const cell = 2.4;
  const sc = scoreOf(g);
  const shown = g.flash > 0 ? g.lastMilestone : sc;
  const visible = g.flash <= 0 || Math.floor(g.flash * 8) % 2 === 0;
  const pad = (n) => String(Math.min(n, 99999)).padStart(5, "0");
  if (visible) text(pad(shown), W - 30, 24, cell, DARK, "right");
  if (g.best > 0) text(`HI ${pad(g.best)}`, W - 30 - 6 * cell * 6 - 10, 24, cell, "#8A8A8A", "right");

  if (g.state === "over") text("GAME OVER", W / 2, 150, 3.4, DARK, "center");
}

/* ---------------------------- component ---------------------------- */

export function LabRunLoader({
  isLoading = true,
  message = "Finding the lowest prices",
  readyMessage = "Prices found",
  continueLabel = "See prices",
  onContinue,
  onSkip,
  accentColor = "#E8892F",
  autoFocus = true,
  className,
  style,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const duckPointer = useRef(null);

  const [phase, setPhase] = useState("idle");
  const [best, setBest] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const spr = buildSprites();
    const g = makeGame();
    g.spr = spr;
    gameRef.current = g;

    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let reduced = !!(mq && mq.matches);
    const onMq = (e) => (reduced = e.matches);
    if (mq && mq.addEventListener) mq.addEventListener("change", onMq);

    let scale = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      scale = canvas.width / W;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    if (autoFocus && wrapRef.current) wrapRef.current.focus({ preventScroll: true });

    let last = performance.now();
    let raf;
    let seenState = g.state;
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const cur = gameRef.current;
      update(cur, dt, spr, reduced);
      draw(ctx, scale, cur, spr);
      if (cur.state !== seenState) {
        seenState = cur.state;
        setPhase(cur.state);
        if (cur.state === "over") setBest(cur.best);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onMq);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = () => {
    let g = gameRef.current;
    if (!g) return;
    if (g.state === "over") {
      if (g.t - g.overAt < 0.45) return;
      const fresh = makeGame(g.best);
      fresh.t = g.t;
      fresh.spr = g.spr;
      gameRef.current = fresh;
      g = fresh;
    }
    if (g.state === "idle") g.state = "run";
    if (g.h === 0 && g.vy === 0 && !g.duckHeld) {
      g.vy = JUMP_V;
      g.h = 0.01;
    }
    g.jumpHeld = true;
  };
  const release = () => {
    if (gameRef.current) gameRef.current.jumpHeld = false;
  };
  const setDuck = (on) => {
    const g = gameRef.current;
    if (!g) return;
    g.duckHeld = on && g.state === "run";
  };

  const onKeyDown = (e) => {
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      e.preventDefault();
      if (!e.repeat) press();
    } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
      e.preventDefault();
      setDuck(true);
    }
  };
  const onKeyUp = (e) => {
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") release();
    if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") setDuck(false);
  };

  const onPointerDown = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const wy = ((e.clientY - r.top) * H) / r.height;
    canvasRef.current.setPointerCapture(e.pointerId);
    const g = gameRef.current;
    if (wy > GROUND + 10 && g && g.state === "run") {
      duckPointer.current = e.pointerId;
      setDuck(true);
    } else {
      press();
    }
  };
  const onPointerUp = (e) => {
    if (duckPointer.current === e.pointerId) {
      duckPointer.current = null;
      setDuck(false);
    } else {
      release();
    }
  };

  const ready = !isLoading;
  const chip = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5em",
    padding: "0.45em 0.9em",
    borderRadius: 999,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(83,83,83,0.12)",
    color: DARK,
    fontWeight: 600,
  };
  const button = {
    font: "inherit",
    fontWeight: 700,
    border: "none",
    borderRadius: 999,
    padding: "0.55em 1.1em",
    cursor: "pointer",
    background: accentColor,
    color: "#fff",
  };
  const ghost = { ...button, background: "#fff", color: DARK, boxShadow: "inset 0 0 0 1.5px rgba(83,83,83,0.3)" };

  const hint =
    phase === "idle"
      ? "Press space or tap to start"
      : phase === "over"
        ? "Tap or press space to run again"
        : "Space or tap to jump. Down arrow, or hold below the line, to duck.";

  return (
    <div
      ref={wrapRef}
      className={className}
      tabIndex={0}
      role="group"
      aria-label="Lab mouse running game. Press space or tap to jump over pills, down arrow to duck."
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        release();
        setDuck(false);
      }}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${W} / ${H}`,
        overflow: "hidden",
        borderRadius: 18,
        background: BG,
        containerType: "inline-size",
        fontFamily: "inherit",
        fontSize: "clamp(11px, 1.7cqw, 15px)",
        userSelect: "none",
        WebkitUserSelect: "none",
        outlineOffset: 3,
        ...style,
      }}
    >
      <style>{`
        .lr-spin { width: 0.9em; height: 0.9em; border-radius: 50%;
          border: 2px solid ${accentColor}; border-right-color: transparent;
          animation: lr-rot 0.8s linear infinite; }
        .lr-dots::after { content: ""; display: inline-block; width: 1.2em; text-align: left;
          animation: lr-dots 1.4s steps(4, end) infinite; }
        .lr-card { animation: lr-drop 0.35s cubic-bezier(.2,1.3,.4,1) both; }
        .lr-btn:focus-visible { outline: 3px solid ${DARK}; outline-offset: 2px; }
        @keyframes lr-rot { to { transform: rotate(360deg); } }
        @keyframes lr-dots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75% { content: "..."; } }
        @keyframes lr-drop { from { transform: translate(-50%, -24px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .lr-spin, .lr-dots::after, .lr-card { animation: none; }
          .lr-dots::after { content: "..."; }
        }
      `}</style>

      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
          cursor: "pointer",
          imageRendering: "pixelated",
        }}
      />

      <div style={{ position: "absolute", top: "4%", left: "2.5%" }} aria-live="polite">
        <div style={chip}>
          {ready ? (
            <span aria-hidden style={{ color: accentColor, fontWeight: 800 }}>✓</span>
          ) : (
            <span className="lr-spin" aria-hidden />
          )}
          <span className={ready ? undefined : "lr-dots"}>{ready ? readyMessage : message}</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "2.5%",
          right: "2.5%",
          bottom: "4%",
          display: "flex",
          alignItems: "center",
          gap: "1em",
          color: DARK,
          pointerEvents: "none",
        }}
      >
        <span style={{ marginRight: "auto", opacity: 0.65 }}>{hint}</span>
        {onSkip && (
          <button className="lr-btn" style={{ ...ghost, pointerEvents: "auto" }} onClick={onSkip}>
            Skip game
          </button>
        )}
      </div>

      {ready && !dismissed && (
        <div
          className="lr-card"
          role="dialog"
          aria-label={readyMessage}
          style={{
            position: "absolute",
            top: "16%",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            color: DARK,
            borderRadius: 16,
            padding: "1.1em 1.3em",
            boxShadow: "0 12px 40px rgba(0,0,0,0.14)",
            textAlign: "center",
            minWidth: "16em",
          }}
        >
          <div style={{ fontSize: "1.3em", fontWeight: 800, marginBottom: "0.2em" }}>Your prices are ready</div>
          <div style={{ opacity: 0.65, marginBottom: "0.9em" }}>
            {best > 0 ? `Your best run was ${best}.` : "We found the lowest prices we could."}
          </div>
          <div style={{ display: "flex", gap: "0.6em", justifyContent: "center" }}>
            {onContinue && (
              <button className="lr-btn" style={button} onClick={onContinue} autoFocus>
                {continueLabel}
              </button>
            )}
            <button
              className="lr-btn"
              style={ghost}
              onClick={() => {
                setDismissed(true);
                wrapRef.current && wrapRef.current.focus({ preventScroll: true });
              }}
            >
              Keep running
            </button>
          </div>
        </div>
      )}

      {ready && dismissed && onContinue && (
        <div style={{ position: "absolute", top: "14%", left: "2.5%" }}>
          <button className="lr-btn" style={button} onClick={onContinue}>
            {continueLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Demo wrapper for previewing here. In your Next.js app, import the
   named export { LabRunLoader } instead of this default.
------------------------------------------------------------------- */
export default function Demo() {
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 40000);
    return () => clearTimeout(t);
  }, [loading, run]);

  const restart = () => {
    setDone(false);
    setLoading(true);
    setRun((r) => r + 1);
  };

  const small = {
    font: "inherit",
    fontWeight: 600,
    padding: "0.5em 1em",
    borderRadius: 999,
    border: "1.5px solid rgba(83,83,83,0.3)",
    background: "#fff",
    color: DARK,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#E6E6E6",
        padding: "24px 16px",
        fontFamily: '"Nunito", "Avenir Next", "Segoe UI", sans-serif',
        color: DARK,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 920 }}>
        {done ? (
          <div
            style={{
              aspectRatio: `${W} / ${H}`,
              borderRadius: 18,
              background: "#fff",
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              padding: 24,
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Your results page goes here</div>
              <div style={{ opacity: 0.6, marginTop: 6 }}>This is where onContinue would take the user.</div>
            </div>
          </div>
        ) : (
          <LabRunLoader key={run} isLoading={loading} onContinue={() => setDone(true)} onSkip={() => setDone(true)} />
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 14 }}>
          <span style={{ opacity: 0.7, marginRight: "auto" }}>
            Demo: the price search finishes on its own after 40 seconds.
          </span>
          <button style={small} onClick={() => setLoading(false)} disabled={!loading || done}>
            Finish loading now
          </button>
          <button style={small} onClick={restart}>
            Restart demo
          </button>
        </div>
      </div>
    </div>
  );
}
