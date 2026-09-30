// Image sharpen via 3×3 convolution kernel.
// Kernel: [ 0, -k, 0;  -k, 1+4k, -k;  0, -k, 0 ] — k controls strength.
// Operates on RGB channels; alpha is passed through untouched so cutouts stay clean.

export async function sharpenImage(src: string, amount: number): Promise<string> {
  if (amount <= 0) return src;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const s = data.data;
  const out = new Uint8ClampedArray(s.length);
  const k = amount;
  const cw = 1 + 4 * k;

  for (let y = 0; y < h; y++) {
    const yT = y > 0 ? y - 1 : y;
    const yB = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const xL = x > 0 ? x - 1 : x;
      const xR = x < w - 1 ? x + 1 : x;
      const i = (y * w + x) * 4;
      const iT = (yT * w + x) * 4;
      const iB = (yB * w + x) * 4;
      const iL = (y * w + xL) * 4;
      const iR = (y * w + xR) * 4;

      let v = cw * s[i] - k * (s[iT] + s[iB] + s[iL] + s[iR]);
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
      v = cw * s[i + 1] - k * (s[iT + 1] + s[iB + 1] + s[iL + 1] + s[iR + 1]);
      out[i + 1] = v < 0 ? 0 : v > 255 ? 255 : v;
      v = cw * s[i + 2] - k * (s[iT + 2] + s[iB + 2] + s[iL + 2] + s[iR + 2]);
      out[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
      out[i + 3] = s[i + 3]; // preserve alpha
    }
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
  return c.toDataURL('image/png');
}
