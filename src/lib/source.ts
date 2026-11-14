import { LIKED } from "./types";
import type { Api, Hint, Track } from "./types";

const PAGE = 50;

/**
 * Läuft seitenweise durch eine Quelle, ohne sie komplett zu laden.
 *
 * Spotify sortiert Lieblingssongs neueste-zuerst und Playlists älteste-zuerst.
 * `dir` ist die Laufrichtung in Spotifys Index: +1 von vorn, -1 von hinten.
 * `cursor` trennt Erledigtes von Offenem: bei +1 ist [0, cursor) geladen,
 * bei -1 ist [cursor, total) geladen.
 *
 * Ein Hinweis vom letzten Mal lässt uns mitten in der Liste einsteigen statt
 * tausende schon gehörte Songs erneut zu blättern. Weil sich die Liste seitdem
 * verschoben haben kann, steigen wir eine Seite früher ein und gehen am Ende
 * einmal komplett durch, falls wir nicht am Rand begonnen haben.
 */
export class Walker {
  total = 0;
  private cursor = 0;
  private fromEdge = true;
  private fetched = new Set<string>();
  private exhausted = false;

  constructor(
    private api: Api,
    readonly source: string,
    readonly dir: 1 | -1,
    private hint?: Hint[string],
  ) {}

  async init() {
    this.total = (await this.api.page(this.source, 0, 1)).total;
    const { hint, total } = this;
    if (this.dir === 1) {
      this.cursor = hint ? Math.max(0, Math.min(total, hint.cursor) - PAGE) : 0;
      this.fromEdge = this.cursor === 0;
    } else {
      // Neue Lieblingssongs landen vorn und schieben alles nach hinten.
      const grown = hint ? Math.max(0, total - hint.total) : 0;
      this.cursor = hint ? Math.min(total, hint.cursor + grown + PAGE) : total;
      this.fromEdge = this.cursor === total;
    }
  }

  /** Nächste Songs in Laufrichtung, oder null, wenn die Quelle durch ist. */
  async next(): Promise<Track[] | null> {
    while (!this.exhausted) {
      const atEnd = this.dir === 1 ? this.cursor >= this.total : this.cursor <= 0;
      if (atEnd) {
        if (this.fromEdge) {
          this.exhausted = true;
          break;
        }
        this.fromEdge = true;
        this.cursor = this.dir === 1 ? 0 : this.total;
        continue;
      }
      const offset = this.dir === 1 ? this.cursor : Math.max(0, this.cursor - PAGE);
      const limit = this.dir === 1 ? PAGE : this.cursor - offset;
      const page = await this.api.page(this.source, offset, limit);

      if (page.total !== this.total) {
        const grown = page.total - this.total;
        this.total = page.total;
        if (this.dir === -1) {
          // Rückwärts wäre die Seite jetzt verrutscht: Cursor nachziehen und neu holen.
          if (grown > 0 && this.source === LIKED) {
            this.cursor += grown;
            continue;
          }
          if (this.cursor > this.total) {
            this.cursor = this.total;
            continue;
          }
        }
      }

      if (this.dir === 1) {
        this.cursor = offset + page.count;
        if (page.count === 0) this.total = this.cursor;
      } else {
        this.cursor = offset;
      }

      const fresh = page.tracks.filter((t) => !this.fetched.has(t.id));
      for (const t of fresh) this.fetched.add(t.id);
      if (this.dir === -1) fresh.reverse();
      if (fresh.length) return fresh;
    }
    return null;
  }

  /** Ein bereits geladener Song wurde aus der Quelle gelöscht. */
  removed() {
    this.total = Math.max(0, this.total - 1);
    if (this.dir === 1) this.cursor = Math.max(0, this.cursor - 1);
  }

  /** Ein gelöschter Song wurde zurückgelegt: Lieblingssongs vorn, Playlists hinten. */
  restored() {
    this.total += 1;
    if (this.source === LIKED) this.cursor += 1;
  }

  hintFor(track: Track): Hint[string] {
    return { cursor: this.dir === 1 ? track.index : track.index + 1, total: this.total };
  }
}
