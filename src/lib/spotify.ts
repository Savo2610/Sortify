import { AuthExpiredError, getAccessToken } from './auth';
import { LIKED, type Playlist, type QueueItem, type Track, type User } from './types';

const API = 'https://api.spotify.com/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : API + path;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    if (attempt < 3) {
      await sleep(800 * (attempt + 1));
      return request(path, init, attempt + 1);
    }
    throw new ApiError(0, 'Keine Verbindung zu Spotify. Bist du online?');
  }

  if (res.status === 401 && attempt === 0) {
    await getAccessToken(true);
    return request(path, init, 1);
  }
  if (res.status === 401) throw new AuthExpiredError();

  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const retryAfter = Number(res.headers.get('Retry-After'));
    await sleep(retryAfter ? retryAfter * 1000 : 1000 * 2 ** attempt);
    return request(path, init, attempt + 1);
  }

  if (!res.ok) {
    let msg = `Spotify-Fehler ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg = body.error.message;
    } catch {
      /* ignore */
    }
    if (res.status === 403) {
      msg = `Keine Berechtigung (${msg}). Ist dein Account im Spotify-Dashboard als Nutzer eingetragen?`;
    }
    throw new ApiError(res.status, msg);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

interface Page<T> {
  items: T[];
  next: string | null;
  total: number;
  offset: number;
  limit: number;
}

export function getMe() {
  return request<User>('/me');
}

export async function getMyPlaylists(): Promise<Playlist[]> {
  const out: Playlist[] = [];
  let next: string | null = '/me/playlists?limit=50';
  while (next) {
    const page: Page<Playlist | null> = await request(next);
    out.push(...(page.items.filter(Boolean) as Playlist[]));
    next = page.next;
  }
  return out;
}

export function playlistTotal(p: Playlist): number {
  return p.items?.total ?? p.tracks?.total ?? 0;
}

interface RawPlaylistItem {
  added_at: string | null;
  is_local?: boolean;
  item?: Track | { type: string } | null;
  track?: Track | { type: string } | null;
}

interface RawSavedTrack {
  added_at: string;
  track: Track | null;
}

function isUsableTrack(t: unknown): t is Track {
  const tr = t as Track | null | undefined;
  return Boolean(tr && tr.type === 'track' && tr.id && tr.uri && !tr.uri.startsWith('spotify:local'));
}

export type ProgressFn = (loaded: number, total: number) => void;

/** Load all songs from a playlist or the liked songs. Local files and podcasts are ignored. */
export async function loadTracks(sourceId: string, onProgress?: ProgressFn): Promise<QueueItem[]> {
  const base = sourceId === LIKED ? '/me/tracks' : `/playlists/${sourceId}/items`;
  const extra = sourceId === LIKED ? '' : '&additional_types=track';
  const limit = 50;
  const fetchPage = (offset: number) =>
    request<Page<RawPlaylistItem | RawSavedTrack>>(`${base}?limit=${limit}&offset=${offset}${extra}`);

  const first = await fetchPage(0);
  const total = first.total;
  let loaded = first.items.length;
  onProgress?.(loaded, total);

  const offsets: number[] = [];
  for (let o = limit; o < total; o += limit) offsets.push(o);
  const rest = await pool(offsets, 4, async (o) => {
    const page = await fetchPage(o);
    loaded += page.items.length;
    onProgress?.(loaded, total);
    return page;
  });

  const out: QueueItem[] = [];
  [first, ...rest].forEach((page, pageIdx) => {
    const pageOffset = pageIdx === 0 ? 0 : offsets[pageIdx - 1];
    page.items.forEach((raw, i) => {
      const it = raw as RawPlaylistItem;
      const t = it.item ?? it.track;
      if (!it.is_local && isUsableTrack(t)) {
        out.push({ track: t, addedAt: it.added_at, position: pageOffset + i });
      }
    });
  });
  return out;
}

export async function likedCount(): Promise<number> {
  const page = await request<Page<unknown>>('/me/tracks?limit=1');
  return page.total;
}

const chunk = <T,>(arr: T[], n: number) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function addToPlaylist(playlistId: string, uris: string[], position?: number) {
  for (const part of chunk(uris, 100)) {
    await request(`/playlists/${playlistId}/items`, {
      method: 'POST',
      body: JSON.stringify(position === undefined ? { uris: part } : { uris: part, position }),
    });
  }
}

export async function removeFromPlaylist(playlistId: string, uris: string[]) {
  for (const part of chunk(uris, 100)) {
    await request(`/playlists/${playlistId}/items`, {
      method: 'DELETE',
      body: JSON.stringify({ items: part.map((uri) => ({ uri })) }),
    });
  }
}

export async function saveToLibrary(uris: string[]) {
  for (const part of chunk(uris, 40)) {
    await request(`/me/library?uris=${encodeURIComponent(part.join(','))}`, { method: 'PUT' });
  }
}

export async function removeFromLibrary(uris: string[]) {
  for (const part of chunk(uris, 40)) {
    await request(`/me/library?uris=${encodeURIComponent(part.join(','))}`, { method: 'DELETE' });
  }
}

export async function libraryContains(uris: string[]): Promise<boolean[]> {
  const out: boolean[] = [];
  for (const part of chunk(uris, 40)) {
    out.push(
      ...(await request<boolean[]>(`/me/library/contains?uris=${encodeURIComponent(part.join(','))}`)),
    );
  }
  return out;
}

export function createPlaylist(name: string, isPublic: boolean, description = '') {
  return request<Playlist>('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, public: isPublic, description }),
  });
}

/** Run async jobs with limited parallelism. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}
