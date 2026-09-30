import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sliceImage, SlicedCell, SliceMetrics } from './sliceImage';
import { Dialog } from './ui';

export interface SliceResult {
  cells: SlicedCell[];
  metrics: SliceMetrics;
  deleteOriginal: boolean;
}

interface SliceImageModalProps {
  open: boolean;
  src: string;
  /** Pixel dimensions of the source the user sees on the canvas (the ImageNode size). */
  onCancel: () => void;
  onApply: (result: SliceResult) => void;
}

export const SliceImageModal: React.FC<SliceImageModalProps> = ({ open, src, onCancel, onApply }) => {
  const [cols, setCols] = useState(6);
  const [rows, setRows] = useState(6);
  const [marginX, setMarginX] = useState(0);
  const [marginY, setMarginY] = useState(0);
  const [spacingX, setSpacingX] = useState(0);
  const [spacingY, setSpacingY] = useState(0);
  const [trim, setTrim] = useState(true);
  const [deleteOriginal, setDeleteOriginal] = useState(true);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [slicing, setSlicing] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(360);

  useEffect(() => {
    if (!open) return;
    const img = new Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const el = previewRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPreviewW(Math.max(200, Math.min(r.width, 480)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const previewH = useMemo(() => {
    if (!imgSize) return 240;
    return Math.round(previewW * (imgSize.h / imgSize.w));
  }, [previewW, imgSize]);

  const handleApply = useCallback(async () => {
    setSlicing(true);
    try {
      const result = await sliceImage(src, {
        cols, rows, marginX, marginY, spacingX, spacingY, trim,
      });
      onApply({ cells: result.cells, metrics: result.metrics, deleteOriginal });
    } finally {
      setSlicing(false);
    }
  }, [src, cols, rows, marginX, marginY, spacingX, spacingY, trim, deleteOriginal, onApply]);

  // Grid overlay: one rectangle per cell, in source-pixel coordinates.
  const gridRects = useMemo(() => {
    if (!imgSize) return null;
    const usableW = Math.max(1, imgSize.w - 2 * marginX - spacingX * (cols - 1));
    const usableH = Math.max(1, imgSize.h - 2 * marginY - spacingY * (rows - 1));
    const cellW = usableW / cols;
    const cellH = usableH / rows;
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        rects.push({
          x: marginX + c * (cellW + spacingX),
          y: marginY + r * (cellH + spacingY),
          w: cellW,
          h: cellH,
        });
      }
    }
    return { rects, srcW: imgSize.w, srcH: imgSize.h };
  }, [imgSize, cols, rows, marginX, marginY, spacingX, spacingY]);

  const numField = (label: string, value: number, set: (n: number) => void, min: number, max?: number) => (
    <label className="smk-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value) || min;
          set(Math.max(min, max === undefined ? n : Math.min(max, n)));
        }}
      />
    </label>
  );

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Slice sprite sheet"
      size="md"
      actions={
        <>
          <button type="button" className="smk-btn" onClick={onCancel} disabled={slicing}>Cancel</button>
          <button type="button" className="smk-btn is-primary" onClick={handleApply} disabled={slicing || !imgSize}>
            {slicing ? 'Slicing…' : 'Splice'}
          </button>
        </>
      }
    >
      <div className="smk-slice">
        <div ref={previewRef} className="smk-slice-preview">
          <div className="smk-checker smk-slice-frame" style={{ width: previewW, height: previewH }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Sprite sheet" />
            {gridRects && (
              <svg
                width={previewW}
                height={previewH}
                viewBox={`0 0 ${gridRects.srcW} ${gridRects.srcH}`}
                preserveAspectRatio="none"
              >
                {gridRects.rects.map((r, i) => (
                  <rect
                    key={i}
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    fill="none"
                    stroke="#ff2d55"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            )}
          </div>
          {imgSize && (
            <p className="smk-caption smk-center">
              Source: {imgSize.w} × {imgSize.h}px · {cols * rows} cells
            </p>
          )}
        </div>

        <div className="smk-slice-fields">
          <div className="smk-pair">
            {numField('Columns', cols, setCols, 1, 40)}
            {numField('Rows', rows, setRows, 1, 40)}
          </div>
          <div className="smk-pair">
            {numField('Margin X', marginX, setMarginX, 0)}
            {numField('Margin Y', marginY, setMarginY, 0)}
          </div>
          <div className="smk-pair">
            {numField('Spacing X', spacingX, setSpacingX, 0)}
            {numField('Spacing Y', spacingY, setSpacingY, 0)}
          </div>
          <label className="smk-check">
            <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
            <span>Trim transparent edges of each cell</span>
          </label>
          <label className="smk-check">
            <input type="checkbox" checked={deleteOriginal} onChange={(e) => setDeleteOriginal(e.target.checked)} />
            <span>Delete original sheet after splice</span>
          </label>
        </div>
      </div>
    </Dialog>
  );
};
