"use client";

import { useEffect, useId, useRef, useState } from "react";

/* ------------------------------------------------------------------
   Pill Sort — a loading-screen puzzle.
   Tap a bottle to pick up its top pills, tap another to drop them.
   A pill can only go into an empty bottle or onto the same kind.
   Fill every bottle with one kind of pill to finish the level.
   Drawn as one SVG in a 1000 x 700 "world" that scales to fit.
------------------------------------------------------------------- */

const W = 1000;
const H = 700;
const CAP = 4;
const BW = 100;
const BH = 196;
const SHELF_Y = 580;
const RIM = SHELF_Y - BH;
const PILL_L = 76;
const PILL_T = 32;
const SLOT = 38;
const INK = "#2B3A4A";

// Light half ("a") carries a small imprint so pills can be told apart without relying on color.
const PILLS = [
  { name: "yellow and red", a: "#FFC845", b: "#BE1931", mark: "5" },
  { name: "pink and teal", a: "#F7A1B0", b: "#3FA9A0", mark: "10" },
  { name: "white and blue", a: "#FFFFFF", b: "#4C7BE0", mark: "20" },
  { name: "lavender and purple", a: "#DCCFFB", b: "#7B5CD6", mark: "40" },
  { name: "white and green", a: "#F4F4F4", b: "#3DAA6B", mark: "50" },
  { name: "grey and navy", a: "#C9D2DB", b: INK, mark: "80" },
];

/* ---------------------------- puzzle logic ---------------------------- */

const top = (b) => b[b.length - 1];
const isComplete = (b) => b.length === CAP && b.every((p) => p.t === b[0].t);
const isWin = (bs) => bs.every((b) => b.length === 0 || isComplete(b));

function topRun(b) {
  if (!b.length) return 0;
  const t = top(b).t;
  let run = 1;
  while (run < b.length && b[b.length - 1 - run].t === t) run++;
  return run;
}

function canMove(bs, i, j) {
  const a = bs[i];
  const b = bs[j];
  if (i === j || !a.length || isComplete(a) || b.length >= CAP) return false;
  return b.length === 0 || top(b).t === top(a).t;
}

function anyMove(bs) {
  for (let i = 0; i < bs.length; i++) for (let j = 0; j < bs.length; j++) if (canMove(bs, i, j)) return true;
  return false;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Depth-first search to make sure a shuffled level can actually be solved.
function solvable(start) {
  const seen = new Set();
  let nodes = 0;
  const done = (b) => b.length === 0 || (b.length === CAP && b.every((v) => v === b[0]));
  const dfs = (bs) => {
    if (bs.every(done)) return true;
    if (++nodes > 40000) return false;
    const key = bs.map((b) => b.join(",")).sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (done(a)) continue;
      const t = a[a.length - 1];
      let run = 1;
      while (run < a.length && a[a.length - 1 - run] === t) run++;
      for (let j = 0; j < bs.length; j++) {
        if (i === j) continue;
        const b = bs[j];
        if (b.length >= CAP || (b.length && b[b.length - 1] !== t)) continue;
        if (!b.length && run === a.length) continue; // pointless move
        const k = Math.min(run, CAP - b.length);
        const next = bs.slice();
        next[i] = a.slice(0, a.length - k);
        next[j] = b.concat(a.slice(a.length - k));
        if (dfs(next)) return true;
      }
    }
    return false;
  };
  return dfs(start);
}

let PID = 0;
function makeLevel(level) {
  const n = Math.min(2 + level, PILLS.length);
  let chosen = null;
  for (let tries = 0; tries < 60; tries++) {
    const pool = [];
    for (let c = 0; c < n; c++) for (let k = 0; k < CAP; k++) pool.push(c);
    shuffle(pool);
    const bs = [];
    for (let i = 0; i < n; i++) bs.push(pool.slice(i * CAP, i * CAP + CAP));
    bs.push([], []);
    const preSorted = bs.some((b) => b.length === CAP && b.every((v) => v === b[0]));
    if (!chosen || !preSorted) chosen = bs;
    if (!preSorted && solvable(bs)) break;
  }
  const types = shuffle(PILLS.map((_, i) => i)).slice(0, n);
  return chosen.map((b) => b.map((v) => ({ id: ++PID, t: types[v] })));
}

/* ---------------------------- geometry ---------------------------- */

function layout(n) {
  const gap = Math.min(64, (920 - n * BW) / Math.max(1, n - 1));
  const start = (W - (n * BW + (n - 1) * gap)) / 2;
  return (i) => start + i * (BW + gap);
}
const slotY = (s) => SHELF_Y - 30 - s * SLOT;
const hoverY = (j) => RIM - 36 - j * SLOT;

function bottlePath(x, y, w, h, rt = 6, rb = 26) {
  return `M${x + rt},${y} H${x + w - rt} Q${x + w},${y} ${x + w},${y + rt} V${y + h - rb} Q${x + w},${y + h} ${x + w - rb},${y + h} H${x + rb} Q${x},${y + h} ${x},${y + h - rb} V${y + rt} Q${x},${y} ${x + rt},${y} Z`;
}

const SHELVES = (() => {
  let s = 11;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const colors = ["#F4A94F", "#7CCBC5", "#F06178", "#4C7BE0", "#6FCF97", "#B9A3F0"];
  const lines = [150, 330];
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

/* ---------------------------- pieces ---------------------------- */

function Pill({ pal, x, y, dur, clipId, imprint, delay }) {
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform ${dur}ms cubic-bezier(.3,.8,.3,1)` }}>
      <g className="ps-in" style={{ animationDelay: `${delay}ms` }}>
        <g clipPath={`url(#${clipId})`}>
          <rect x={-PILL_L / 2} y={-PILL_T / 2} width={PILL_L / 2 + 0.5} height={PILL_T} fill={pal.a} />
          <rect x={0} y={-PILL_T / 2} width={PILL_L / 2} height={PILL_T} fill={pal.b} />
          <rect x={-PILL_L / 2} y={PILL_T * 0.2} width={PILL_L} height={PILL_T} fill="rgba(0,0,0,0.07)" />
          <line
            x1={-PILL_L / 2 + 13}
            y1={-PILL_T / 2 + 7}
            x2={PILL_L / 2 - 13}
            y2={-PILL_T / 2 + 7}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        </g>
        <rect
          x={-PILL_L / 2}
          y={-PILL_T / 2}
          width={PILL_L}
          height={PILL_T}
          rx={PILL_T / 2}
          fill="none"
          stroke={INK}
          strokeOpacity={0.55}
          strokeWidth={2}
        />
        <line x1={0} y1={-PILL_T / 2} x2={0} y2={PILL_T / 2} stroke={INK} strokeOpacity={0.3} strokeWidth={1.5} />
        {imprint && (
          <text
            x={-PILL_L / 4 + 2}
            y={1.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={800}
            fill="rgba(43,58,74,0.5)"
          >
            {pal.mark}
          </text>
        )}
      </g>
    </g>
  );
}

function Cap({ x, on, reduced }) {
  const cw = BW + 12;
  const x0 = x - 6;
  const y0 = RIM - 34;
  const delay = on ? 260 : 0;
  return (
    <g
      style={{
        transform: `translateY(${on ? 0 : -150}px)`,
        opacity: on ? 1 : 0,
        transition: reduced
          ? "none"
          : `transform 420ms cubic-bezier(.3,1.5,.5,1) ${delay}ms, opacity 180ms ${delay}ms`,
      }}
    >
      <rect x={x0} y={y0} width={cw} height={40} rx={9} fill="#EEE7E2" />
      <rect x={x0} y={y0} width={cw} height={11} rx={9} fill="#F8F4F1" />
      {Array.from({ length: 8 }, (_, k) => (
        <line
          key={k}
          x1={x0 + 14 + k * 12}
          y1={y0 + 16}
          x2={x0 + 14 + k * 12}
          y2={y0 + 32}
          stroke="#BDB2AB"
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      <rect x={x0} y={y0} width={cw} height={40} rx={9} fill="none" stroke="rgba(43,58,74,0.15)" strokeWidth={1.5} />
    </g>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e) => setReduced(e.matches);
    mq.addEventListener && mq.addEventListener("change", on);
    return () => mq.removeEventListener && mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/* ---------------------------- component ---------------------------- */

export function PillSortLoader({
  isLoading = true,
  message = "Finding the lowest prices",
  readyMessage = "Prices found",
  continueLabel = "See prices",
  onContinue,
  onSkip,
  backgroundImage,
  accentColor = "#E8892F",
  showImprints = true,
  className,
  style,
}) {
  const clipId = `psclip${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const reduced = useReducedMotion();

  const [level, setLevel] = useState(1);
  const [bottles, setBottles] = useState(null); // generated on the client to avoid hydration mismatches
  const [history, setHistory] = useState([]);
  const [sel, setSel] = useState(null);
  const [over, setOver] = useState({});
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(null);
  const [won, setWon] = useState(false);
  const [sorted, setSorted] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [usedKeys, setUsedKeys] = useState(false);

  const timers = useRef([]);
  const btnRefs = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => {
    setBottles(makeLevel(1));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const moves = history.length;
  const MOVE_MS = reduced ? 0 : 230;

  const flashBad = (i, msg) => {
    setBad(i);
    setSel(null);
    setAnnounce(msg);
    later(() => setBad(null), 380);
  };

  const finishMove = (next) => {
    setBusy(false);
    if (isWin(next)) {
      setWon(true);
      setSorted((c) => c + 1);
      setAnnounce("All bottles sorted. Next level starting.");
      later(() => {
        setLevel((l) => {
          const nl = l + 1;
          setBottles(makeLevel(nl));
          return nl;
        });
        setHistory([]);
        setSel(null);
        setOver({});
        setWon(false);
      }, 1800);
    } else if (!anyMove(next)) {
      setAnnounce("No moves left. Undo or start over.");
    }
  };

  const pour = (from, to) => {
    const src = bottles[from];
    const dst = bottles[to];
    const k = Math.min(topRun(src), CAP - dst.length);
    const moving = src.slice(src.length - k);
    const next = bottles.map((b) => b.slice());
    next[from] = src.slice(0, src.length - k);
    next[to] = dst.concat(moving);

    setHistory((h) => [...h, bottles]);
    setSel(null);
    setAnnounce(`Moved ${k} ${PILLS[moving[0].t].name} ${k > 1 ? "pills" : "pill"} to bottle ${to + 1}`);

    if (reduced) {
      setBottles(next);
      setOver({});
      finishMove(next);
      return;
    }
    const cx = layout(bottles.length)(to) + BW / 2;
    const ov = {};
    moving.forEach((p, j) => (ov[p.id] = { x: cx, y: hoverY(j) }));
    setBusy(true);
    setOver(ov);
    setBottles(next);
    later(() => setOver({}), MOVE_MS);
    later(() => finishMove(next), MOVE_MS * 2 + 20);
  };

  const onBottle = (i) => {
    if (!bottles || busy || won) return;
    const b = bottles[i];
    if (sel === null) {
      if (!b.length) return;
      if (isComplete(b)) return flashBad(i, "That bottle is already sorted");
      setSel(i);
      return;
    }
    if (sel === i) return setSel(null);
    if (canMove(bottles, sel, i)) return pour(sel, i);
    if (isComplete(b)) return flashBad(i, "That bottle is already sorted");
    if (b.length >= CAP) return flashBad(i, "That bottle is full");
    flashBad(i, "Pills only go on top of the same kind, or into an empty bottle");
  };

  const undo = () => {
    if (busy || won || !history.length) return;
    setBottles(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setSel(null);
    setAnnounce("Move undone");
  };

  const restart = () => {
    if (busy || won || !history.length) return;
    setBottles(history[0]);
    setHistory([]);
    setSel(null);
    setAnnounce("Level restarted");
  };

  const onBottleKey = (e, i) => {
    const n = bottles ? bottles.length : 0;
    let target = null;
    if (e.key === "ArrowRight") target = (i + 1) % n;
    if (e.key === "ArrowLeft") target = (i - 1 + n) % n;
    if (e.key === "Escape") setSel(null);
    if (e.key === "u" || e.key === "U") undo();
    if (target !== null) {
      e.preventDefault();
      btnRefs.current[target] && btnRefs.current[target].focus();
    }
    if (["ArrowRight", "ArrowLeft", "Enter", " "].includes(e.key)) setUsedKeys(true);
  };

  /* ---- render helpers ---- */
  const xAt = bottles ? layout(bottles.length) : () => 0;
  const pills = [];
  if (bottles) {
    bottles.forEach((b, i) => {
      const run = sel === i ? topRun(b) : 0;
      b.forEach((p, s) => {
        const cx = xAt(i) + BW / 2;
        let pos = { x: cx, y: slotY(s) };
        if (over[p.id]) pos = over[p.id];
        else if (s >= b.length - run) pos = { x: cx, y: hoverY(s - (b.length - run)) };
        pills.push({ p, pos });
      });
    });
    pills.sort((a, b) => a.p.id - b.p.id); // stable DOM order keeps transitions smooth
  }
  const stuck = bottles && !busy && !won && !isWin(bottles) && !anyMove(bottles);
  const ready = !isLoading;
  const firstId = pills.length ? pills[0].p.id : 0;

  const describe = (b, i) => {
    if (!b.length) return `Bottle ${i + 1}, empty`;
    const t = PILLS[top(b).t];
    const state = isComplete(b) ? ", sorted" : "";
    return `Bottle ${i + 1}, ${b.length} of ${CAP} pills, top pill ${t.name} marked ${t.mark}${state}`;
  };

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
    background: "rgba(255,255,255,0.85)",
    color: INK,
    boxShadow: "inset 0 0 0 1.5px rgba(43,58,74,0.25)",
  };

  return (
    <div
      className={className}
      role="group"
      aria-label="Pill sorting puzzle. Move pills between bottles until each bottle holds one kind."
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
        ...style,
      }}
    >
      <style>{`
        .ps-spin { width: 0.9em; height: 0.9em; border-radius: 50%;
          border: 2px solid ${accentColor}; border-right-color: transparent;
          animation: ps-rot 0.8s linear infinite; }
        .ps-dots::after { content: ""; display: inline-block; width: 1.2em; text-align: left;
          animation: ps-dots 1.4s steps(4, end) infinite; }
        .ps-in { animation: ps-in 420ms cubic-bezier(.3,1.3,.5,1) both; }
        .ps-card { animation: ps-drop 0.35s cubic-bezier(.2,1.3,.4,1) both; }
        .ps-btn:focus-visible { outline: 3px solid ${INK}; outline-offset: 2px; }
        .ps-btn:disabled { opacity: 0.45; cursor: default; }
        .ps-hit { background: transparent; border: none; padding: 0; cursor: pointer;
          border-radius: 16px; -webkit-tap-highlight-color: transparent; }
        .ps-hit:focus-visible { outline: 3px solid ${INK}; outline-offset: -3px; }
        @keyframes ps-rot { to { transform: rotate(360deg); } }
        @keyframes ps-dots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75% { content: "..."; } }
        @keyframes ps-in { from { transform: translateY(-46px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes ps-drop { from { transform: translate(-50%, -24px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .ps-spin, .ps-dots::after, .ps-in, .ps-card { animation: none; }
          .ps-dots::after { content: "..."; }
        }
      `}</style>

      <svg
        key={level}
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
        aria-hidden
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={-PILL_L / 2} y={-PILL_T / 2} width={PILL_L} height={PILL_T} rx={PILL_T / 2} />
          </clipPath>
        </defs>

        {!backgroundImage && (
          <g opacity={0.07}>
            {SHELVES.items.map((it, k) => (
              <g key={k}>
                <rect x={it.x} y={it.y - it.h} width={it.w} height={it.h} rx={5} fill={it.c} />
                <rect x={it.x + 3} y={it.y - it.h - 8} width={it.w - 6} height={9} fill={INK} />
              </g>
            ))}
            {SHELVES.lines.map((y) => (
              <rect key={y} x={0} y={y} width={W} height={3} fill={INK} opacity={1.3} />
            ))}
          </g>
        )}

        <rect x={30} y={SHELF_Y} width={W - 60} height={16} rx={4} fill="rgba(43,58,74,0.07)" />
        <rect x={30} y={SHELF_Y} width={W - 60} height={2} fill="rgba(43,58,74,0.16)" />

        {bottles && (
          <>
            {/* Shadows, selection glow, bottle backs */}
            {bottles.map((b, i) => {
              const x = xAt(i);
              return (
                <g key={`back${i}`}>
                  <ellipse cx={x + BW / 2} cy={SHELF_Y + 3} rx={BW * 0.6} ry={8} fill="rgba(43,58,74,0.12)" />
                  <ellipse
                    cx={x + BW / 2}
                    cy={SHELF_Y + 3}
                    rx={BW * 0.62}
                    ry={10}
                    fill={accentColor}
                    style={{ opacity: sel === i ? 0.45 : 0, transition: "opacity 150ms" }}
                  />
                  <path d={bottlePath(x, RIM, BW, BH)} fill="rgba(224,138,54,0.30)" />
                </g>
              );
            })}

            {/* Pills */}
            {pills.map(({ p, pos }, idx) => (
              <Pill
                key={p.id}
                pal={PILLS[p.t]}
                x={pos.x}
                y={pos.y}
                dur={MOVE_MS}
                clipId={clipId}
                imprint={showImprints}
                delay={reduced ? 0 : (p.id - firstId) * 22 + idx * 0}
              />
            ))}

            {/* Bottle fronts and rims */}
            {bottles.map((b, i) => {
              const x = xAt(i);
              return (
                <g key={`front${i}`}>
                  <path
                    d={bottlePath(x, RIM, BW, BH)}
                    fill="rgba(251,186,99,0.26)"
                    stroke={bad === i ? "#D64545" : "#E0913F"}
                    strokeWidth={bad === i ? 4 : 2.5}
                    style={{ transition: "stroke 120ms" }}
                  />
                  <rect x={x + 14} y={RIM + 18} width={9} height={BH - 58} rx={4.5} fill="rgba(255,255,255,0.4)" />
                  <rect x={x - 5} y={RIM - 8} width={BW + 10} height={14} rx={5} fill="#F2A248" />
                  <rect x={x + 10} y={RIM - 6} width={BW - 20} height={5} fill="#C9742A" />
                </g>
              );
            })}

            {/* Caps pop on when a bottle is sorted */}
            {bottles.map((b, i) => (
              <Cap key={`cap${i}`} x={xAt(i)} on={isComplete(b)} reduced={reduced} />
            ))}
          </>
        )}
      </svg>

      {/* Invisible buttons over each bottle for tap, click and keyboard */}
      {bottles &&
        bottles.map((b, i) => (
          <button
            key={`hit${level}-${i}`}
            ref={(el) => (btnRefs.current[i] = el)}
            className="ps-hit"
            aria-label={describe(b, i)}
            aria-pressed={sel === i}
            onClick={() => onBottle(i)}
            onKeyDown={(e) => onBottleKey(e, i)}
            style={{
              position: "absolute",
              left: `${(xAt(i) / W) * 100}%`,
              top: `${((RIM - 180) / H) * 100}%`,
              width: `${(BW / W) * 100}%`,
              height: `${((SHELF_Y + 14 - (RIM - 180)) / H) * 100}%`,
            }}
          />
        ))}

      <div
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        {announce}
      </div>

      {/* Status */}
      <div style={{ position: "absolute", top: "3%", left: "2.5%" }} aria-live="polite">
        <div style={chip}>
          {ready ? (
            <span aria-hidden style={{ color: accentColor, fontWeight: 800 }}>✓</span>
          ) : (
            <span className="ps-spin" aria-hidden />
          )}
          <span className={ready ? undefined : "ps-dots"}>{ready ? readyMessage : message}</span>
        </div>
      </div>

      {/* Level + moves */}
      <div style={{ position: "absolute", top: "3%", right: "2.5%", pointerEvents: "none" }}>
        <div style={chip}>
          <span>Level {level}</span>
          <span style={{ opacity: 0.55, fontWeight: 500 }}>Moves {moves}</span>
          {sorted > 0 && <span style={{ color: accentColor }}>{sorted} solved</span>}
        </div>
      </div>

      {/* Level complete */}
      {won && !(ready && !dismissed) && (
        <div
          className="ps-card"
          style={{
            position: "absolute",
            top: "13%",
            left: "50%",
            transform: "translateX(-50%)",
            ...chip,
            padding: "0.7em 1.2em",
            fontSize: "1.15em",
            fontWeight: 800,
          }}
        >
          Sorted in {moves} moves. Next level coming up.
        </div>
      )}

      {/* Hint + controls */}
      <div
        style={{
          position: "absolute",
          left: "2.5%",
          right: "2.5%",
          bottom: "2.5%",
          display: "flex",
          alignItems: "center",
          gap: "0.6em",
          color: INK,
        }}
      >
        <span
          style={{
            marginRight: "auto",
            opacity: stuck ? 1 : 0.6,
            fontWeight: stuck ? 700 : 400,
            color: stuck ? accentColor : INK,
          }}
        >
          {stuck
            ? "No moves left. Undo or start over."
            : usedKeys
              ? "Left and right to choose a bottle, Enter to pick up and drop, U to undo"
              : "Tap a bottle to pick up pills, then tap where they go. Fill each bottle with one kind."}
        </span>
        <button className="ps-btn" style={ghost} onClick={undo} disabled={!history.length || busy || won}>
          Undo
        </button>
        <button className="ps-btn" style={ghost} onClick={restart} disabled={!history.length || busy || won}>
          Start over
        </button>
        {onSkip && (
          <button className="ps-btn" style={ghost} onClick={onSkip}>
            Skip game
          </button>
        )}
      </div>

      {/* Ready card: appears on top; the puzzle stays playable underneath */}
      {ready && !dismissed && (
        <div
          className="ps-card"
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
            {sorted > 0
              ? `You solved ${sorted} ${sorted === 1 ? "level" : "levels"}. Nicely sorted.`
              : "We found the lowest prices we could."}
          </div>
          <div style={{ display: "flex", gap: "0.6em", justifyContent: "center" }}>
            {onContinue && (
              <button className="ps-btn" style={button} onClick={onContinue} autoFocus>
                {continueLabel}
              </button>
            )}
            <button className="ps-btn" style={ghost} onClick={() => setDismissed(true)}>
              Keep sorting
            </button>
          </div>
        </div>
      )}

      {ready && dismissed && onContinue && (
        <div style={{ position: "absolute", top: "11%", left: "2.5%" }}>
          <button className="ps-btn" style={button} onClick={onContinue}>
            {continueLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Demo wrapper for previewing here. In your Next.js app, import the
   named export { PillSortLoader } instead of this default.
------------------------------------------------------------------- */
export default function Demo() {
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 45000);
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
          <PillSortLoader
            key={run}
            isLoading={loading}
            onContinue={() => setDone(true)}
            onSkip={() => setDone(true)}
          />
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 14 }}>
          <span style={{ opacity: 0.7, marginRight: "auto" }}>
            Demo: the price search finishes on its own after 45 seconds.
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
