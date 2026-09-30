import React from 'react';
import { CanvasSizeControl } from './CanvasSizeControl';
import { Icon, IconName } from './ui';

interface SymbolTopBarProps {
  title?: string;
  canvasWidth: number;
  canvasHeight: number;
  onSizeChange: (width: number, height: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Open the file picker to add an image layer. */
  onAddImage: () => void;
  /** False when neither the system clipboard nor a cut layer can be pasted. */
  canPaste: boolean;
  onPaste: () => void;
  onClear: () => void;
  showGuides: boolean;
  onToggleGuides: () => void;
  /** Opens the export dialog, which both copies and downloads. */
  onExport?: () => void;
  canExport: boolean;
  /** Splice a selected sprite-sheet image into per-cell layers. Undefined when no image is selected. */
  onSlice?: () => void;
  /** Scale the selected image to fill the canvas (aspect-preserved). Undefined when nothing fittable is selected. */
  onFitToCanvas?: () => void;
  pixelPerfect?: boolean;
  onTogglePixelPerfect?: () => void;
}

const IconButton: React.FC<{ icon: IconName; label: string; onClick?: () => void; disabled?: boolean; active?: boolean }> = ({
  icon, label, onClick, disabled, active,
}) => (
  <button
    type="button"
    className={`smk-icon-btn${active ? ' is-active' : ''}`}
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
  >
    <Icon name={icon} />
  </button>
);

export const SymbolTopBar: React.FC<SymbolTopBarProps> = ({
  title = 'Symbol',
  canvasWidth,
  canvasHeight,
  onSizeChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddImage,
  canPaste,
  onPaste,
  onClear,
  showGuides,
  onToggleGuides,
  onExport,
  canExport,
  onSlice,
  onFitToCanvas,
  pixelPerfect,
  onTogglePixelPerfect,
}) => (
  <div className="smk-topbar">
    <span className="smk-topbar-title">{title}</span>

    <button type="button" className="smk-btn" onClick={onAddImage} title="Add an image from a file (or drop one on the canvas)">
      <Icon name="image" size={16} />
      Add image
    </button>
    <button
      type="button"
      className="smk-btn"
      onClick={onPaste}
      disabled={!canPaste}
      title={canPaste ? 'Paste an image from the clipboard (or press Ctrl/Cmd+V)' : 'Nothing to paste'}
    >
      <Icon name="paste" size={16} />
      Paste
    </button>

    <span className="smk-grow" />

    <CanvasSizeControl width={canvasWidth} height={canvasHeight} onChange={onSizeChange} />

    <IconButton icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
    <IconButton icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />
    <IconButton icon="trash" label="Clear all" onClick={onClear} />
    <IconButton
      icon={showGuides ? 'gridOn' : 'gridOff'}
      label={showGuides ? 'Hide centering guides' : 'Show centering guides'}
      onClick={onToggleGuides}
    />
    {onSlice && <IconButton icon="slice" label="Slice selected image into a grid of layers" onClick={onSlice} />}
    {onFitToCanvas && <IconButton icon="fit" label="Fit selected to canvas (no distortion)" onClick={onFitToCanvas} />}
    {onTogglePixelPerfect && (
      <IconButton
        icon={pixelPerfect ? 'pixel' : 'smooth'}
        label={pixelPerfect ? 'Pixel-perfect ON (no smoothing — sharp upscales)' : 'Pixel-perfect OFF (smooth scaling)'}
        onClick={onTogglePixelPerfect}
        active={pixelPerfect}
      />
    )}

    {onExport && (
      <button
        type="button"
        className="smk-btn is-primary"
        onClick={onExport}
        disabled={!canExport}
        title="Choose what to include and the size, then copy or download"
      >
        <Icon name="download" size={16} />
        Copy / download
      </button>
    )}
  </div>
);
