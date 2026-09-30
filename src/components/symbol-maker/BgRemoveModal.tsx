import React, { useCallback, useEffect, useRef, useState } from 'react';
import { sampleColor, autoPickFromCorners, rgbToHex, hexToRgb, RGB } from './bgRemove';
import {
  CAN_COPY_IMAGE,
  CAN_READ_CLIPBOARD,
  copyCanvasToClipboard,
  imageFromPasteEvent,
  readImageFromClipboard,
} from '@/lib/clipboardImage';
import { buildEdgeFadeMask, DEFAULT_EDGE_FADE, EdgeFadeOptions, FadeShape } from './edgeFade';
import './BgRemoveModal.css';

const MAX_UNDO = 20;
type PreviewBg = 'checker' | 'light' | 'dark';
type BrushType = 'free' | 'line';

// Native EyeDropper API — Chrome/Edge/Opera 95+. Picks an sRGB color from anywhere on screen.
interface EyeDropperResult { sRGBHex: string; }
interface EyeDropperApi { open(opts?: { signal?: AbortSignal }): Promise<EyeDropperResult>; }
const eyeDropperCtor = () =>
  typeof window === 'undefined' ? undefined : (window as unknown as { EyeDropper?: new () => EyeDropperApi }).EyeDropper;
const HAS_EYEDROPPER = typeof eyeDropperCtor() === 'function';

// Composition model:
//   final.alpha[p] =
//     manualMask[p] === 1 ? 0                      (erased)
//     manualMask[p] === 2 ? originalAlpha[p]       (restored)
//     else                  autoMask[p]            (auto color removal result)
//   then multiplied by the edge-fade mask, which applies on top of everything.
// RGB always copied from the original image. Manual edits survive tolerance changes.

interface BgRemoveModalProps {
  src: string;
  onApply: (newSrc: string) => void;
  onCancel: () => void;
  /**
   * Supplied by hosts that let the user swap the image being edited. When set,
   * pasting an image (Cmd/Ctrl+V or the Paste button) hands the new data URL back
   * so the host can re-open the modal on it. Omit to disable pasting.
   */
  onReplaceSrc?: (dataUrl: string) => void;
}

type Mode = 'auto' | 'erase' | 'restore' | 'fade';
const MAX_DIST = Math.sqrt(255 * 255 * 3);

export const BgRemoveModal: React.FC<BgRemoveModalProps> = ({ src, onApply, onCancel, onReplaceSrc }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const originalImgDataRef = useRef<ImageData | null>(null);
  const autoMaskRef = useRef<Uint8Array | null>(null);
  const manualMaskRef = useRef<Uint8Array | null>(null);
  const fadeMaskRef = useRef<Uint8Array | null>(null);
  const isPaintingRef = useRef(false);

  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [targetColor, setTargetColor] = useState<RGB>({ r: 255, g: 255, b: 255 });
  const [tolerance, setTolerance] = useState(0.15);
  const [feather, setFeather] = useState(true);
  const [mode, setMode] = useState<Mode>('auto');
  const [brushSize, setBrushSize] = useState(30);
  const [hasManualEdits, setHasManualEdits] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  // Which src has finished loading (or failing); anything else is still loading.
  const [settledSrc, setSettledSrc] = useState<string | null>(null);
  const loading = settledSrc !== src;
  const [previewBg, setPreviewBg] = useState<PreviewBg>('checker');
  const [brushType, setBrushType] = useState<BrushType>('free');
  const [brushCurvature, setBrushCurvature] = useState(0);
  const [fadeOn, setFadeOn] = useState(false);
  const [fade, setFade] = useState<EdgeFadeOptions>(DEFAULT_EDGE_FADE);
  const [status, setStatus] = useState<string | null>(null);
  const [lineDrag, setLineDrag] = useState<{ startClient: { x: number; y: number }; endClient: { x: number; y: number } } | null>(null);

  // Undo/redo for brush strokes — each pointerdown→up cycle is one entry.
  const undoStackRef = useRef<Uint8Array[]>([]);
  const redoStackRef = useRef<Uint8Array[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  // ── Load original image, init masks, do an auto-pick on first open ─────
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const id = c.getContext('2d')!.getImageData(0, 0, w, h);
      originalImgDataRef.current = id;
      autoMaskRef.current = new Uint8Array(w * h);
      manualMaskRef.current = new Uint8Array(w * h);
      fadeMaskRef.current = null;
      setImgSize({ w, h });
      setHasManualEdits(false);
      undoStackRef.current = [];
      redoStackRef.current = [];
      setUndoCount(0);
      setRedoCount(0);
      // Seed auto mask with full alpha so something renders before tolerance kicks in
      for (let i = 0, p = 0; i < id.data.length; i += 4, p++) autoMaskRef.current[p] = id.data[i + 3];
      composeToCanvas();
      setSettledSrc(src);
      // Auto-pick a target color from corners
      autoPickFromCorners(src).then((rgb) => { if (!cancelled) setTargetColor(rgb); }).catch(() => {});
    };
    img.onerror = () => { if (!cancelled) setSettledSrc(src); };
    img.src = src;
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ── Recompute auto mask whenever auto-removal params change ────────────
  useEffect(() => {
    const orig = originalImgDataRef.current;
    const auto = autoMaskRef.current;
    if (!orig || !auto) return;
    const data = orig.data;
    const tr = targetColor.r, tg = targetColor.g, tb = targetColor.b;
    const t = tolerance * MAX_DIST;
    const featherW = feather ? t * 0.6 : 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const dr = data[i] - tr;
      const dg = data[i + 1] - tg;
      const db = data[i + 2] - tb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist <= t) {
        auto[p] = 0;
      } else if (featherW && dist <= t + featherW) {
        auto[p] = Math.round(data[i + 3] * ((dist - t) / featherW));
      } else {
        auto[p] = data[i + 3];
      }
    }
    composeToCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetColor.r, targetColor.g, targetColor.b, tolerance, feather, imgSize]);

  // ── Composite into the display canvas ─────────────────────────────────
  const composeToCanvas = useCallback(() => {
    const orig = originalImgDataRef.current;
    const auto = autoMaskRef.current;
    const manual = manualMaskRef.current;
    const c = canvasRef.current;
    if (!orig || !auto || !manual || !c) return;
    if (c.width !== orig.width) c.width = orig.width;
    if (c.height !== orig.height) c.height = orig.height;
    const ctx = c.getContext('2d')!;
    const out = ctx.createImageData(orig.width, orig.height);
    const od = orig.data;
    const nd = out.data;
    const fadeMask = fadeMaskRef.current;
    for (let i = 0, p = 0; i < od.length; i += 4, p++) {
      nd[i] = od[i];
      nd[i + 1] = od[i + 1];
      nd[i + 2] = od[i + 2];
      const m = manual[p];
      const a = m === 1 ? 0 : m === 2 ? od[i + 3] : auto[p];
      nd[i + 3] = fadeMask ? (a * fadeMask[p]) / 255 : a;
    }
    ctx.putImageData(out, 0, 0);
  }, []);

  // ── Edge fade mask ────────────────────────────────────────────────────
  useEffect(() => {
    const orig = originalImgDataRef.current;
    if (!orig) return;
    fadeMaskRef.current = fadeOn ? buildEdgeFadeMask(orig.width, orig.height, fade) : null;
    composeToCanvas();
  }, [fadeOn, fade, imgSize, composeToCanvas]);

  // ── Undo / redo (manual mask snapshots) ──────────────────────────────
  const snapshotForUndo = useCallback(() => {
    const m = manualMaskRef.current;
    if (!m) return;
    undoStackRef.current.push(new Uint8Array(m));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    redoStackRef.current = [];
    setUndoCount(undoStackRef.current.length);
    setRedoCount(0);
  }, []);

  const computeHasManual = useCallback((m: Uint8Array): boolean => {
    for (let i = 0; i < m.length; i++) if (m[i] !== 0) return true;
    return false;
  }, []);

  const handleUndo = useCallback(() => {
    const m = manualMaskRef.current;
    const u = undoStackRef.current;
    if (!m || u.length === 0) return;
    const prev = u.pop()!;
    redoStackRef.current.push(new Uint8Array(m));
    m.set(prev);
    setHasManualEdits(computeHasManual(m));
    setUndoCount(u.length);
    setRedoCount(redoStackRef.current.length);
    composeToCanvas();
  }, [composeToCanvas, computeHasManual]);

  const handleRedo = useCallback(() => {
    const m = manualMaskRef.current;
    const r = redoStackRef.current;
    if (!m || r.length === 0) return;
    const next = r.pop()!;
    undoStackRef.current.push(new Uint8Array(m));
    m.set(next);
    setHasManualEdits(computeHasManual(m));
    setUndoCount(undoStackRef.current.length);
    setRedoCount(r.length);
    composeToCanvas();
  }, [composeToCanvas, computeHasManual]);

  // ── Brush painting ────────────────────────────────────────────────────
  const paintAt = useCallback((clientX: number, clientY: number) => {
    if (mode !== 'erase' && mode !== 'restore') return;
    const orig = originalImgDataRef.current;
    const manual = manualMaskRef.current;
    const c = canvasRef.current;
    if (!orig || !manual || !c) return;
    const r = c.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * orig.width;
    const py = ((clientY - r.top) / r.height) * orig.height;
    // Brush size is given in display pixels; convert to image-space radius.
    const radiusImg = (brushSize / 2) * (orig.width / r.width);
    const r2 = radiusImg * radiusImg;
    const x0 = Math.max(0, Math.floor(px - radiusImg));
    const y0 = Math.max(0, Math.floor(py - radiusImg));
    const x1 = Math.min(orig.width - 1, Math.ceil(px + radiusImg));
    const y1 = Math.min(orig.height - 1, Math.ceil(py + radiusImg));
    const v: number = mode === 'erase' ? 1 : 2;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy <= r2) manual[y * orig.width + x] = v;
      }
    }
    setHasManualEdits(true);
    composeToCanvas();
  }, [mode, brushSize, composeToCanvas]);

  // Bake a curved (quadratic Bezier) thick stroke into the manual mask.
  // Used by the Line brush type; samples N points along the curve and stamps a circle at each.
  // Declared before pointer handlers so handlePointerUp's useCallback deps array can reference it.
  const bakeCurvedStroke = useCallback((sxClient: number, syClient: number, exClient: number, eyClient: number, curvature: number, asMode: 'erase' | 'restore') => {
    const orig = originalImgDataRef.current;
    const manual = manualMaskRef.current;
    const c = canvasRef.current;
    if (!orig || !manual || !c) return;
    const r = c.getBoundingClientRect();
    const sx = ((sxClient - r.left) / r.width) * orig.width;
    const sy = ((syClient - r.top) / r.height) * orig.height;
    const ex = ((exClient - r.left) / r.width) * orig.width;
    const ey = ((eyClient - r.top) / r.height) * orig.height;
    const dx = ex - sx, dy = ey - sy;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2;
    const perpX = -dy / len, perpY = dx / len;
    const offset = curvature * len * 0.5;
    const cxImg = mx + perpX * offset;
    const cyImg = my + perpY * offset;
    const radiusImg = (brushSize / 2) * (orig.width / r.width);
    const r2 = radiusImg * radiusImg;
    const v: number = asMode === 'erase' ? 1 : 2;
    const segments = Math.max(20, Math.ceil(len / Math.max(1, radiusImg) * 2));
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const u = 1 - t;
      const px = u * u * sx + 2 * u * t * cxImg + t * t * ex;
      const py = u * u * sy + 2 * u * t * cyImg + t * t * ey;
      const x0 = Math.max(0, Math.floor(px - radiusImg));
      const y0 = Math.max(0, Math.floor(py - radiusImg));
      const x1 = Math.min(orig.width - 1, Math.ceil(px + radiusImg));
      const y1 = Math.min(orig.height - 1, Math.ceil(py + radiusImg));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const ddx = x - px, ddy = y - py;
          if (ddx * ddx + ddy * ddy <= r2) manual[y * orig.width + x] = v;
        }
      }
    }
    setHasManualEdits(true);
    composeToCanvas();
  }, [brushSize, composeToCanvas]);

  // ── Pointer wiring ────────────────────────────────────────────────────
  const handlePointerDown = useCallback(async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'auto') {
      const c = canvasRef.current!;
      const r = c.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      try {
        const color = await sampleColor(src, nx, ny);
        setTargetColor(color);
      } catch { /* ignore */ }
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    isPaintingRef.current = true;
    if (brushType === 'line') {
      // Don't snapshot or paint yet — drag tracks the endpoint; bake (and snapshot) on pointerup.
      setLineDrag({
        startClient: { x: e.clientX, y: e.clientY },
        endClient: { x: e.clientX, y: e.clientY },
      });
    } else {
      snapshotForUndo();
      paintAt(e.clientX, e.clientY);
    }
  }, [mode, src, paintAt, snapshotForUndo, brushType]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const wrap = previewWrapRef.current;
    if (wrap) {
      const r = wrap.getBoundingClientRect();
      setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
    if (!isPaintingRef.current) return;
    if (brushType === 'line') {
      setLineDrag((prev) => prev ? { ...prev, endClient: { x: e.clientX, y: e.clientY } } : prev);
    } else {
      paintAt(e.clientX, e.clientY);
    }
  }, [paintAt, brushType]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    isPaintingRef.current = false;
    if (brushType === 'line' && lineDrag && (mode === 'erase' || mode === 'restore')) {
      const dx = e.clientX - lineDrag.startClient.x;
      const dy = e.clientY - lineDrag.startClient.y;
      // Skip degenerate clicks (no drag) so we don't pile up empty undo entries
      if (dx * dx + dy * dy > 4) {
        snapshotForUndo();
        bakeCurvedStroke(lineDrag.startClient.x, lineDrag.startClient.y, e.clientX, e.clientY, brushCurvature, mode);
      }
    }
    setLineDrag(null);
  }, [brushType, lineDrag, mode, brushCurvature, bakeCurvedStroke, snapshotForUndo]);

  const handlePointerLeave = useCallback(() => setCursorPos(null), []);

  const handleResetManual = useCallback(() => {
    const m = manualMaskRef.current;
    if (!m) return;
    snapshotForUndo();
    m.fill(0);
    setHasManualEdits(false);
    composeToCanvas();
  }, [composeToCanvas, snapshotForUndo]);

  const handleAutoPick = useCallback(async () => {
    try {
      const c = await autoPickFromCorners(src);
      setTargetColor(c);
    } catch { /* ignore */ }
  }, [src]);

  const handleEyedropper = useCallback(async () => {
    const Ctor = eyeDropperCtor();
    if (!Ctor) return;
    try {
      const result = await new Ctor().open();
      setTargetColor(hexToRgb(result.sRGBHex));
    } catch { /* user cancelled */ }
  }, []);

  // ── Clipboard in / out ───────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    const c = canvasRef.current;
    if (!c) return;
    try {
      await copyCanvasToClipboard(c);
      setStatus('Copied to clipboard');
    } catch {
      setStatus('Could not copy — try Apply instead');
    }
  }, []);

  const handlePasteButton = useCallback(async () => {
    if (!onReplaceSrc) return;
    try {
      const dataUrl = await readImageFromClipboard();
      if (dataUrl) onReplaceSrc(dataUrl);
      else setStatus('No image on the clipboard');
    } catch {
      setStatus('Clipboard access blocked — press Ctrl/Cmd+V instead');
    }
  }, [onReplaceSrc]);

  // Cmd/Ctrl+V anywhere in the modal swaps in the pasted image.
  useEffect(() => {
    if (!onReplaceSrc) return;
    const onPaste = (e: ClipboardEvent) => {
      imageFromPasteEvent(e)
        .then((dataUrl) => {
          if (!dataUrl) return;
          e.preventDefault();
          onReplaceSrc(dataUrl);
        })
        .catch(() => setStatus('Could not read that image'));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onReplaceSrc]);

  // Auto-dismiss the status line
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2200);
    return () => clearTimeout(t);
  }, [status]);

  const handleApply = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    onApply(c.toDataURL('image/png'));
  }, [onApply]);

  // ── UI ────────────────────────────────────────────────────────────────
  const inBrushMode = mode === 'erase' || mode === 'restore';

  return (
    <div className="bgr-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bgr-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="bgr-header">
          <h3>Remove background</h3>
          <div className="bgr-header-tools">
            <button
              type="button"
              className="bgr-icon-btn"
              onClick={handleUndo}
              disabled={undoCount === 0}
              title="Undo brush stroke"
              aria-label="Undo"
            >↶</button>
            <button
              type="button"
              className="bgr-icon-btn"
              onClick={handleRedo}
              disabled={redoCount === 0}
              title="Redo brush stroke"
              aria-label="Redo"
            >↷</button>
            <div className="bgr-bg-toggle" role="group" aria-label="Preview background">
              <button
                type="button"
                className={previewBg === 'checker' ? 'is-active' : ''}
                onClick={() => setPreviewBg('checker')}
                title="Checkerboard"
                aria-label="Checkerboard background"
              ><span className="checker-icon" /></button>
              <button
                type="button"
                className={previewBg === 'light' ? 'is-active' : ''}
                onClick={() => setPreviewBg('light')}
                title="Light background"
                aria-label="Light background"
              ><span className="light-icon" /></button>
              <button
                type="button"
                className={previewBg === 'dark' ? 'is-active' : ''}
                onClick={() => setPreviewBg('dark')}
                title="Dark background"
                aria-label="Dark background"
              ><span className="dark-icon" /></button>
            </div>
            <button type="button" className="bgr-close" onClick={onCancel} aria-label="Close">✕</button>
          </div>
        </header>

        <div className="bgr-body">
          <div ref={previewWrapRef} className={`bgr-preview bg-${previewBg}`}>
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              style={{ cursor: inBrushMode ? 'none' : mode === 'fade' ? 'default' : 'crosshair' }}
            />
            {loading && <div className="bgr-busy">Loading…</div>}
            {inBrushMode && cursorPos && !lineDrag && (
              <div
                className="bgr-brush-cursor"
                style={{
                  left: cursorPos.x,
                  top: cursorPos.y,
                  width: brushSize,
                  height: brushSize,
                  borderColor: mode === 'erase' ? '#ef4444' : '#10b981',
                }}
              />
            )}
            {lineDrag && previewWrapRef.current && (() => {
              const wr = previewWrapRef.current.getBoundingClientRect();
              const sx = lineDrag.startClient.x - wr.left;
              const sy = lineDrag.startClient.y - wr.top;
              const ex = lineDrag.endClient.x - wr.left;
              const ey = lineDrag.endClient.y - wr.top;
              const dx = ex - sx, dy = ey - sy;
              const len = Math.hypot(dx, dy) || 1;
              const mx = (sx + ex) / 2, my = (sy + ey) / 2;
              const px = -dy / len, py = dx / len;
              const offset = brushCurvature * len * 0.5;
              const cx = mx + px * offset;
              const cy = my + py * offset;
              const stroke = mode === 'erase' ? '#ef4444' : '#10b981';
              return (
                <svg className="bgr-line-preview">
                  <path
                    d={`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={brushSize}
                    strokeLinecap="round"
                    opacity={0.55}
                  />
                </svg>
              );
            })()}
          </div>

          <div className="bgr-controls">
            <div className="bgr-mode">
              <button type="button" className={mode === 'auto' ? 'is-active' : ''} onClick={() => setMode('auto')}>Auto</button>
              <button type="button" className={mode === 'erase' ? 'is-active' : ''} onClick={() => setMode('erase')}>Erase</button>
              <button type="button" className={mode === 'restore' ? 'is-active' : ''} onClick={() => setMode('restore')}>Restore</button>
              <button type="button" className={mode === 'fade' ? 'is-active' : ''} onClick={() => { setMode('fade'); setFadeOn(true); }}>Fade</button>
            </div>

            {mode === 'auto' && (
              <>
                <h4>Target color</h4>
                <div className="row">
                  <span className="swatch" style={{ background: `rgb(${targetColor.r},${targetColor.g},${targetColor.b})` }} />
                  <span className="hex">{rgbToHex(targetColor)}</span>
                  <input
                    type="color"
                    className="bgr-color-input"
                    value={rgbToHex(targetColor)}
                    onChange={(e) => setTargetColor(hexToRgb(e.target.value))}
                    aria-label="Pick a custom target color"
                  />
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="bgr-btn" onClick={handleAutoPick}>Auto-pick corners</button>
                  {HAS_EYEDROPPER && (
                    <button type="button" className="bgr-btn" onClick={handleEyedropper} title="Pick a color from anywhere on screen">
                      Eyedropper
                    </button>
                  )}
                </div>
                <p className="help">
                  Click anywhere on the preview to sample a color, use the picker, or use the eyedropper{HAS_EYEDROPPER ? '' : ' (Chrome/Edge only)'}.
                </p>

                <h4>Tolerance ({Math.round(tolerance * 100)}%)</h4>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={Math.round(tolerance * 100)}
                  onChange={(e) => setTolerance(Number(e.target.value) / 100)}
                />

                <label className="row" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={feather} onChange={(e) => setFeather(e.target.checked)} />
                  <span>Soft edges</span>
                </label>
              </>
            )}

            {mode === 'fade' && (
              <>
                <label className="row" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={fadeOn} onChange={(e) => setFadeOn(e.target.checked)} />
                  <span>Fade the edges out</span>
                </label>

                <h4>Shape</h4>
                <div className="bgr-mode bgr-brush-type">
                  {(['oval', 'rect'] as FadeShape[]).map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      className={fade.shape === shape ? 'is-active' : ''}
                      disabled={!fadeOn}
                      onClick={() => setFade((f) => ({ ...f, shape }))}
                    >{shape === 'oval' ? 'Oval' : 'Rectangle'}</button>
                  ))}
                </div>

                <h4>Size ({Math.round(fade.size * 100)}%)</h4>
                <input
                  type="range"
                  min={0}
                  max={140}
                  step={1}
                  disabled={!fadeOn}
                  value={Math.round(fade.size * 100)}
                  onChange={(e) => setFade((f) => ({ ...f, size: Number(e.target.value) / 100 }))}
                />

                <h4>Softness ({Math.round(fade.softness * 100)}%)</h4>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  disabled={!fadeOn}
                  value={Math.round(fade.softness * 100)}
                  onChange={(e) => setFade((f) => ({ ...f, softness: Number(e.target.value) / 100 }))}
                />

                <label className="row" style={{ cursor: fadeOn ? 'pointer' : 'default', opacity: fadeOn ? 1 : 0.5 }}>
                  <input
                    type="checkbox"
                    checked={fade.invert}
                    disabled={!fadeOn}
                    onChange={(e) => setFade((f) => ({ ...f, invert: e.target.checked }))}
                  />
                  <span>Reverse (fade the middle out)</span>
                </label>

                <p className="help">
                  {fade.invert
                    ? 'Keeps the border and dissolves the centre — good for frames and rings.'
                    : 'Corners go first, then the edges melt into transparency. Stacks on top of the colour removal and the brush.'}
                </p>
              </>
            )}

            {inBrushMode && (
              <>
                <h4>Brush type</h4>
                <div className="bgr-mode bgr-brush-type">
                  <button type="button" className={brushType === 'free' ? 'is-active' : ''} onClick={() => setBrushType('free')}>Free</button>
                  <button type="button" className={brushType === 'line' ? 'is-active' : ''} onClick={() => setBrushType('line')}>Line</button>
                </div>

                <h4>Brush size ({brushSize}px)</h4>
                <input
                  type="range"
                  min={5}
                  max={140}
                  step={1}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />

                {brushType === 'line' && (
                  <>
                    <h4>Curve ({Math.round(brushCurvature * 100)}%)</h4>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      step={1}
                      value={Math.round(brushCurvature * 100)}
                      onChange={(e) => setBrushCurvature(Number(e.target.value) / 100)}
                    />
                  </>
                )}

                <p className="help">
                  {brushType === 'line'
                    ? `Click + drag from start to end. Adjust Curve before drawing to bend the line. ${mode === 'erase' ? 'Red = removes.' : 'Green = restores.'}`
                    : (mode === 'erase'
                      ? 'Click and drag to remove pixels (red brush).'
                      : 'Click and drag to bring pixels back (green brush).')}
                </p>
              </>
            )}

            {hasManualEdits && (
              <button type="button" className="bgr-btn" onClick={handleResetManual} style={{ marginTop: 'auto' }}>
                Reset manual edits
              </button>
            )}

            <p className="help" style={{ marginTop: hasManualEdits ? 0 : 'auto' }}>
              Best for solid-color backgrounds. Manual brush handles drop shadows + ragged edges that color-removal can’t.
            </p>
          </div>
        </div>

        <div className="bgr-actions">
          {status && <span className="bgr-status" role="status">{status}</span>}
          {onReplaceSrc && CAN_READ_CLIPBOARD && (
            <button type="button" className="bgr-btn" onClick={handlePasteButton} title="Replace with the image on your clipboard">
              Paste image
            </button>
          )}
          <button type="button" className="bgr-btn" onClick={onCancel}>Cancel</button>
          {CAN_COPY_IMAGE && (
            <button type="button" className="bgr-btn" onClick={handleCopy} disabled={loading} title="Copy the cut-out PNG to your clipboard">
              Copy
            </button>
          )}
          <button type="button" className="bgr-btn is-primary" onClick={handleApply} disabled={loading}>Apply</button>
        </div>
      </div>
    </div>
  );
};
