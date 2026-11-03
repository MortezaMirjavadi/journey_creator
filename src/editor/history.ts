export interface HistoryState<T> {
  past: T[];
  future: T[];
  lastKey?: string;
  lastAt: number;
}

export const HISTORY_LIMIT = 50;
export const COALESCE_MS = 800;

export function createHistory<T>(): HistoryState<T> {
  return { past: [], future: [], lastAt: 0 };
}

/**
 * Pushes a snapshot. Repeated edits with the same key inside the coalesce window
 * (e.g. typing in one field) collapse into a single undo step.
 */
export function pushHistory<T>(
  history: HistoryState<T>,
  snapshot: T,
  key?: string,
  now = Date.now(),
): HistoryState<T> {
  if (key && history.lastKey === key && now - history.lastAt < COALESCE_MS) {
    return { ...history, lastAt: now };
  }
  const past = [...history.past, snapshot].slice(-HISTORY_LIMIT);
  return { past, future: [], lastKey: key, lastAt: now };
}

export function undoHistory<T>(
  history: HistoryState<T>,
  current: T,
): { history: HistoryState<T>; snapshot: T | null } {
  if (history.past.length === 0) return { history, snapshot: null };
  const snapshot = history.past[history.past.length - 1];
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, HISTORY_LIMIT),
      lastAt: 0,
    },
    snapshot,
  };
}

export function redoHistory<T>(
  history: HistoryState<T>,
  current: T,
): { history: HistoryState<T>; snapshot: T | null } {
  if (history.future.length === 0) return { history, snapshot: null };
  const snapshot = history.future[0];
  return {
    history: {
      past: [...history.past, current].slice(-HISTORY_LIMIT),
      future: history.future.slice(1),
      lastAt: 0,
    },
    snapshot,
  };
}
