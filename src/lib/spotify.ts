import { getToken } from "./auth";
import { ApiError, LIKED, sleep } from "./types";
import type { Api, Device, Page, Playback, Playlist, Track } from "./types";

// Spotify Web API, Stand der Umstellung vom Februar 2026:
// Playlist-Inhalte unter /playlists/{id}/items, Lieblingssongs über /me/library.

const BASE = "https://api.spotify.com/v1";

interface Options {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

async function request<T>(method: string, path: string, { query, body }: Options = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  let stale: string | undefined;
  for (let attempt = 0; ; attempt++) {
    const token = await getToken(stale);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && attempt === 0) {
      stale = token;
      continue;
    }
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get("Retry-After") ?? 2);
      if (wait > 20) throw new ApiError(429, "Spotify bremst gerade. Später weitermachen.");
      await sleep((wait + 0.5) * 1000);
      continue;
    }
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? `Spotify: ${res.status}`);
    return data as T;
  }
}

function toTrack(t: any, addedAt: string | null, index: number): Track | null {
  if (!t || t.type !== "track" || !t.id || t.is_local) return null;
  const images: { url: string }[] = t.album?.images ?? [];
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists ?? []).map((a: any) => a.name).join(", "),
    album: t.album?.name ?? "",
    year: (t.album?.release_date ?? "").slice(0, 4),
    cover: images[0]?.url ?? null,
    durationMs: t.duration_ms ?? 0,
    url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    addedAt,
    index,
  };
}

function toPlaylist(p: any): Playlist {
  const images: { url: string }[] = p.images ?? [];
  return {
    id: p.id,
    name: p.name || "Ohne Titel",
    // Das letzte Bild ist das kleinste – reicht für die Listen.
    cover: images[images.length - 1]?.url ?? null,
    total: p.items?.total ?? p.tracks?.total ?? 0,
    snapshot: p.snapshot_id ?? null,
  };
}

const uriQuery = (uris: string[]) => ({ uris: uris.join(",") });

export const spotify: Api = {
  async me() {
    const me = await request<any>("GET", "/me");
    return { id: me.id, name: me.display_name ?? me.id };
  },

  async playlists() {
    const [me, liked] = await Promise.all([
      request<any>("GET", "/me"),
      request<any>("GET", "/me/tracks", { query: { limit: 1 } }),
    ]);
    const out: Playlist[] = [
      { id: LIKED, name: "Lieblingssongs", cover: null, total: liked.total, snapshot: null },
    ];
    for (let offset = 0; ; offset += 50) {
      const page = await request<any>("GET", "/me/playlists", { query: { limit: 50, offset } });
      for (const p of page.items ?? []) {
        // Inhalte lesen und ändern geht nur bei eigenen und kollaborativen Playlists.
        if (p && (p.owner?.id === me.id || p.collaborative)) out.push(toPlaylist(p));
      }
      if (!page.next) break;
    }
    return out;
  },

  async page(source, offset, limit): Promise<Page> {
    const path = source === LIKED ? "/me/tracks" : `/playlists/${source}/items`;
    const data = await request<any>("GET", path, { query: { limit, offset } });
    const items: any[] = data.items ?? [];
    const tracks: Track[] = [];
    items.forEach((it, i) => {
      const track = toTrack(it?.item ?? it?.track, it?.added_at ?? null, offset + i);
      if (track) tracks.push(track);
    });
    return { total: data.total ?? 0, count: items.length, tracks };
  },

  async trackIds(playlist) {
    const ids: string[] = [];
    for (let offset = 0; ; offset += 50) {
      const data = await request<any>("GET", `/playlists/${playlist}/items`, {
        query: { limit: 50, offset, fields: "next,items(item(id),track(id))" },
      });
      for (const it of data.items ?? []) {
        const id = it?.item?.id ?? it?.track?.id;
        if (id) ids.push(id);
      }
      if (!data.next || !data.items?.length) break;
    }
    return ids;
  },

  async likedContains(uris) {
    const out: boolean[] = [];
    for (let i = 0; i < uris.length; i += 40) {
      const part = await request<boolean[]>("GET", "/me/library/contains", {
        query: uriQuery(uris.slice(i, i + 40)),
      });
      out.push(...part);
    }
    return out;
  },

  async add(target, uri) {
    if (target === LIKED) {
      await request("PUT", "/me/library", { query: uriQuery([uri]) });
      return null;
    }
    const res = await request<any>("POST", `/playlists/${target}/items`, { body: { uris: [uri] } });
    return res?.snapshot_id ?? null;
  },

  async remove(target, uri) {
    if (target === LIKED) {
      await request("DELETE", "/me/library", { query: uriQuery([uri]) });
      return null;
    }
    const res = await request<any>("DELETE", `/playlists/${target}/items`, {
      body: { items: [{ uri }] },
    });
    return res?.snapshot_id ?? null;
  },

  async createPlaylist(name) {
    return toPlaylist(await request<any>("POST", "/me/playlists", { body: { name, public: false } }));
  },

  async devices() {
    const data = await request<any>("GET", "/me/player/devices");
    return (data?.devices ?? [])
      .filter((d: any) => d.id && !d.is_restricted)
      .map((d: any): Device => ({ id: d.id, name: d.name, type: d.type }));
  },

  async play(device, uri, positionMs) {
    await request("PUT", "/me/player/play", {
      query: { device_id: device },
      body: { uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) },
    });
  },

  async resume(device) {
    await request("PUT", "/me/player/play", { query: { device_id: device } });
  },

  async pause(device) {
    await request("PUT", "/me/player/pause", { query: { device_id: device } });
  },

  async seek(device, positionMs) {
    await request("PUT", "/me/player/seek", {
      query: { device_id: device, position_ms: Math.max(0, Math.round(positionMs)) },
    });
  },

  async playback(): Promise<Playback | null> {
    const data = await request<any>("GET", "/me/player");
    if (!data?.item) return null;
    return {
      paused: !data.is_playing,
      position: data.progress_ms ?? 0,
      duration: data.item.duration_ms ?? 0,
    };
  },
};
