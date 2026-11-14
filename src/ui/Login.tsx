import { CLIENT_ID } from "../config";
import { login, redirectUri } from "../lib/auth";
import { Logo } from "./Icons";

export function Login({ error }: { error: string | null }) {
  return (
    <div className="login">
      <Logo size={56} />
      <h1>Sortify</h1>
      <p>Songs anhören, in Playlists einsortieren.</p>
      {CLIENT_ID ? (
        <button className="btn primary big" onClick={login}>
          Mit Spotify verbinden
        </button>
      ) : (
        <div className="setup-hint">
          <strong>Spotify-Client-ID fehlt</strong>
          <span>
            In <code>.env</code> als <code>VITE_SPOTIFY_CLIENT_ID</code> eintragen. Redirect-URI
            der Spotify-App:
          </span>
          <code>{redirectUri()}</code>
          <a className="btn" href="/?demo">
            Demo ansehen
          </a>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
