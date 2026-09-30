import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Circle, Star, Line, Transformer, Group, Image as KonvaImage, Text as KonvaText, TextPath as KonvaTextPath } from 'react-konva';
import type Konva from 'konva';
import type {
  SymbolDoc,
  SymbolNode,
  SymbolTool,
  RectNode,
  CircleNode,
  PolygonNode,
  StarNode,
  LineNode,
  PenNode,
  ImageNode,
  TextNode,
} from './types';
import { makeNodeId, docWidth, docHeight } from './types';
import { tintAlphaWithColor } from './silhouette';

interface SymbolCanvasProps {
  doc: SymbolDoc;
  /** Display width in CSS pixels. The stage scales the canvas to it; the
   *  height follows from the canvas's own shape. */
  displaySize: number;
  tool: SymbolTool;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Commit a finished change (pushes to history). */
  onCommit: (next: SymbolDoc | ((prev: SymbolDoc) => SymbolDoc)) => void;
  /** Update without history entry — used during in-progress drag/draw. */
  onSetDoc: (next: SymbolDoc | ((prev: SymbolDoc) => SymbolDoc)) => void;
  /** Cut tool: caller stashes the removed node on its clipboard. */
  onCutNode: (node: SymbolNode) => void;
  /** Show centering guides (crosshair + thirds + frame) overlay. */
  showGuides?: boolean;
  /** When set, only this node renders (others temporarily hidden). UI-only — not persisted to doc. */
  soloId?: string | null;
  /** When true, disable image smoothing so raster nodes stay crisp when upscaled (pixel-art look). */
  pixelPerfect?: boolean;
}

interface DraftShape {
  kind: 'rect' | 'circle' | 'polygon' | 'star' | 'line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface DraftPen {
  points: number[];
}

export const SymbolCanvas: React.FC<SymbolCanvasProps> = ({
  doc,
  displaySize,
  tool,
  fill,
  stroke,
  strokeWidth,
  opacity,
  selectedId,
  onSelect,
  onCommit,
  onCutNode,
  showGuides = true,
  soloId = null,
  pixelPerfect = false,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodesLayerRef = useRef<Konva.Layer>(null);
  const [draftShape, setDraftShape] = useState<DraftShape | null>(null);
  const [draftPen, setDraftPen] = useState<DraftPen | null>(null);

  // Logical → display scale
  const W = docWidth(doc);
  const H = docHeight(doc);
  const scale = displaySize / W;

  // Apply image smoothing on the node layer. Konva's React layer prop covers initial mount,
  // but toggling at runtime needs the imperative call + redraw to take effect.
  useEffect(() => {
    const layer = nodesLayerRef.current;
    if (!layer) return;
    layer.imageSmoothingEnabled(!pixelPerfect);
    layer.batchDraw();
  }, [pixelPerfect, doc.nodes]);

  // Wire transformer to the selected node (by Konva node name = doc node id)
  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    if (!selectedId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = stage.findOne(`#${selectedId}`);
    if (node) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [selectedId, doc.nodes.length]);

  // ── Pointer handling ─────────────────────────────────────
  // All coordinates we work with are in logical (doc.size) space, obtained via getRelativePointerPosition.

  const getLogicalPoint = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }, []);

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const p = getLogicalPoint();
      if (!p) return;

      // Cut: handled by node onClick instead — nothing to do here.
      if (tool === 'cut') return;

      // Move (pan): stage handles its own dragging when draggable. Nothing to do.
      if (tool === 'move') return;

      // Select: clicking empty stage clears selection
      if (tool === 'select') {
        if (e.target === stageRef.current) {
          onSelect(null);
        }
        return;
      }

      // Pen
      if (tool === 'pen') {
        setDraftPen({ points: [p.x, p.y] });
        return;
      }

      // Shape tools
      if (tool === 'rect' || tool === 'circle' || tool === 'polygon' || tool === 'star' || tool === 'line') {
        setDraftShape({ kind: tool, startX: p.x, startY: p.y, endX: p.x, endY: p.y });
        onSelect(null);
        return;
      }

      // Text — click to drop a node at the point with default content; user edits via the style row.
      if (tool === 'text') {
        const node: TextNode = {
          id: makeNodeId(),
          type: 'text',
          x: p.x,
          y: p.y,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity,
          fill: fill && fill !== 'transparent' ? fill : '#1f2937',
          stroke: 'transparent',
          strokeWidth: 0,
          text: 'Text',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 48,
          fontWeight: 500,
        };
        onCommit((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
        onSelect(node.id);
        return;
      }
    },
    [tool, getLogicalPoint, onSelect, fill, opacity, onCommit]
  );

  const handleStageMouseMove = useCallback(() => {
    const p = getLogicalPoint();
    if (!p) return;

    if (draftPen) {
      // Append point if it has moved enough (avoids adjacent duplicates)
      const last = draftPen.points;
      const lx = last[last.length - 2];
      const ly = last[last.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) >= 1) {
        setDraftPen({ points: [...last, p.x, p.y] });
      }
      return;
    }

    if (draftShape) {
      setDraftShape({ ...draftShape, endX: p.x, endY: p.y });
      return;
    }
  }, [draftPen, draftShape, getLogicalPoint]);

  const handleStageMouseUp = useCallback(() => {
    if (draftPen) {
      // Commit pen as a new node — only if it has at least 2 points (4 coord values)
      if (draftPen.points.length >= 4) {
        const id = makeNodeId();
        const node: PenNode = {
          id,
          type: 'pen',
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity,
          fill: 'transparent',
          stroke: stroke || fill,
          strokeWidth: Math.max(2, strokeWidth || 6),
          points: draftPen.points,
          tension: 0.4,
        };
        onCommit((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
        onSelect(id);
      }
      setDraftPen(null);
      return;
    }

    if (draftShape) {
      const node = buildShapeFromDraft(draftShape, fill, stroke, strokeWidth, opacity);
      if (node) {
        onCommit((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
        onSelect(node.id);
      }
      setDraftShape(null);
      return;
    }
  }, [draftPen, draftShape, fill, stroke, strokeWidth, opacity, onCommit, onSelect]);

  // ── Per-node change handlers (drag/transform) ────────────

  const handleNodeChange = useCallback(
    (id: string, patch: Partial<SymbolNode>) => {
      onCommit((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as SymbolNode) : n)),
      }));
    },
    [onCommit]
  );

  const handleNodeClick = useCallback(
    (id: string) => {
      if (tool === 'cut') {
        const node = doc.nodes.find((n) => n.id === id);
        if (node) {
          onCutNode(node);
          onCommit((prev) => ({ ...prev, nodes: prev.nodes.filter((n) => n.id !== id) }));
          if (selectedId === id) onSelect(null);
        }
        return;
      }
      if (tool === 'fill') {
        // Apply current fill color (and stroke if a stroke color is set) to the clicked node
        onCommit((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (n.id !== id) return n;
            const patch: Partial<SymbolNode> = { fill };
            // For pen/line nodes the visible color is "stroke" — recolor that too
            if (n.type === 'pen' || n.type === 'line') patch.stroke = fill;
            return { ...n, ...patch } as SymbolNode;
          }),
        }));
        return;
      }
      if (tool === 'select') {
        onSelect(id);
      }
    },
    [tool, doc.nodes, onCutNode, onCommit, selectedId, onSelect, fill]
  );

  // Selection enabled on select / cut / fill — others let pointer events fall through to stage
  const nodesAreInteractive = tool === 'select' || tool === 'cut' || tool === 'fill';

  return (
    <Stage
      ref={stageRef}
      width={displaySize}
      height={Math.round(H * scale)}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={handleStageMouseDown}
      onTouchStart={handleStageMouseDown}
      onMouseMove={handleStageMouseMove}
      onTouchMove={handleStageMouseMove}
      onMouseUp={handleStageMouseUp}
      onTouchEnd={handleStageMouseUp}
      style={{ background: doc.background.kind === 'solid' ? doc.background.color : 'transparent', cursor: cursorFor(tool) }}
    >
      <Layer listening={false}>
        {/* Checkerboard background for transparent canvases — only when bg is transparent */}
        {doc.background.kind === 'transparent' && (
          <Group>
            <Rect x={0} y={0} width={W} height={H} fill="#ffffff" />
            <CheckerPattern width={W} height={H} />
          </Group>
        )}
        {showGuides && <Guides width={W} height={H} />}
      </Layer>

      <Layer ref={nodesLayerRef} imageSmoothingEnabled={!pixelPerfect}>
        {doc.nodes.map((n) =>
          (n.hidden || (soloId && n.id !== soloId)) ? null : (
            <NodeRenderer
              key={n.id}
              node={n}
              interactive={nodesAreInteractive && !n.locked}
              onClick={() => handleNodeClick(n.id)}
              onChange={(patch) => handleNodeChange(n.id, patch)}
              draggable={tool === 'select' && !n.locked}
            />
          )
        )}

        {/* In-flight drafts (no commit yet) */}
        {draftShape && <DraftShapeNode draft={draftShape} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />}
        {draftPen && (
          <Line
            points={draftPen.points}
            stroke={stroke || fill}
            strokeWidth={Math.max(2, strokeWidth || 6)}
            tension={0.4}
            lineCap="round"
            lineJoin="round"
            opacity={opacity}
            listening={false}
          />
        )}

        {/* Transformer */}
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={[
            'top-left', 'top-right', 'bottom-left', 'bottom-right',
            'middle-left', 'middle-right', 'top-center', 'bottom-center',
          ]}
          anchorSize={14}
          anchorCornerRadius={3}
          borderStroke="#7c4ad9"
          anchorStroke="#7c4ad9"
          anchorFill="#fff"
        />
      </Layer>
    </Stage>
  );
};

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function cursorFor(tool: SymbolTool): string {
  switch (tool) {
    case 'pen': return 'crosshair';
    case 'cut': return 'cell';
    case 'rect':
    case 'circle':
    case 'polygon':
    case 'star':
    case 'line':
      return 'crosshair';
    case 'text': return 'text';
    case 'move': return 'grab';
    case 'select': return 'default';
    default: return 'default';
  }
}

function buildShapeFromDraft(
  d: DraftShape,
  fill: string,
  stroke: string,
  strokeWidth: number,
  opacity: number
): SymbolNode | null {
  const minX = Math.min(d.startX, d.endX);
  const minY = Math.min(d.startY, d.endY);
  const w = Math.abs(d.endX - d.startX);
  const h = Math.abs(d.endY - d.startY);
  if (w < 2 && h < 2) return null;
  const id = makeNodeId();
  const base = {
    id,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity,
    fill,
    stroke,
    strokeWidth,
  } as const;

  if (d.kind === 'rect') {
    const node: RectNode = { ...base, type: 'rect', x: minX, y: minY, width: w, height: h, cornerRadius: 0 };
    return node;
  }
  if (d.kind === 'circle') {
    const r = Math.max(w, h) / 2;
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    const node: CircleNode = { ...base, type: 'circle', x: cx, y: cy, radius: r };
    return node;
  }
  if (d.kind === 'polygon') {
    const r = Math.max(w, h) / 2;
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    const node: PolygonNode = { ...base, type: 'polygon', x: cx, y: cy, sides: 6, radius: r };
    return node;
  }
  if (d.kind === 'star') {
    const r = Math.max(w, h) / 2;
    const cx = minX + w / 2;
    const cy = minY + h / 2;
    const node: StarNode = { ...base, type: 'star', x: cx, y: cy, numPoints: 5, innerRadius: r * 0.45, outerRadius: r };
    return node;
  }
  if (d.kind === 'line') {
    const node: LineNode = {
      ...base,
      type: 'line',
      x: 0,
      y: 0,
      points: [d.startX, d.startY, d.endX, d.endY],
      closed: false,
      fill: 'transparent',
      stroke: stroke || fill,
      strokeWidth: Math.max(2, strokeWidth),
    };
    return node;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// Node renderer — dispatches by type
// ──────────────────────────────────────────────────────────────

interface NodeRendererProps {
  node: SymbolNode;
  interactive: boolean;
  draggable: boolean;
  onClick: () => void;
  onChange: (patch: Partial<SymbolNode>) => void;
}

const NodeRenderer: React.FC<NodeRendererProps> = ({ node, interactive, draggable, onClick, onChange }) => {
  // For all leaf nodes we set Konva id = doc id (Stage.findOne(#id) wires up the Transformer).
  const common = {
    id: node.id,
    name: node.id,
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    opacity: node.opacity,
    fill: node.fill,
    stroke: node.stroke,
    strokeWidth: node.strokeWidth,
    listening: interactive,
    draggable,
    onClick,
    onTap: onClick,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onChange({ x: e.target.x(), y: e.target.y() }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      onChange({
        x: n.x(),
        y: n.y(),
        rotation: n.rotation(),
        scaleX: n.scaleX(),
        scaleY: n.scaleY(),
      });
    },
  };

  switch (node.type) {
    case 'rect':
      return (
        <Rect
          {...common}
          width={node.width}
          height={node.height}
          cornerRadius={node.cornerRadius}
        />
      );
    case 'circle':
      return <Circle {...common} radius={node.radius} />;
    case 'polygon':
      return (
        <Line
          {...common}
          points={polygonPoints(node.sides, node.radius)}
          closed
        />
      );
    case 'star':
      return (
        <Star
          {...common}
          numPoints={node.numPoints}
          innerRadius={node.innerRadius}
          outerRadius={node.outerRadius}
        />
      );
    case 'line': {
      const renderPoints = node.curvature
        ? quadBezierSampled(node.points, node.curvature)
        : node.points;
      return (
        <Line
          {...common}
          points={renderPoints}
          closed={node.closed}
          fill={node.closed ? node.fill : undefined}
          stroke={node.stroke || node.fill}
          strokeWidth={Math.max(1, node.strokeWidth)}
          lineCap="round"
          lineJoin="round"
        />
      );
    }
    case 'pen':
      return (
        <Line
          {...common}
          points={node.points}
          stroke={node.stroke || node.fill}
          strokeWidth={node.strokeWidth}
          tension={node.tension}
          lineCap="round"
          lineJoin="round"
          fill={undefined}
        />
      );
    case 'image':
      return <ImageRenderer node={node} common={common} />;
    case 'text': {
      // Konva uses fontStyle for bold/italic. We map weight ≥ 600 to bold; italic deferred.
      const fontStyle = node.fontWeight >= 600 ? 'bold' : 'normal';
      const curvature = node.curvature ?? 0;
      if (curvature !== 0 && node.text) {
        // baseY ≈ 80% of fontSize approximates Konva.Text's top→baseline distance,
        // so toggling curvature doesn't visually jump the text far from its straight position.
        // The × 1.1 pad on width keeps the last glyph from being clipped on wider fonts.
        const approxWidth = Math.max(1, node.text.length * node.fontSize * 0.55) * 1.1;
        const baseY = node.fontSize * 0.8;
        const ctrlY = baseY + curvature * approxWidth * 0.4;
        const pathData = `M 0 ${baseY} Q ${approxWidth / 2} ${ctrlY} ${approxWidth} ${baseY}`;
        return (
          <KonvaTextPath
            {...common}
            data={pathData}
            text={node.text}
            fontFamily={node.fontFamily}
            fontSize={node.fontSize}
            fontStyle={fontStyle}
          />
        );
      }
      return (
        <KonvaText
          {...common}
          text={node.text}
          fontFamily={node.fontFamily}
          fontSize={node.fontSize}
          fontStyle={fontStyle}
          stroke={node.strokeWidth > 0 ? node.stroke : undefined}
          strokeWidth={node.strokeWidth > 0 ? node.strokeWidth : 0}
        />
      );
    }
  }
};

// Image node renderer — loads HTMLImageElement async, renders nothing until ready.
// For silhouette/outline images, the src is a white-alpha mask and is tinted to node.fill
// at display time (re-tints when fill changes, debounced for slider drags).
const ImageRenderer: React.FC<{ node: ImageNode; common: Omit<React.ComponentProps<typeof KonvaImage>, 'image'> }> = ({ node, common }) => {
  // The last image that finished loading. Kept while a new tint renders, so a
  // colour drag doesn't flash empty between frames.
  const [loaded, setImg] = useState<HTMLImageElement | null>(null);
  const img = node.src ? loaded : null;
  const tinted = !!(node.silhouette || (node.outline && node.outline > 0));

  useEffect(() => {
    if (!node.src) return;
    let cancelled = false;
    if (!tinted) {
      const i = new Image();
      i.onload = () => { if (!cancelled) setImg(i); };
      i.onerror = () => { if (!cancelled) setImg(null); };
      i.src = node.src;
      return () => { cancelled = true; };
    }
    // Tinted path: debounce so rapid slider color changes don't process the full image per frame.
    const timer = window.setTimeout(() => {
      tintAlphaWithColor(node.src, node.fill || '#000000').then((dataUrl) => {
        if (cancelled) return;
        const i = new Image();
        i.onload = () => { if (!cancelled) setImg(i); };
        i.onerror = () => { if (!cancelled) setImg(null); };
        i.src = dataUrl;
      }).catch(() => { /* ignore */ });
    }, 40);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [node.src, node.fill, tinted]);

  if (!img) return null;
  return <KonvaImage {...common} image={img} width={node.width} height={node.height} fill={undefined} />;
};

// Guides: subtle center crosshair, rule-of-thirds, and frame outline. UI-only, never exported.
const Guides: React.FC<{ width: number; height: number }> = ({ width: w, height: h }) => {
  // Line weights are keyed to the longer side, so they look the same on a
  // wide canvas as on a square one of the same size.
  const size = Math.max(w, h);
  const guideColor = 'rgba(124, 74, 217, 0.55)';
  const subtle = 'rgba(124, 74, 217, 0.22)';
  const dash = [Math.max(4, size * 0.012), Math.max(4, size * 0.012)];
  const thin = Math.max(0.5, size / 1024);
  return (
    <Group>
      {/* Frame outline (1-px in display = 1/scale in doc coords; use a small stroke) */}
      <Rect x={0} y={0} width={w} height={h} stroke={subtle} strokeWidth={Math.max(0.5, size / 512)} />
      {/* Rule of thirds */}
      <Line points={[w / 3, 0, w / 3, h]} stroke={subtle} strokeWidth={thin} dash={dash} />
      <Line points={[(w * 2) / 3, 0, (w * 2) / 3, h]} stroke={subtle} strokeWidth={thin} dash={dash} />
      <Line points={[0, h / 3, w, h / 3]} stroke={subtle} strokeWidth={thin} dash={dash} />
      <Line points={[0, (h * 2) / 3, w, (h * 2) / 3]} stroke={subtle} strokeWidth={thin} dash={dash} />
      {/* Center crosshair (more visible) */}
      <Line points={[w / 2, 0, w / 2, h]} stroke={guideColor} strokeWidth={Math.max(0.6, size / 768)} dash={dash} />
      <Line points={[0, h / 2, w, h / 2]} stroke={guideColor} strokeWidth={Math.max(0.6, size / 768)} dash={dash} />
      {/* Center dot */}
      <Circle x={w / 2} y={h / 2} radius={Math.max(2, size / 96)} fill={guideColor} />
    </Group>
  );
};

function polygonPoints(sides: number, radius: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  return pts;
}

// Sample a quadratic Bezier between the first and last point of `points`,
// with a control point offset perpendicular by `curvature * length / 2`.
function quadBezierSampled(points: number[], curvature: number, segments = 28): number[] {
  if (points.length < 4) return points;
  const x1 = points[0], y1 = points[1];
  const x2 = points[points.length - 2], y2 = points[points.length - 1];
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return points;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const px = -dy / len, py = dx / len;
  const offset = curvature * len * 0.5;
  const cx = mx + px * offset;
  const cy = my + py * offset;
  const out: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    out.push(u * u * x1 + 2 * u * t * cx + t * t * x2);
    out.push(u * u * y1 + 2 * u * t * cy + t * t * y2);
  }
  return out;
}

// In-flight shape preview — rendered while the user drags
const DraftShapeNode: React.FC<{ draft: DraftShape; fill: string; stroke: string; strokeWidth: number; opacity: number }> = ({ draft, fill, stroke, strokeWidth, opacity }) => {
  const minX = Math.min(draft.startX, draft.endX);
  const minY = Math.min(draft.startY, draft.endY);
  const w = Math.abs(draft.endX - draft.startX);
  const h = Math.abs(draft.endY - draft.startY);
  const cx = minX + w / 2;
  const cy = minY + h / 2;
  const r = Math.max(w, h) / 2;

  if (draft.kind === 'rect') {
    return <Rect x={minX} y={minY} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity * 0.7} listening={false} />;
  }
  if (draft.kind === 'circle') {
    return <Circle x={cx} y={cy} radius={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity * 0.7} listening={false} />;
  }
  if (draft.kind === 'polygon') {
    return <Line x={cx} y={cy} points={polygonPoints(6, r)} closed fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity * 0.7} listening={false} />;
  }
  if (draft.kind === 'star') {
    return <Star x={cx} y={cy} numPoints={5} innerRadius={r * 0.45} outerRadius={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity * 0.7} listening={false} />;
  }
  if (draft.kind === 'line') {
    return (
      <Line
        points={[draft.startX, draft.startY, draft.endX, draft.endY]}
        stroke={stroke || fill}
        strokeWidth={Math.max(2, strokeWidth)}
        opacity={opacity * 0.7}
        listening={false}
        lineCap="round"
      />
    );
  }
  return null;
};

// Lightweight checkerboard for transparent backgrounds
const CheckerPattern: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const cell = Math.max(8, Math.max(width, height) / 32);
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const tiles: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) continue;
      tiles.push(<Rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#e5e7eb" />);
    }
  }
  return <>{tiles}</>;
};
