// Sprite-sheet slicing utility.
// Given an image and a grid (cols × rows, with optional outer margin / inter-cell spacing),
// emit a PNG data URL per cell. Optionally trims fully-transparent borders off each cell so
// the resulting sprites are tight to their visible content.

export interface SliceOptions {
  cols: number;
  rows: number;
  /** Pixels of padding to skip on the left/right edges of the source. */
  marginX?: number;
  /** Pixels of padding to skip on the top/bottom edges of the source. */
  marginY?: number;
  /** Pixels of gap between cells, horizontally. */
  spacingX?: number;
  /** Pixels of gap between cells, vertically. */
  spacingY?: number;
  /** When true, each cell is cropped to its alpha bounding box. */
  trim?: boolean;
}

export interface SlicedCell {
  /** Cell PNG as data URL. */
  dataUrl: string;
  /** Top-left of the cell's content in source-image pixel coordinates. */
  sx: number;
  sy: number;
  /** Final cell dimensions in source pixels (post-trim if trim is on). */
  width: number;
  height: number;
  row: number;
  col: number;
}

export interface SliceMetrics {
  sourceWidth: number;
  sourceHeight: number;
  /** Cell-box dimensions BEFORE trimming. */
  cellBoxWidth: number;
  cellBoxHeight: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/** Returns null if every pixel is transparent. */
function alphaBoundingBox(data: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export async function sliceImage(src: string, opts: SliceOptions): Promise<{ cells: SlicedCell[]; metrics: SliceMetrics }> {
  const img = await loadImage(src);
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const cols = Math.max(1, Math.floor(opts.cols));
  const rows = Math.max(1, Math.floor(opts.rows));
  const marginX = Math.max(0, opts.marginX ?? 0);
  const marginY = Math.max(0, opts.marginY ?? 0);
  const spacingX = Math.max(0, opts.spacingX ?? 0);
  const spacingY = Math.max(0, opts.spacingY ?? 0);

  const usableW = Math.max(0, sw - 2 * marginX - spacingX * (cols - 1));
  const usableH = Math.max(0, sh - 2 * marginY - spacingY * (rows - 1));
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  const cells: SlicedCell[] = [];
  const cellCanvas = document.createElement('canvas');
  const cellCtx = cellCanvas.getContext('2d')!;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellX = marginX + c * (cellW + spacingX);
      const cellY = marginY + r * (cellH + spacingY);
      const boxW = Math.round(cellW);
      const boxH = Math.round(cellH);
      if (boxW <= 0 || boxH <= 0) continue;

      cellCanvas.width = boxW;
      cellCanvas.height = boxH;
      cellCtx.clearRect(0, 0, boxW, boxH);
      cellCtx.drawImage(img, cellX, cellY, boxW, boxH, 0, 0, boxW, boxH);

      let outX = cellX;
      let outY = cellY;
      let outW = boxW;
      let outH = boxH;
      let outCanvas: HTMLCanvasElement = cellCanvas;

      if (opts.trim) {
        const id = cellCtx.getImageData(0, 0, boxW, boxH);
        const bb = alphaBoundingBox(id.data, boxW, boxH);
        if (!bb) continue; // fully transparent cell — skip
        if (bb.x !== 0 || bb.y !== 0 || bb.w !== boxW || bb.h !== boxH) {
          const trimmed = document.createElement('canvas');
          trimmed.width = bb.w;
          trimmed.height = bb.h;
          trimmed.getContext('2d')!.drawImage(cellCanvas, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
          outCanvas = trimmed;
          outX = cellX + bb.x;
          outY = cellY + bb.y;
          outW = bb.w;
          outH = bb.h;
        }
      }

      cells.push({
        dataUrl: outCanvas.toDataURL('image/png'),
        sx: outX,
        sy: outY,
        width: outW,
        height: outH,
        row: r,
        col: c,
      });
    }
  }

  return {
    cells,
    metrics: {
      sourceWidth: sw,
      sourceHeight: sh,
      cellBoxWidth: cellW,
      cellBoxHeight: cellH,
    },
  };
}
