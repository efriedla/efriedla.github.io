import React from 'react';
import type { SymbolNode } from './types';
import { Icon, IconName } from './ui';

interface LayersPanelProps {
  nodes: SymbolNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<SymbolNode>) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** When set, only this node is rendered on the canvas. */
  soloId?: string | null;
  /** Toggle solo for this layer. */
  onSolo?: (id: string) => void;
}

const TYPE_LABEL: Record<SymbolNode['type'], string> = {
  rect: 'Rect',
  circle: 'Circle',
  polygon: 'Polygon',
  star: 'Star',
  line: 'Line',
  pen: 'Pen',
  image: 'Image',
  text: 'Text',
};

const TYPE_ICON: Record<SymbolNode['type'], IconName> = {
  rect: 'rect',
  circle: 'circle',
  polygon: 'polygon',
  star: 'star',
  line: 'line',
  pen: 'pen',
  image: 'image',
  text: 'text',
};

export const LayersPanel: React.FC<LayersPanelProps> = ({
  nodes,
  selectedId,
  onSelect,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  soloId = null,
  onSolo,
}) => {
  // Display top-z first
  const reversed = [...nodes].reverse();

  const action = (title: string, icon: IconName, run: () => void, active = false) => (
    <button
      type="button"
      className={`smk-layer-btn${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); run(); }}
    >
      <Icon name={icon} size={14} />
    </button>
  );

  return (
    <div className="smk-layers">
      <div className="smk-layers-head">Layers</div>
      <div className="smk-layers-list">
        {reversed.length === 0 && (
          <p className="smk-layers-empty">No layers yet. Add an image, or pick a tool and start drawing.</p>
        )}
        {reversed.map((n) => {
          const isSolo = soloId === n.id;
          const label = n.name && n.name.trim() ? n.name : TYPE_LABEL[n.type];
          return (
            <div
              key={n.id}
              className={`smk-layer${n.id === selectedId ? ' is-selected' : ''}`}
              onClick={() => onSelect(n.id)}
            >
              <span className="smk-layer-glyph"><Icon name={TYPE_ICON[n.type]} size={14} /></span>
              <span className={`smk-layer-name${n.name ? ' is-named' : ''}`}>{label}</span>
              {action('Move up (z-order)', 'up', () => onMove(n.id, 'up'))}
              {action('Move down (z-order)', 'down', () => onMove(n.id, 'down'))}
              {onSolo && action(isSolo ? 'Un-solo (show all)' : 'Solo (show only this)', 'solo', () => onSolo(n.id), isSolo)}
              {action(n.hidden ? 'Show' : 'Hide', n.hidden ? 'eyeOff' : 'eye', () => onChange(n.id, { hidden: !n.hidden }))}
              {action(n.locked ? 'Unlock' : 'Lock', n.locked ? 'lock' : 'unlock', () => onChange(n.id, { locked: !n.locked }))}
              {action('Duplicate', 'copy', () => onDuplicate(n.id))}
              {action('Delete', 'trash', () => onDelete(n.id))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
