// Nearest-neighbor resampling. Returns a PNG data URL at the requested pixel dimensions.
// Useful for "bake the upscale" so subsequent renders/exports don't smooth the bitmap further.

export async function nearestNeighborResample(src: string, targetW: number, targetH: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const w = Math.max(1, Math.round(targetW));
  const h = Math.max(1, Math.round(targetH));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/png');
}
