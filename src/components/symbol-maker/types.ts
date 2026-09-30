// Symbol maker — data model.
// SymbolDoc is the single source of truth: serializable JSON, drives Konva render and exports.

export type SymbolNodeType =
  | 'rect'
  | 'circle'
  | 'polygon'
  | 'star'
  | 'line'
  | 'pen'
  | 'image'
  | 'text';

export interface BaseNode {
  id: string;
  type: SymbolNodeType;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  locked?: boolean;
  hidden?: boolean;
  /** Optional human label shown in the Layers panel. Falls back to type label when absent. */
  name?: string;
}

export interface RectNode extends BaseNode {
  type: 'rect';
  width: number;
  height: number;
  cornerRadius: number;
}

export interface CircleNode extends BaseNode {
  type: 'circle';
  radius: number;
}

export interface PolygonNode extends BaseNode {
  type: 'polygon';
  sides: number;
  radius: number;
}

export interface StarNode extends BaseNode {
  type: 'star';
  numPoints: number;
  innerRadius: number;
  outerRadius: number;
}

export interface LineNode extends BaseNode {
  type: 'line';
  points: number[];
  closed: boolean;
  /** -1..1, perpendicular bow as a fraction of line length. 0 = straight. */
  curvature?: number;
}

export interface PenNode extends BaseNode {
  type: 'pen';
  points: number[];
  tension: number;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  src: string;
  width: number;
  height: number;
  /** Pre-conversion source kept around so silhouette/outline can be reverted. */
  origSrc?: string;
  /** When true, src is treated as a white-on-transparent alpha mask and tinted with `fill` at render. */
  silhouette?: boolean;
  /** Outline thickness in pixels (only when src is a boundary-band mask). 0/undefined = not outline. */
  outline?: number;
  /** Current sharpen amount (0 = none). Slider re-applies to preSharpenSrc each step. */
  sharpen?: number;
  /** Source bitmap as it was before sharpen was first applied. */
  preSharpenSrc?: string;
  /** The crop baked into `src`, as fractions of the image before any crop —
   *  kept so "Copy size & crop" can frame another image the same way. */
  crop?: { x: number; y: number; w: number; h: number };
}

export interface TextNode extends BaseNode {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  /** -1..1, perpendicular bow as a fraction of approximate text width. 0 = straight. */
  curvature?: number;
}

export type SymbolNode =
  | RectNode
  | CircleNode
  | PolygonNode
  | StarNode
  | LineNode
  | PenNode
  | ImageNode
  | TextNode;

export interface SymbolDoc {
  version: 1;
  /** Canvas WIDTH in px. Named `size` from when every canvas was square. */
  size: number;
  /** Canvas height in px. Absent means square — which is every symbol saved
   *  before canvases could be any shape, so old documents load unchanged. */
  height?: number;
  background: { kind: 'transparent' } | { kind: 'solid'; color: string };
  nodes: SymbolNode[]; // z-order = array order; index 0 is bottom
}

export const docWidth = (doc: Pick<SymbolDoc, 'size'>) => doc.size;
export const docHeight = (doc: Pick<SymbolDoc, 'size' | 'height'>) => doc.height ?? doc.size;

/** How far every layer moves when the canvas goes from `from` to `to`
 *  around its centre. */
export const canvasShift = (from: Pick<SymbolDoc, 'size' | 'height'>, width: number, height: number) => ({
  dx: (width - docWidth(from)) / 2,
  dy: (height - docHeight(from)) / 2,
});

/**
 * Resize the canvas about its CENTRE: every layer moves by the same amount,
 * so the artwork keeps its place relative to the middle and to each other.
 * Anchoring at the top-left instead left a centred symbol hanging off the
 * edge whenever a square canvas became a wide one. A square is stored as
 * just `size`, the way it always was.
 */
export const withCanvasSize = <T extends SymbolDoc>(doc: T, width: number, height: number): T => {
  const { dx, dy } = canvasShift(doc, width, height);
  const next = {
    ...doc,
    size: width,
    nodes: dx || dy ? doc.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })) : doc.nodes,
  };
  if (height === width) delete next.height; else next.height = height;
  return next;
};

export const DEFAULT_DOC: SymbolDoc = {
  version: 1,
  size: 512,
  background: { kind: 'transparent' },
  nodes: [],
};

export const COMMON_SIZES: { px: number; label: string }[] = [
  { px: 192, label: '192' },
  { px: 256, label: '256' },
  { px: 512, label: '512' },
  { px: 1024, label: '1024' },
];

// Tools the toolbar exposes. Drives canvas behavior.
export type SymbolTool =
  | 'select'
  | 'move' // pan
  | 'pen'
  | 'cut' // delete-to-clipboard
  | 'fill' // paint bucket — click node to recolor with current color
  | 'rect'
  | 'circle'
  | 'polygon'
  | 'star'
  | 'line'
  | 'text';

export const TOOL_LABELS: Record<SymbolTool, string> = {
  select: 'Select',
  move: 'Pan',
  pen: 'Pen',
  cut: 'Cut',
  fill: 'Paint fill',
  rect: 'Rectangle',
  circle: 'Circle',
  polygon: 'Polygon',
  star: 'Star',
  line: 'Line',
  text: 'Text',
};

// Curated system-safe font stacks. Google Fonts can be added later by inserting
// a stylesheet link and appending to this list — TextNode.fontFamily is just a string.
export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times' },
  { value: '"Courier New", Courier, monospace', label: 'Courier' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet' },
  { value: 'Impact, "Arial Black", sans-serif', label: 'Impact' },
  { value: '"Comic Sans MS", cursive', label: 'Comic Sans' },
];

// Helper: shallow new-id generator (avoids importing project utils to keep this folder self-contained)
export function makeNodeId(): string {
  return 'n_' + Math.random().toString(36).slice(2, 10);
}

// Defaults for new shape nodes (caller fills in x/y/size from drag interaction)
export function defaultStyle(fill: string, stroke: string, strokeWidth: number): Pick<BaseNode, 'fill' | 'stroke' | 'strokeWidth' | 'opacity' | 'rotation' | 'scaleX' | 'scaleY'> {
  return {
    fill,
    stroke,
    strokeWidth,
    opacity: 1,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };
}
