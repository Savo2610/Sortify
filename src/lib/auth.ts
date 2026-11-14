import { clientId, SCOPES } from "../config";

// Spotify-Login per Authorization Code + PKCE, komplett im Browser.

const KEY = "sortify.auth";
const PKCE = "sortify.pkce";

interface Tokens {
  access: string;
  refresh: string;
  expires: number;
  /** Client-ID, die diese Tokens ausgestellt hat – nur sie kann sie erneuern. */
  client?: string;
}

export class AuthError extends Error {}

function read(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

let mem = read();

function write(tokens: Tokens | null) {
  mem = tokens;
  if (tokens) localStorage.setItem(KEY, JSON.stringify(tokens));
  else {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("sortify:logout"));
  }
}

export const redirectUri = () => `${location.origin}/callback`;
export const isLoggedIn = () => read() !== null;
export const logout = () => write(null);

/** Zuletzt bekanntes, noch gültiges Token, ohne Netz – für Abschiedsgrüße beim Schließen. */
export const peekToken = () => (mem && mem.expires > Date.now() ? mem.access : null);

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function login() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const client = clientId();
  localStorage.setItem(PKCE, JSON.stringify({ verifier, state, client }));
  const challenge = b64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const query = new URLSearchParams({
    client_id: client,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES.join(" "),
    state,
  });
  location.assign(`https://accounts.spotify.com/authorize?${query}`);
}

async function tokenRequest(client: string, params: Record<string, string>): Promise<Tokens> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client, ...params }),
  });
  if (res.status === 400 || res.status === 401) throw new AuthError("Anmeldung abgelaufen");
  if (!res.ok) throw new Error(`Spotify-Anmeldung: ${res.status}`);
  const data = await res.json();
  return {
    access: data.access_token,
    refresh: data.refresh_token ?? params.refresh_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
    client,
  };
}

/** Wertet die Rückkehr von Spotify aus. Liefert eine Fehlermeldung oder null. */
export async function completeLogin(): Promise<string | null> {
  if (location.pathname !== "/callback") return null;
  const params = new URLSearchParams(location.search);
  history.replaceState(null, "", "/");
  const saved = JSON.parse(localStorage.getItem(PKCE) ?? "null");
  localStorage.removeItem(PKCE);
  const code = params.get("code");
  if (params.get("error") === "access_denied") return null;
  if (!code || !saved || saved.state !== params.get("state")) {
    return "Anmeldung fehlgeschlagen";
  }
  try {
    write(
      await tokenRequest(saved.client ?? clientId(), {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        code_verifier: saved.verifier,
      }),
    );
    return null;
  } catch {
    return "Anmeldung fehlgeschlagen";
  }
}

function locked<T>(fn: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request("sortify.auth", fn) : fn();
}

/**
 * Gültiges Access-Token; erneuert es bei Bedarf. `stale` ist ein Token, das
 * Spotify gerade abgelehnt hat und deshalb nicht noch einmal geliefert werden soll.
 */
export async function getToken(stale?: string): Promise<string> {
  const now = read();
  if (!now) throw new AuthError("Nicht angemeldet");
  if (now.expires > Date.now() && now.access !== stale) {
    mem = now;
    return now.access;
  }
  // Refresh-Tokens sind Einmal-Tokens: nur ein Tab darf gleichzeitig erneuern.
  return locked(async () => {
    const cur = read();
    if (!cur) throw new AuthError("Nicht angemeldet");
    if (cur.expires > Date.now() && cur.access !== stale) {
      mem = cur;
      return cur.access;
    }
    try {
      const next = await tokenRequest(cur.client ?? clientId(), {
        grant_type: "refresh_token",
        refresh_token: cur.refresh,
      });
      write(next);
      return next.access;
    } catch (err) {
      if (err instanceof AuthError) write(null);
      throw err;
    }
  });
}
