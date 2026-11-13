import type { Playlist, SpotifyImage, Track } from './types';

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function artists(t: Track): string {
  return t.artists.map((a) => a.name).join(', ');
}

export function year(t: Track): string {
  return t.album.release_date?.slice(0, 4) ?? '';
}

export function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Pick the smallest image that is at least `min` px wide. */
export function pickImage(images: SpotifyImage[] | null | undefined, min = 300): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 640) - (b.width ?? 640));
  return (sorted.find((i) => (i.width ?? 640) >= min) ?? sorted[sorted.length - 1]).url;
}

export function playlistCover(p: Playlist, min = 120) {
  return pickImage(p.images, min);
}

export function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
}
