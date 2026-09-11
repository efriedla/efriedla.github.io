import type { LoaderProps } from "./loader-props";

/** Lab Run takes focus on mount so the keyboard works without a click first.
 *  Turn it off if the loader is not the primary thing on the screen. */
export declare function LabRunLoader(
  props: LoaderProps & { autoFocus?: boolean },
): JSX.Element;
declare const Demo: () => JSX.Element;
export default Demo;
