// Copy style / Paste style: take how one symbol looks — its canvas, and the
// selected layer — and apply any of it to another symbol, so a set comes out
// matching. The user picks which parts to paste.
//
// Pure — no DOM — so what can be pasted where, and what a paste changes, is
// tested. The pixel work for images (crop, silhouette, outline, sharpen) is
// described here as a plan and carried out by the editor.
//
// The copy holds only numbers and names, never image data, so it fits in
// localStorage and survives closing one symbol and opening the next.

import type { ImageNode, SymbolDoc, SymbolNode, SymbolNodeType } from './types';
import { docHeight, docWidth } from './types';
import { CropFrac, ImageLook, lookOf, sizePatch } from './imageLook';

export type StylePart =
  | 'canvasSize'
  | 'background'
  | 'colours'
  | 'strokeWidth'
  | 'opacity'
  | 'size'
  | 'rotation'
  | 'position'
  | 'text'
  | 'crop'
  | 'effects';

/** In the order the paste list shows them. */
export const PART_LABELS: { part: StylePart; label: string; group: 'Canvas' | 'Layer' | 'Text' | 'Image' }[] = [
  { part: 'canvasSize', label: 'Canvas size', group: 'Canvas' },
  { part: 'background', label: 'Background', group: 'Canvas' },
  { part: 'colours', label: 'Colours', group: 'Layer' },
  { part: 'strokeWidth', label: 'Stroke width', group: 'Layer' },
  { part: 'opacity', label: 'Opacity', group: 'Layer' },
  { part: 'size', label: 'Size', group: 'Layer' },
  { part: 'rotation', label: 'Rotation', group: 'Layer' },
  { part: 'position', label: 'Position', group: 'Layer' },
  { part: 'text', label: 'Font, size and curve', group: 'Text' },
  { part: 'crop', label: 'Crop', group: 'Image' },
  { part: 'effects', label: 'Silhouette / outline / sharpen', group: 'Image' },
];

export type PartChoice = Record<StylePart, boolean>;

/** Everything but position: matching a set usually means the same look in
 *  each symbol's own place. */
export const DEFAULT_CHOICE: PartChoice = {
  canvasSize: true,
  background: true,
  colours: true,
  strokeWidth: true,
  opacity: true,
  size: true,
  rotation: true,
  position: false,
  text: true,
  crop: true,
  effects: true,
};

/** Geometry that means "how big" for each kind of layer. Copied only between
 *  layers of the same kind — a circle's radius means nothing to a rectangle. */
const SIZE_KEYS: Partial<Record<SymbolNodeType, string[]>> = {
  rect: ['width', 'height', 'cornerRadius'],
  circle: ['radius'],
  polygon: ['radius'],
  star: ['innerRadius', 'outerRadius'],
};

export interface CopiedLayer {
  type: SymbolNodeType;
  label: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  rotation: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Type-specific size fields (see SIZE_KEYS). */
  geometry: Record<string, number>;
  text?: { fontFamily: string; fontSize: number; fontWeight: number; curvature?: number };
  image?: {
    look: ImageLook;
    crop?: CropFrac;
    silhouette: boolean;
    outline?: number;
    sharpen?: number;
  };
}

export interface CopiedStyle {
  canvas: { width: number; height: number; background: SymbolDoc['background'] };
  layer?: CopiedLayer;
}

const TYPE_LABEL: Record<SymbolNodeType, string> = {
  rect: 'rectangle', circle: 'circle', polygon: 'polygon', star: 'star',
  line: 'line', pen: 'drawing', image: 'image', text: 'text',
};

export const typeLabel = (t: SymbolNodeType) => TYPE_LABEL[t];

export function copyStyle(doc: SymbolDoc, node: SymbolNode | null | undefined): CopiedStyle {
  const style: CopiedStyle = {
    canvas: { width: docWidth(doc), height: docHeight(doc), background: doc.background },
  };
  if (!node) return style;
  const geometry: Record<string, number> = {};
  for (const k of SIZE_KEYS[node.type] ?? []) {
    const v = (node as unknown as Record<string, unknown>)[k];
    if (typeof v === 'number') geometry[k] = v;
  }
  style.layer = {
    type: node.type,
    label: node.name?.trim() || TYPE_LABEL[node.type],
    fill: node.fill,
    stroke: node.stroke,
    strokeWidth: node.strokeWidth,
    opacity: node.opacity,
    rotation: node.rotation,
    x: node.x,
    y: node.y,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    geometry,
  };
  if (node.type === 'text') {
    style.layer.text = { fontFamily: node.fontFamily, fontSize: node.fontSize, fontWeight: node.fontWeight, curvature: node.curvature };
  }
  if (node.type === 'image') {
    style.layer.image = {
      look: lookOf(node),
      crop: node.crop,
      silhouette: !!node.silhouette,
      outline: node.outline,
      sharpen: node.sharpen,
    };
  }
  return style;
}

/**
 * For each part: null if it can be pasted onto `target`, or the reason it
 * cannot, in words for the checkbox. A disabled option always says why.
 */
export function availability(style: CopiedStyle, target: SymbolNode | null | undefined): Record<StylePart, string | null> {
  const src = style.layer;
  const noLayer = !src ? 'Nothing was selected when you copied' : !target ? 'Select a layer to paste onto' : null;
  const sameKind = noLayer ?? (src!.type !== target!.type ? `Copied a ${typeLabel(src!.type)}, this is a ${typeLabel(target!.type)}` : null);
  const bothText = noLayer ?? (src!.type !== 'text' || target!.type !== 'text' ? 'Only between text layers' : null);
  const bothImage = noLayer ?? (src!.type !== 'image' || target!.type !== 'image' ? 'Only between images' : null);
  let crop = bothImage;
  if (!crop) {
    if (!src!.image!.crop) crop = 'The copied image was not cropped';
    // A crop throws pixels away and there is no original to go back to, so
    // cropping an already-cropped image would frame it differently from the
    // source — the opposite of matching.
    else if ((target as ImageNode).crop) crop = 'This image is already cropped';
  }
  return {
    canvasSize: null,
    background: null,
    colours: noLayer,
    strokeWidth: noLayer,
    opacity: noLayer,
    size: sameKind,
    rotation: noLayer,
    position: sameKind,
    text: bothText,
    crop,
    effects: bothImage,
  };
}

/** Parts that are both ticked and possible. */
export function activeParts(style: CopiedStyle, target: SymbolNode | null | undefined, choice: PartChoice): Set<StylePart> {
  const avail = availability(style, target);
  return new Set((Object.keys(choice) as StylePart[]).filter((p) => choice[p] && avail[p] === null));
}

/** The canvas half of a paste: a patch for the doc, or null. */
export function canvasPatch(style: CopiedStyle, parts: Set<StylePart>): Partial<SymbolDoc> | null {
  const patch: Partial<SymbolDoc> = {};
  if (parts.has('canvasSize')) {
    patch.size = style.canvas.width;
    patch.height = style.canvas.height === style.canvas.width ? undefined : style.canvas.height;
  }
  if (parts.has('background')) patch.background = style.canvas.background;
  return Object.keys(patch).length ? patch : null;
}

/** What an image paste has to do to the pixels, in order. */
export interface ImagePlan {
  /** Undo the target's own silhouette/outline/sharpen first, so the result
   *  matches the source rather than stacking effects. */
  resetEffects: boolean;
  crop?: CropFrac;
  effect?: { kind: 'none' } | { kind: 'silhouette' } | { kind: 'outline'; thickness: number };
  sharpen?: number;
}

export function imagePlan(style: CopiedStyle, target: SymbolNode, parts: Set<StylePart>): ImagePlan | null {
  const img = style.layer?.image;
  if (!img || target.type !== 'image') return null;
  const doCrop = parts.has('crop');
  const doEffects = parts.has('effects');
  if (!doCrop && !doEffects) return null;
  const hasEffects = !!(target.silhouette || target.outline || target.sharpen);
  return {
    // Cropping works on the plain image too, so effects come off first
    // either way and are re-applied after.
    resetEffects: hasEffects && (doCrop || doEffects),
    crop: doCrop ? img.crop : undefined,
    effect: doEffects
      ? img.silhouette ? { kind: 'silhouette' }
        : img.outline && img.outline > 0 ? { kind: 'outline', thickness: img.outline }
        : { kind: 'none' }
      : undefined,
    sharpen: doEffects ? img.sharpen : undefined,
  };
}

/**
 * The plain-field half of a paste onto `target` — everything that needs no
 * pixel work. `imageAspect` is the target image's shape AFTER any crop, when
 * one is pasted.
 */
export function layerPatch(
  style: CopiedStyle,
  target: SymbolNode,
  parts: Set<StylePart>,
  imageAspect?: number,
): Partial<SymbolNode> {
  const src = style.layer;
  if (!src) return {};
  const patch: Record<string, unknown> = {};
  if (parts.has('colours')) { patch.fill = src.fill; patch.stroke = src.stroke; }
  if (parts.has('strokeWidth')) patch.strokeWidth = src.strokeWidth;
  if (parts.has('opacity')) patch.opacity = src.opacity;
  if (parts.has('text') && src.text) Object.assign(patch, src.text);

  if (target.type === 'image' && src.image) {
    // Images fit inside the copied box and turn about their centre; see
    // imageLook.sizePatch.
    const aspect = imageAspect ?? (target.width * Math.abs(target.scaleX)) / Math.max(1e-6, target.height * Math.abs(target.scaleY));
    const touchesFrame = parts.has('size') || parts.has('rotation') || parts.has('position') || imageAspect !== undefined;
    if (touchesFrame) {
      Object.assign(patch, sizePatch(target, aspect, src.image.look, {
        size: parts.has('size'),
        rotation: parts.has('rotation'),
        position: parts.has('position'),
      }));
    }
    return patch as Partial<SymbolNode>;
  }

  if (parts.has('size')) {
    Object.assign(patch, src.geometry);
    patch.scaleX = src.scaleX;
    patch.scaleY = src.scaleY;
  }
  if (parts.has('rotation')) patch.rotation = src.rotation;
  if (parts.has('position')) { patch.x = src.x; patch.y = src.y; }
  return patch as Partial<SymbolNode>;
}

/** A one-line summary of what was copied, for the toast and the paste list. */
export function describeCopy(style: CopiedStyle): string {
  const c = `canvas ${style.canvas.width} × ${style.canvas.height}`;
  return style.layer ? `${style.layer.label} + ${c}` : c;
}

const KEY = 'portfolio-symbol-style';
const CHOICE_KEY = 'portfolio-symbol-style-choice';

export function saveStyle(style: CopiedStyle) {
  try { localStorage.setItem(KEY, JSON.stringify(style)); } catch { /* private mode */ }
}

export function loadStyle(): CopiedStyle | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.canvas?.width === 'number' && typeof v?.canvas?.height === 'number' ? v : null;
  } catch {
    return null;
  }
}

export function saveChoice(choice: PartChoice) {
  try { localStorage.setItem(CHOICE_KEY, JSON.stringify(choice)); } catch { /* private mode */ }
}

export function loadChoice(): PartChoice {
  try {
    const v = JSON.parse(localStorage.getItem(CHOICE_KEY) || 'null');
    if (!v || typeof v !== 'object') return DEFAULT_CHOICE;
    const out = { ...DEFAULT_CHOICE };
    for (const k of Object.keys(DEFAULT_CHOICE) as StylePart[]) if (typeof v[k] === 'boolean') out[k] = v[k];
    return out;
  } catch {
    return DEFAULT_CHOICE;
  }
}
