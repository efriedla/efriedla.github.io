// Edge fade ("vignette") mask — fades the outside of an image to transparent so
// the corners drop away and the subject blends out, or the reverse: punch the
// middle out and keep the border.

export type FadeShape = 'oval' | 'rect';

export interface EdgeFadeOptions {
  shape: FadeShape;
  /** Fraction of the half-diagonal kept fully opaque, 0–1. */
  size: number;
  /** Width of the gradient that follows, 0–1. A 0 gives a hard edge. */
  softness: number;
  /** Keep the outside and fade the middle away instead. */
  invert: boolean;
}

export const DEFAULT_EDGE_FADE: EdgeFadeOptions = {
  shape: 'oval',
  size: 0.55,
  softness: 0.45,
  invert: false,
};

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * Per-pixel alpha multiplier, 0–255, in row-major order.
 * Distance is normalised so 1.0 sits on the edge midpoints; image corners reach
 * ~1.41 under the oval shape, which is why they fade out first.
 */
export function buildEdgeFadeMask(w: number, h: number, opts: EdgeFadeOptions): Uint8Array {
  const mask = new Uint8Array(w * h);
  const inner = opts.size;
  const outer = opts.size + Math.max(opts.softness, 0.0001);
  const halfW = w / 2;
  const halfH = h / 2;
  for (let y = 0; y < h; y++) {
    const ny = (y + 0.5) / halfH - 1;
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5) / halfW - 1;
      const d = opts.shape === 'oval'
        ? Math.sqrt(nx * nx + ny * ny)
        : Math.max(Math.abs(nx), Math.abs(ny));
      let f: number;
      if (d <= inner) f = 1;
      else if (d >= outer) f = 0;
      else f = 1 - smoothstep((d - inner) / (outer - inner));
      if (opts.invert) f = 1 - f;
      mask[y * w + x] = Math.round(f * 255);
    }
  }
  return mask;
}
