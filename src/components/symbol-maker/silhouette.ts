// Silhouette + outline derivation from an alpha-bearing source image.
//
// Concept: keep the *shape* (alpha channel) but discard the colors so the result
// can be live-tinted at render time and recolored downstream by BrandKit's foreground.
// A "silhouette" is the full filled shape; an "outline" is just a band along the boundary.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Binary white-on-transparent version of the source: pixels with alpha above
 * ALPHA_THRESHOLD become solid white, the rest become fully transparent.
 *
 * The threshold is what kills the "rectangular bounds bleed" — when a source
 * image has soft / partially-transparent background pixels (e.g. anti-aliased
 * edges or an incompletely removed background), preserving their alpha would
 * tint them the foreground color and reveal the original image's rectangle.
 * Hard thresholding produces a clean shape at the cost of a slightly stair-
 * stepped edge.
 */
const ALPHA_THRESHOLD = 128;

export async function makeWhiteAlphaMask(src: string): Promise<string> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > ALPHA_THRESHOLD) {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    } else {
      d[i] = d[i + 1] = d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * White-on-transparent boundary band of given thickness. Pixels are kept iff they're
 * inside (alpha > threshold) AND within `thickness` of an outside pixel
 * (i.e., not eroded away by a disc of radius `thickness`).
 */
export async function makeOutlineMask(src: string, thickness: number): Promise<string> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  // Inside mask (binary) — same threshold as makeWhiteAlphaMask so silhouette + outline agree
  const inside = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) inside[p] = d[i + 3] > ALPHA_THRESHOLD ? 1 : 0;

  // Erode by `thickness` using disc structuring element
  const eroded = erodeDisc(inside, w, h, Math.max(1, Math.round(thickness)));

  // Output: inside AND NOT eroded → boundary band
  const out = ctx.createImageData(w, h);
  const od = out.data;
  for (let p = 0, i = 0; p < inside.length; p++, i += 4) {
    if (inside[p] && !eroded[p]) {
      od[i] = 255;
      od[i + 1] = 255;
      od[i + 2] = 255;
      od[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * Tint a white-alpha mask to a target color. The mask's alpha is preserved;
 * its RGB is replaced by `color`. Implementation: fill the canvas with color,
 * then composite the mask with destination-in (keep only where mask has alpha).
 */
export async function tintAlphaWithColor(maskSrc: string, color: string): Promise<string> {
  const img = await loadImage(maskSrc);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return c.toDataURL('image/png');
}

// Naive disc-erosion: mask[p]=1 only if every pixel within `radius` is also 1.
// O(N · R²). For typical 1024² · radius ≤ 12 it runs in a few hundred ms — fine for one-shot conversions.
function erodeDisc(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const r2 = radius * radius;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      let allIn = true;
      outer: for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) { allIn = false; break outer; }
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w || !mask[ny * w + nx]) { allIn = false; break outer; }
        }
      }
      if (allIn) out[y * w + x] = 1;
    }
  }
  return out;
}
