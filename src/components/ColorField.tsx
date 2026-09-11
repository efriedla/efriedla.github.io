"use client";

import { useId } from "react";

/**
 * A native colour input, a typable hex field and a row of presets.
 *
 * The native picker alone is a poor fit here: it can't be pasted into from a
 * brand guide, and it hides behind an OS dialog on every platform. The text
 * field takes the paste; the swatches cover the common case in one click.
 */
export function ColorField({
  label,
  value,
  onChange,
  swatches,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  swatches: string[];
}) {
  const id = useId();

  return (
    <div className="cf-field">
      <label className="qrm-label" htmlFor={id}>
        {label}
      </label>
      <div className="cf-row">
        <input
          id={id}
          type="color"
          className="cf-chip"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} colour picker`}
        />
        <input
          type="text"
          className="qrm-input cf-hex"
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} hex value`}
        />
      </div>
      <div className="cf-swatches">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="cf-swatch"
            style={{ background: swatch }}
            aria-label={`${label} ${swatch}`}
            aria-pressed={value.toLowerCase() === swatch.toLowerCase()}
            onClick={() => onChange(swatch)}
          />
        ))}
      </div>
    </div>
  );
}
