// Color-based background removal — pure utilities.
// Pixels close to a target color (Euclidean RGB distance) are made transparent.
// "feather" gives nearby-but-not-matching pixels a soft alpha taper for smoother edges.
//
// Limits: doesn't handle anti-aliased silhouettes against complex backgrounds,
// drop shadows that aren't the target color, or photos. For real product photos
// or anything photographic, use ML-based removal (rembg / U2Net) on the server.

export interface RGB { r: number; g: number; b: number; }

export interface BgRemoveOptions {
  targetColor: RGB;
  /** 0..1 fraction of the maximum RGB distance (sqrt(255²·3) ≈ 441.7). */
  tolerance: number;
  /** Soft alpha taper for pixels just outside the tolerance band. */
  feather?: boolean;
}

const MAX_DIST = Math.sqrt(255 * 255 * 3);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export async function removeBackground(src: string, opts: BgRemoveOptions): Promise<string> {
  const img = await loadImage(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const tr = opts.targetColor.r;
  const tg = opts.targetColor.g;
  const tb = opts.targetColor.b;
  const t = opts.tolerance * MAX_DIST;
  const featherW = opts.feather ? t * 0.6 : 0;

  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - tr;
    const dg = d[i + 1] - tg;
    const db = d[i + 2] - tb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= t) {
      d[i + 3] = 0;
    } else if (featherW && dist <= t + featherW) {
      const factor = (dist - t) / featherW;
      d[i + 3] = Math.round(d[i + 3] * factor);
    }
  }
  ctx.putImageData(id, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Sample a pixel at normalized (0..1) coordinates. */
export async function sampleColor(src: string, nx: number, ny: number): Promise<RGB> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(nx * canvas.width)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(ny * canvas.height)));
  const px = ctx.getImageData(x, y, 1, 1).data;
  return { r: px[0], g: px[1], b: px[2] };
}

/** Average the four corner pixels — usually a good default for "background color". */
export async function autoPickFromCorners(src: string): Promise<RGB> {
  const samples = await Promise.all([
    sampleColor(src, 0.02, 0.02),
    sampleColor(src, 0.98, 0.02),
    sampleColor(src, 0.02, 0.98),
    sampleColor(src, 0.98, 0.98),
  ]);
  return {
    r: Math.round(samples.reduce((a, s) => a + s.r, 0) / samples.length),
    g: Math.round(samples.reduce((a, s) => a + s.g, 0) / samples.length),
    b: Math.round(samples.reduce((a, s) => a + s.b, 0) / samples.length),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
