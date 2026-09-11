/**
 * Just enough colour maths to tell someone their QR won't scan.
 *
 * A QR reader thresholds the image into light and dark modules, so what matters
 * is luminance distance, not hue. Two colours that look clearly different to a
 * person — mid-blue on mid-green, say — can land close enough in luminance that
 * the decoder never finds the finder patterns.
 */

/** Below this the code is a coin flip on real scanners. */
export const QR_MIN_CONTRAST = 3;

/** Accepts `#abc`, `#aabbcc`, and `rgb()/rgba()`; returns null on anything else. */
export function parseColor(input: string): [number, number, number] | null {
  const value = input.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (hex) {
    const h = hex[1]!;
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    if (parts.length < 3) return null;
    const nums = parts.map((p) =>
      p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p),
    );
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return [nums[0]!, nums[1]!, nums[2]!];
  }

  return null;
}

/** WCAG relative luminance. The 0.03928 knee is the sRGB transfer curve. */
export function relativeLuminance(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Light modules on a dark ground — legal, but older scanners assume the reverse. */
export function isInverted(foreground: string, background: string): boolean {
  return relativeLuminance(foreground) > relativeLuminance(background);
}
