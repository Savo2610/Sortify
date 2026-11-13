/**
 * Spotify login via Authorization Code Flow with PKCE.
 * Runs fully in the browser – no client secret, no backend.
 */

const SCOPES = [
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

const K = {
  clientId: 'sortify.clientId',
  token: 'sortify.token',
  verifier: 'sortify.pkceVerifier',
  state: 'sortify.pkceState',
};

interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
}

export function getClientId(): string {
  const fromEnv = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  return localStorage.getItem(K.clientId) ?? '';
}

export function hasBuiltInClientId(): boolean {
  return Boolean((import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim());
}

export function setClientId(id: string) {
  localStorage.setItem(K.clientId, id.trim());
}

export function clearClientId() {
  localStorage.removeItem(K.clientId);
}

/** The app root URL – this exact value must be registered as Redirect URI at Spotify. */
export function getRedirectUri(): string {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/index\.html$/, '').replace(/[^/]*$/, '');
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64url(bytes).slice(0, len);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export async function startLogin() {
  const clientId = getClientId();
  if (!clientId) throw new Error('Keine Client ID hinterlegt.');
  const verifier = randomString(96);
  const state = randomString(24);
  sessionStorage.setItem(K.verifier, verifier);
  sessionStorage.setItem(K.state, state);
  // Fallback in case the browser drops sessionStorage on the redirect (some iOS PWAs)
  localStorage.setItem(K.verifier, verifier);
  localStorage.setItem(K.state, state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    scope: SCOPES,
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

function saveToken(data: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}) {
  const prev = readToken();
  const token: StoredToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? prev?.refresh_token ?? '',
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
    scope: data.scope,
  };
  localStorage.setItem(K.token, JSON.stringify(token));
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(K.token);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return Boolean(readToken()?.refresh_token);
}

export function logout() {
  localStorage.removeItem(K.token);
}

/**
 * If the current URL is the Spotify redirect (?code=… or ?error=…),
 * exchange the code for tokens and clean up the URL.
 * Returns true if a login was completed.
 */
export async function handleRedirect(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state');
  if (!code && !error) return false;

  const cleanUrl = url.origin + url.pathname;
  window.history.replaceState(null, '', cleanUrl);

  if (error) {
    throw new Error(error === 'access_denied' ? 'Login abgebrochen.' : `Spotify meldet: ${error}`);
  }

  const expectedState = sessionStorage.getItem(K.state) ?? localStorage.getItem(K.state);
  const verifier = sessionStorage.getItem(K.verifier) ?? localStorage.getItem(K.verifier);
  for (const k of [K.state, K.verifier]) {
    sessionStorage.removeItem(k);
    localStorage.removeItem(k);
  }
  if (!verifier || !expectedState || state !== expectedState) {
    throw new Error('Login-Sitzung ungültig. Bitte nochmal versuchen.');
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Token konnte nicht geholt werden.');
  }
  saveToken(data);
  return true;
}

let refreshing: Promise<string> | null = null;

async function refresh(): Promise<string> {
  const token = readToken();
  if (!token?.refresh_token) throw new AuthExpiredError();
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logout();
    throw new AuthExpiredError();
  }
  saveToken(data);
  return data.access_token as string;
}

export class AuthExpiredError extends Error {
  constructor() {
    super('Deine Spotify-Sitzung ist abgelaufen. Bitte melde dich erneut an.');
  }
}

export async function getAccessToken(force = false): Promise<string> {
  const token = readToken();
  if (!token) throw new AuthExpiredError();
  if (!force && token.expires_at > Date.now()) return token.access_token;
  refreshing ??= refresh().finally(() => (refreshing = null));
  return refreshing;
}
