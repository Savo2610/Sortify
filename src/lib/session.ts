import { cacheGet, cacheSet } from "./cache";
import type { Player } from "./player";
import { Walker } from "./source";
import type { Sync } from "./sync";
import { LIKED, Store } from "./types";
import type { Api, Config, Playlist, Track } from "./types";

export interface Entry {
  track: Track;
  /** Ziele, in die der Song in dieser Sitzung gelegt wurde. */
  added: Set<string>;
  /** Löschen aus der Quelle: vorgemerkt wird erst beim übernächsten Schritt gelöscht. */
  dropped: "no" | "pending" | "done";
}

export interface SessionState {
  phase: "loading" | "ready" | "done" | "error";
  note: string;
  entry: Entry | null;
  /** Ziel-ID → aktueller Song ist drin. */
  member: Record<string, boolean>;
  busy: Record<string, boolean>;
  canBack: boolean;
  pos: number;
  total: number;
  targets: Playlist[];
  toast: { id: number; text: string } | null;
}

interface Hooks {
  /** Eine Playlist wurde angelegt oder hat sich geändert. */
  onPlaylist(playlist: Playlist, created: boolean): void;
}

const DROPS = "sortify.drops";
const DROP_DELAY = 8000;

/**
 * Eine Sortier-Sitzung: holt Songs aus der Quelle, merkt sich, was gehört
 * wurde, und legt Songs in Ziele.
 *
 * Löschen aus der Quelle passiert verzögert. Ein aus den Lieblingssongs
 * gelöschter Song käme beim Zurückholen als neuester zurück und verlöre
 * seinen Platz – deshalb bleibt ein Schritt lang Zeit für „Zurück“.
 */
export class Session extends Store<SessionState> {
  private walker: Walker;
  private dir: 1 | -1;
  private seen = new Set<string>();
  private members = new Map<string, Set<string>>();
  private liked = new Map<string, boolean>();
  private queue: Track[] = [];
  private history: Entry[] = [];
  private forward: Entry[] = [];
  private filling: Promise<boolean> | null = null;
  private exhausted = false;
  private moving = false;
  private stopped = false;
  private dropTimer: number | undefined;
  private toastId = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private api: Api,
    private player: Player,
    private sync: Sync,
    private config: Config,
    private playlists: Playlist[],
    private hooks: Hooks,
  ) {
    super({
      phase: "loading",
      note: "",
      entry: null,
      member: {},
      busy: {},
      canBack: false,
      pos: 0,
      total: 0,
      targets: [],
      toast: null,
    });
    const liked = config.source === LIKED;
    this.dir = (config.order === "oldest") === liked ? -1 : 1;
    this.walker = new Walker(api, config.source!, this.dir);
    this.state.targets = this.targetList();
  }

  /**
   * Nachladen und Löschen aus der Quelle nie gleichzeitig: sonst verrutscht
   * die Seite, die gerade geholt wird, um einen Song.
   */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }

  private get source() {
    return this.config.source!;
  }

  private targetList() {
    return this.config.targets
      .filter((id) => id !== this.source)
      .map((id) => this.playlists.find((p) => p.id === id))
      .filter((p): p is Playlist => !!p);
  }

  /** Einstellungen, die ohne Neustart wirken (Auto-weiter, Startposition). */
  setConfig(config: Config) {
    this.config = config;
  }

  async start() {
    try {
      await this.flushSavedDrops();
      const progress = await this.sync.loadProgress(this.source);
      this.seen = progress.seen;
      await this.loadMembers();
      this.walker = new Walker(this.api, this.source, this.dir, progress.hint[this.dir]);
      await this.walker.init();
      await this.show(await this.take());
    } catch (err) {
      if (!this.stopped) this.set({ phase: "error", note: message(err) });
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.dropTimer);
    this.player.pause();
    await this.flushDrops();
    this.sync.flush();
  }

  /* ---------- Ziele ---------- */

  private async loadMembers() {
    const todo = this.targetList().filter((p) => p.id !== LIKED);
    let done = 0;
    const work = async () => {
      for (let p = todo.shift(); p; p = todo.shift()) {
        this.set({ note: `Playlists laden ${++done}/${done + todo.length}` });
        const cached = await cacheGet<{ snapshot: string; ids: string[] }>(`pl.${p.id}`);
        let ids = cached && p.snapshot && cached.snapshot === p.snapshot ? cached.ids : null;
        if (!ids) {
          ids = await this.api.trackIds(p.id);
          if (p.snapshot) cacheSet(`pl.${p.id}`, { snapshot: p.snapshot, ids });
        }
        this.members.set(p.id, new Set(ids));
      }
    };
    await Promise.all([work(), work(), work()]);
  }

  private isMember(target: string, id: string) {
    return target === LIKED ? this.liked.get(id) === true : !!this.members.get(target)?.has(id);
  }

  private setMember(target: string, id: string, on: boolean) {
    if (target === LIKED) this.liked.set(id, on);
    else {
      const set = this.members.get(target) ?? new Set<string>();
      this.members.set(target, set);
      if (on) set.add(id);
      else set.delete(id);
    }
  }

  private memberMap(track: Track) {
    const map: Record<string, boolean> = {};
    for (const p of this.state.targets) map[p.id] = this.isMember(p.id, track.id);
    return map;
  }

  /* ---------- Warteschlange ---------- */

  private eligible = (t: Track) =>
    !this.seen.has(t.id) &&
    !(this.config.skipSorted && this.state.targets.some((p) => this.isMember(p.id, t.id)));

  private fill(): Promise<boolean> {
    return (this.filling ??= (async () => {
      const page = await this.serial(() => this.walker.next());
      if (!page) {
        this.exhausted = true;
        return false;
      }
      if (this.state.targets.some((p) => p.id === LIKED)) {
        const unknown = page.filter((t) => !this.liked.has(t.id));
        const flags = await this.api.likedContains(unknown.map((t) => t.uri));
        unknown.forEach((t, i) => this.liked.set(t.id, flags[i] === true));
      }
      this.queue.push(...page.filter(this.eligible));
      return true;
    })().finally(() => (this.filling = null)));
  }

  private async take(): Promise<Track | null> {
    while (!this.queue.length) {
      if (this.exhausted || !(await this.fill())) return null;
    }
    const track = this.queue.shift()!;
    if (this.queue.length < 5 && !this.exhausted) this.fill().catch(() => {});
    return track;
  }

  private async show(next: Track | Entry | null) {
    if (this.stopped) return;
    if (!next) {
      this.player.pause();
      this.set({ phase: "done", entry: null, canBack: this.history.length > 0 });
      return;
    }
    const fresh = !("track" in next);
    const entry: Entry = fresh ? { track: next, added: new Set(), dropped: "no" } : next;
    const { track } = entry;
    this.set({
      phase: "ready",
      entry,
      member: this.memberMap(track),
      canBack: this.history.length > 0,
      ...this.place(track),
    });
    if (fresh) this.sync.setHint(this.source, this.dir, this.walker.hintFor(track));
    const startAt = Math.min(this.config.startAt * 1000, Math.max(0, track.durationMs - 20_000));
    this.player.play(track, startAt);
  }

  /** Wo der Song in der Quelle steht, in Laufrichtung gezählt. */
  private place(track: Track) {
    const total = this.walker.total;
    const pos = this.dir === 1 ? track.index + 1 : total - track.index;
    return { total, pos: Math.max(1, Math.min(total, pos)) };
  }

  /** Geladene Songs rücken nach, wenn sich die Quelle durch uns verschiebt. */
  private reindex(shift: (index: number) => number) {
    const current = this.state.entry;
    const tracks = [
      ...this.queue,
      ...this.history.map((e) => e.track),
      ...this.forward.map((e) => e.track),
      ...(current ? [current.track] : []),
    ];
    for (const t of new Set(tracks)) t.index = shift(t.index);
    if (current && this.state.phase === "ready") this.set(this.place(current.track));
  }

  /* ---------- Aktionen ---------- */

  /** Weiter zum nächsten Song; `drop` löscht den aktuellen aus der Quelle. */
  async next(drop = false) {
    const entry = this.state.entry;
    if (!entry || this.moving || this.state.phase !== "ready") return;
    this.moving = true;
    try {
      if (entry.dropped === "no" && (drop || (this.config.move && entry.added.size > 0))) {
        entry.dropped = "pending";
      }
      this.seen.add(entry.track.id);
      this.sync.mark(this.source, entry.track.id);
      // Ältere Vormerkungen sind jetzt endgültig.
      this.flushDrops();
      this.history.push(entry);
      if (this.history.length > 100) this.history.shift();
      if (entry.dropped === "pending") this.armDrop();
      await this.show(this.forward.pop() ?? (await this.take()));
    } catch (err) {
      this.toast(message(err));
    } finally {
      this.moving = false;
    }
  }

  async back() {
    if (this.moving || !this.history.length) return;
    const prev = this.history.pop()!;
    const current = this.state.entry;
    if (current) this.forward.push(current);
    this.seen.delete(prev.track.id);
    this.sync.unmark(this.source, prev.track.id);
    if (prev.dropped === "pending") {
      prev.dropped = "no";
      clearTimeout(this.dropTimer);
      this.saveDrops();
    }
    await this.show(prev);
  }

  /** Aus der Quelle löschen – oder zurücklegen, wenn schon gelöscht. */
  async drop() {
    const entry = this.state.entry;
    if (!entry) return;
    if (entry.dropped !== "done") return this.next(true);
    try {
      await this.serial(async () => {
        await this.api.add(this.source, entry.track.uri);
        this.walker.restored();
        const liked = this.source === LIKED;
        this.reindex((i) => (liked ? i + 1 : i));
        entry.track.index = liked ? 0 : this.walker.total - 1;
      });
      entry.dropped = "no";
      this.set({ entry: { ...entry }, ...this.place(entry.track) });
    } catch (err) {
      this.toast(message(err));
    }
  }

  async toggle(target: string) {
    const entry = this.state.entry;
    if (!entry || this.state.busy[target]) return;
    const { id, uri } = entry.track;
    const was = this.isMember(target, id);
    this.setMember(target, id, !was);
    this.set({
      member: { ...this.state.member, [target]: !was },
      busy: { ...this.state.busy, [target]: true },
    });
    let ok = true;
    try {
      const snapshot = was ? await this.api.remove(target, uri) : await this.api.add(target, uri);
      if (was) entry.added.delete(target);
      else entry.added.add(target);
      this.touched(target, was ? -1 : 1, snapshot);
    } catch (err) {
      ok = false;
      this.setMember(target, id, was);
      this.toast(message(err));
    }
    const busy = { ...this.state.busy };
    delete busy[target];
    const same = this.state.entry?.track.id === id;
    this.set({ busy, ...(same ? { member: this.memberMap(entry.track) } : {}) });
    if (ok && !was && same && this.config.autoNext) this.next();
  }

  /** Zähler und Zwischenspeicher einer Playlist nach einer Änderung nachziehen. */
  private touched(target: string, delta: number, snapshot: string | null) {
    const playlist = this.playlists.find((p) => p.id === target);
    if (!playlist) return;
    const next = { ...playlist, total: Math.max(0, playlist.total + delta), snapshot };
    if (snapshot && target !== LIKED) {
      cacheSet(`pl.${target}`, { snapshot, ids: [...(this.members.get(target) ?? [])] });
    }
    this.playlists = this.playlists.map((p) => (p.id === target ? next : p));
    this.hooks.onPlaylist(next, false);
    this.set({ targets: this.targetList() });
  }

  async createTarget(name: string) {
    try {
      const playlist = await this.api.createPlaylist(name);
      this.members.set(playlist.id, new Set());
      this.playlists = [...this.playlists, playlist];
      this.config = { ...this.config, targets: [...this.config.targets, playlist.id] };
      this.hooks.onPlaylist(playlist, true);
      const entry = this.state.entry;
      this.set({ targets: this.targetList(), ...(entry ? { member: this.memberMap(entry.track) } : {}) });
    } catch (err) {
      this.toast(message(err));
    }
  }

  /* ---------- Verzögertes Löschen aus der Quelle ---------- */

  private pending() {
    return this.history.filter((e) => e.dropped === "pending");
  }

  private saveDrops() {
    const list = this.pending().map((e) => ({ source: this.source, uri: e.track.uri }));
    if (list.length) localStorage.setItem(DROPS, JSON.stringify(list));
    else localStorage.removeItem(DROPS);
  }

  private armDrop() {
    this.saveDrops();
    clearTimeout(this.dropTimer);
    this.dropTimer = window.setTimeout(() => this.flushDrops(), DROP_DELAY);
  }

  private async flushDrops() {
    const list = this.pending();
    await Promise.all(
      list.map(async (entry) => {
        entry.dropped = "done";
        try {
          await this.serial(async () => {
            await this.api.remove(this.source, entry.track.uri);
            this.walker.removed();
            const gone = entry.track.index;
            this.reindex((i) => (i > gone ? i - 1 : i));
          });
        } catch (err) {
          entry.dropped = "no";
          this.toast(message(err));
        }
      }),
    );
    this.saveDrops();
  }

  /** Vormerkungen, die beim letzten Mal nicht mehr ausgeführt wurden (Tab geschlossen). */
  private async flushSavedDrops() {
    let list: { source: string; uri: string }[] = [];
    try {
      list = JSON.parse(localStorage.getItem(DROPS) ?? "[]");
    } catch {
      // nichts vorgemerkt
    }
    localStorage.removeItem(DROPS);
    for (const drop of list) await this.api.remove(drop.source, drop.uri).catch(() => {});
  }

  private toast(text: string) {
    const id = ++this.toastId;
    this.set({ toast: { id, text } });
    setTimeout(() => {
      if (this.state.toast?.id === id) this.set({ toast: null });
    }, 4000);
  }
}

function message(err: unknown) {
  return err instanceof Error && err.message ? err.message : "Das hat nicht geklappt";
}
