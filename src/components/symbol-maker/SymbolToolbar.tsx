import React from 'react';
import type { SymbolTool } from './types';
import { TOOL_LABELS } from './types';
import { Icon, IconName } from './ui';

interface SymbolToolbarProps {
  tool: SymbolTool;
  onToolChange: (tool: SymbolTool) => void;
  orientation?: 'vertical' | 'horizontal';
}

const TOOLS: { tool: SymbolTool; icon: IconName }[] = [
  { tool: 'select', icon: 'select' },
  { tool: 'pen', icon: 'pen' },
  { tool: 'fill', icon: 'fill' },
  { tool: 'cut', icon: 'cut' },
  { tool: 'rect', icon: 'rect' },
  { tool: 'circle', icon: 'circle' },
  { tool: 'polygon', icon: 'polygon' },
  { tool: 'star', icon: 'star' },
  { tool: 'line', icon: 'line' },
  { tool: 'text', icon: 'text' },
  { tool: 'move', icon: 'move' },
];

export const SymbolToolbar: React.FC<SymbolToolbarProps> = ({ tool, onToolChange, orientation = 'vertical' }) => (
  <div className={`smk-toolbar smk-toolbar-${orientation}`} role="toolbar" aria-label="Drawing tools" aria-orientation={orientation}>
    {TOOLS.map(({ tool: t, icon }, i) => (
      <React.Fragment key={t}>
        <button
          type="button"
          className={`smk-icon-btn${tool === t ? ' is-active' : ''}`}
          onClick={() => onToolChange(t)}
          title={TOOL_LABELS[t]}
          aria-label={TOOL_LABELS[t]}
          aria-pressed={tool === t}
        >
          <Icon name={icon} />
        </button>
        {(i === 3 || i === 9) && <span className="smk-toolbar-divider" aria-hidden="true" />}
      </React.Fragment>
    ))}
  </div>
);
