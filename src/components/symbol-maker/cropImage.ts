// The pixel side of cropping: shared by the Crop dialog and by pasting a
// copied crop, so both cut an image exactly the same way.

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/** Cut `rect` (natural pixels) out of `src`, as a PNG data URL. */
export async function cropToDataUrl(src: string, rect: PixelRect): Promise<{ src: string; w: number; h: number }> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(rect.w));
  c.height = Math.max(1, Math.round(rect.h));
  c.getContext('2d')!.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
  return { src: c.toDataURL('image/png'), w: c.width, h: c.height };
}
