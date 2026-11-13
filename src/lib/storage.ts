import type { SavedSession, SessionConfig } from './types';

const SESSION = 'sortify.session';
const LAST_CONFIG = 'sortify.lastConfig';
const SEEN_PREFIX = 'sortify.seen.';
const PREFS = 'sortify.prefs';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked – app still works */
  }
}

export const storage = {
  getSession: () => read<SavedSession>(SESSION),
  setSession: (s: SavedSession) => write(SESSION, s),
  clearSession: () => localStorage.removeItem(SESSION),

  getLastConfig: () => read<SessionConfig>(LAST_CONFIG),
  setLastConfig: (c: SessionConfig) => write(LAST_CONFIG, c),

  /** Songs already decided on for a given source, across sessions. */
  getSeen: (sourceId: string) => new Set(read<string[]>(SEEN_PREFIX + sourceId) ?? []),
  setSeen: (sourceId: string, ids: Set<string>) => write(SEEN_PREFIX + sourceId, [...ids]),
  clearSeen: (sourceId: string) => localStorage.removeItem(SEEN_PREFIX + sourceId),

  getPrefs: () => ({ showPlayer: true, ...(read<{ showPlayer: boolean }>(PREFS) ?? {}) }),
  setPrefs: (p: { showPlayer: boolean }) => write(PREFS, p),
};
