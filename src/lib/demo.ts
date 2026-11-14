import { LIKED, sleep } from "./types";
import type { Api, Playlist, Track } from "./types";

// Erfundene Bibliothek für ?demo – zum Ausprobieren ohne Spotify-Konto.

const A = ["Night", "Glass", "Slow", "Neon", "Paper", "Low", "Signal", "Velvet", "Cold", "Second", "Static", "Hollow"];
const B = ["Drive", "Rooms", "Tide", "Garden", "Runner", "Light", "Motion", "Summer", "Circuit", "Harbour", "Echo", "North"];
const ARTISTS = ["Halde", "Mira Voss", "Kilometer 9", "Otto & die Fähre", "Lumen", "Sub Atlas", "Anja Kern", "Nordpol", "The Quiet Kind", "DJ Feldweg"];
const HUES = [150, 95, 172, 128, 200, 60, 140, 110];

function cover(seed: number) {
  const hue = HUES[seed % HUES.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="hsl(${hue} 45% 14%)"/>` +
    `<circle cx="${2 + (seed % 5)}" cy="${2 + ((seed * 3) % 5)}" r="${2 + (seed % 3)}" fill="hsl(${hue} 70% 45%)"/>` +
    `<rect x="${seed % 4}" y="${5 + (seed % 2)}" width="5" height="1" fill="hsl(${hue} 80% 70%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function makeTrack(n: number): Track {
  const id = `demo${String(n).padStart(4, "0")}`;
  const day = new Date(Date.UTC(2019, 0, 1) + n * 86_400_000 * 9);
  return {
    id,
    uri: `spotify:track:${id}`,
    name: `${A[n % A.length]} ${B[(n * 7) % B.length]}`,
    artists: ARTISTS[(n * 3) % ARTISTS.length],
    album: `${B[(n * 5) % B.length]} EP`,
    year: String(2012 + (n % 13)),
    cover: cover(n),
    durationMs: 150_000 + ((n * 37) % 120) * 1000,
    url: "https://open.spotify.com",
    addedAt: day.toISOString(),
    index: 0,
  };
}

const all = Array.from({ length: 240 }, (_, i) => makeTrack(i));

// Lieblingssongs: neueste zuerst. Playlists: älteste zuerst.
const lists: Record<string, Track[]> = {
  [LIKED]: [...all].reverse(),
  dnb: all.filter((_, i) => i % 11 === 0),
  ruhig: all.filter((_, i) => i % 13 === 3),
  party: all.filter((_, i) => i % 17 === 5),
  laufen: [],
  best: all.filter((_, i) => i % 29 === 1),
  roadtrip: all.slice(40, 90),
};

const names: Record<string, string> = {
  [LIKED]: "Lieblingssongs",
  dnb: "Drum and Bass",
  ruhig: "Ruhig",
  party: "Party",
  laufen: "Laufen",
  best: "Die Allerbesten",
  roadtrip: "Roadtrip 2023",
};

const playlist = (id: string): Playlist => ({
  id,
  name: names[id],
  cover: id === LIKED ? null : (lists[id][0]?.cover ?? null),
  total: lists[id].length,
  snapshot: null,
});

const wait = () => sleep(120);
const byUri = (uri: string) => all.find((t) => t.uri === uri)!;

export const demo: Api = {
  async me() {
    return { id: "demo", name: "Demo" };
  },
  async playlists() {
    await wait();
    return Object.keys(lists).map(playlist);
  },
  async page(source, offset, limit) {
    await wait();
    const list = lists[source] ?? [];
    const tracks = list.slice(offset, offset + limit).map((t, i) => ({ ...t, index: offset + i }));
    return { total: list.length, count: tracks.length, tracks };
  },
  async trackIds(id) {
    await wait();
    return (lists[id] ?? []).map((t) => t.id);
  },
  async likedContains(uris) {
    return uris.map((uri) => lists[LIKED].some((t) => t.uri === uri));
  },
  async add(target, uri) {
    await wait();
    const track = { ...byUri(uri), addedAt: new Date().toISOString() };
    if (target === LIKED) lists[LIKED].unshift(track);
    else lists[target].push(track);
    return null;
  },
  async remove(target, uri) {
    await wait();
    lists[target] = lists[target].filter((t) => t.uri !== uri);
    return null;
  },
  async createPlaylist(name) {
    await wait();
    const id = `neu${Object.keys(lists).length}`;
    lists[id] = [];
    names[id] = name;
    return playlist(id);
  },
  async devices() {
    return [];
  },
  async play() {},
  async resume() {},
  async pause() {},
  async seek() {},
  async playback() {
    return null;
  },
};
