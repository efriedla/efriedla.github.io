import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cropToDataUrl } from './cropImage';
import { CropFrac, toFrac } from './imageLook';
import { Dialog } from './ui';

interface CropImageModalProps {
  open: boolean;
  src: string;
  onCancel: () => void;
  /** `crop` is the region kept, as fractions of the image that was cropped. */
  onApply: (newSrc: string, crop: CropFrac) => void;
}

interface Rect { x: number; y: number; w: number; h: number; }

// Image-natural-pixel coordinates for the crop selection. Updated as the user drags handles or
// a new selection rectangle. Display rendering maps these via a uniform `previewScale`.
const HANDLE = 8;

export const CropImageModal: React.FC<CropImageModalProps> = ({ open, src, onCancel, onApply }) => {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [previewW, setPreviewW] = useState(480);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null); // active drag in progress
  const [dragMode, setDragMode] = useState<null | 'create' | 'move' | { kind: 'resize'; corner: 'nw' | 'ne' | 'sw' | 'se' }>(null);
  const dragStartRef = useRef<{ x: number; y: number; rect: Rect } | null>(null);
  const createAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const img = new Image();
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      // Default crop = full image, slightly inset, so the user can immediately resize.
      const inset = Math.round(Math.min(img.naturalWidth, img.naturalHeight) * 0.05);
      setCrop({
        x: inset,
        y: inset,
        w: img.naturalWidth - 2 * inset,
        h: img.naturalHeight - 2 * inset,
      });
    };
    img.src = src;
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPreviewW(Math.max(240, Math.min(r.width, 640)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const previewScale = imgSize ? previewW / imgSize.w : 1;
  const previewH = imgSize ? imgSize.h * previewScale : 240;

  // Convert client mouse → source-image pixel coordinates within the preview.
  const clientToSource = useCallback((e: React.PointerEvent | PointerEvent) => {
    const el = previewRef.current;
    if (!el || !imgSize) return null;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * imgSize.w;
    const py = ((e.clientY - r.top) / r.height) * imgSize.h;
    return { x: Math.max(0, Math.min(imgSize.w, px)), y: Math.max(0, Math.min(imgSize.h, py)) };
  }, [imgSize]);

  const handlePointerDownPreview = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!imgSize) return;
    const p = clientToSource(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragMode('create');
    createAnchorRef.current = { x: p.x, y: p.y };
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  }, [imgSize, clientToSource]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode || !imgSize) return;
    const p = clientToSource(e);
    if (!p) return;
    if (dragMode === 'create' && createAnchorRef.current) {
      const a = createAnchorRef.current;
      setDraft({
        x: Math.min(a.x, p.x),
        y: Math.min(a.y, p.y),
        w: Math.max(1, Math.abs(p.x - a.x)),
        h: Math.max(1, Math.abs(p.y - a.y)),
      });
    }
    if (dragMode === 'move' && crop && dragStartRef.current) {
      const dx = p.x - dragStartRef.current.x;
      const dy = p.y - dragStartRef.current.y;
      const next = {
        x: Math.max(0, Math.min(imgSize.w - dragStartRef.current.rect.w, dragStartRef.current.rect.x + dx)),
        y: Math.max(0, Math.min(imgSize.h - dragStartRef.current.rect.h, dragStartRef.current.rect.y + dy)),
        w: dragStartRef.current.rect.w,
        h: dragStartRef.current.rect.h,
      };
      setCrop(next);
    }
    if (typeof dragMode === 'object' && dragMode.kind === 'resize' && crop && dragStartRef.current) {
      const start = dragStartRef.current.rect;
      const corner = dragMode.corner;
      const fixedX = corner === 'nw' || corner === 'sw' ? start.x + start.w : start.x;
      const fixedY = corner === 'nw' || corner === 'ne' ? start.y + start.h : start.y;
      const x1 = Math.min(fixedX, p.x);
      const y1 = Math.min(fixedY, p.y);
      const x2 = Math.max(fixedX, p.x);
      const y2 = Math.max(fixedY, p.y);
      setCrop({ x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) });
    }
  }, [dragMode, crop, imgSize, clientToSource]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragMode === 'create' && draft && draft.w > 2 && draft.h > 2) {
      setCrop(draft);
    }
    setDraft(null);
    setDragMode(null);
    dragStartRef.current = null;
    createAnchorRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, [dragMode, draft]);

  const startMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!crop) return;
    e.stopPropagation();
    const p = clientToSource(e);
    if (!p) return;
    dragStartRef.current = { x: p.x, y: p.y, rect: { ...crop } };
    setDragMode('move');
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [crop, clientToSource]);

  const startResize = useCallback((corner: 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!crop) return;
    e.stopPropagation();
    const p = clientToSource(e);
    if (!p) return;
    dragStartRef.current = { x: p.x, y: p.y, rect: { ...crop } };
    setDragMode({ kind: 'resize', corner });
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [crop, clientToSource]);

  const handleApply = useCallback(() => {
    if (!crop || !imgSize) return;
    cropToDataUrl(src, crop).then(
      (out) => onApply(out.src, toFrac(crop, imgSize.w, imgSize.h)),
      () => { /* the source failed to decode; leave the dialog open */ },
    );
  }, [crop, imgSize, src, onApply]);

  const display = (n: number) => n * previewScale;
  const active = draft ?? crop;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Crop image"
      size="md"
      actions={
        <>
          <button type="button" className="smk-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="smk-btn is-primary" onClick={handleApply} disabled={!crop || crop.w < 1 || crop.h < 1}>Crop</button>
        </>
      }
    >
      <div ref={containerRef} className="smk-stack">
        <p className="smk-caption">
          Drag on the image to draw a crop region, or drag the existing rectangle and corners to adjust.
        </p>
        <div
          ref={previewRef}
          className="smk-checker smk-crop-preview"
          onPointerDown={handlePointerDownPreview}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ width: previewW, height: previewH }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Source" draggable={false} />
          {active && imgSize && (
            <>
              {/* Dim outside the crop area with four overlays. */}
              <div className="smk-crop-dim" style={{ left: 0, top: 0, width: '100%', height: display(active.y) }} />
              <div className="smk-crop-dim" style={{ left: 0, top: display(active.y) + display(active.h), width: '100%', bottom: 0 }} />
              <div className="smk-crop-dim" style={{ left: 0, top: display(active.y), width: display(active.x), height: display(active.h) }} />
              <div className="smk-crop-dim" style={{ left: display(active.x) + display(active.w), top: display(active.y), right: 0, height: display(active.h) }} />

              {/* Selection outline (interactive) */}
              <div
                className="smk-crop-box"
                onPointerDown={startMove}
                style={{ left: display(active.x), top: display(active.y), width: display(active.w), height: display(active.h) }}
              />
              {/* Corner handles */}
              {(['nw', 'ne', 'sw', 'se'] as const).map((c) => {
                const cx = c === 'ne' || c === 'se' ? display(active.x) + display(active.w) : display(active.x);
                const cy = c === 'sw' || c === 'se' ? display(active.y) + display(active.h) : display(active.y);
                const cursor = c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize';
                return (
                  <div
                    key={c}
                    className="smk-crop-handle"
                    onPointerDown={startResize(c)}
                    style={{ left: cx - HANDLE / 2, top: cy - HANDLE / 2, width: HANDLE, height: HANDLE, cursor }}
                  />
                );
              })}
            </>
          )}
        </div>
        {imgSize && crop && (
          <p className="smk-caption smk-center">
            Crop: {Math.round(crop.x)}, {Math.round(crop.y)} · {Math.round(crop.w)} × {Math.round(crop.h)} px · source {imgSize.w} × {imgSize.h}
          </p>
        )}
      </div>
    </Dialog>
  );
};
