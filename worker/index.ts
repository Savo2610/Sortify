import { DurableObject } from "cloudflare:workers";

// Sync-API für Sortify. Wer anfragt, weist sich mit seinem Spotify-Token aus;
// der Worker fragt Spotify, zu welchem Konto das Token gehört, und legt alles
// in einem Durable Object pro Konto ab.

const ID = /^[A-Za-z0-9]{1,64}$/;
const MAX_BODY = 1_000_000;
const MAX_SEEN_PER_SOURCE = 200_000;

interface ProgressOps {
  add?: unknown;
  remove?: unknown;
  reset?: unknown;
  hint?: unknown;
}

export class UserState extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS seen (
         source TEXT NOT NULL, track TEXT NOT NULL,
         PRIMARY KEY (source, track)
       ) WITHOUT ROWID`,
    );
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL)`,
    );
  }

  private read(key: string): { value: unknown; updated: number } | null {
    const row = this.sql.exec("SELECT value, updated FROM kv WHERE key = ?", key).toArray()[0];
    return row ? { value: JSON.parse(row.value as string), updated: row.updated as number } : null;
  }

  private write(key: string, value: unknown, updated: number) {
    this.sql.exec(
      "INSERT INTO kv (key, value, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated",
      key,
      JSON.stringify(value),
      updated,
    );
  }

  getConfig() {
    const row = this.read("config");
    return { config: row?.value ?? null, updated: row?.updated ?? 0 };
  }

  // Der neuere Stand gewinnt, damit ein lange offenes Gerät nichts überschreibt.
  putConfig(config: unknown, updated: number) {
    const row = this.read("config");
    if (row && row.updated > updated) return { config: row.value, updated: row.updated };
    this.write("config", config, updated);
    return { config, updated };
  }

  getProgress(source: string) {
    const seen = this.sql
      .exec("SELECT track FROM seen WHERE source = ?", source)
      .toArray()
      .map((r) => r.track as string);
    return { seen, hint: this.read(`hint:${source}`)?.value ?? null };
  }

  applyProgress(source: string, ops: ProgressOps) {
    if (ops.reset === true) {
      this.sql.exec("DELETE FROM seen WHERE source = ?", source);
      this.sql.exec("DELETE FROM kv WHERE key = ?", `hint:${source}`);
    }
    const ids = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ID.test(x)) : [];
    const add = ids(ops.add);
    if (add.length) {
      const count = this.sql.exec("SELECT COUNT(*) AS n FROM seen WHERE source = ?", source).one()
        .n as number;
      if (count + add.length <= MAX_SEEN_PER_SOURCE) {
        for (const id of add) {
          this.sql.exec("INSERT OR IGNORE INTO seen (source, track) VALUES (?, ?)", source, id);
        }
      }
    }
    for (const id of ids(ops.remove)) {
      this.sql.exec("DELETE FROM seen WHERE source = ? AND track = ?", source, id);
    }
    if (ops.hint && typeof ops.hint === "object") {
      this.write(`hint:${source}`, ops.hint, Date.now());
    }
    return { ok: true };
  }
}

const tokenCache = new Map<string, { id: string; exp: number }>();

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Liefert die Spotify-Konto-ID zum Token, oder den HTTP-Status, mit dem die
// Anfrage abgelehnt wird (401: Token ungültig, 503: Spotify gerade nicht fragbar).
async function spotifyUser(request: Request, ctx: ExecutionContext): Promise<string | number> {
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.length > 2000) return 401;
  const key = await sha256(auth);
  const now = Date.now();
  const hit = tokenCache.get(key);
  if (hit && hit.exp > now) return hit.id;

  const cacheKey = new Request(`https://token.sortify.internal/${key}`);
  const cached = await caches.default.match(cacheKey);
  let id = cached ? await cached.text() : "";
  if (!id) {
    const res = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: auth } });
    if (res.status === 401 || res.status === 403) return 401;
    if (!res.ok) return 503;
    id = ((await res.json()) as { id?: string }).id ?? "";
    if (!id) return 401;
    ctx.waitUntil(
      caches.default.put(
        cacheKey,
        new Response(id, { headers: { "Cache-Control": "max-age=600" } }),
      ),
    );
  }
  if (tokenCache.size > 500) tokenCache.clear();
  tokenCache.set(key, { id, exp: now + 600_000 });
  return id;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function body(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

    const user = await spotifyUser(request, ctx);
    if (typeof user === "number") return json({ error: "auth" }, user);
    const state = env.USER.get(env.USER.idFromName(user));
    const route = `${request.method} ${url.pathname}`;

    if (route === "GET /api/config") return json(await state.getConfig());

    if (route === "PUT /api/config") {
      const data = await body(request);
      if (!data || typeof data.updated !== "number" || typeof data.config !== "object") {
        return json({ error: "bad request" }, 400);
      }
      return json(await state.putConfig(data.config, data.updated));
    }

    const source = url.searchParams.get("source") ?? "";
    if (url.pathname === "/api/progress" && ID.test(source)) {
      if (request.method === "GET") return json(await state.getProgress(source));
      if (request.method === "POST") {
        const data = await body(request);
        if (!data) return json({ error: "bad request" }, 400);
        return json(await state.applyProgress(source, data));
      }
    }

    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
