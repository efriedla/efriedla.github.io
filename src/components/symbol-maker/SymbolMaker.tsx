import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SymbolCanvas } from './SymbolCanvas';
import { SymbolToolbar } from './SymbolToolbar';
import { SymbolTopBar } from './SymbolTopBar';
import { LayersPanel } from './LayersPanel';
import { BgRemoveModal } from './BgRemoveModal';
import { SliceImageModal, SliceResult } from './SliceImageModal';
import { CropImageModal } from './CropImageModal';
import { DownloadDialog } from './DownloadDialog';
import { sharpenImage } from './sharpenImage';
import { nearestNeighborResample } from './resampleImage';
import { useSymbolHistory } from './useSymbolHistory';
import {
  DEFAULT_DOC,
  SymbolDoc,
  SymbolNode,
  SymbolTool,
  ImageNode,
  makeNodeId,
  FONT_OPTIONS,
  docWidth,
  docHeight,
  withCanvasSize,
  canvasShift,
} from './types';
import { makeWhiteAlphaMask, makeOutlineMask } from './silhouette';
import { CropFrac, composeCrop, fromFrac } from './imageLook';
import {
  CopiedStyle, PartChoice, activeParts, canvasPatch, copyStyle, describeCopy, imagePlan, layerPatch,
  loadChoice, loadStyle, saveChoice, saveStyle,
} from './styleClipboard';
import { StylePastePanel } from './StylePastePanel';
import { cropToDataUrl, loadImage } from './cropImage';
import './SymbolMaker.css';
import { CAN_READ_CLIPBOARD, blobToDataUrl } from '@/lib/clipboardImage';

const DEFAULT_OUTLINE_THICKNESS = 4;

interface SymbolMakerProps {
  /** Restore an existing doc to edit. */
  initial?: SymbolDoc | null;
  /** Persistence key in localStorage so the editor restores when reopened. */
  storageKey?: string;
  title?: string;
}

const FG_SWATCHES = ['#7c4ad9', '#000000', '#1f2937', '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#ffffff'];

function useIsNarrow(query = '(max-width: 768px)') {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return narrow;
}

export const SymbolMaker: React.FC<SymbolMakerProps> = ({
  initial,
  storageKey,
  title = 'Symbol maker',
}) => {
  const isMobile = useIsNarrow();

  // A short confirmation line under the canvas ("Copied…", "Downloaded…").
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const showStatus = useCallback((text: string, error = false) => setStatus({ text, error }), []);
  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 2600);
    return () => window.clearTimeout(t);
  }, [status]);

  // Restore from storageKey if no explicit initial provided
  const startingDoc: SymbolDoc = useMemo(() => {
    if (initial) return initial;
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as SymbolDoc;
          if (parsed && parsed.version === 1 && Array.isArray(parsed.nodes)) return parsed;
        }
      } catch { /* ignore */ }
    }
    return DEFAULT_DOC;
  }, [initial, storageKey]);

  const history = useSymbolHistory(startingDoc);
  const { doc, commit, undo, redo, canUndo, canRedo } = history;

  const [tool, setTool] = useState<SymbolTool>('select');
  const [fill, setFill] = useState('#7c4ad9');
  const [stroke, setStroke] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [colorTarget, setColorTarget] = useState<'fill' | 'stroke'>('fill');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Remember last non-transparent fill so switching back from Stroke (outline-only) restores a sensible color.
  const lastFillRef = useRef('#7c4ad9');
  const [showGuides, setShowGuides] = useState(true);
  const clipboardRef = useRef<SymbolNode | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [stageDisplay, setStageDisplay] = useState(480);

  const [bgRemoveSrc, setBgRemoveSrc] = useState<string | null>(null);
  const bgRemoveTargetIdRef = useRef<string | null>(null);

  const [sliceTargetId, setSliceTargetId] = useState<string | null>(null);
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const [soloPick, setSoloId] = useState<string | null>(null);
  // Solo lapses by itself when the soloed layer goes (delete / replace via slice).
  const soloId = soloPick && doc.nodes.some((n) => n.id === soloPick) ? soloPick : null;
  const [pixelPerfect, setPixelPerfect] = useState(false);

  // Sharpen slider state — local UI value, debounced before applying the convolution.
  // While dragging it shows the dragged value; otherwise the selected image's own amount.
  const [sharpenDrag, setSharpenDrag] = useState<{ id: string | null; value: number } | null>(null);
  const selectedNode = doc.nodes.find((n) => n.id === selectedId);
  const sharpenSlider = sharpenDrag && sharpenDrag.id === selectedId
    ? sharpenDrag.value
    : selectedNode?.type === 'image' ? (selectedNode.sharpen ?? 0) : 0;
  const sharpenTimerRef = useRef<number | null>(null);
  const sharpenJobIdRef = useRef(0);

  const handleSoloToggle = useCallback((id: string) => {
    setSoloId((prev) => (prev === id ? null : id));
    setSelectedId(id);
  }, []);

  // Custom font dropdown — native <option> ignores font-family in Chromium/Firefox,
  // so we render our own popover and style each item in its own font.
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fontMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!fontMenuRef.current?.contains(e.target as Node)) setFontMenuOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [fontMenuOpen]);

  // Persist doc to localStorage on change
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(doc)); } catch { /* ignore */ }
  }, [doc, storageKey]);

  // Compute display size from container. Re-runs when the canvas changes
  // shape, since a wide canvas fits a different width than a tall one.
  const canvasAspect = docWidth(doc) / docHeight(doc);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      // The largest display WIDTH at which the whole canvas fits both ways.
      const s = Math.max(160, Math.min(r.width - 32, (r.height - 32) * canvasAspect, 720));
      setStageDisplay(Math.round(s));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasAspect]);

  // ── Operations ─────────────────────────────────────────

  const handleNodeChange = useCallback((id: string, patch: Partial<SymbolNode>) => {
    commit((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as SymbolNode) : n)),
    }));
  }, [commit]);

  const handleMove = useCallback((id: string, direction: 'up' | 'down') => {
    commit((prev) => {
      const idx = prev.nodes.findIndex((n) => n.id === id);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx + 1 : idx - 1;
      if (target < 0 || target >= prev.nodes.length) return prev;
      const nodes = [...prev.nodes];
      [nodes[idx], nodes[target]] = [nodes[target], nodes[idx]];
      return { ...prev, nodes };
    });
  }, [commit]);

  const handleDuplicate = useCallback((id: string) => {
    commit((prev) => {
      const node = prev.nodes.find((n) => n.id === id);
      if (!node) return prev;
      const clone: SymbolNode = { ...node, id: makeNodeId(), x: node.x + 12, y: node.y + 12 };
      const idx = prev.nodes.findIndex((n) => n.id === id);
      const nodes = [...prev.nodes];
      nodes.splice(idx + 1, 0, clone);
      return { ...prev, nodes };
    });
  }, [commit]);

  const handleDelete = useCallback((id: string) => {
    commit((prev) => ({ ...prev, nodes: prev.nodes.filter((n) => n.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }, [commit, selectedId]);

  const handleCutNode = useCallback((node: SymbolNode) => {
    clipboardRef.current = node;
    setHasClipboard(true);
  }, []);

  // Add an image-from-data-url as a centered ImageNode, respecting natural dimensions.
  // Source is downscaled if huge (> 1024 px on longest dim) to keep the doc compact and BG-removal fast.
  const addImageFromDataUrl = useCallback((dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const MAX_SRC_DIM = 1024;
      let src = dataUrl;
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      if (longest > MAX_SRC_DIM) {
        const k = MAX_SRC_DIM / longest;
        const sw = Math.round(img.naturalWidth * k);
        const sh = Math.round(img.naturalHeight * k);
        const c = document.createElement('canvas');
        c.width = sw;
        c.height = sh;
        c.getContext('2d')!.drawImage(img, 0, 0, sw, sh);
        src = c.toDataURL('image/png');
      }
      const cw = docWidth(doc);
      const ch = docHeight(doc);
      const max = Math.min(cw, ch) * 0.6;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, img.naturalWidth * scale);
      const h = Math.max(1, img.naturalHeight * scale);
      const node: ImageNode = {
        id: makeNodeId(),
        type: 'image',
        x: (cw - w) / 2,
        y: (ch - h) / 2,
        width: w,
        height: h,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        fill: 'transparent',
        stroke: 'transparent',
        strokeWidth: 0,
        src,
      };
      commit((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
      setSelectedId(node.id);
      setTool('select');
    };
    img.onerror = () => showStatus('That file isn’t an image this browser can open', true);
    img.src = dataUrl;
  }, [doc, commit, showStatus]);

  // Files come from the Add image picker or a drop onto the canvas.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addImageFiles = useCallback((files: FileList | null) => {
    const file = files && Array.from(files).find((f) => f.type.startsWith('image/'));
    if (!file) { if (files?.length) showStatus('Only image files can be added', true); return; }
    blobToDataUrl(file).then(addImageFromDataUrl, () => showStatus('Could not read that file', true));
  }, [addImageFromDataUrl, showStatus]);
  const [dragOver, setDragOver] = useState(false);

  // Paste internal node (cut/copy clipboard)
  const pasteInternalNode = useCallback(() => {
    const c = clipboardRef.current;
    if (!c) return false;
    const clone: SymbolNode = { ...c, id: makeNodeId(), x: c.x + 16, y: c.y + 16 };
    commit((prev) => ({ ...prev, nodes: [...prev.nodes, clone] }));
    setSelectedId(clone.id);
    return true;
  }, [commit]);

  // Topbar paste button — try OS clipboard async, fall back to internal
  const handlePaste = useCallback(async () => {
    if (CAN_READ_CLIPBOARD) {
      try {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const t = it.types.find((type) => type.startsWith('image/'));
          if (t) {
            addImageFromDataUrl(await blobToDataUrl(await it.getType(t)));
            return;
          }
        }
      } catch { /* permission denied or no image — fall through */ }
    }
    if (!pasteInternalNode()) showStatus('No image on the clipboard — copy one, or press Ctrl/Cmd+V', true);
  }, [addImageFromDataUrl, pasteInternalNode, showStatus]);

  const handleClear = useCallback(() => {
    if (doc.nodes.length === 0) return;
    if (!confirm('Clear the canvas? This can be undone.')) return;
    commit((prev) => ({ ...prev, nodes: [] }));
    setSelectedId(null);
  }, [commit, doc.nodes.length]);

  const handleSizeChange = useCallback((width: number, height: number) => {
    // Resizing does NOT scale layers; it grows or shrinks the canvas about its
    // centre, so they keep their place relative to the middle (see withCanvasSize).
    commit((prev) => withCanvasSize(prev, width, height));
  }, [commit]);

  const DEFAULT_STROKE_WIDTH = 4;

  const handleColorPick = useCallback((hex: string) => {
    if (selectedId) {
      const sel = doc.nodes.find((n) => n.id === selectedId);
      if (colorTarget === 'fill') {
        handleNodeChange(selectedId, { fill: hex });
      } else {
        // Picking a stroke color — bump strokeWidth from 0 so the change is visible
        const patch: Partial<SymbolNode> = { stroke: hex };
        if (sel && (!sel.strokeWidth || sel.strokeWidth === 0)) patch.strokeWidth = DEFAULT_STROKE_WIDTH;
        handleNodeChange(selectedId, patch);
      }
    } else if (colorTarget === 'fill') {
      setFill(hex);
    } else {
      setStroke(hex);
      if (strokeWidth === 0) setStrokeWidth(DEFAULT_STROKE_WIDTH);
    }
    // Track last non-transparent fill so we can restore it when switching back from Stroke mode
    if (colorTarget === 'fill' && hex !== 'transparent') lastFillRef.current = hex;
  }, [selectedId, colorTarget, doc.nodes, handleNodeChange, strokeWidth]);

  // Switching the color target to "Stroke" means outline-only mode: clear fill and ensure stroke is visible.
  // Switching back to "Fill" restores the fill from the last non-transparent fill color.
  // For text nodes this produces outlined glyphs (Konva.Text/TextPath stroke + paint-order in SVG).
  const handleColorTargetChange = useCallback((target: 'fill' | 'stroke') => {
    setColorTarget(target);
    if (target === 'stroke') {
      if (selectedId) {
        const sel = doc.nodes.find((n) => n.id === selectedId);
        if (sel && sel.fill && sel.fill !== 'transparent') lastFillRef.current = sel.fill;
        const patch: Partial<SymbolNode> = { fill: 'transparent' };
        if (sel && (!sel.strokeWidth || sel.strokeWidth === 0)) patch.strokeWidth = DEFAULT_STROKE_WIDTH;
        if (sel && (!sel.stroke || sel.stroke === 'transparent')) patch.stroke = stroke && stroke !== 'transparent' ? stroke : '#000000';
        handleNodeChange(selectedId, patch);
      } else {
        if (fill !== 'transparent') lastFillRef.current = fill;
        setFill('transparent');
        if (strokeWidth === 0) setStrokeWidth(DEFAULT_STROKE_WIDTH);
        if (stroke === 'transparent') setStroke('#000000');
      }
    } else {
      const restore = lastFillRef.current || '#7c4ad9';
      if (selectedId) {
        const sel = doc.nodes.find((n) => n.id === selectedId);
        if (sel && (!sel.fill || sel.fill === 'transparent')) {
          handleNodeChange(selectedId, { fill: restore });
        }
      } else if (fill === 'transparent') {
        setFill(restore);
      }
    }
  }, [selectedId, doc.nodes, handleNodeChange, fill, stroke, strokeWidth]);

  // "None" — clear fill or stroke depending on which target is active.
  // Removing fill auto-bumps strokeWidth so the shape stays visible.
  const handlePickNone = useCallback(() => {
    if (selectedId) {
      const sel = doc.nodes.find((n) => n.id === selectedId);
      if (colorTarget === 'fill') {
        const patch: Partial<SymbolNode> = { fill: 'transparent' };
        if (sel && (!sel.strokeWidth || sel.strokeWidth === 0)) patch.strokeWidth = DEFAULT_STROKE_WIDTH;
        handleNodeChange(selectedId, patch);
      } else {
        handleNodeChange(selectedId, { stroke: 'transparent', strokeWidth: 0 });
      }
    } else if (colorTarget === 'fill') {
      setFill('transparent');
      if (strokeWidth === 0) setStrokeWidth(DEFAULT_STROKE_WIDTH);
    } else {
      setStroke('transparent');
      setStrokeWidth(0);
    }
  }, [selectedId, colorTarget, doc.nodes, handleNodeChange, strokeWidth]);

  const handleStrokeWidthChange = useCallback((w: number) => {
    if (selectedId) {
      handleNodeChange(selectedId, { strokeWidth: w });
    } else {
      setStrokeWidth(w);
    }
  }, [selectedId, handleNodeChange]);

  const handleOpacityChange = useCallback((o: number) => {
    if (selectedId) {
      handleNodeChange(selectedId, { opacity: o });
    } else {
      setOpacity(o);
    }
  }, [selectedId, handleNodeChange]);

  // Convert the selected image to a tinted silhouette: replace src with a white-alpha mask,
  // mark the node so the canvas tints it live and SVG export uses the mask trick.
  const handleConvertToSilhouette = useCallback(async () => {
    if (!selectedId) return;
    const sel = doc.nodes.find((n) => n.id === selectedId);
    if (!sel || sel.type !== 'image') return;
    try {
      const origSrc = sel.origSrc ?? sel.src;
      const maskUrl = await makeWhiteAlphaMask(origSrc);
      commit((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === selectedId && n.type === 'image'
            ? { ...n, origSrc, src: maskUrl, silhouette: true, outline: undefined, fill: n.fill && n.fill !== 'transparent' ? n.fill : fill }
            : n
        ),
      }));
    } catch { /* ignore */ }
  }, [selectedId, doc.nodes, commit, fill]);

  const handleConvertToOutline = useCallback(async (thickness: number = DEFAULT_OUTLINE_THICKNESS) => {
    if (!selectedId) return;
    const sel = doc.nodes.find((n) => n.id === selectedId);
    if (!sel || sel.type !== 'image') return;
    try {
      const origSrc = sel.origSrc ?? sel.src;
      const maskUrl = await makeOutlineMask(origSrc, thickness);
      commit((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === selectedId && n.type === 'image'
            ? { ...n, origSrc, src: maskUrl, outline: thickness, silhouette: false, fill: n.fill && n.fill !== 'transparent' ? n.fill : fill }
            : n
        ),
      }));
    } catch { /* ignore */ }
  }, [selectedId, doc.nodes, commit, fill]);

  // Open the splice modal for the selected image (no-op if selection isn't an image).
  const handleOpenSlice = useCallback(() => {
    if (!selectedId) return;
    const sel = doc.nodes.find((n) => n.id === selectedId);
    if (!sel || sel.type !== 'image') return;
    setSliceTargetId(selectedId);
  }, [selectedId, doc.nodes]);

  // Apply a slice: replace the source image with one ImageNode per cell.
  // Cells are laid out in a grid centered on the canvas (preserving the original col/row order),
  // each tile sized to fit the canvas, so every sprite is immediately usable.
  const handleSliceApply = useCallback((result: SliceResult) => {
    const targetId = sliceTargetId;
    if (!targetId) { setSliceTargetId(null); return; }
    const source = doc.nodes.find((n) => n.id === targetId);
    if (!source || source.type !== 'image') { setSliceTargetId(null); return; }

    const { cells, deleteOriginal } = result;
    if (cells.length === 0) { setSliceTargetId(null); return; }

    const cols = Math.max(...cells.map((c) => c.col)) + 1;
    const rows = Math.max(...cells.map((c) => c.row)) + 1;
    const cw = docWidth(doc);
    const ch = docHeight(doc);
    const pad = Math.min(cw, ch) * 0.05;
    const tileSize = Math.min((cw - 2 * pad) / cols, (ch - 2 * pad) / rows);
    const gridW = tileSize * cols;
    const gridH = tileSize * rows;
    const startX = (cw - gridW) / 2;
    const startY = (ch - gridH) / 2;

    const newNodes: ImageNode[] = cells.map((cell, i) => {
      const aspect = cell.width / Math.max(1, cell.height);
      const w = aspect >= 1 ? tileSize : tileSize * aspect;
      const h = aspect >= 1 ? tileSize / aspect : tileSize;
      return {
        id: makeNodeId(),
        type: 'image',
        name: String(i + 1),
        // Hide every cell except the first — workflow is one-at-a-time adjust → save.
        hidden: i !== 0,
        x: startX + cell.col * tileSize + (tileSize - w) / 2,
        y: startY + cell.row * tileSize + (tileSize - h) / 2,
        width: w,
        height: h,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        fill: 'transparent',
        stroke: 'transparent',
        strokeWidth: 0,
        src: cell.dataUrl,
      };
    });

    commit((prev) => {
      const idx = prev.nodes.findIndex((n) => n.id === targetId);
      if (idx === -1) return { ...prev, nodes: [...prev.nodes, ...newNodes] };
      const next = [...prev.nodes];
      if (deleteOriginal) {
        next.splice(idx, 1, ...newNodes);
      } else {
        next.splice(idx + 1, 0, ...newNodes);
      }
      return { ...prev, nodes: next };
    });
    // Select the first sliced cell so the user can immediately start adjusting it.
    if (newNodes.length > 0) setSelectedId(newNodes[0].id);
    setSliceTargetId(null);
  }, [sliceTargetId, doc, commit]);

  // ── Copy style / Paste style ───────────────────────────────────────────────
  // How one symbol looks — its canvas and the selected layer — pasted onto
  // another, choosing which parts. Kept in localStorage rather than a ref, so
  // it survives closing this symbol and opening the next one.
  const [copiedStyle, setCopiedStyle] = useState<CopiedStyle | null>(loadStyle);
  const [styleChoice, setStyleChoice] = useState<PartChoice>(loadChoice);
  const [pasteAnchor, setPasteAnchor] = useState<HTMLElement | null>(null);

  const handleCopyStyle = useCallback(() => {
    const node = doc.nodes.find((n) => n.id === selectedId);
    const style = copyStyle(doc, node);
    saveStyle(style);
    setCopiedStyle(style);
    showStatus(`Copied style: ${describeCopy(style)}`);
  }, [doc, selectedId, showStatus]);

  const handleStyleChoice = useCallback((next: PartChoice) => {
    setStyleChoice(next);
    saveChoice(next);
  }, []);

  const handlePasteStyle = useCallback(async () => {
    const style = copiedStyle;
    if (!style) return;
    setPasteAnchor(null);
    const target = doc.nodes.find((n) => n.id === selectedId) ?? null;
    const parts = activeParts(style, target, styleChoice);
    if (!parts.size) return;

    const docPatch = canvasPatch(style, parts);
    // A pasted canvas size moves every layer (see withCanvasSize), so the
    // target is measured where it WILL be — otherwise "keep its own place"
    // would put it back where it was on the old canvas.
    const shift = docPatch?.size !== undefined
      ? canvasShift(doc, docPatch.size, docPatch.height ?? docPatch.size)
      : { dx: 0, dy: 0 };
    let nodePatch: Partial<SymbolNode> = {};
    if (target) {
      let aspect: number | undefined;
      let imgPatch: Partial<ImageNode> = {};
      const plan = imagePlan(style, target, parts);
      if (plan && target.type === 'image') {
        try {
          // Start from the plain image: under a silhouette/outline that is
          // origSrc, under a sharpen it is preSharpenSrc.
          let base = target.src;
          if (plan.resetEffects) {
            base = target.silhouette || target.outline ? (target.origSrc ?? target.src) : (target.preSharpenSrc ?? target.src);
            imgPatch = { src: base, origSrc: undefined, silhouette: false, outline: undefined, sharpen: undefined, preSharpenSrc: undefined };
          }
          if (plan.crop) {
            const img = await loadImage(base);
            const cut = await cropToDataUrl(base, fromFrac(plan.crop, img.naturalWidth, img.naturalHeight));
            base = cut.src;
            aspect = cut.w / cut.h;
            imgPatch = { ...imgPatch, src: base, crop: plan.crop };
          }
          // Effects: the source's if they were pasted, otherwise the
          // target's own put back on top of the new crop.
          const effect = plan.effect ?? (
            target.silhouette ? { kind: 'silhouette' as const }
              : target.outline ? { kind: 'outline' as const, thickness: target.outline }
              : { kind: 'none' as const });
          const sharpen = plan.effect ? plan.sharpen : target.sharpen;
          if (effect.kind === 'silhouette') {
            imgPatch = { ...imgPatch, origSrc: base, src: await makeWhiteAlphaMask(base), silhouette: true, outline: undefined };
          } else if (effect.kind === 'outline') {
            imgPatch = { ...imgPatch, origSrc: base, src: await makeOutlineMask(base, effect.thickness), outline: effect.thickness, silhouette: false };
          } else if (sharpen && sharpen > 0) {
            imgPatch = { ...imgPatch, preSharpenSrc: base, src: await sharpenImage(base, sharpen), sharpen };
          }
        } catch {
          showStatus('Could not paste onto that image', true);
          return;
        }
      }
      const moved = { ...target, x: target.x + shift.dx, y: target.y + shift.dy } as SymbolNode;
      nodePatch = { ...imgPatch, ...layerPatch(style, moved, parts, aspect) } as Partial<SymbolNode>;
    }

    const id = target?.id;
    // One commit, so a single Undo takes the whole paste back.
    commit((prev) => {
      const next = docPatch
        ? (docPatch.size !== undefined ? withCanvasSize({ ...prev, ...docPatch }, docPatch.size, docPatch.height ?? docPatch.size) : { ...prev, ...docPatch })
        : prev;
      return {
        ...next,
        nodes: id ? next.nodes.map((n) => (n.id === id ? ({ ...n, ...nodePatch } as SymbolNode) : n)) : next.nodes,
      };
    });
    showStatus(`Pasted ${parts.size} style${parts.size === 1 ? '' : 's'}`);
  }, [copiedStyle, doc, selectedId, styleChoice, commit, showStatus]);

  const handleOpenCrop = useCallback(() => {
    if (!selectedId) return;
    const sel = doc.nodes.find((n) => n.id === selectedId);
    if (!sel || sel.type !== 'image') return;
    setCropTargetId(selectedId);
  }, [selectedId, doc.nodes]);

  // Apply a crop: replace the selected image's src with the cropped version, fit width/height to
  // the new natural pixel dimensions while keeping the image's centroid in the same canvas spot.
  const handleCropApply = useCallback((newSrc: string, cropFrac: CropFrac) => {
    const targetId = cropTargetId;
    if (!targetId) { setCropTargetId(null); return; }
    const source = doc.nodes.find((n) => n.id === targetId);
    if (!source || source.type !== 'image') { setCropTargetId(null); return; }
    const img = new Image();
    img.onload = () => {
      const newNatW = img.naturalWidth;
      const newNatH = img.naturalHeight;
      const aspect = newNatW / Math.max(1, newNatH);
      const oldAspect = source.width / Math.max(1, source.height);
      // Preserve longest-side display size; recompute other side from new aspect.
      const longest = Math.max(source.width, source.height);
      let w: number, h: number;
      if (aspect >= 1) {
        w = oldAspect >= 1 ? longest : source.width;
        h = w / aspect;
      } else {
        h = oldAspect < 1 ? longest : source.height;
        w = h * aspect;
      }
      const cx = source.x + source.width / 2;
      const cy = source.y + source.height / 2;
      commit((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === targetId && n.type === 'image'
            ? { ...n, src: newSrc, origSrc: undefined, silhouette: false, outline: undefined,
                sharpen: undefined, preSharpenSrc: undefined,
                // Remembered so "Copy size & crop" can frame another image the same way.
                crop: composeCrop(source.crop, cropFrac),
                width: w, height: h, x: cx - w / 2, y: cy - h / 2 }
            : n
        ),
      }));
      setCropTargetId(null);
    };
    img.src = newSrc;
  }, [cropTargetId, doc.nodes, commit]);

  // Apply sharpen at `amount` to the selected image. We keep `preSharpenSrc` so dragging the slider
  // back toward 0 cleanly restores the original — each slider position re-sharpens from the same baseline
  // rather than compounding on already-sharpened pixels.
  const applySharpen = useCallback(async (amount: number) => {
    if (!selectedId) return;
    const sel = doc.nodes.find((n) => n.id === selectedId);
    if (!sel || sel.type !== 'image') return;
    const baseline = sel.preSharpenSrc ?? sel.src;
    const jobId = ++sharpenJobIdRef.current;

    if (amount <= 0) {
      commit((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === selectedId && n.type === 'image'
            ? { ...n, src: baseline, preSharpenSrc: undefined, sharpen: undefined }
            : n
        ),
      }));
      return;
    }

    try {
      const newSrc = await sharpenImage(baseline, amount);
      if (jobId !== sharpenJobIdRef.current) return; // a newer slider event superseded this one
      commit((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === selectedId && n.type === 'image'
            ? { ...n, src: newSrc, preSharpenSrc: n.preSharpenSrc ?? sel.src, sharpen: amount }
            : n
        ),
      }));
    } catch { /* ignore */ }
  }, [selectedId, doc.nodes, commit]);

  const handleSharpenSliderChange = useCallback((v: number) => {
    setSharpenDrag({ id: selectedId, value: v });
    if (sharpenTimerRef.current) window.clearTimeout(sharpenTimerRef.current);
    sharpenTimerRef.current = window.setTimeout(() => {
      // Once applied, the layer's own amount takes over again (so Undo moves the slider too).
      applySharpen(v).finally(() => setSharpenDrag((d) => (d && d.value === v ? null : d)));
    }, 80);
  }, [applySharpen, selectedId]);

  // Scale the selected image to fill the canvas (preserving aspect ratio) and center it.
  // Bakes a nearest-neighbor upscale into the bitmap at 2× canvas resolution so the sprite stays
  // crisp through any later render or export, without relying on the pixel-perfect toggle.
  // Operates on the silhouette/sharpen-free baseline so we don't re-rasterize on top of effects.
  const handleFitToCanvas = useCallback(async () => {
    if (!selectedId) return;
    const sel = doc.nodes.find((n) => n.id === selectedId);
    if (!sel || sel.type !== 'image') return;
    const aspect = sel.width / Math.max(1, sel.height);
    // Fitted inside the canvas, which need not be square.
    const cw = docWidth(doc);
    const ch = docHeight(doc);
    const w = aspect >= cw / ch ? cw : ch * aspect;
    const h = aspect >= cw / ch ? cw / aspect : ch;

    // Pick the cleanest baseline available; preSharpenSrc > origSrc > src.
    const baseline = sel.preSharpenSrc ?? sel.origSrc ?? sel.src;
    let newSrc = sel.src;
    try {
      // 2× target so retina displays and 2× exports both find native pixels.
      newSrc = await nearestNeighborResample(baseline, Math.round(w * 2), Math.round(h * 2));
    } catch { /* fall back to current src if resample fails */ }

    commit((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === selectedId && n.type === 'image'
          ? { ...n,
              src: newSrc,
              origSrc: undefined,
              silhouette: false,
              outline: undefined,
              preSharpenSrc: undefined,
              sharpen: undefined,
              x: (cw - w) / 2,
              y: (ch - h) / 2,
              width: w,
              height: h,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            }
          : n
      ),
    }));
  }, [selectedId, doc, commit]);

  const handleRevertImage = useCallback(() => {
    if (!selectedId) return;
    const sel = doc.nodes.find((n) => n.id === selectedId);
    if (!sel || sel.type !== 'image' || !sel.origSrc) return;
    commit((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === selectedId && n.type === 'image'
          ? { ...n, src: n.origSrc!, origSrc: undefined, silhouette: false, outline: undefined }
          : n
      ),
    }));
  }, [selectedId, doc.nodes, commit]);

  // Download opens a dialog for what to export and at what size; it starts
  // from the last download's settings, so a set of symbols comes out matching.
  const [downloadOpen, setDownloadOpen] = useState(false);
  const handleDownload = useCallback(() => {
    if (doc.nodes.length === 0) return;
    setDownloadOpen(true);
  }, [doc.nodes.length]);

  // ── Derived UI state ───────────────────────────────────

  const selected = selectedId ? doc.nodes.find((n) => n.id === selectedId) : null;
  const activeFill = selected ? selected.fill : fill;
  const activeStroke = selected ? selected.stroke : stroke;
  const activeStrokeWidth = selected ? selected.strokeWidth : strokeWidth;
  const activeOpacity = selected ? selected.opacity : opacity;
  const activeColor = colorTarget === 'fill' ? activeFill : activeStroke;

  // The maker sits on a page beside other tools, so its shortcuts and paste
  // only apply once someone is working in it: a press inside makes it active,
  // a press anywhere else hands the keyboard back to the page. Any open dialog
  // (background remover, crop, export…) owns the keyboard and paste itself.
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      activeRef.current = !!(t && rootRef.current?.contains(t));
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);
  const modalOpen = !!(bgRemoveSrc || sliceTargetId || cropTargetId || downloadOpen);
  const listening = useCallback((e: Event) => {
    if (!activeRef.current || modalOpen) return false;
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body && !rootRef.current?.contains(el)) return false;
    return !(e.target as Element | null)?.closest?.('[role="dialog"]');
  }, [modalOpen]);

  // Keyboard shortcuts. Cmd/Ctrl-V pastes internal node clipboard directly (no permission needed).
  // OS-clipboard image paste is handled by the native 'paste' event below, so we don't fire both.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!listening(e)) return;
      const isMod = e.metaKey || e.ctrlKey;
      const inEditable = (() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
      })();
      if (inEditable) return;
      if (isMod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (isMod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (isMod && (e.key === 'v' || e.key === 'V')) {
        // Don't preventDefault — let the native 'paste' event also fire (it handles OS-clipboard images).
        // We just paste the internal node clipboard (if any). The two paths don't overlap.
        pasteInternalNode();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        handleDelete(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, handleDelete, selectedId, pasteInternalNode, listening]);

  // Native paste event — handles OS-clipboard image paste (screenshots, copied images).
  // Permission-free in browsers that fire it on document.body (Chrome, Firefox).
  // Safari fallback is the topbar paste button (handlePaste → navigator.clipboard.read).
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!listening(e)) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            blobToDataUrl(file).then(addImageFromDataUrl, () => showStatus('Could not read that image', true));
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [addImageFromDataUrl, listening, showStatus]);

  return (
    <div ref={rootRef} className="symbol-maker-root">
      <div className="symbol-maker">
        <SymbolTopBar
          title={title}
          canvasWidth={docWidth(doc)}
          canvasHeight={docHeight(doc)}
          onSizeChange={handleSizeChange}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onAddImage={() => fileInputRef.current?.click()}
          canPaste={CAN_READ_CLIPBOARD || hasClipboard}
          onPaste={handlePaste}
          onClear={handleClear}
          showGuides={showGuides}
          onToggleGuides={() => setShowGuides((s) => !s)}
          onExport={handleDownload}
          canExport={doc.nodes.length > 0}
          onSlice={selected && selected.type === 'image' ? handleOpenSlice : undefined}
          onFitToCanvas={selected && selected.type === 'image' ? handleFitToCanvas : undefined}
          pixelPerfect={pixelPerfect}
          onTogglePixelPerfect={() => setPixelPerfect((p) => !p)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => { addImageFiles(e.target.files); e.target.value = ''; }}
        />

        <div className="symbol-maker-body">
          {!isMobile && <SymbolToolbar tool={tool} onToolChange={setTool} />}

          <div
            ref={wrapRef}
            className={`symbol-maker-canvas-wrap${dragOver ? ' is-drop-target' : ''}`}
            onDragOver={(e) => {
              if (!Array.from(e.dataTransfer.types).includes('Files')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setDragOver(true);
            }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false); }}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              setDragOver(false);
              addImageFiles(e.dataTransfer.files);
            }}
          >
            <div className="symbol-maker-stage" style={{ width: stageDisplay, height: Math.round((stageDisplay * docHeight(doc)) / docWidth(doc)) }}>
              <SymbolCanvas
                doc={doc}
                displaySize={stageDisplay}
                tool={tool}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onCommit={commit}
                onSetDoc={history.setDoc}
                onCutNode={handleCutNode}
                showGuides={showGuides}
                soloId={soloId}
                pixelPerfect={pixelPerfect}
              />
            </div>
            {doc.nodes.length === 0 && (
              <p className="symbol-maker-hint">
                Add an image, paste one with Ctrl/Cmd+V, or drop a file here. Then select it and use Remove BG.
              </p>
            )}
            <p className={`symbol-maker-status${status?.error ? ' is-error' : ''}`} role="status" aria-live="polite">
              {status?.text}
            </p>
          </div>

          {!isMobile && (
            <LayersPanel
              nodes={doc.nodes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={handleNodeChange}
              onMove={handleMove}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              soloId={soloId}
              onSolo={handleSoloToggle}
            />
          )}
        </div>

        <div className="symbol-maker-style-row">
          <button
            type="button"
            className="bgr-launch"
            onClick={handleCopyStyle}
            title={selected ? 'Copy this layer’s style and the canvas size' : 'Copy the canvas size and background'}
          >
            Copy style
          </button>
          <button
            type="button"
            className="bgr-launch look-paste-btn"
            onClick={(e) => setPasteAnchor(e.currentTarget)}
            disabled={!copiedStyle}
            title={copiedStyle ? `Paste from ${describeCopy(copiedStyle)}` : 'Copy a style first'}
          >
            Paste style…
          </button>
          {copiedStyle && (
            <StylePastePanel
              anchor={pasteAnchor}
              style={copiedStyle}
              target={selected}
              choice={styleChoice}
              onChoice={handleStyleChoice}
              onPaste={handlePasteStyle}
              onClose={() => setPasteAnchor(null)}
            />
          )}
          <span className="label">{selected ? 'Selected' : 'New shape'}</span>

          <div className="target-toggle">
            <button type="button" className={colorTarget === 'fill' ? 'is-active' : ''} onClick={() => handleColorTargetChange('fill')}>Fill</button>
            <button type="button" className={colorTarget === 'stroke' ? 'is-active' : ''} onClick={() => handleColorTargetChange('stroke')}>Stroke</button>
          </div>

          <button
            type="button"
            className={`swatch swatch-none${activeColor === 'transparent' ? ' is-active' : ''}`}
            onClick={handlePickNone}
            aria-label={`No ${colorTarget}`}
            title={`No ${colorTarget}`}
          >
            <span className="slash" />
          </button>

          {FG_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch${activeColor === c ? ' is-active' : ''}${c === '#ffffff' ? ' is-white' : ''}`}
              style={{ background: c }}
              onClick={() => handleColorPick(c)}
              aria-label={c}
            />
          ))}

          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(activeColor) ? activeColor : '#000000'}
            onChange={(e) => handleColorPick(e.target.value)}
            style={{ width: 28, height: 28, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
            aria-label="Pick custom color"
          />

          <div className="ctrl-pair">
            <span className="label">Stroke width</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={activeStrokeWidth}
              onChange={(e) => handleStrokeWidthChange(Number(e.target.value))}
            />
          </div>

          <div className="ctrl-pair">
            <span className="label">Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(activeOpacity * 100)}
              onChange={(e) => handleOpacityChange(Number(e.target.value) / 100)}
            />
          </div>

          {selected && selected.type === 'line' && !selected.closed && (
            <div className="ctrl-pair">
              <span className="label">Curve</span>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={Math.round((selected.curvature ?? 0) * 100)}
                onChange={(e) => handleNodeChange(selected.id, { curvature: Number(e.target.value) / 100 })}
              />
            </div>
          )}

          {selected && selected.type === 'text' && (
            <>
              <div className="ctrl-pair">
                <span className="label">Text</span>
                <input
                  type="text"
                  className="text-input"
                  value={selected.text}
                  onChange={(e) => handleNodeChange(selected.id, { text: e.target.value })}
                  placeholder="Type something"
                />
              </div>
              <div className="ctrl-pair">
                <span className="label">Font</span>
                <div className="font-menu" ref={fontMenuRef}>
                  <button
                    type="button"
                    className="font-menu-trigger"
                    onClick={() => setFontMenuOpen((o) => !o)}
                    style={{ fontFamily: selected.fontFamily }}
                  >
                    <span className="font-menu-label">
                      {FONT_OPTIONS.find((f) => f.value === selected.fontFamily)?.label ?? 'Font'}
                    </span>
                    <span className="font-menu-caret" aria-hidden>▾</span>
                  </button>
                  {fontMenuOpen && (
                    <div className="font-menu-list" role="listbox">
                      {FONT_OPTIONS.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          role="option"
                          aria-selected={f.value === selected.fontFamily}
                          className={`font-menu-item${f.value === selected.fontFamily ? ' is-active' : ''}`}
                          style={{ fontFamily: f.value }}
                          onClick={() => {
                            handleNodeChange(selected.id, { fontFamily: f.value });
                            setFontMenuOpen(false);
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="ctrl-pair">
                <span className="label">Size</span>
                <input
                  type="range"
                  min={8}
                  max={240}
                  step={1}
                  value={selected.fontSize}
                  onChange={(e) => handleNodeChange(selected.id, { fontSize: Number(e.target.value) })}
                />
              </div>
              <div className="target-toggle">
                <button
                  type="button"
                  className={selected.fontWeight < 600 ? 'is-active' : ''}
                  onClick={() => handleNodeChange(selected.id, { fontWeight: 500 })}
                  title="Regular weight"
                >Regular</button>
                <button
                  type="button"
                  className={selected.fontWeight >= 600 ? 'is-active' : ''}
                  onClick={() => handleNodeChange(selected.id, { fontWeight: 700 })}
                  title="Bold weight"
                  style={{ fontWeight: 700 }}
                >Bold</button>
              </div>
              <div className="ctrl-pair">
                <span className="label">Curve</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={Math.round((selected.curvature ?? 0) * 100)}
                  onChange={(e) => handleNodeChange(selected.id, { curvature: Number(e.target.value) / 100 })}
                />
              </div>
            </>
          )}

          {selected && selected.type === 'image' && (
            <>
              <button
                type="button"
                className="bgr-launch"
                onClick={() => {
                  bgRemoveTargetIdRef.current = selected.id;
                  setBgRemoveSrc(selected.silhouette || selected.outline ? (selected.origSrc ?? selected.src) : selected.src);
                }}
                title="Remove background of this image"
              >
                Remove BG
              </button>
              {!selected.silhouette && !selected.outline && (
                <>
                  <button
                    type="button"
                    className="bgr-launch"
                    onClick={handleConvertToSilhouette}
                    title="Replace image with a colored silhouette that recolors with foreground"
                  >
                    Silhouette
                  </button>
                  <button
                    type="button"
                    className="bgr-launch"
                    onClick={() => handleConvertToOutline(DEFAULT_OUTLINE_THICKNESS)}
                    title="Replace image with an outline that recolors with foreground"
                  >
                    Outline
                  </button>
                  <button
                    type="button"
                    className="bgr-launch"
                    onClick={handleOpenCrop}
                    title="Crop the image to a region you select"
                  >
                    Crop
                  </button>
                  <div className="ctrl-pair">
                    <span className="label">Sharpen</span>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={sharpenSlider}
                      onChange={(e) => handleSharpenSliderChange(Number(e.target.value))}
                      title="Sharpen the selected image (3×3 convolution)"
                    />
                  </div>
                </>
              )}
              {(selected.silhouette || (selected.outline && selected.outline > 0)) && (
                <button
                  type="button"
                  className="bgr-launch"
                  onClick={handleRevertImage}
                  title="Revert to the original image"
                >
                  Revert
                </button>
              )}
              {selected.outline && selected.outline > 0 && (
                <div className="ctrl-pair">
                  <span className="label">Thickness</span>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={selected.outline}
                    onChange={(e) => handleConvertToOutline(Number(e.target.value))}
                  />
                </div>
              )}
            </>
          )}

        </div>

        {isMobile && (
          <SymbolToolbar tool={tool} onToolChange={setTool} orientation="horizontal" />
        )}
      </div>

      {bgRemoveSrc && (
        <BgRemoveModal
          src={bgRemoveSrc}
          onCancel={() => { setBgRemoveSrc(null); bgRemoveTargetIdRef.current = null; }}
          onApply={(newSrc) => {
            const id = bgRemoveTargetIdRef.current;
            if (id) handleNodeChange(id, { src: newSrc } as Partial<SymbolNode>);
            setBgRemoveSrc(null);
            bgRemoveTargetIdRef.current = null;
          }}
        />
      )}

      {sliceTargetId && (() => {
        const target = doc.nodes.find((n) => n.id === sliceTargetId);
        if (!target || target.type !== 'image') return null;
        return (
          <SliceImageModal
            open
            src={target.src}
            onCancel={() => setSliceTargetId(null)}
            onApply={handleSliceApply}
          />
        );
      })()}

      {cropTargetId && (() => {
        const target = doc.nodes.find((n) => n.id === cropTargetId);
        if (!target || target.type !== 'image') return null;
        return (
          <CropImageModal
            open
            src={target.origSrc ?? target.src}
            onCancel={() => setCropTargetId(null)}
            onApply={handleCropApply}
          />
        );
      })()}
      {downloadOpen && (
        <DownloadDialog
          doc={doc}
          selectedId={selectedId}
          pixelPerfect={pixelPerfect}
          onClose={() => setDownloadOpen(false)}
          onDone={(message) => showStatus(message)}
        />
      )}
    </div>
  );
};
