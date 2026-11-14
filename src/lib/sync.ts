import { getToken, peekToken } from "./auth";
import { DEFAULT_CONFIG } from "./types";
import type { Config, Hint } from "./types";

// Einstellungen und Fortschritt liegen lokal und – wenn erreichbar – im Worker,
// damit man auf einem anderen Gerät weitermachen kann. Lokal wird sofort
// geschrieben, zum Server gebündelt; was nicht ankam, bleibt im Postausgang.

interface Ops {
  add: string[];
  remove: string[];
  reset?: boolean;
  hint?: Hint;
}

interface Progress {
  seen: Set<string>;
  hint: Hint;
}

export class Sync {
  private outbox: Record<string, Ops>;
  private timer: number | undefined;
  private configTimer: number | undefined;
  private sending: Promise<void> | null = null;

  /** `remote: false` hält alles nur lokal (Demo). */
  constructor(
    private prefix: string,
    private remote: boolean,
  ) {
    this.outbox = this.load("outbox") ?? {};
    if (remote) {
      addEventListener("pagehide", () => this.farewell());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.farewell();
      });
    }
  }

  private load<T>(key: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(`${this.prefix}.${key}`) ?? "null");
    } catch {
      return null;
    }
  }

  private save(key: string, value: unknown) {
    try {
      localStorage.setItem(`${this.prefix}.${key}`, JSON.stringify(value));
    } catch {
      // Speicher voll: der Server-Stand bleibt die Wahrheit.
    }
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Sync: ${res.status}`);
    return res.json();
  }

  async loadConfig(): Promise<Config> {
    const local = this.load<{ config: Config; updated: number }>("config");
    let best = local;
    if (this.remote) {
      try {
        const server = await this.call<{ config: Config | null; updated: number }>(
          "GET",
          "/api/config",
        );
        if (server.config && server.updated >= (local?.updated ?? 0)) {
          best = { config: server.config, updated: server.updated };
          this.save("config", best);
        } else if (local) {
          this.pushConfig();
        }
      } catch {
        // offline oder kein Worker: lokaler Stand
      }
    }
    return { ...DEFAULT_CONFIG, ...best?.config };
  }

  saveConfig(config: Config) {
    this.save("config", { config, updated: Date.now() });
    clearTimeout(this.configTimer);
    this.configTimer = window.setTimeout(() => this.pushConfig(), 800);
  }

  private pushConfig() {
    const local = this.load<{ config: Config; updated: number }>("config");
    if (this.remote && local) this.call("PUT", "/api/config", local).catch(() => {});
  }

  async loadProgress(source: string): Promise<Progress> {
    const local = this.load<{ seen: string[]; hint: Hint }>(`progress.${source}`);
    let seen = new Set(local?.seen);
    let hint: Hint = local?.hint ?? {};
    if (this.remote) {
      try {
        await this.flush();
        const server = await this.call<{ seen: string[]; hint: Hint | null }>(
          "GET",
          `/api/progress?source=${source}`,
        );
        seen = new Set(server.seen);
        hint = server.hint ?? hint;
        // Was noch im Postausgang liegt, kennt der Server nicht.
        const pending = this.outbox[source];
        if (pending) {
          if (pending.reset) seen.clear();
          for (const id of pending.add) seen.add(id);
          for (const id of pending.remove) seen.delete(id);
        }
      } catch {
        // lokaler Stand
      }
    }
    this.progress = { source, seen, hint };
    this.persist();
    return { seen, hint };
  }

  private progress: { source: string; seen: Set<string>; hint: Hint } | null = null;

  private persist() {
    const p = this.progress;
    if (p) this.save(`progress.${p.source}`, { seen: [...p.seen], hint: p.hint });
  }

  private ops(source: string): Ops {
    return (this.outbox[source] ??= { add: [], remove: [] });
  }

  private changed() {
    this.persist();
    if (!this.remote) return;
    this.save("outbox", this.outbox);
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 1500);
  }

  mark(source: string, id: string) {
    const ops = this.ops(source);
    ops.remove = ops.remove.filter((x) => x !== id);
    if (!ops.add.includes(id)) ops.add.push(id);
    this.changed();
  }

  unmark(source: string, id: string) {
    const ops = this.ops(source);
    ops.add = ops.add.filter((x) => x !== id);
    if (!ops.remove.includes(id)) ops.remove.push(id);
    this.changed();
  }

  setHint(source: string, dir: number, hint: Hint[string]) {
    if (this.progress?.source === source) this.progress.hint[dir] = hint;
    this.ops(source).hint = { ...this.progress?.hint, [dir]: hint };
    this.changed();
  }

  reset(source: string) {
    this.outbox[source] = { add: [], remove: [], reset: true };
    localStorage.removeItem(`${this.prefix}.progress.${source}`);
    if (this.progress?.source === source) this.progress = null;
    this.changed();
  }

  flush(): Promise<void> {
    if (!this.remote) return Promise.resolve();
    clearTimeout(this.timer);
    return (this.sending ??= this.send().finally(() => (this.sending = null)));
  }

  private async send() {
    for (const source of Object.keys(this.outbox)) {
      const ops = this.outbox[source];
      // Leeren, bevor gesendet wird: was währenddessen dazukommt, bleibt für die nächste Runde.
      delete this.outbox[source];
      try {
        await this.call("POST", `/api/progress?source=${source}`, ops);
      } catch {
        const later = this.outbox[source];
        this.outbox[source] = later
          ? {
              reset: ops.reset || later.reset,
              hint: later.hint ?? ops.hint,
              add: later.reset
                ? later.add
                : [...ops.add.filter((x) => !later.remove.includes(x)), ...later.add],
              remove: later.reset
                ? later.remove
                : [...ops.remove.filter((x) => !later.add.includes(x)), ...later.remove],
            }
          : ops;
      }
      this.save("outbox", this.outbox);
    }
  }

  /** Beim Schließen der Seite: letzter Versuch, ohne auf die Antwort zu warten. */
  private farewell() {
    const token = peekToken();
    if (!token || this.sending) return;
    // Der Postausgang bleibt stehen: kommt der Gruß nicht an, sendet der nächste
    // reguläre Lauf dasselbe noch einmal, und doppelt schadet nicht.
    for (const [source, ops] of Object.entries(this.outbox)) {
      const body = JSON.stringify(ops);
      if (body.length > 60_000) continue;
      fetch(`/api/progress?source=${source}`, {
        method: "POST",
        keepalive: true,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
      }).catch(() => {});
    }
  }
}
