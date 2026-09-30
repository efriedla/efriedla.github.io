import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

// The few UI pieces the symbol maker needs — a dialog, an anchored popover and
// an icon set — in plain markup, so the tool carries no component library.
// Styles live in SymbolMaker.css under the `smk-` prefix.

// ── Dialog ──────────────────────────────────────────────────────────────────

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Panel width: sm ≈ 440px, md ≈ 820px. */
  size?: 'sm' | 'md';
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, size = 'sm', actions, children }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Move focus into the dialog so keyboard users land in it, and put it back afterwards.
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="smk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        className={`smk-dialog smk-dialog-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 id={titleId} className="smk-dialog-title">{title}</h3>
        <div className="smk-dialog-body">{children}</div>
        {actions && <div className="smk-dialog-actions">{actions}</div>}
      </div>
    </div>
  );
};

// ── Popover ─────────────────────────────────────────────────────────────────

interface PopoverProps {
  anchor: HTMLElement | null;
  onClose: () => void;
  /** Open below the anchor (default) or above it. */
  placement?: 'below' | 'above';
  width?: number;
  label: string;
  children: React.ReactNode;
}

export const Popover: React.FC<PopoverProps> = ({ anchor, onClose, placement = 'below', width = 290, label, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Fixed-position next to the anchor, kept on screen.
  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 0;
      const left = Math.max(8, Math.min(a.left, window.innerWidth - width - 8));
      const top = placement === 'above' ? Math.max(8, a.top - h - 6) : Math.min(a.bottom + 6, window.innerHeight - h - 8);
      setPos({ left, top: Math.max(8, top) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, placement, width]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return (
    <div
      ref={ref}
      className="smk-popover"
      role="dialog"
      aria-label={label}
      style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {children}
    </div>
  );
};

// ── Icons ───────────────────────────────────────────────────────────────────
// 24px line icons drawn in currentColor.

const PATHS = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></>,
  paste: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  gridOn: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M12 4v16M4 12h16" /></>,
  gridOff: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 4l16 16" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  slice: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16" /></>,
  fit: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><rect x="8" y="8" width="8" height="8" rx="1" /></>,
  pixel: <><rect x="4" y="4" width="4" height="4" /><rect x="10" y="4" width="4" height="4" /><rect x="16" y="4" width="4" height="4" /><rect x="4" y="10" width="4" height="4" /><rect x="10" y="10" width="4" height="4" /><rect x="16" y="10" width="4" height="4" /><rect x="4" y="16" width="4" height="4" /><rect x="10" y="16" width="4" height="4" /><rect x="16" y="16" width="4" height="4" /></>,
  smooth: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" strokeDasharray="2 3" /></>,
  image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 8" /></>,
  select: <path d="M6 3l12 8-5.5 1.5L15 19l-2.5 1.2-2.6-6.3L6 18z" />,
  pen: <><path d="M4 20c3-1 4-3 5-5l8-8a2 2 0 013 3l-8 8c-2 1-4 2-5 5" /><path d="M14 7l3 3" /></>,
  fill: <><path d="M5 11l7-7 7 7-7 7z" /><path d="M20 15c0 1.5-1 3-2 3s-2-1.5-2-3 2-3.5 2-3.5 2 2 2 3.5z" /><path d="M5 11h14" /></>,
  cut: <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M8.2 15L18 4M15.8 15L6 4" /></>,
  rect: <rect x="4" y="6" width="16" height="12" rx="1" />,
  circle: <circle cx="12" cy="12" r="8" />,
  polygon: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />,
  line: <path d="M4 19L20 5" />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  move: <><path d="M12 3v18M3 12h18" /><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M2 12s3.5-7 10-7c2 0 3.8.7 5.2 1.6M22 12s-3.5 7-10 7c-2 0-3.8-.7-5.2-1.6" /><path d="M4 4l16 16" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 017.5-2" /></>,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  solo: <><circle cx="12" cy="12" r="3" /><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /></>,
  link: <><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" /></>,
  linkOff: <><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" /><path d="M4 4l16 16" /></>,
  swap: <><path d="M7 7h13l-3-3M17 17H4l3 3" /></>,
  size: <><rect x="3" y="6" width="18" height="12" rx="1" /><path d="M7 10v4M17 10v4" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export const Icon: React.FC<{ name: IconName; size?: number }> = ({ name, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {PATHS[name]}
  </svg>
);
