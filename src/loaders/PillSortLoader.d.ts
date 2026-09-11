import type { LoaderProps } from "./loader-props";

/** Pill Sort additionally prints an imprint on each pill so the kinds are
 *  separable without relying on colour. Off only if you have another cue. */
export declare function PillSortLoader(
  props: LoaderProps & { showImprints?: boolean },
): JSX.Element;
declare const Demo: () => JSX.Element;
export default Demo;
