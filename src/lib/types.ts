export const LIKED = "liked";

export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string;
  album: string;
  year: string;
  cover: string | null;
  durationMs: number;
  url: string;
  addedAt: string | null;
  /** Position in der Quelle (Spotify-Reihenfolge) zum Zeitpunkt des Ladens. */
  index: number;
}

export interface Playlist {
  id: string;
  name: string;
  cover: string | null;
  total: number;
  snapshot: string | null;
}

export interface Device {
  id: string;
  name: string;
  type: string;
}

export interface Config {
  source: string | null;
  targets: string[];
  order: "oldest" | "newest";
  skipSorted: boolean;
  move: boolean;
  autoNext: boolean;
  startAt: number;
}

export const DEFAULT_CONFIG: Config = {
  source: null,
  targets: [],
  order: "oldest",
  skipSorted: true,
  move: false,
  autoNext: false,
  startAt: 0,
};

/** Wo die Quelle zuletzt stand, je Laufrichtung ("1" | "-1"). */
export type Hint = Partial<Record<string, { cursor: number; total: number }>>;

export interface Page {
  total: number;
  /** Anzahl Einträge, die Spotify geliefert hat (inkl. nicht abspielbarer). */
  count: number;
  tracks: Track[];
}

export interface Playback {
  paused: boolean;
  position: number;
  duration: number;
}

export interface Api {
  me(): Promise<{ id: string; name: string }>;
  /** Lieblingssongs zuerst, dann eigene und kollaborative Playlists. */
  playlists(): Promise<Playlist[]>;
  page(source: string, offset: number, limit: number): Promise<Page>;
  trackIds(playlist: string): Promise<string[]>;
  likedContains(uris: string[]): Promise<boolean[]>;
  add(target: string, uri: string): Promise<string | null>;
  remove(target: string, uri: string): Promise<string | null>;
  createPlaylist(name: string): Promise<Playlist>;
  devices(): Promise<Device[]>;
  play(device: string, uri: string, positionMs: number): Promise<void>;
  resume(device: string): Promise<void>;
  pause(device: string): Promise<void>;
  seek(device: string, positionMs: number): Promise<void>;
  playback(): Promise<Playback | null>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Kleiner Speicher, den React per useSyncExternalStore lesen kann. */
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(protected state: T) {}
  get = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  protected set(patch: Partial<T>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
