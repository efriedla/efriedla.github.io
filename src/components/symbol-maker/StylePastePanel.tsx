import React from 'react';
import type { SymbolNode } from './types';
import {
  CopiedStyle, PART_LABELS, PartChoice, StylePart, availability, describeCopy, typeLabel,
} from './styleClipboard';
import { Popover } from './ui';

// The Paste style list: every part of the copied style, ticked or not, with
// anything that cannot go onto this layer greyed out and the reason beside it.
// Ticks are remembered, so pasting through a set of symbols is one tap each.

interface StylePastePanelProps {
  anchor: HTMLElement | null;
  style: CopiedStyle;
  target: SymbolNode | null | undefined;
  choice: PartChoice;
  onChoice: (next: PartChoice) => void;
  onPaste: () => void;
  onClose: () => void;
}

const GROUPS = ['Canvas', 'Layer', 'Text', 'Image'] as const;

export const StylePastePanel: React.FC<StylePastePanelProps> = ({
  anchor, style, target, choice, onChoice, onPaste, onClose,
}) => {
  const avail = availability(style, target);
  const willPaste = (Object.keys(choice) as StylePart[]).filter((p) => choice[p] && avail[p] === null);

  // A group whose every part is impossible (text styles onto an image, say)
  // is hidden rather than shown as a wall of disabled boxes.
  const visibleGroups = GROUPS.filter((g) => {
    const parts = PART_LABELS.filter((p) => p.group === g);
    if (g === 'Canvas' || g === 'Layer') return true;
    return parts.some((p) => avail[p.part] === null);
  });

  return (
    <Popover anchor={anchor} onClose={onClose} placement="above" width={300} label="Paste style">
      <p className="smk-pop-title">Paste style</p>
      <p className="smk-caption">
        From: {describeCopy(style)}
        {target ? ` → this ${typeLabel(target.type)}` : ' → this canvas'}
      </p>

      {visibleGroups.map((g) => (
        <fieldset key={g} className="smk-group">
          <legend className="smk-overline">{g}</legend>
          {PART_LABELS.filter((p) => p.group === g).map(({ part, label }) => {
            const why = avail[part];
            return (
              <label key={part} className={`smk-check${why ? ' is-disabled' : ''}`}>
                <input
                  type="checkbox"
                  disabled={!!why}
                  checked={choice[part] && !why}
                  onChange={(e) => onChoice({ ...choice, [part]: e.target.checked })}
                />
                <span>
                  {label}
                  {why && <span className="smk-caption-inline"> — {why.toLowerCase()}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}

      {choice.canvasSize && (
        <p className="smk-caption">
          Canvas becomes {style.canvas.width} × {style.canvas.height}, around its centre — layers keep their place.
        </p>
      )}

      <div className="smk-row-end">
        <button type="button" className="smk-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="smk-btn is-primary" disabled={!willPaste.length} onClick={onPaste}>
          Paste {willPaste.length ? `(${willPaste.length})` : ''}
        </button>
      </div>
    </Popover>
  );
};
