// Image framing for Copy style / Paste style: an image's size, rotation,
// position and crop, and how to apply them to another image so a set of
// symbols comes out matching. (The clipboard itself is styleClipboard.ts.)
//
// Pure — no DOM, no canvas — so it can be tested headlessly. The pixel work
// of actually cropping lives in cropImage.ts.
//
// Crop is carried as FRACTIONS of the image it was cut from ("keep the middle
// 60%"), never as pixels. Two photos of different resolutions then get the
// same framing, which is the whole point; a pixel rectangle copied from a
// 4000px photo to a 600px one would fall off the edge.

import type { ImageNode } from './types';

/** A crop, as fractions (0..1) of the image it was cut from. */
export interface CropFrac {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageLook {
  /** Size on the canvas, scale included. */
  width: number;
  height: number;
  rotation: number;
  /** Centre on the canvas. */
  cx: number;
  cy: number;
  /** Absent if the source image was never cropped. */
  crop?: CropFrac;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Pixel rect -> fractions of an image `natW` x `natH`. */
export function toFrac(rect: { x: number; y: number; w: number; h: number }, natW: number, natH: number): CropFrac {
  const x = clamp01(rect.x / natW);
  const y = clamp01(rect.y / natH);
  return { x, y, w: Math.min(1 - x, clamp01(rect.w / natW)), h: Math.min(1 - y, clamp01(rect.h / natH)) };
}

/** Fractions -> a whole-pixel rect inside an image `natW` x `natH`, never
 *  smaller than one pixel. */
export function fromFrac(frac: CropFrac, natW: number, natH: number) {
  const x = Math.min(natW - 1, Math.max(0, Math.round(frac.x * natW)));
  const y = Math.min(natH - 1, Math.max(0, Math.round(frac.y * natH)));
  return {
    x,
    y,
    w: Math.max(1, Math.min(natW - x, Math.round(frac.w * natW))),
    h: Math.max(1, Math.min(natH - y, Math.round(frac.h * natH))),
  };
}

/**
 * A crop on top of an earlier crop, as one crop of the original. Cropping
 * twice is common (rough cut, then tidy), and without this the copied look
 * would only remember the tidy-up and a fresh image would get the wrong frame.
 */
export function composeCrop(earlier: CropFrac | undefined, next: CropFrac): CropFrac {
  if (!earlier) return next;
  return {
    x: earlier.x + next.x * earlier.w,
    y: earlier.y + next.y * earlier.h,
    w: next.w * earlier.w,
    h: next.h * earlier.h,
  };
}

export const displayWidth = (n: Pick<ImageNode, 'width' | 'scaleX'>) => n.width * Math.abs(n.scaleX);
export const displayHeight = (n: Pick<ImageNode, 'height' | 'scaleY'>) => n.height * Math.abs(n.scaleY);

/** From the node's origin to its visual centre. Konva rotates a node about
 *  its x/y — the top-left corner, since no offset is set — so the centre of
 *  a rotated image is not simply x + width / 2. */
function centreOffset(width: number, height: number, rotationDeg: number) {
  const a = (rotationDeg * Math.PI) / 180;
  const hx = width / 2;
  const hy = height / 2;
  return { dx: hx * Math.cos(a) - hy * Math.sin(a), dy: hx * Math.sin(a) + hy * Math.cos(a) };
}

/** The visual centre of an image on the canvas. */
export function centreOf(n: Pick<ImageNode, 'x' | 'y' | 'width' | 'height' | 'scaleX' | 'scaleY' | 'rotation'>) {
  const { dx, dy } = centreOffset(displayWidth(n), displayHeight(n), n.rotation);
  return { cx: n.x + dx, cy: n.y + dy };
}

/** The look of an image, ready to copy. */
export function lookOf(node: ImageNode): ImageLook {
  return {
    width: displayWidth(node),
    height: displayHeight(node),
    rotation: node.rotation,
    ...centreOf(node),
    crop: node.crop,
  };
}

/**
 * The size-and-position half of a paste, for an image whose aspect ratio is
 * `aspect` (its own, after any crop has been applied).
 *
 * The image is fitted INSIDE the copied box rather than stretched to it: if
 * the two aspects differ, stretching would distort the picture, and a
 * distorted symbol is worse than a slightly smaller one. When a crop was
 * pasted too, the aspects match and it fills the box exactly.
 *
 * Returns a patch with scale reset to 1 — the size is carried by
 * width/height, so a mirrored source does not mirror the target.
 */
export function sizePatch(
  target: Pick<ImageNode, 'x' | 'y' | 'width' | 'height' | 'scaleX' | 'scaleY' | 'rotation'>,
  aspect: number,
  look: ImageLook,
  parts: { size: boolean; rotation: boolean; position: boolean },
) {
  let width = displayWidth(target);
  let height = displayHeight(target);
  if (parts.size) {
    const fit = Math.min(look.width / aspect, look.height);
    height = fit;
    width = fit * aspect;
  } else if (Math.abs(width / height - aspect) > 1e-6) {
    // Only cropped: keep the longest side, follow the new aspect.
    const longest = Math.max(width, height);
    if (aspect >= 1) { width = longest; height = longest / aspect; } else { height = longest; width = longest * aspect; }
  }
  // The image keeps its centre (or takes the source's), and turns about it.
  const { cx, cy } = parts.position ? look : centreOf(target);
  const rotation = parts.rotation ? look.rotation : target.rotation;
  const { dx, dy } = centreOffset(width, height, rotation);
  return { width, height, scaleX: 1, scaleY: 1, rotation, x: cx - dx, y: cy - dy };
}
