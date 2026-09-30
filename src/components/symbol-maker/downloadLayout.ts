// Download settings for the symbol maker: what to export, at what size, with
// how much space around it. Pure — no DOM — so the framing maths is tested.
//
// Settings are remembered between downloads, on purpose: the usual job is a
// SET of symbols that must come out matching, and "the same as last time" is
// exactly "the same as symbol one". A remembered width x height is kept as
// is, even when the next symbol's artwork is a different shape — it is
// fitted inside that box, which is what keeps the set consistent.

export type DownloadScope = 'canvas' | 'artwork' | 'layer';
export type DownloadFormat = 'png' | 'svg';

export interface DownloadSettings {
  scope: DownloadScope;
  width: number;
  height: number;
  lockAspect: boolean;
  /** Empty space on every side, as a fraction of the artwork's longest side. */
  padding: number;
  format: DownloadFormat;
  name: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_PX = 16;
export const MAX_PX = 8192;
export const MAX_PADDING = 0.4;

/** The download as it was before this dialog existed: the whole canvas at 2x. */
export const defaultDownload = (docW: number, docH: number = docW): DownloadSettings => ({
  scope: 'canvas',
  width: clampPx(docW * 2),
  height: clampPx(docH * 2),
  lockAspect: true,
  padding: 0,
  format: 'png',
  name: 'symbol',
});

export const clampPx = (n: number) =>
  Number.isFinite(n) ? Math.max(MIN_PX, Math.min(MAX_PX, Math.round(n))) : MIN_PX;

/** Grow a region by `padding` of its longest side on every side. */
export function padRegion(r: Rect, padding: number): Rect {
  const p = Math.max(0, Math.min(MAX_PADDING, padding)) * Math.max(r.w, r.h);
  return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p };
}

/**
 * The viewBox that shows all of `region`, centred, in an output of
 * `outW` x `outH`. The region is grown along its short side to the output's
 * shape, so the artwork is fitted — never stretched and never cut off — and
 * the extra space is transparent.
 */
export function viewBoxFor(region: Rect, outW: number, outH: number): Rect {
  const outAspect = outW / outH;
  const aspect = region.w / region.h;
  if (aspect > outAspect) {
    const h = region.w / outAspect;
    return { x: region.x, y: region.y - (h - region.h) / 2, w: region.w, h };
  }
  const w = region.h * outAspect;
  return { x: region.x - (w - region.w) / 2, y: region.y, w, h: region.h };
}

/** Change one side; with the lock on, the other follows the current shape. */
export function resizeLocked(
  prev: Pick<DownloadSettings, 'width' | 'height' | 'lockAspect'>,
  side: 'width' | 'height',
  value: number,
): { width: number; height: number } {
  const v = clampPx(value);
  if (!prev.lockAspect) return side === 'width' ? { width: v, height: prev.height } : { width: prev.width, height: v };
  const ratio = prev.width / prev.height;
  return side === 'width'
    ? { width: v, height: clampPx(v / ratio) }
    : { width: clampPx(v * ratio), height: v };
}

/** A width x height with the artwork's own shape, longest side `longest`. */
export function sizeForShape(region: Rect, padding: number, longest: number) {
  const r = padRegion(region, padding);
  return r.w >= r.h
    ? { width: clampPx(longest), height: clampPx((longest * r.h) / r.w) }
    : { width: clampPx((longest * r.w) / r.h), height: clampPx(longest) };
}

/**
 * The bounding box of every pixel with alpha above `threshold`, in pixels of
 * the scanned image, or null if nothing is visible. Used to trim to the
 * artwork, which is far more reliable than adding up node geometry: text,
 * curved text, strokes and rotated shapes all measure themselves correctly
 * this way.
 */
export function alphaBounds(data: ArrayLike<number>, w: number, h: number, threshold = 8): Rect | null {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** A file name that is safe on every platform, with the right extension. */
export function fileNameFor(name: string, format: DownloadFormat): string {
  const base = name.trim().replace(/\.(png|svg)$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 80);
  return `${base || 'symbol'}.${format}`;
}

const KEY = 'portfolio-symbol-download';

export function saveDownload(s: DownloadSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/** The last download's settings, or null. Anything malformed is ignored
 *  rather than half-applied. */
export function loadDownload(): DownloadSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    const scopes: DownloadScope[] = ['canvas', 'artwork', 'layer'];
    if (!scopes.includes(v?.scope) || (v.format !== 'png' && v.format !== 'svg')) return null;
    return {
      scope: v.scope,
      width: clampPx(v.width),
      height: clampPx(v.height),
      lockAspect: v.lockAspect !== false,
      padding: Math.max(0, Math.min(MAX_PADDING, Number(v.padding) || 0)),
      format: v.format,
      name: typeof v.name === 'string' ? v.name : 'symbol',
    };
  } catch {
    return null;
  }
}
