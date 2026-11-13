export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface User {
  id: string;
  display_name: string | null;
  images?: SpotifyImage[];
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  images: SpotifyImage[] | null;
  owner: { id: string; display_name: string | null };
  collaborative: boolean;
  public: boolean | null;
  snapshot_id: string;
  uri: string;
  external_urls?: { spotify?: string };
  /** Since Feb 2026 the API calls this `items`; older responses use `tracks`. */
  items?: { total: number } | null;
  tracks?: { total: number } | null;
}

export interface Track {
  id: string;
  uri: string;
  name: string;
  type: 'track';
  duration_ms: number;
  explicit: boolean;
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: SpotifyImage[];
    release_date?: string;
  };
}

/** One song in the sorting queue. */
export interface QueueItem {
  track: Track;
  addedAt: string | null;
  /** Position in the source playlist (used to restore it on undo). */
  position: number;
}

/** Special pseudo playlist id for the user's liked songs. */
export const LIKED = 'liked';

export type Order = 'source' | 'newest' | 'oldest' | 'shuffle';

export interface SessionConfig {
  sourceId: string; // playlist id or LIKED
  excludeIds: string[]; // playlist ids or LIKED
  targetIds: string[]; // playlist ids
  skipInTargets: boolean;
  fuzzyMatch: boolean;
  hideSeen: boolean;
  order: Order;
}

export interface SessionStats {
  seen: number;
  added: number;
  skipped: number;
  removed: number;
  liked: number;
  perTarget: Record<string, number>;
}

export interface SavedSession {
  config: SessionConfig;
  processed: string[];
  stats: SessionStats;
  total: number;
  startedAt: number;
}
