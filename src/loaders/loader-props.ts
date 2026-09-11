import type { CSSProperties } from "react";

/**
 * The shared contract for every loading-screen game. The components themselves
 * are plain JSX so they can be copied into any React project without carrying a
 * type dependency along; these declarations exist so this site consumes them
 * with the same strictness as the rest of the codebase.
 */
export type LoaderProps = {
  /** True while the request being covered is still in flight. */
  isLoading?: boolean;
  /** Shown while loading. Name the work, not the wait. */
  message?: string;
  /** Shown once the data has landed. */
  readyMessage?: string;
  /** Label on the button that leaves for the result. */
  continueLabel?: string;
  /** The player chose to move on. */
  onContinue?: () => void;
  /** The player never wanted the game. Honour it at once. */
  onSkip?: () => void;
  backgroundImage?: string;
  accentColor?: string;
  className?: string;
  style?: CSSProperties;
};
