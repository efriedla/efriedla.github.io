import React, { useState } from 'react';
import { COMMON_SIZES } from './types';
import { clampPx, resizeLocked } from './downloadLayout';
import { Icon, Popover } from './ui';

// The canvas size, as width x height. Canvases used to be square only; that
// made a set of wide or tall symbols impossible to line up, because each one
// had to be framed inside a square and then trimmed differently on download.

interface CanvasSizeControlProps {
  width: number;
  height: number;
  onChange: (width: number, height: number) => void;
}

export const CanvasSizeControl: React.FC<CanvasSizeControlProps> = ({ width, height, onChange }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [lock, setLock] = useState(false);
  const [draftW, setDraftW] = useState(String(width));
  const [draftH, setDraftH] = useState(String(height));

  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    if (anchor) { setAnchor(null); return; }
    setDraftW(String(width));
    setDraftH(String(height));
    setAnchor(e.currentTarget);
  };

  // Typed values are committed on blur / Enter, like the Download dialog, so
  // the "1" of "1024" is not clamped to the minimum mid-typing.
  const commit = (side: 'width' | 'height', text: string) => {
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) { setDraftW(String(width)); setDraftH(String(height)); return; }
    const next = resizeLocked({ width, height, lockAspect: lock }, side, n);
    setDraftW(String(next.width));
    setDraftH(String(next.height));
    if (next.width !== width || next.height !== height) onChange(next.width, next.height);
  };

  const set = (w: number, h: number) => {
    setDraftW(String(clampPx(w)));
    setDraftH(String(clampPx(h)));
    onChange(clampPx(w), clampPx(h));
  };

  return (
    <>
      <button type="button" className="smk-btn smk-size-btn" onClick={toggle} title="Canvas size" aria-expanded={!!anchor}>
        <Icon name="size" size={16} />
        {width} × {height}
      </button>
      <Popover anchor={anchor} onClose={() => setAnchor(null)} label="Canvas size">
        <p className="smk-overline">Canvas size (pixels)</p>
        <div className="smk-size-fields">
          <label className="smk-field">
            <span>Width</span>
            <input
              value={draftW}
              inputMode="numeric"
              aria-label="Canvas width"
              onChange={(e) => setDraftW(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => commit('width', draftW)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit('width', draftW); }}
            />
          </label>
          <button
            type="button"
            className={`smk-icon-btn${lock ? ' is-active' : ''}`}
            aria-label={lock ? 'Unlock proportions' : 'Lock proportions'}
            title={lock ? 'Width and height change together' : 'Width and height change separately'}
            onClick={() => setLock((l) => !l)}
          >
            <Icon name={lock ? 'link' : 'linkOff'} />
          </button>
          <label className="smk-field">
            <span>Height</span>
            <input
              value={draftH}
              inputMode="numeric"
              aria-label="Canvas height"
              onChange={(e) => setDraftH(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => commit('height', draftH)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit('height', draftH); }}
            />
          </label>
        </div>
        <div className="smk-chips">
          {COMMON_SIZES.map(({ px, label }) => (
            <button
              key={px}
              type="button"
              className={`smk-chip${px === width && px === height ? ' is-active' : ''}`}
              onClick={() => set(px, px)}
            >
              {label} □
            </button>
          ))}
          <button
            type="button"
            className="smk-icon-btn"
            aria-label="Swap width and height"
            title="Swap width and height"
            disabled={width === height}
            onClick={() => set(height, width)}
          >
            <Icon name="swap" size={16} />
          </button>
        </div>
        <p className="smk-caption">
          The canvas grows or shrinks around its centre, so layers keep their place. To match another symbol, use Copy style there and paste its canvas size here.
        </p>
      </Popover>
    </>
  );
};
