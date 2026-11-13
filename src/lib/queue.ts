import type { Order, QueueItem, Track } from './types';

/** Normalised "same song" key: title without version suffixes + first artist. */
export function fuzzyKey(t: Track): string {
  const title = t.name
    .toLowerCase()
    .replace(/\s*[([].*?(remaster|version|edit|mono|stereo|live|deluxe|explicit|radio|mix).*?[)\]]/g, '')
    .replace(/\s+-\s+.*(remaster|version|edit|mono|stereo|live|radio|mix).*$/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const artist = (t.artists[0]?.name ?? '').toLowerCase().trim();
  return `${title}|${artist}`;
}

/** Fast membership lookup for a set of tracks (by id, optionally by ISRC / title+artist). */
export class TrackSet {
  ids = new Set<string>();
  isrcs = new Set<string>();
  keys = new Set<string>();

  constructor(tracks: Track[] = []) {
    tracks.forEach((t) => this.add(t));
  }

  add(t: Track) {
    this.ids.add(t.id);
    if (t.external_ids?.isrc) this.isrcs.add(t.external_ids.isrc);
    this.keys.add(fuzzyKey(t));
  }

  delete(t: Track) {
    this.ids.delete(t.id);
    // ISRC/fuzzy keys are kept – removing could hide another version still in the set.
  }

  has(t: Track, fuzzy: boolean): boolean {
    if (this.ids.has(t.id)) return true;
    if (!fuzzy) return false;
    if (t.external_ids?.isrc && this.isrcs.has(t.external_ids.isrc)) return true;
    return this.keys.has(fuzzyKey(t));
  }
}

export function dedupe(items: QueueItem[]): QueueItem[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    if (seen.has(it.track.id)) return false;
    seen.add(it.track.id);
    return true;
  });
}

export function orderQueue(items: QueueItem[], order: Order): QueueItem[] {
  const arr = [...items];
  const time = (it: QueueItem) => (it.addedAt ? Date.parse(it.addedAt) : 0);
  switch (order) {
    case 'newest':
      return arr.sort((a, b) => time(b) - time(a));
    case 'oldest':
      return arr.sort((a, b) => time(a) - time(b));
    case 'shuffle':
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    default:
      return arr;
  }
}
