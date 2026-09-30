import { useCallback, useState } from 'react';
import type { SymbolDoc } from './types';

// JSON-snapshot undo/redo. Cheap because docs are small (<10 KB even with images as src refs).
// commit() pushes the *previous* state onto the past stack and clears the future.
// undo()/redo() shift the cursor across past/future stacks.
//
// All three stacks live in one piece of state and every update is a pure
// function of it, so React may re-run an updater (Strict Mode does) without
// pushing an entry twice.

const MAX_HISTORY = 50;

type Next = SymbolDoc | ((prev: SymbolDoc) => SymbolDoc);

interface State {
  past: SymbolDoc[];
  present: SymbolDoc;
  future: SymbolDoc[];
}

export interface SymbolHistory {
  doc: SymbolDoc;
  setDoc: (next: Next) => void;
  commit: (next: Next) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (doc: SymbolDoc) => void;
}

const resolve = (next: Next, prev: SymbolDoc) => (typeof next === 'function' ? next(prev) : next);

export function useSymbolHistory(initial: SymbolDoc): SymbolHistory {
  const [state, setState] = useState<State>({ past: [], present: initial, future: [] });

  const setDoc = useCallback((next: Next) => {
    setState((s) => ({ ...s, present: resolve(next, s.present) }));
  }, []);

  const commit = useCallback((next: Next) => {
    setState((s) => {
      const resolved = resolve(next, s.present);
      if (resolved === s.present) return s;
      return { past: [...s.past, s.present].slice(-MAX_HISTORY), present: resolved, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => (s.past.length
      ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [...s.future, s.present] }
      : s));
  }, []);

  const redo = useCallback(() => {
    setState((s) => (s.future.length
      ? { past: [...s.past, s.present], present: s.future[s.future.length - 1], future: s.future.slice(0, -1) }
      : s));
  }, []);

  const reset = useCallback((d: SymbolDoc) => {
    setState({ past: [], present: d, future: [] });
  }, []);

  return {
    doc: state.present,
    setDoc,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset,
  };
}
