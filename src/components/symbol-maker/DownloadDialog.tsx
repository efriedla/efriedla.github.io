import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SymbolDoc } from './types';
import { docWidth, docHeight } from './types';
import { artworkBounds, svgToBlob, svgToDataUrl, svgToPngDataUrl, symbolToSvg } from './exportSymbol';
import {
  DownloadScope, DownloadSettings, MAX_PADDING, Rect, clampPx, defaultDownload, fileNameFor, loadDownload,
  padRegion, resizeLocked, saveDownload, sizeForShape, viewBoxFor,
} from './downloadLayout';
import { CAN_COPY_IMAGE, copyPngToClipboard } from './clipboardImage';
import { Dialog, Icon } from './ui';

// The export dialog: choose what to include, at exactly what size, then copy
// it to the clipboard or download it.
//
// It opens on the settings of the LAST download, and says so. That is the
// "make symbol two come out like symbol one" feature — no separate copy step,
// because the thing you want to copy is almost always the one you just did.

// Mounted only while open, so every opening starts fresh from the last export.
interface DownloadDialogProps {
  doc: SymbolDoc;
  selectedId: string | null;
  pixelPerfect: boolean;
  onClose: () => void;
  onDone?: (message: string) => void;
}

const PRESETS = [256, 512, 1024, 2048];

const SCOPES: { value: DownloadScope; label: string }[] = [
  { value: 'canvas', label: 'Whole canvas' },
  { value: 'artwork', label: 'Just the image' },
  { value: 'layer', label: 'Selected layer' },
];

const SCOPE_HELP: Record<DownloadScope, string> = {
  canvas: 'The whole canvas, empty space included',
  artwork: 'Trimmed to the edges of everything on the canvas',
  layer: 'Only the selected layer, trimmed to its edges',
};

/** Where to start: the last export's settings if there were any. */
function initialSettings(doc: SymbolDoc, selectedId: string | null): { settings: DownloadSettings; remembered: boolean } {
  const last = loadDownload();
  const start = last ?? defaultDownload(docWidth(doc), docHeight(doc));
  // A remembered "selected layer" with nothing selected falls back to the
  // artwork, which is the closest thing to what was meant.
  if (start.scope === 'layer' && !selectedId) start.scope = 'artwork';
  return { settings: start, remembered: !!last };
}

/** The part of the doc a scope exports, always on a transparent background
 *  — the same as the download has always been. */
function docFor(doc: SymbolDoc, scope: DownloadScope, selectedId: string | null): SymbolDoc {
  const base: SymbolDoc = { ...doc, background: { kind: 'transparent' } };
  if (scope !== 'layer' || !selectedId) return base;
  return { ...base, nodes: doc.nodes.filter((n) => n.id === selectedId).map((n) => ({ ...n, hidden: false })) };
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function pngBlob(svg: string, w: number, h: number, pixelPerfect: boolean): Promise<Blob> {
  const dataUrl = await svgToPngDataUrl(svg, w, h, pixelPerfect);
  return (await fetch(dataUrl)).blob();
}

export const DownloadDialog: React.FC<DownloadDialogProps> = ({
  doc, selectedId, pixelPerfect, onClose, onDone,
}) => {
  const [initial] = useState(() => initialSettings(doc, selectedId));
  const [settings, setSettings] = useState<DownloadSettings>(initial.settings);
  const remembered = initial.remembered;
  // Width/height are typed as text and committed on blur or Enter; clamping
  // on every keystroke would turn the "1" of "1024" into 16.
  const [draftW, setDraftW] = useState(String(initial.settings.width));
  const [draftH, setDraftH] = useState(String(initial.settings.height));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportDoc = useMemo(() => docFor(doc, settings.scope, selectedId), [doc, settings.scope, selectedId]);

  // What the chosen scope covers. The whole canvas is known; anything trimmed
  // is measured from rendered pixels, which takes a moment.
  const [measured, setMeasured] = useState<{ doc: SymbolDoc; pixelPerfect: boolean; rect: Rect | null } | null>(null);
  // Picking a scope reshapes the output to fit it, once its bounds are known.
  // Reopening doesn't: the remembered size is what keeps a set matching.
  const fitPendingRef = useRef(false);
  const trimmed = settings.scope !== 'canvas';
  const measuredNow = !!measured && measured.doc === exportDoc && measured.pixelPerfect === pixelPerfect;
  const measuring = trimmed && !measuredNow;
  const canvasW = docWidth(doc);
  const canvasH = docHeight(doc);
  const region = useMemo<Rect | null>(() => {
    if (!trimmed) return { x: 0, y: 0, w: canvasW, h: canvasH };
    return measuredNow ? measured!.rect : null;
  }, [trimmed, canvasW, canvasH, measuredNow, measured]);

  useEffect(() => {
    if (!trimmed) return;
    let live = true;
    artworkBounds(exportDoc, pixelPerfect)
      .catch(() => null)
      .then((rect) => {
        if (!live) return;
        setMeasured({ doc: exportDoc, pixelPerfect, rect });
        if (rect && fitPendingRef.current) {
          fitPendingRef.current = false;
          fitTo(rect);
        }
      });
    return () => { live = false; };
  }, [exportDoc, trimmed, pixelPerfect]);

  const svg = useMemo(() => {
    if (!region) return null;
    const { width, height } = settings;
    return symbolToSvg(exportDoc, {
      pixelPerfect,
      viewBox: viewBoxFor(padRegion(region, settings.padding), width, height),
      width,
      height,
    });
  }, [exportDoc, region, settings, pixelPerfect]);

  const update = (patch: Partial<DownloadSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const commitSide = (side: 'width' | 'height', text: string) => {
    const n = Number(text);
    setSettings((s) => {
      const next = Number.isFinite(n) && n > 0 ? { ...s, ...resizeLocked(s, side, n) } : s;
      setDraftW(String(next.width));
      setDraftH(String(next.height));
      return next;
    });
  };

  const setSize = (size: { width: number; height: number }) => {
    update(size);
    setDraftW(String(size.width));
    setDraftH(String(size.height));
  };

  /** Keep the longest side, take the shape of `rect` (plus its padding). */
  function fitTo(rect: Rect) {
    setSettings((s) => {
      const size = sizeForShape(rect, s.padding, Math.max(s.width, s.height));
      setDraftW(String(size.width));
      setDraftH(String(size.height));
      return { ...s, ...size };
    });
  }

  const chooseScope = (scope: DownloadScope) => {
    if (scope === settings.scope) return;
    update({ scope });
    if (scope === 'canvas') {
      fitPendingRef.current = false;
      fitTo({ x: 0, y: 0, w: canvasW, h: canvasH });
    } else {
      fitPendingRef.current = true;
    }
  };

  /** A preset sets the longest side, keeping the current shape. */
  const applyPreset = (longest: number) => {
    const { width, height } = settings;
    setSize(width >= height
      ? { width: longest, height: clampPx((longest * height) / width) }
      : { width: clampPx((longest * width) / height), height: longest });
  };

  const handleDownload = async () => {
    if (!svg) return;
    setBusy(true);
    try {
      const fileName = fileNameFor(settings.name, settings.format);
      triggerDownload(
        settings.format === 'svg' ? svgToBlob(svg) : await pngBlob(svg, settings.width, settings.height, pixelPerfect),
        fileName,
      );
      saveDownload(settings);
      onDone?.(`Downloaded ${fileName}`);
      onClose();
    } catch {
      setError('Could not make that file — try a smaller size.');
    } finally {
      setBusy(false);
    }
  };

  // Called synchronously from the click so the clipboard write stays inside
  // the user gesture; the PNG is rendered while the browser waits on it.
  const handleCopy = () => {
    if (!svg) return;
    setBusy(true);
    copyPngToClipboard(pngBlob(svg, settings.width, settings.height, pixelPerfect))
      .then(() => {
        saveDownload(settings);
        onDone?.(`Copied a ${settings.width} × ${settings.height} PNG`);
        onClose();
      })
      .catch(() => setError('The browser blocked the copy — use Download instead.'))
      .finally(() => setBusy(false));
  };

  // The preview is drawn at the output's shape, fitted to a small box.
  const box = 150;
  const pScale = box / Math.max(settings.width, settings.height);
  const disabled = !svg || busy || measuring;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Copy or download"
      actions={
        <>
          {error && <span className="smk-error" role="alert">{error}</span>}
          <button type="button" className="smk-btn" onClick={onClose}>Cancel</button>
          {CAN_COPY_IMAGE && (
            <button type="button" className="smk-btn" onClick={handleCopy} disabled={disabled} title="Copy as a PNG with a transparent background">
              <Icon name="copy" size={16} /> Copy PNG
            </button>
          )}
          <button type="button" className="smk-btn is-primary" onClick={handleDownload} disabled={disabled}>
            <Icon name="download" size={16} /> Download
          </button>
        </>
      }
    >
      {/* Exactly what will be saved, on a checkerboard so the transparent
          margin shows as margin. */}
      <div className="smk-export-preview">
        <div className="smk-checker smk-export-frame" style={{ width: settings.width * pScale, height: settings.height * pScale }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise */}
          {svg && <img alt="Export preview" src={svgToDataUrl(svg)} />}
        </div>
        <span className={region || measuring ? 'smk-caption' : 'smk-error'}>
          {measuring ? 'Measuring…' : region ? `${settings.width} × ${settings.height} px` : 'Nothing visible to export'}
        </span>
        {remembered && (
          <span className="smk-caption">Same settings as your last export, so this one will match it.</span>
        )}
      </div>

      <div>
        <p className="smk-overline">What to include</p>
        <div className="smk-segmented" role="radiogroup" aria-label="What to include">
          {SCOPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={settings.scope === value}
              className={settings.scope === value ? 'is-active' : ''}
              disabled={value === 'layer' && !selectedId}
              onClick={() => chooseScope(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="smk-caption">
          {settings.scope === 'layer' || selectedId ? SCOPE_HELP[settings.scope] : `${SCOPE_HELP[settings.scope]} · select a layer to export it alone`}
        </p>
      </div>

      <div>
        <p className="smk-overline">Size (pixels)</p>
        <div className="smk-size-fields">
          <label className="smk-field">
            <span>Width</span>
            <input
              value={draftW}
              inputMode="numeric"
              aria-label="Width in pixels"
              onChange={(e) => setDraftW(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => commitSide('width', draftW)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSide('width', draftW); }}
            />
          </label>
          <button
            type="button"
            className={`smk-icon-btn${settings.lockAspect ? ' is-active' : ''}`}
            aria-label={settings.lockAspect ? 'Unlock proportions' : 'Lock proportions'}
            title={settings.lockAspect ? 'Width and height change together' : 'Width and height change separately'}
            onClick={() => update({ lockAspect: !settings.lockAspect })}
          >
            <Icon name={settings.lockAspect ? 'link' : 'linkOff'} />
          </button>
          <label className="smk-field">
            <span>Height</span>
            <input
              value={draftH}
              inputMode="numeric"
              aria-label="Height in pixels"
              onChange={(e) => setDraftH(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => commitSide('height', draftH)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSide('height', draftH); }}
            />
          </label>
        </div>
        <div className="smk-chips">
          {PRESETS.map((p) => (
            <button key={p} type="button" className="smk-chip" onClick={() => applyPreset(p)}>{p}</button>
          ))}
          <button
            type="button"
            className="smk-chip"
            disabled={!region}
            onClick={() => region && fitTo(region)}
          >
            Fit to image shape
          </button>
        </div>
      </div>

      <label className="smk-slider">
        <span className="smk-overline">Space around · {Math.round(settings.padding * 100)}%</span>
        <input
          type="range"
          min={0}
          max={MAX_PADDING}
          step={0.01}
          value={settings.padding}
          onChange={(e) => update({ padding: Number(e.target.value) })}
          aria-label="Space around the image"
        />
      </label>

      <div className="smk-format-row">
        <div className="smk-segmented" role="radiogroup" aria-label="File format">
          {(['png', 'svg'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={settings.format === f}
              className={settings.format === f ? 'is-active' : ''}
              onClick={() => update({ format: f })}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <label className="smk-field smk-grow">
          <span>File name</span>
          <input value={settings.name} onChange={(e) => update({ name: e.target.value })} />
          <small className="smk-caption">{fileNameFor(settings.name, settings.format)}</small>
        </label>
      </div>
    </Dialog>
  );
};
