// Export pipeline: SymbolDoc → SVG string and PNG dataUrl.
// SVG output is a complete <svg> root element with explicit viewBox so it can be embedded anywhere.
// The output is independent of Konva — we build SVG by serializing nodes directly.

import type { SymbolDoc, SymbolNode } from './types';
import { docWidth, docHeight } from './types';
import { alphaBounds, type Rect } from './downloadLayout';

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
}

function commonAttrs(n: SymbolNode): string {
  // All nodes share opacity, rotation, position handling via a wrapping <g transform="...">.
  // Fill/stroke are emitted on the leaf element itself.
  const style: string[] = [];
  if (n.opacity != null && n.opacity !== 1) style.push(`opacity="${n.opacity}"`);
  return style.join(' ');
}

function transformAttr(n: SymbolNode, anchorX = 0, anchorY = 0): string {
  // Build a transform string equivalent to Konva's: translate to (x,y), rotate around anchor, scale around anchor.
  // For most shapes the anchor is (0,0) of the local coord system.
  const parts: string[] = [];
  parts.push(`translate(${n.x}, ${n.y})`);
  if (n.rotation) parts.push(`rotate(${n.rotation}, ${anchorX}, ${anchorY})`);
  if (n.scaleX !== 1 || n.scaleY !== 1) parts.push(`scale(${n.scaleX}, ${n.scaleY})`);
  return `transform="${parts.join(' ')}"`;
}

function fillStroke(n: SymbolNode): string {
  const f = n.fill ? `fill="${n.fill}"` : 'fill="none"';
  if (!n.stroke || n.strokeWidth <= 0) return f;
  return `${f} stroke="${n.stroke}" stroke-width="${n.strokeWidth}"`;
}

function nodeToSvg(n: SymbolNode, pixelPerfect = false): string {
  if (n.hidden) return '';
  const tx = transformAttr(n);
  const op = commonAttrs(n);
  const fs = fillStroke(n);
  const imgRender = pixelPerfect ? ' image-rendering="pixelated" style="image-rendering:pixelated;image-rendering:crisp-edges;"' : '';

  switch (n.type) {
    case 'rect': {
      const rx = n.cornerRadius ? `rx="${n.cornerRadius}" ry="${n.cornerRadius}"` : '';
      return `<g ${tx} ${op}><rect x="0" y="0" width="${n.width}" height="${n.height}" ${rx} ${fs} /></g>`;
    }
    case 'circle': {
      return `<g ${tx} ${op}><circle cx="0" cy="0" r="${n.radius}" ${fs} /></g>`;
    }
    case 'polygon': {
      const pts = polygonPoints(n.sides, n.radius);
      return `<g ${tx} ${op}><polygon points="${pts}" ${fs} /></g>`;
    }
    case 'star': {
      const pts = starPoints(n.numPoints, n.innerRadius, n.outerRadius);
      return `<g ${tx} ${op}><polygon points="${pts}" ${fs} /></g>`;
    }
    case 'line': {
      // Curved (open) line → render as a quadratic-Bezier <path>
      if (!n.closed && n.curvature && n.points.length >= 4) {
        const x1 = n.points[0], y1 = n.points[1];
        const x2 = n.points[n.points.length - 2], y2 = n.points[n.points.length - 1];
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const px = -dy / (len || 1), py = dx / (len || 1);
        const offset = n.curvature * len * 0.5;
        const cx = mx + px * offset;
        const cy = my + py * offset;
        const sw = n.strokeWidth || 2;
        const sc = n.stroke || n.fill || '#000000';
        return `<g ${tx} ${op}><path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${sc}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" /></g>`;
      }
      const pts = pointsString(n.points);
      const tag = n.closed ? 'polygon' : 'polyline';
      // For non-closed lines fill should default to none even if a stroke fill is set
      const lineFs = n.closed ? fs : `fill="none" stroke="${n.stroke || n.fill}" stroke-width="${n.strokeWidth || 2}"`;
      return `<g ${tx} ${op}><${tag} points="${pts}" ${lineFs} stroke-linejoin="round" stroke-linecap="round" /></g>`;
    }
    case 'pen': {
      const d = penPath(n.points, n.tension);
      const sw = n.strokeWidth || 4;
      const sc = n.stroke || n.fill || '#000000';
      return `<g ${tx} ${op}><path d="${d}" fill="none" stroke="${sc}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" /></g>`;
    }
    case 'image': {
      // Silhouette / outline: src is a white-alpha mask, render as a fill-rect masked by the image alpha.
      // The fill attribute is rewritten to currentColor by BrandKit's recolor pass when enabled.
      const isMasked = n.silhouette || (n.outline && n.outline > 0);
      if (isMasked) {
        const maskId = `m_${n.id}`;
        const fillColor = n.fill && n.fill !== 'transparent' ? n.fill : '#000000';
        return `<g ${tx} ${op}>
          <mask id="${maskId}" mask-type="luminance">
            <rect x="0" y="0" width="${n.width}" height="${n.height}" fill="black" />
            <image x="0" y="0" width="${n.width}" height="${n.height}" href="${n.src}" preserveAspectRatio="xMidYMid meet"${imgRender} />
          </mask>
          <rect x="0" y="0" width="${n.width}" height="${n.height}" fill="${fillColor}" mask="url(#${maskId})" />
        </g>`;
      }
      return `<g ${tx} ${op}><image x="0" y="0" width="${n.width}" height="${n.height}" href="${n.src}" preserveAspectRatio="xMidYMid meet"${imgRender} /></g>`;
    }
    case 'text': {
      const ff = escapeXml(n.fontFamily || 'Inter, system-ui, sans-serif');
      const curvature = n.curvature ?? 0;
      const fillVal = !n.fill || n.fill === 'transparent' ? 'none' : n.fill;
      const hasStroke = n.strokeWidth > 0 && n.stroke && n.stroke !== 'transparent';
      // paint-order=stroke draws the outline first then fill on top — the outline appears
      // outside the glyph rather than eating into it. Cleaner look for fill+stroke text.
      const strokeAttrs = hasStroke ? ` stroke="${n.stroke}" stroke-width="${n.strokeWidth}" paint-order="stroke"` : '';
      if (curvature !== 0 && n.text) {
        // Pad approxWidth a bit (× 1.1) so the last glyph isn't clipped by a too-short path.
        const approxWidth = Math.max(1, n.text.length * n.fontSize * 0.55) * 1.1;
        const baseY = n.fontSize * 0.8;
        const ctrlY = baseY + curvature * approxWidth * 0.4;
        const pathId = `tp_${n.id}`;
        const pathData = `M 0 ${baseY} Q ${approxWidth / 2} ${ctrlY} ${approxWidth} ${baseY}`;
        return `<g ${tx} ${op}><defs><path id="${pathId}" d="${pathData}" /></defs><text font-family="${ff}" font-weight="${n.fontWeight}" font-size="${n.fontSize}" fill="${fillVal}"${strokeAttrs}><textPath href="#${pathId}">${escapeXml(n.text)}</textPath></text></g>`;
      }
      return `<g ${tx} ${op}><text x="0" y="0" font-family="${ff}" font-weight="${n.fontWeight}" font-size="${n.fontSize}" fill="${fillVal}"${strokeAttrs} dominant-baseline="hanging">${escapeXml(n.text)}</text></g>`;
    }
  }
}

function polygonPoints(sides: number, radius: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push(`${(Math.cos(a) * radius).toFixed(2)},${(Math.sin(a) * radius).toFixed(2)}`);
  }
  return pts.join(' ');
}

function starPoints(numPoints: number, innerR: number, outerR: number): string {
  const pts: string[] = [];
  const n = numPoints * 2;
  for (let i = 0; i < n; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI / 2 + (i * Math.PI) / numPoints;
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return pts.join(' ');
}

function pointsString(points: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < points.length; i += 2) out.push(`${points[i]},${points[i + 1]}`);
  return out.join(' ');
}

// Catmull-Rom-ish smoothing for pen strokes. tension=0 → straight, 0.5 → smooth.
function penPath(points: number[], tension: number): string {
  if (points.length < 2) return '';
  if (points.length < 4) return `M ${points[0]} ${points[1]}`;
  const t = Math.max(0, Math.min(1, tension));
  if (t === 0) {
    let d = `M ${points[0]} ${points[1]}`;
    for (let i = 2; i < points.length; i += 2) d += ` L ${points[i]} ${points[i + 1]}`;
    return d;
  }
  // Quadratic smoothing using midpoints
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length - 2; i += 2) {
    const xc = (points[i] + points[i + 2]) / 2;
    const yc = (points[i + 1] + points[i + 3]) / 2;
    d += ` Q ${points[i]} ${points[i + 1]}, ${xc} ${yc}`;
  }
  d += ` L ${points[points.length - 2]} ${points[points.length - 1]}`;
  return d;
}

export interface SvgOptions {
  /** Output size of the LONGER side, in px; the other follows the canvas
   *  shape. Default: the canvas's own size. */
  size?: number;
  /** Inline xmlns attribute. Default true. Set false when embedding inside another <svg>. */
  includeXmlns?: boolean;
  /** Emit image-rendering="pixelated" on raster nodes so they stay crisp when upscaled. */
  pixelPerfect?: boolean;
  /** Show only this part of the canvas (doc units). Default: the whole canvas. */
  viewBox?: Rect;
  /** Output size in px. Default: `size` square. A viewBox of a different
   *  shape is fitted inside it (SVG's default preserveAspectRatio). */
  width?: number;
  height?: number;
}

export function symbolToSvg(doc: SymbolDoc, opts: SvgOptions = {}): string {
  const W = docWidth(doc);
  const H = docHeight(doc);
  const k = opts.size ? opts.size / Math.max(W, H) : 1;
  const xmlns = opts.includeXmlns === false ? '' : ' xmlns="http://www.w3.org/2000/svg"';
  const bg =
    doc.background.kind === 'solid'
      ? `<rect x="0" y="0" width="${W}" height="${H}" fill="${doc.background.color}" />`
      : '';
  const body = doc.nodes.map((n) => nodeToSvg(n, opts.pixelPerfect)).join('');
  const vb = opts.viewBox ?? { x: 0, y: 0, w: W, h: H };
  const width = opts.width ?? W * k;
  const height = opts.height ?? H * k;
  return `<svg${xmlns} width="${width}" height="${height}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">${bg}${body}</svg>`;
}

export function svgToBlob(svg: string): Blob {
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' });
}

export function svgToDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export async function symbolToPngDataUrl(doc: SymbolDoc, pixelRatio = 2, pixelPerfect = false): Promise<string> {
  const svg = symbolToSvg(doc, { pixelPerfect });
  const blob = svgToBlob(svg);
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const w = Math.max(1, Math.round(docWidth(doc) * pixelRatio));
    const h = Math.max(1, Math.round(docHeight(doc) * pixelRatio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    if (pixelPerfect) ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/** Rasterise an SVG string to a PNG data URL at exactly `w` x `h`. */
export async function svgToPngDataUrl(svg: string, w: number, h: number, pixelPerfect = false): Promise<string> {
  const url = URL.createObjectURL(svgToBlob(svg));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    if (pixelPerfect) ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Where the visible artwork is, in doc units, or null if nothing shows.
 * Measured from rendered pixels rather than node geometry — see alphaBounds.
 * Rendered at up to 1024px, so the box is exact to well under a doc pixel on
 * the usual canvas sizes.
 */
export async function artworkBounds(doc: SymbolDoc, pixelPerfect = false): Promise<Rect | null> {
  const W = docWidth(doc);
  const H = docHeight(doc);
  const k = Math.min(1024, Math.max(W, H) * 2) / Math.max(W, H);
  const sw = Math.max(1, Math.round(W * k));
  const sh = Math.max(1, Math.round(H * k));
  const url = URL.createObjectURL(svgToBlob(symbolToSvg({ ...doc, background: { kind: 'transparent' } }, { pixelPerfect, width: sw, height: sh })));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, sw, sh);
    const px = alphaBounds(ctx.getImageData(0, 0, sw, sh).data, sw, sh);
    // Back to canvas units, using the rounded scan size on each axis.
    const kx = sw / W;
    const ky = sh / H;
    return px && { x: px.x / kx, y: px.y / ky, w: px.w / kx, h: px.h / ky };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Tiny PNG thumbnail (e.g. 64px) for picker chips
export async function symbolToThumbnail(doc: SymbolDoc, px = 64, pixelPerfect = false): Promise<string> {
  const ratio = px / Math.max(docWidth(doc), docHeight(doc));
  return symbolToPngDataUrl(doc, ratio, pixelPerfect);
}

export function docHasRasterOnly(doc: SymbolDoc): boolean {
  // Reserved for v2 (filters/masks). v1 nodes are all SVG-safe.
  return doc.nodes.some((n) => n.type === 'image');
}
