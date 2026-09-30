// Clipboard helpers for images. Kept framework-free so any tool can reuse them.

/** True if the browser can write image blobs to the clipboard. */
export const CAN_COPY_IMAGE =
  typeof navigator !== 'undefined' &&
  !!navigator.clipboard &&
  typeof navigator.clipboard.write === 'function' &&
  typeof ClipboardItem === 'function';

/** True if the browser can read images out of the clipboard on demand (button-driven paste). */
export const CAN_READ_CLIPBOARD =
  typeof navigator !== 'undefined' &&
  !!navigator.clipboard &&
  typeof navigator.clipboard.read === 'function';

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unreadable image'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unreadable image'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Pull the first image out of a paste event, as a data URL.
 * Returns null when the paste held no image (plain text, etc).
 */
export async function imageFromPasteEvent(e: ClipboardEvent): Promise<string | null> {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return blobToDataUrl(file);
    }
  }
  return null;
}

/**
 * Read an image from the system clipboard on demand. Chromium-only; may prompt
 * for permission. Returns null when the clipboard holds no image.
 */
export async function readImageFromClipboard(): Promise<string | null> {
  if (!CAN_READ_CLIPBOARD) return null;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) return blobToDataUrl(await item.getType(type));
  }
  return null;
}

/**
 * Copy a PNG to the clipboard. Takes the blob as a promise and must be called
 * straight from the click: Safari drops the write if the blob is produced
 * asynchronously after the user gesture, so ClipboardItem gets the promise
 * rather than an awaited blob.
 */
export async function copyPngToClipboard(png: Promise<Blob>): Promise<void> {
  if (!CAN_COPY_IMAGE) throw new Error('Clipboard image copy is not supported here');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

/** Copy a canvas to the clipboard as a PNG (alpha preserved). */
export function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  return copyPngToClipboard(new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode PNG'))), 'image/png');
  }));
}
