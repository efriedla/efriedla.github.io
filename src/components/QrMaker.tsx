"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { ColorField } from "./ColorField";
import { buildIcs, type CalendarEvent } from "@/lib/ics";
import { googleCalendarUrl } from "@/lib/calendar-links";
import { contrastRatio, isInverted, QR_MIN_CONTRAST } from "@/lib/color";
import "./QrMaker.css";

type ErrorLevel = 'L' | 'M' | 'Q' | 'H';
type Mode = 'link' | 'event' | 'gcal';

const FG_SWATCHES = [
  '#000000', '#1f2937', '#a855f7', '#3b82f6',
  '#ec4899', '#10b981', '#f59e0b', '#ffffff',
];
const BG_SWATCHES = [
  '#ffffff', '#f9fafb', '#f3f4f6', '#e5e7eb',
  '#d1d5db', '#1f2937', '#0f172a', '#000000',
];

const SIZES = [
  { v: 256, label: '256 px · small' },
  { v: 512, label: '512 px · medium' },
  { v: 1024, label: '1024 px · large' },
  { v: 2048, label: '2048 px · huge' },
];

const ERROR_LEVELS: { v: ErrorLevel; label: string }[] = [
  { v: 'L', label: 'L · Low (~7%)' },
  { v: 'M', label: 'M · Medium (~15%)' },
  { v: 'Q', label: 'Q · Quartile (~25%)' },
  { v: 'H', label: 'H · High (~30%)' },
];

// QR byte-mode capacity per error correction level (Version 40, max)
const MAX_BYTES: Record<ErrorLevel, number> = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
};

// The form collects wall-clock time with no zone attached, which is exactly
// what `buildIcs` wants — it does the zone conversion itself. Passing the
// viewer's IANA zone (rather than stamping a Z on the string) is the difference
// between a 2:30pm appointment landing at 2:30pm and landing at 7:30am.
function eventFrom(fields: {
  title: string;
  start: string;
  end: string;
  location: string;
  description: string;
}): CalendarEvent {
  return {
    title: fields.title,
    start: fields.start,
    end: fields.end || undefined,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    location: fields.location || undefined,
    description: fields.description || undefined,
  };
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function QrMaker() {
  const [mode, setMode] = useState<Mode>('link');

  // Link tab
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  // Event tab
  const [evTitle, setEvTitle] = useState('');
  const [evStart, setEvStart] = useState('');
  const [evEnd, setEvEnd] = useState('');
  const [evLoc, setEvLoc] = useState('');
  const [evDesc, setEvDesc] = useState('');

  // Style
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#ffffff');
  const [level, setLevel] = useState<ErrorLevel>('Q');
  const [size, setSize] = useState(512);
  const [withLogo, setWithLogo] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<string | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasFullRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const scrollToPreview = useCallback(() => {
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  // The tool no longer owns the scroll container — it sits in the page flow
  // under the site header — so "back to form" scrolls the window to the form.
  const scrollToTop = useCallback(() => {
    pageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Responsive preview size — shrinks on narrow phones so the QR fits without overflow.
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Compute encoded payload
  const payload = useMemo(() => {
    if (mode === 'link') return url.trim();
    if (!evTitle && !evStart) return '';
    const ev = eventFrom({
      title: evTitle,
      start: evStart,
      end: evEnd,
      location: evLoc,
      description: evDesc,
    });
    return mode === 'gcal' ? googleCalendarUrl(ev) : buildIcs(ev);
  }, [mode, url, evTitle, evStart, evEnd, evLoc, evDesc]);

  // Free colour choice makes it easy to build a QR that looks great and cannot
  // be scanned, so say so at the point of choosing rather than letting the user
  // find out after printing it.
  const contrastWarning = useMemo(() => {
    const ratio = contrastRatio(fg, bg);
    if (ratio < QR_MIN_CONTRAST) {
      return `Low contrast (${ratio.toFixed(1)}:1) — scanners may fail. Aim for ${QR_MIN_CONTRAST}:1 or more.`;
    }
    if (isInverted(fg, bg)) {
      return 'Light code on a dark background — modern phones cope, but some older scanners expect dark on light.';
    }
    return null;
  }, [fg, bg]);

  const charCount = payload.length;
  const tooLong = charCount > MAX_BYTES[level];
  const isReady = payload.length > 0 && !tooLong;

  // Cap at 280 on desktop, shrink to fit on narrow phones (down to 180 minimum).
  const previewSize = vw <= 560 ? Math.max(180, Math.min(280, vw - 120)) : 280;

  const handlePngDownload = useCallback(() => {
    const canvas = canvasFullRef.current?.querySelector('canvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    downloadDataUrl(dataUrl, `qrcode-${Date.now()}.png`);
    setToast('PNG saved to your device');
  }, []);

  const handleSvgDownload = useCallback(() => {
    const svg = svgWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, `qrcode-${Date.now()}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('SVG saved to your device');
  }, []);

  const handleCopy = useCallback(async () => {
    const canvas = canvasFullRef.current?.querySelector('canvas');
    if (!canvas) {
      setToast('No QR to copy yet');
      return;
    }
    const hasClipboardItem = typeof window !== 'undefined' && 'ClipboardItem' in window;
    if (!hasClipboardItem || !navigator.clipboard?.write) {
      // Older browsers — fall back to opening the image so the user can right-click → copy
      const dataUrl = canvas.toDataURL('image/png');
      window.open(dataUrl, '_blank');
      setToast('Browser can\'t copy images directly — opened in a new tab');
      return;
    }
    try {
      // Construct ClipboardItem synchronously in the click handler.
      // Pass a Promise<Blob> so Safari accepts it (no await before `new ClipboardItem`).
      const blobPromise = new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png');
      });
      const item = new ClipboardItem({ 'image/png': blobPromise });
      await navigator.clipboard.write([item]);
      setToast('QR copied — paste anywhere');
    } catch (err) {
      console.error('QR copy failed:', err);
      const msg = (err as Error)?.message || 'unknown';
      setToast(`Copy blocked: ${msg.slice(0, 60)}`);
    }
  }, []);

  const handleLogoFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setToast('Logo must be an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setToast('Logo must be under 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoSrc(reader.result as string);
      setLogoName(file.name);
    };
    reader.onerror = () => setToast('Could not read logo file');
    reader.readAsDataURL(file);
  }, []);

  const clearLogo = useCallback(() => {
    setLogoSrc(null);
    setLogoName(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  }, []);

  // Build imageSettings only when logo enabled + loaded
  const previewLogoSize = Math.round(previewSize * 0.22);
  const fullLogoSize = Math.round(size * 0.22);
  const previewImageSettings = withLogo && logoSrc
    ? { src: logoSrc, height: previewLogoSize, width: previewLogoSize, excavate: true }
    : undefined;
  const fullImageSettings = withLogo && logoSrc
    ? { src: logoSrc, height: fullLogoSize, width: fullLogoSize, excavate: true }
    : undefined;
  const showLevelHint = withLogo && logoSrc && level !== 'H' && level !== 'Q';

  return (
    <div className="qrm-page" ref={pageRef}>
      <div className="qrm-inner">
        <div className="qrm-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'link'}
            className={`qrm-tab${mode === 'link' ? ' is-active' : ''}`}
            onClick={() => setMode('link')}
          >
            ✦ Link
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'event'}
            className={`qrm-tab${mode === 'event' ? ' is-active' : ''}`}
            onClick={() => setMode('event')}
          >
            📅 Calendar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'gcal'}
            className={`qrm-tab${mode === 'gcal' ? ' is-active' : ''}`}
            onClick={() => setMode('gcal')}
          >
            🗓️ Google Calendar
          </button>
        </div>

        <div className="qrm-cols">
          {/* ---------- Form panel ---------- */}
          <div className="qrm-card">
            {mode === 'link' ? (
              <>
                <h2 className="qrm-card-header">Link</h2>
                <p className="qrm-card-sub">Paste any URL. We&apos;ll generate the QR live as you type.</p>

                <div className="qrm-field">
                  <label className="qrm-label" htmlFor="qrm-url">URL *</label>
                  <input
                    id="qrm-url"
                    className="qrm-input"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    autoFocus
                  />
                </div>
                <div className="qrm-field">
                  <label className="qrm-label" htmlFor="qrm-label">Label (optional, shown above QR)</label>
                  <input
                    id="qrm-label"
                    className="qrm-input"
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Visit us"
                  />
                </div>
              </>
            ) : (
              <>
                <h2 className="qrm-card-header">
                  {mode === 'gcal' ? 'Google Calendar invite' : 'Calendar invite'}
                </h2>
                <p className="qrm-card-sub">
                  {mode === 'gcal'
                    ? 'Encodes a Google Calendar link. Scanning opens the Google event composer, already filled in — works best on Android and anywhere signed into Google.'
                    : 'Encodes a standard .ics event. Works with Apple Calendar, Outlook and most built-in phone scanners.'}
                </p>

                <div className="qrm-field">
                  <label className="qrm-label" htmlFor="qrm-evtitle">Event title *</label>
                  <input
                    id="qrm-evtitle"
                    className="qrm-input"
                    type="text"
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    placeholder="Coffee meetup"
                  />
                </div>
                <div className="qrm-row-2">
                  <div className="qrm-field">
                    <label className="qrm-label" htmlFor="qrm-evstart">Starts</label>
                    <input
                      id="qrm-evstart"
                      className="qrm-input"
                      type="datetime-local"
                      value={evStart}
                      onChange={(e) => setEvStart(e.target.value)}
                    />
                  </div>
                  <div className="qrm-field">
                    <label className="qrm-label" htmlFor="qrm-evend">Ends</label>
                    <input
                      id="qrm-evend"
                      className="qrm-input"
                      type="datetime-local"
                      value={evEnd}
                      onChange={(e) => setEvEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="qrm-field">
                  <label className="qrm-label" htmlFor="qrm-evloc">Location</label>
                  <input
                    id="qrm-evloc"
                    className="qrm-input"
                    type="text"
                    value={evLoc}
                    onChange={(e) => setEvLoc(e.target.value)}
                    placeholder="123 Main St, or a Zoom link"
                  />
                </div>
                <div className="qrm-field">
                  <label className="qrm-label" htmlFor="qrm-evdesc">Description</label>
                  <input
                    id="qrm-evdesc"
                    className="qrm-input"
                    type="text"
                    value={evDesc}
                    onChange={(e) => setEvDesc(e.target.value)}
                    placeholder="Short blurb shown in the calendar entry"
                  />
                </div>
              </>
            )}

            <div className="qrm-divider">Style</div>

            <div className="qrm-field">
              <ColorField
                label="Foreground"
                value={fg}
                onChange={setFg}
                swatches={FG_SWATCHES}
              />
            </div>
            <div className="qrm-field">
              <ColorField
                label="Background"
                value={bg}
                onChange={setBg}
                swatches={BG_SWATCHES}
              />
            </div>
            {contrastWarning && (
              <p className="qrm-contrast-warn" role="status">{contrastWarning}</p>
            )}

            <div className="qrm-advanced">
            <div className="qrm-row-2">
              <div className="qrm-field">
                <label className="qrm-label" htmlFor="qrm-level">Error correction</label>
                <select
                  id="qrm-level"
                  className="qrm-select"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as ErrorLevel)}
                >
                  {ERROR_LEVELS.map((l) => (
                    <option key={l.v} value={l.v}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="qrm-field">
                <label className="qrm-label" htmlFor="qrm-size">Size</label>
                <select
                  id="qrm-size"
                  className="qrm-select"
                  value={size}
                  onChange={(e) => setSize(parseInt(e.target.value, 10))}
                >
                  {SIZES.map((s) => (
                    <option key={s.v} value={s.v}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="qrm-toggle-row">
              <span className="qrm-toggle-text">
                <strong>Add logo in center</strong>
                <small>Higher error correction recommended (Q or H)</small>
              </span>
              <input
                type="checkbox"
                className="qrm-toggle"
                checked={withLogo}
                onChange={(e) => {
                  const v = e.target.checked;
                  setWithLogo(v);
                  if (!v) clearLogo();
                }}
              />
            </label>

            {withLogo && (
              <div className="qrm-logo-picker">
                {!logoSrc ? (
                  <button
                    type="button"
                    className="qrm-logo-drop"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <span className="ico">⬆</span>
                    <span>Pick a logo image</span>
                    <small>PNG/SVG/JPG · up to 2 MB</small>
                  </button>
                ) : (
                  <div className="qrm-logo-loaded">
                    {/* A data URL from the viewer's own file, never a remote
                        asset — there is nothing for next/image to optimise. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoSrc} alt="" className="qrm-logo-thumb" />
                    <div className="qrm-logo-meta">
                      <strong>{logoName}</strong>
                      <small>Centered, ~22% of QR size</small>
                    </div>
                    <button type="button" className="qrm-logo-remove" onClick={clearLogo} aria-label="Remove logo">
                      ✕
                    </button>
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  hidden
                  onChange={(e) => handleLogoFile(e.target.files?.[0] || null)}
                />
                {showLevelHint && (
                  <p className="qrm-logo-hint">
                    Tip: bump <strong>Error correction</strong> to <strong>H</strong> so scanners
                    still read the code with the logo on top.{' '}
                    <button type="button" className="qrm-logo-hint-action" onClick={() => setLevel('H')}>
                      Set to H
                    </button>
                  </p>
                )}
              </div>
            )}
            </div>

            {isReady && (
              <button
                type="button"
                className="qrm-jump-btn qrm-jump-down"
                onClick={scrollToPreview}
                aria-label="Scroll to QR preview"
              >
                Show QR ↓
              </button>
            )}
          </div>

          {/* ---------- Preview panel ---------- */}
          <div>
            <div className="qrm-card" ref={previewRef}>
              <div className="qrm-preview-head">
                <h2 className="qrm-card-header" style={{ margin: 0 }}>Preview</h2>
                <span className="qrm-live">Live</span>
              </div>

              <div className="qrm-preview-stage">
                {!payload && (
                  <div className="qrm-preview-empty">
                    <span style={{ fontSize: '1.6rem', opacity: 0.5 }}>◳</span>
                    <span>Fill in the form — your QR shows up here.</span>
                  </div>
                )}
                {payload && tooLong && (
                  <div className="qrm-preview-error">
                    <span className="icon">⚠</span>
                    <strong>Payload too long</strong>
                    <small>Try reducing description length, or lowering error correction.</small>
                  </div>
                )}
                {isReady && (
                  <div className="qrm-preview-canvas">
                    {label && mode === 'link' && (
                      <span className="qrm-preview-label">{label}</span>
                    )}
                    <div ref={canvasWrapRef}>
                      <QRCodeCanvas
                        value={payload}
                        size={previewSize}
                        bgColor={bg}
                        fgColor={fg}
                        level={level}
                        marginSize={2}
                        imageSettings={previewImageSettings}
                      />
                    </div>
                    {/* Hidden SVG for export */}
                    <div ref={svgWrapRef} style={{ position: 'absolute', left: -9999, top: -9999 }}>
                      <QRCodeSVG
                        value={payload}
                        size={size}
                        bgColor={bg}
                        fgColor={fg}
                        level={level}
                        marginSize={2}
                        imageSettings={fullImageSettings}
                      />
                    </div>
                    {/* Hidden full-size canvas for PNG export and clipboard copy at chosen size */}
                    <div ref={canvasFullRef} style={{ position: 'absolute', left: -9999, top: -9999 }}>
                      <QRCodeCanvas
                        value={payload}
                        size={size}
                        bgColor={bg}
                        fgColor={fg}
                        level={level}
                        marginSize={2}
                        imageSettings={fullImageSettings}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="qrm-stats">
                <div className="qrm-stat">
                  <span className="v">{mode === 'link' ? 'Link' : mode === 'gcal' ? 'Google event' : 'Event (.ics)'}</span>
                  <span className="l">Type</span>
                </div>
                <div className="qrm-stat">
                  <span className="v">{charCount}</span>
                  <span className="l">Characters</span>
                </div>
                <div className="qrm-stat">
                  <span className="v">{level}</span>
                  <span className="l">Error correct</span>
                </div>
              </div>
            </div>

            <div className="qrm-card qrm-export-card">
              <h2 className="qrm-card-header">Download / Export</h2>
              <p className="qrm-card-sub">Saves directly to your device — no upload, no signup.</p>
              <div className="qrm-export-buttons">
                <button type="button" className="qrm-btn" disabled={!isReady} onClick={handlePngDownload}>
                  PNG download
                </button>
                <button type="button" className="qrm-btn" disabled={!isReady} onClick={handleSvgDownload}>
                  SVG download
                </button>
                <button type="button" className="qrm-btn" disabled={!isReady} onClick={handleCopy}>
                  ✦ Copy
                </button>
              </div>
              {payload && (
                <div className="qrm-encoded">
                  <span className="lbl">Encoded</span>
                  <span className="val">{payload}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="qrm-jump-btn qrm-jump-up"
              onClick={scrollToTop}
              aria-label="Scroll back to form"
            >
              Back to form ↑
            </button>
          </div>
        </div>
      </div>

      <div className={`qrm-toast${toast ? ' is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

