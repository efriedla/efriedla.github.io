"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------
   Pill Shot — a loading-screen mini game.
   Drag back and release to shoot pills into the open pill bottle.
   Everything is drawn on a canvas in a fixed 1000 x 700 "world"
   and scaled to fit, so it stays crisp and light (no image assets).
------------------------------------------------------------------- */

const W = 1000;
const H = 700;
const GROUND = 668;
const GRAVITY = 1500;
const SUBSTEPS = 3;
const TAU = Math.PI * 2;

const PILL_LEN = 64;
const PILL_W = 28;
const PILL_R = 15; // collision radius

const LAUNCH = { x: 150, y: 440 };
const QUEUE = { x: 80, y: 565 };
const MAX_PULL = 170;
const MIN_PULL = 18;
const POWER = 7.4;

const BOTTLE_W = 150;
const BOTTLE_H = 210;
const WALL = 12;
const CAP_W = BOTTLE_W + 10;
const CAP_H = 44;
const LID_OPEN = 2.0; // radians the flip-top lid is swung open
const STACK_MAX = 18;
const HOME_X = 740; // bottle center when it isn't moving

const INK = "#2B3A4A";

const PALETTES = [
  { a: "#FFC845", b: "#BE1931", stroke: null },
  { a: "#F06178", b: "#7CCBC5", stroke: INK },
  { a: "#FFFFFF", b: "#4C7BE0", stroke: INK },
  { a: "#B9A3F0", b: "#FFE08A", stroke: null },
  { a: "#6FCF97", b: "#F4F4F4", stroke: INK },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randPal = () => PALETTES[Math.floor(Math.random() * PALETTES.length)];
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/* Faint shelves used when no background photo is supplied */
const SHELVES = (() => {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const colors = ["#F4A94F", "#7CCBC5", "#F06178", "#4C7BE0", "#6FCF97", "#B9A3F0"];
  const lines = [170, 360, 550];
  const items = [];
  for (const y of lines) {
    let x = 20;
    while (x < W - 50) {
      const w = 26 + rnd() * 40;
      const h = 40 + rnd() * 80;
      items.push({ x, y, w, h, c: colors[Math.floor(rnd() * colors.length)] });
      x += w + 8 + rnd() * 22;
    }
  }
  return { lines, items };
})();

/* ---------------------------- game state ---------------------------- */

function makeGame() {
  return {
    t: 0,
    pills: [],
    stack: [],
    particles: [],
    texts: [],
    loaded: { pal: randPal(), appear: 0 },
    next: randPal(),
    reload: 0,
    aim: null,
    kb: { active: false, angle: -0.8, power: 0.72 },
    shots: 0,
    score: 0,
    streak: 0,
    amp: 0,
    phase: 0,
    bottleX: HOME_X,
    lidKick: 0,
    squash: 0,
    stackClearAt: 0,
  };
}

function bottleGeom(cx) {
  return { bx: cx - BOTTLE_W / 2, by: GROUND - BOTTLE_H, bw: BOTTLE_W, bh: BOTTLE_H };
}

function lidAngle(g) {
  return LID_OPEN + g.lidKick * Math.sin(g.t * 18);
}

function lidSegment(b, angle) {
  const px = b.bx + b.bw + 2;
  const py = b.by - 4;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tf = (lx, ly) => ({ x: px + lx * c - ly * s, y: py + lx * s + ly * c });
  return { a: tf(-(CAP_W - 12), -CAP_H / 2), b: tf(-8, -CAP_H / 2), thick: CAP_H / 2 - 2 };
}

const pulledPos = (px, py) => ({ x: LAUNCH.x - px * 0.28, y: LAUNCH.y - py * 0.28 });

function currentPull(g) {
  let px;
  let py;
  if (g.aim) {
    px = g.aim.sx - g.aim.cx;
    py = g.aim.sy - g.aim.cy;
  } else if (g.kb.active) {
    const len = g.kb.power * MAX_PULL;
    px = Math.cos(g.kb.angle) * len;
    py = Math.sin(g.kb.angle) * len;
  } else {
    return null;
  }
  const len = Math.hypot(px, py);
  if (len > MAX_PULL) {
    px *= MAX_PULL / len;
    py *= MAX_PULL / len;
  }
  return { px, py, len: Math.min(len, MAX_PULL) };
}

function fire(g) {
  const pull = currentPull(g);
  if (!g.loaded || !pull || pull.len < MIN_PULL) return;
  const start = pulledPos(pull.px, pull.py);
  g.pills.push({
    x: start.x,
    y: start.y,
    vx: pull.px * POWER,
    vy: pull.py * POWER,
    angle: Math.atan2(pull.py, pull.px),
    spin: 0,
    pal: g.loaded.pal,
    touched: false,
    lid: false,
    slow: 0,
    alpha: 1,
    done: false,
  });
  g.loaded = null;
  g.reload = 0.35;
  g.shots += 1;
}

/* ---------------------------- physics ---------------------------- */

function bounce(p, nx, ny, rest) {
  const vn = p.vx * nx + p.vy * ny;
  if (vn < 0) {
    p.vx -= (1 + rest) * vn * nx;
    p.vy -= (1 + rest) * vn * ny;
    p.vx *= 0.92;
    p.vy *= 0.92;
    if (Math.abs(p.spin) < 2) p.spin = (p.vx >= 0 ? 1 : -1) * (5 + Math.random() * 5);
  }
}

function collideRect(p, r, rest) {
  const qx = clamp(p.x, r.x, r.x + r.w);
  const qy = clamp(p.y, r.y, r.y + r.h);
  const dx = p.x - qx;
  const dy = p.y - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= PILL_R * PILL_R) return false;
  let nx;
  let ny;
  const d = Math.sqrt(d2);
  if (d < 1e-4) {
    const opts = [
      [p.x - r.x, -1, 0],
      [r.x + r.w - p.x, 1, 0],
      [p.y - r.y, 0, -1],
      [r.y + r.h - p.y, 0, 1],
    ].sort((a, b) => a[0] - b[0])[0];
    nx = opts[1];
    ny = opts[2];
    p.x += nx * (opts[0] + PILL_R);
    p.y += ny * (opts[0] + PILL_R);
  } else {
    nx = dx / d;
    ny = dy / d;
    p.x += nx * (PILL_R - d);
    p.y += ny * (PILL_R - d);
  }
  bounce(p, nx, ny, rest);
  return true;
}

function collideSeg(p, seg, rest) {
  const abx = seg.b.x - seg.a.x;
  const aby = seg.b.y - seg.a.y;
  const t = clamp(((p.x - seg.a.x) * abx + (p.y - seg.a.y) * aby) / (abx * abx + aby * aby), 0, 1);
  const qx = seg.a.x + abx * t;
  const qy = seg.a.y + aby * t;
  const dx = p.x - qx;
  const dy = p.y - qy;
  const minD = PILL_R + seg.thick;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return false;
  const d = Math.sqrt(d2) || 1e-4;
  const nx = dx / d;
  const ny = dy / d;
  p.x += nx * (minD - d);
  p.y += ny * (minD - d);
  bounce(p, nx, ny, rest);
  return true;
}

function burst(g, x, y, colors, n) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const sp = 150 + Math.random() * 260;
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.7 + Math.random() * 0.4,
      size: 3 + Math.random() * 3,
      color: colors[i % colors.length],
    });
  }
}

function scorePill(g, p, b, reduced) {
  const clean = !p.touched;
  const pts = clean ? 2 : 1;
  g.score += pts;
  g.streak += 1;
  const label = clean ? "Swish! +2" : p.lid ? "Bank shot! +1" : "+1";
  g.texts.push({ x: b.bx + b.bw / 2, y: b.by - 34, text: label, life: 1 });

  const i = g.stack.length;
  const row = Math.floor(i / 3);
  const col = i % 3;
  g.stack.push({
    ox: p.x - b.bx,
    oy: p.y - GROUND,
    tox: WALL + 30 + col * 39 + (Math.random() * 8 - 4),
    toy: -(22 + row * 21),
    vy: Math.max(0, p.vy * 0.3),
    angle: p.angle,
    tangle: (Math.random() - 0.5) * 0.9 + (col - 1) * 0.25,
    pal: p.pal,
  });

  if (!reduced) {
    g.lidKick = 0.25;
    g.squash = 1;
    burst(g, b.bx + b.bw / 2, b.by, [p.pal.a, p.pal.b, "#FBBA63"], 14);
  }

  if (g.stack.length >= STACK_MAX && !g.stackClearAt) {
    g.score += 5;
    g.texts.push({ x: b.bx + b.bw / 2, y: b.by - 80, text: "Bottle full! +5", life: 1.4 });
    g.stackClearAt = g.t + 0.9;
  }
}

function update(g, dt, reduced) {
  g.t += dt;

  // Reload
  if (!g.loaded) {
    g.reload -= dt;
    if (g.reload <= 0) {
      g.loaded = { pal: g.next, appear: reduced ? 1 : 0 };
      g.next = randPal();
    }
  } else {
    g.loaded.appear = Math.min(1, g.loaded.appear + dt * 5);
  }

  // Bottle starts sliding once you get the hang of it
  const level = Math.floor(g.score / 6);
  const targetAmp = reduced || level < 1 ? 0 : Math.min(30 + level * 20, 110);
  g.amp += (targetAmp - g.amp) * Math.min(1, dt * 0.8);
  g.phase += Math.min(0.55 + level * 0.12, 1.3) * dt;
  g.bottleX = HOME_X + g.amp * Math.sin(g.phase);
  g.lidKick *= Math.exp(-dt * 4);
  g.squash *= Math.exp(-dt * 8);

  const b = bottleGeom(g.bottleX);
  const rects = [
    { x: b.bx - 4, y: b.by - 6, w: WALL + 4, h: b.bh + 6 },
    { x: b.bx + b.bw - WALL, y: b.by - 6, w: WALL + 4, h: b.bh + 6 },
  ];
  const lid = lidSegment(b, lidAngle(g));
  const h = dt / SUBSTEPS;

  for (const p of g.pills) {
    if (p.done) continue;
    let grounded = false;
    for (let s = 0; s < SUBSTEPS && !p.done; s++) {
      p.vy += GRAVITY * h;
      const prevY = p.y;
      p.x += p.vx * h;
      p.y += p.vy * h;

      const rimLine = b.by + 14;
      if (p.vy > 0 && prevY < rimLine && p.y >= rimLine && p.x > b.bx + WALL && p.x < b.bx + b.bw - WALL) {
        p.done = true;
        p.scored = true;
        scorePill(g, p, b, reduced);
        break;
      }

      for (const r of rects) if (collideRect(p, r, 0.45)) p.touched = true;
      if (collideSeg(p, lid, 0.6)) {
        p.touched = true;
        p.lid = true;
      }

      if (p.y > GROUND - PILL_R) {
        p.y = GROUND - PILL_R;
        if (p.vy > 90) {
          p.vy = -p.vy * 0.35;
          p.touched = true;
          p.spin = p.vx / 18;
        } else {
          p.vy = 0;
          grounded = true;
        }
        p.vx *= grounded ? 1 - 2.5 * h : 0.8;
      }
    }
    if (p.done) continue;

    if (grounded) {
      const flat = Math.round(p.angle / Math.PI) * Math.PI;
      p.angle += (flat - p.angle) * Math.min(1, dt * 10);
    } else if (!p.touched) {
      p.angle = Math.atan2(p.vy, p.vx);
    } else {
      p.angle += p.spin * dt;
      p.spin *= Math.exp(-dt * 1.5);
    }

    p.slow = Math.hypot(p.vx, p.vy) < 25 ? p.slow + dt : 0;
    if (p.slow > 0.5) p.alpha -= dt * 3;
    if (p.alpha <= 0 || p.x > W + 60 || p.x < -60) {
      p.done = true;
      g.streak = 0;
    }
  }
  g.pills = g.pills.filter((p) => !p.done);

  // Pills settling inside the bottle
  for (const e of g.stack) {
    if (e.oy < e.toy) {
      e.vy += GRAVITY * dt;
      e.oy = Math.min(e.toy, e.oy + e.vy * dt);
    }
    e.ox += (e.tox - e.ox) * Math.min(1, dt * 8);
    e.angle += (e.tangle - e.angle) * Math.min(1, dt * 6);
  }
  if (g.stackClearAt && g.t >= g.stackClearAt) {
    g.stack = [];
    g.stackClearAt = 0;
    if (!reduced) burst(g, b.bx + b.bw / 2, b.by, ["#FFC845", "#F06178", "#7CCBC5", "#FBBA63"], 26);
  }

  for (const q of g.particles) {
    q.vy += 900 * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.life -= dt;
  }
  g.particles = g.particles.filter((q) => q.life > 0);

  for (const t of g.texts) {
    t.y -= 40 * dt;
    t.life -= dt * 0.9;
  }
  g.texts = g.texts.filter((t) => t.life > 0);
}

/* ---------------------------- drawing ---------------------------- */

function rrect(ctx, x, y, w, h, rt, rb = rt) {
  ctx.beginPath();
  ctx.moveTo(x + rt, y);
  ctx.lineTo(x + w - rt, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rt);
  ctx.lineTo(x + w, y + h - rb);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rb, y + h);
  ctx.lineTo(x + rb, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rb);
  ctx.lineTo(x, y + rt);
  ctx.quadraticCurveTo(x, y, x + rt, y);
  ctx.closePath();
}

function capsulePath(ctx, len, w) {
  const r = w / 2;
  const half = len / 2;
  ctx.beginPath();
  ctx.moveTo(-half + r, -r);
  ctx.lineTo(half - r, -r);
  ctx.arc(half - r, 0, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(-half + r, r);
  ctx.arc(-half + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
}

function drawPill(ctx, x, y, angle, pal, scale = 1, alpha = 1) {
  if (scale <= 0.01 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  const L = PILL_LEN;
  const Wd = PILL_W;
  capsulePath(ctx, L, Wd);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = pal.a;
  ctx.fillRect(-L / 2, -Wd / 2, L / 2 + 0.5, Wd);
  ctx.fillStyle = pal.b;
  ctx.fillRect(0, -Wd / 2, L / 2, Wd);
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  ctx.fillRect(-L / 2, Wd * 0.2, L, Wd);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-L / 2 + 13, -Wd / 2 + 7);
  ctx.lineTo(L / 2 - 13, -Wd / 2 + 7);
  ctx.stroke();
  ctx.restore();
  if (pal.stroke) {
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = 2.5;
    capsulePath(ctx, L, Wd);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -Wd / 2);
    ctx.lineTo(0, Wd / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShelves(ctx) {
  ctx.save();
  ctx.globalAlpha = 0.07;
  for (const it of SHELVES.items) {
    ctx.fillStyle = it.c;
    rrect(ctx, it.x, it.y - it.h, it.w, it.h, 6, 4);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillRect(it.x + 3, it.y - it.h - 8, it.w - 6, 9);
  }
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = INK;
  for (const y of SHELVES.lines) ctx.fillRect(0, y, W, 3);
  ctx.restore();
}

function withSquash(ctx, g, b, fn) {
  const cx = b.bx + b.bw / 2;
  ctx.save();
  ctx.translate(cx, GROUND);
  ctx.scale(1 + g.squash * 0.05, 1 - g.squash * 0.06);
  ctx.translate(-cx, -GROUND);
  fn();
  ctx.restore();
}

function drawLid(ctx, b, angle) {
  ctx.save();
  ctx.translate(b.bx + b.bw + 2, b.by - 4);
  ctx.rotate(angle);
  const x0 = -(CAP_W - 4);
  rrect(ctx, x0, -CAP_H, CAP_W, CAP_H, 9);
  ctx.fillStyle = "#EEE7E2";
  ctx.fill();
  ctx.fillStyle = "#F8F4F1";
  rrect(ctx, x0, -CAP_H, CAP_W, 11, 9, 2);
  ctx.fill();
  ctx.strokeStyle = "#BDB2AB";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let x = x0 + 12; x < -6; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, -CAP_H + 16);
    ctx.lineTo(x, -8);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(43,58,74,0.15)";
  ctx.lineWidth = 1.5;
  rrect(ctx, x0, -CAP_H, CAP_W, CAP_H, 9);
  ctx.stroke();
  ctx.restore();
}

function draw(ctx, g, font, showShelves) {
  ctx.clearRect(0, 0, W, H);
  if (showShelves) drawShelves(ctx);

  ctx.fillStyle = "rgba(43,58,74,0.05)";
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = "rgba(43,58,74,0.14)";
  ctx.fillRect(0, GROUND, W, 2);

  const b = bottleGeom(g.bottleX);

  // Shadow
  ctx.fillStyle = "rgba(43,58,74,0.12)";
  ctx.beginPath();
  ctx.ellipse(b.bx + b.bw / 2, GROUND + 3, b.bw * 0.6, 8, 0, 0, TAU);
  ctx.fill();

  // Bottle back + pills inside
  withSquash(ctx, g, b, () => {
    rrect(ctx, b.bx, b.by, b.bw, b.bh, 6, 30);
    ctx.fillStyle = "#E08A36";
    ctx.fill();
    ctx.save();
    rrect(ctx, b.bx, b.by, b.bw, b.bh, 6, 30);
    ctx.clip();
    for (const e of g.stack) drawPill(ctx, b.bx + e.ox, GROUND + e.oy, e.angle, e.pal, 0.72);
    ctx.restore();
  });

  // Pills in flight (drawn behind the bottle front so they drop "into" it)
  for (const p of g.pills) drawPill(ctx, p.x, p.y, p.angle, p.pal, 1, p.alpha);

  // Bottle front, label, rim
  withSquash(ctx, g, b, () => {
    rrect(ctx, b.bx, b.by, b.bw, b.bh, 6, 30);
    ctx.fillStyle = "rgba(251,186,99,0.72)";
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    rrect(ctx, b.bx + 16, b.by + 20, 10, b.bh - 60, 5);
    ctx.fill();

    ctx.save();
    ctx.translate(b.bx + b.bw / 2 + 2, b.by + 96);
    ctx.rotate(-0.015);
    ctx.fillStyle = "#FFF3E6";
    rrect(ctx, -64, -46, 130, 92, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(43,58,74,0.55)";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 22px ${font}`;
    ctx.fillText("Rx", -50, -14);
    ctx.font = `600 14px ${font}`;
    ctx.fillText(`Qty ${g.stack.length}/${STACK_MAX}`, -50, 12);
    ctx.fillStyle = "rgba(43,58,74,0.14)";
    ctx.fillRect(-50, 24, 96, 3);
    ctx.fillRect(-50, 32, 64, 3);
    ctx.restore();

    rrect(ctx, b.bx - 5, b.by - 8, b.bw + 10, 14, 5);
    ctx.fillStyle = "#F2A248";
    ctx.fill();
    ctx.fillStyle = "#C9742A";
    ctx.fillRect(b.bx + WALL, b.by - 6, b.bw - WALL * 2, 5);
  });

  drawLid(ctx, b, lidAngle(g));

  // Launcher
  const pull = currentPull(g);
  drawPill(ctx, QUEUE.x, QUEUE.y + Math.sin(g.t * 2 + 1) * 2, -0.75, g.next, 0.8, 0.95);
  ctx.fillStyle = "rgba(43,58,74,0.2)";
  ctx.beginPath();
  ctx.arc(LAUNCH.x, LAUNCH.y, 5, 0, TAU);
  ctx.fill();

  if (g.loaded) {
    let x = LAUNCH.x;
    let y = LAUNCH.y + Math.sin(g.t * 3) * 3;
    let ang = -0.6;
    if (pull && pull.len > 2) {
      const pp = pulledPos(pull.px, pull.py);
      x = pp.x;
      y = pp.y;
      ang = Math.atan2(pull.py, pull.px);
      ctx.strokeStyle = "rgba(43,58,74,0.25)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(LAUNCH.x, LAUNCH.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    if (g.shots === 0 && !pull) {
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = "rgba(43,58,74,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(LAUNCH.x, LAUNCH.y, 46 + Math.sin(g.t * 4) * 4, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    if (pull && pull.len >= MIN_PULL) {
      const s = pulledPos(pull.px, pull.py);
      const vx = pull.px * POWER;
      const vy = pull.py * POWER;
      ctx.fillStyle = INK;
      for (let i = 1; i <= 10; i++) {
        const t = i * 0.04;
        ctx.globalAlpha = 0.5 * (1 - i / 12);
        ctx.beginPath();
        ctx.arc(s.x + vx * t, s.y + vy * t + 0.5 * GRAVITY * t * t, 5 - i * 0.2, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    drawPill(ctx, x, y, ang, g.loaded.pal, easeOutBack(g.loaded.appear));
  }

  for (const q of g.particles) {
    ctx.globalAlpha = Math.min(1, q.life * 1.5);
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 28px ${font}`;
  ctx.lineJoin = "round";
  for (const t of g.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 1.6);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = INK;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

/* ---------------------------- component ---------------------------- */

export function PillShotLoader({
  isLoading = true,
  message = "Finding the lowest prices",
  readyMessage = "Prices found",
  continueLabel = "See prices",
  onContinue,
  onSkip,
  backgroundImage,
  accentColor = "#E8892F",
  className,
  style,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const bgRef = useRef(backgroundImage);
  bgRef.current = backgroundImage;

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hasShot, setHasShot] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const g = makeGame();
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

    const font = getComputedStyle(wrap).fontFamily || "sans-serif";
    const synced = { score: -1, streak: -1, shot: false };
    let last = performance.now();
    let raf;

    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(g, dt, reduced);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      draw(ctx, g, font, !bgRef.current);

      if (g.score !== synced.score) {
        synced.score = g.score;
        setScore(g.score);
        setBest((b) => Math.max(b, g.score));
      }
      if (g.streak !== synced.streak) {
        synced.streak = g.streak;
        setStreak(g.streak);
      }
      if (!synced.shot && g.shots > 0) {
        synced.shot = true;
        setHasShot(true);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onMq);
    };
  }, []);

  const toWorld = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  };

  const onPointerDown = (e) => {
    const g = gameRef.current;
    if (!g) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    g.aim = { sx: p.x, sy: p.y, cx: p.x, cy: p.y };
    g.kb.active = false;
  };
  const onPointerMove = (e) => {
    const g = gameRef.current;
    if (!g || !g.aim) return;
    const p = toWorld(e);
    g.aim.cx = p.x;
    g.aim.cy = p.y;
  };
  const onPointerUp = () => {
    const g = gameRef.current;
    if (!g || !g.aim) return;
    fire(g);
    g.aim = null;
  };
  const onPointerCancel = () => {
    if (gameRef.current) gameRef.current.aim = null;
  };

  const onKeyDown = (e) => {
    const g = gameRef.current;
    if (!g) return;
    const k = g.kb;
    let handled = true;
    switch (e.key) {
      case "ArrowUp":
        k.angle = clamp(k.angle - 0.04, -1.45, 0.2);
        break;
      case "ArrowDown":
        k.angle = clamp(k.angle + 0.04, -1.45, 0.2);
        break;
      case "ArrowRight":
        k.power = clamp(k.power + 0.03, 0.2, 1);
        break;
      case "ArrowLeft":
        k.power = clamp(k.power - 0.03, 0.2, 1);
        break;
      case " ":
      case "Enter":
        k.active = true;
        fire(g);
        break;
      default:
        handled = false;
    }
    if (handled) {
      k.active = true;
      e.preventDefault();
    }
  };

  const ready = !isLoading;
  const chip = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5em",
    padding: "0.45em 0.9em",
    borderRadius: 999,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(43,58,74,0.08)",
    boxShadow: "0 2px 10px rgba(43,58,74,0.08)",
    color: INK,
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
  const ghost = {
    ...button,
    background: "transparent",
    color: INK,
    boxShadow: "inset 0 0 0 1.5px rgba(43,58,74,0.25)",
  };

  return (
    <div
      ref={wrapRef}
      className={className}
      tabIndex={0}
      role="group"
      aria-label="Pill toss mini game. Drag back and release, or use the arrow keys and space, to shoot pills into the bottle."
      onKeyDown={onKeyDown}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${W} / ${H}`,
        overflow: "hidden",
        borderRadius: 18,
        containerType: "inline-size",
        fontFamily: "inherit",
        fontSize: "clamp(11px, 1.7cqw, 15px)",
        userSelect: "none",
        WebkitUserSelect: "none",
        background: backgroundImage
          ? `linear-gradient(rgba(255,255,255,0.72), rgba(255,255,255,0.72)), url(${backgroundImage}) center / cover`
          : "linear-gradient(180deg, #F7F8FA 0%, #ECEFF3 100%)",
        outlineOffset: 3,
        ...style,
      }}
    >
      <style>{`
        .psl-spin { width: 0.9em; height: 0.9em; border-radius: 50%;
          border: 2px solid ${accentColor}; border-right-color: transparent;
          animation: psl-rot 0.8s linear infinite; }
        .psl-dots::after { content: ""; display: inline-block; width: 1.2em; text-align: left;
          animation: psl-dots 1.4s steps(4, end) infinite; }
        .psl-card { animation: psl-drop 0.35s cubic-bezier(.2,1.3,.4,1) both; }
        .psl-btn:focus-visible { outline: 3px solid ${INK}; outline-offset: 2px; }
        @keyframes psl-rot { to { transform: rotate(360deg); } }
        @keyframes psl-dots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75% { content: "..."; } }
        @keyframes psl-drop { from { transform: translate(-50%, -24px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .psl-spin, .psl-dots::after, .psl-card { animation: none; }
          .psl-dots::after { content: "..."; }
        }
      `}</style>

      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
          cursor: "crosshair",
        }}
      />

      {/* Status */}
      <div style={{ position: "absolute", top: "3%", left: "2.5%" }} aria-live="polite">
        <div style={chip}>
          {ready ? (
            <span aria-hidden style={{ color: accentColor, fontWeight: 800 }}>✓</span>
          ) : (
            <span className="psl-spin" aria-hidden />
          )}
          <span className={ready ? undefined : "psl-dots"}>{ready ? readyMessage : message}</span>
        </div>
      </div>

      {/* Score */}
      <div style={{ position: "absolute", top: "3%", right: "2.5%", pointerEvents: "none" }}>
        <div style={chip}>
          <span>Score {score}</span>
          <span style={{ opacity: 0.5, fontWeight: 500 }}>Best {best}</span>
          {streak >= 2 && <span style={{ color: accentColor }}>{streak} in a row</span>}
        </div>
      </div>

      {/* Hint + skip */}
      <div
        style={{
          position: "absolute",
          left: "2.5%",
          right: "2.5%",
          bottom: "2.5%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1em",
          pointerEvents: "none",
          color: INK,
        }}
      >
        <span style={{ opacity: 0.6 }}>
          {hasShot
            ? "Keyboard: up and down to aim, left and right for power, space to shoot"
            : "Drag anywhere, pull back, and let go to shoot the pill into the bottle"}
        </span>
        {onSkip && (
          <button className="psl-btn" style={{ ...ghost, pointerEvents: "auto", background: "rgba(255,255,255,0.8)" }} onClick={onSkip}>
            Skip game
          </button>
        )}
      </div>

      {/* Ready card: appears on top; the game keeps running underneath */}
      {ready && !dismissed && (
        <div
          className="psl-card"
          role="dialog"
          aria-label={readyMessage}
          style={{
            position: "absolute",
            top: "14%",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            color: INK,
            borderRadius: 16,
            padding: "1.1em 1.3em",
            boxShadow: "0 12px 40px rgba(43,58,74,0.18)",
            textAlign: "center",
            minWidth: "16em",
          }}
        >
          <div style={{ fontSize: "1.3em", fontWeight: 800, marginBottom: "0.2em" }}>Your prices are ready</div>
          <div style={{ opacity: 0.65, marginBottom: "0.9em" }}>
            {score > 0 ? `You scored ${score}. Nice shooting.` : "We found the lowest prices we could."}
          </div>
          <div style={{ display: "flex", gap: "0.6em", justifyContent: "center" }}>
            {onContinue && (
              <button className="psl-btn" style={button} onClick={onContinue} autoFocus>
                {continueLabel}
              </button>
            )}
            <button className="psl-btn" style={ghost} onClick={() => setDismissed(true)}>
              Keep playing
            </button>
          </div>
        </div>
      )}

      {ready && dismissed && onContinue && (
        <div style={{ position: "absolute", top: "11%", left: "2.5%" }}>
          <button className="psl-btn" style={button} onClick={onContinue}>
            {continueLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Demo wrapper for previewing here. In your Next.js app, import the
   named export { PillShotLoader } instead of this default.
------------------------------------------------------------------- */
export default function Demo() {
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 30000);
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
    border: "1.5px solid rgba(43,58,74,0.25)",
    background: "#fff",
    color: INK,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#E4E8EC",
        padding: "24px 16px",
        fontFamily: '"Nunito", "Avenir Next", "Segoe UI", sans-serif',
        color: INK,
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
          <PillShotLoader
            key={run}
            isLoading={loading}
            onContinue={() => setDone(true)}
            onSkip={() => setDone(true)}
          />
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 14 }}>
          <span style={{ opacity: 0.7, marginRight: "auto" }}>
            Demo: the price search finishes on its own after 30 seconds.
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
