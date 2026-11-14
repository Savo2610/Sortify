import { useState } from "react";
import {
  clientId,
  hasBuiltInClientId,
  isClientId,
  ownClientId,
  setOwnClientId,
} from "../config";
import { login, redirectUri } from "../lib/auth";
import { Logo } from "./Icons";

export function Login({ error }: { error: string | null }) {
  const [own, setOwn] = useState(ownClientId);
  // Ohne eingebaute Client-ID geht es nur mit einer eigenen.
  const [open, setOpen] = useState(!hasBuiltInClientId && !own);
  const [draft, setDraft] = useState("");
  const valid = isClientId(draft.trim());

  function save(id: string) {
    setOwnClientId(id);
    setOwn(id);
    setDraft("");
    setOpen(!id && !hasBuiltInClientId);
  }

  return (
    <div className="login">
      <Logo size={56} />
      <h1>Sortify</h1>
      <p>Songs anhören, in Playlists einsortieren.</p>

      <button className="btn primary big" onClick={login} disabled={!clientId()}>
        Mit Spotify verbinden
      </button>
      {error && <div className="error">{error}</div>}

      {own ? (
        <div className="own-id">
          <span className="dim">Eigene Client-ID</span>
          <code>
            {own.slice(0, 6)}…{own.slice(-4)}
          </code>
          <button className="link" onClick={() => save("")}>
            Entfernen
          </button>
        </div>
      ) : (
        !open && (
          <button className="link" onClick={() => setOpen(true)}>
            Eigene Client-ID verwenden
          </button>
        )
      )}

      {open && !own && (
        <form
          className="own-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save(draft.trim().toLowerCase());
          }}
        >
          <span className="dim">
            Im{" "}
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
              Spotify-Dashboard
            </a>{" "}
            eine App mit Web API und Web Playback SDK anlegen, als Redirect-URI:
          </span>
          <code>{redirectUri()}</code>
          <div className="own-row">
            <input
              className="field"
              placeholder="Client-ID"
              value={draft}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn" disabled={!valid}>
              Speichern
            </button>
          </div>
          <div className="own-foot">
            {!hasBuiltInClientId && (
              <a className="link" href="/?demo">
                Demo ansehen
              </a>
            )}
            {hasBuiltInClientId && (
              <button type="button" className="link" onClick={() => setOpen(false)}>
                Abbrechen
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
