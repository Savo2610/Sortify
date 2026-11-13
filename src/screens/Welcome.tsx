import { useState } from 'react';
import { Logo } from '../components/Logo';
import { IconCheck, IconExternal } from '../components/Icons';
import { Spinner } from '../components/ui';
import { clearClientId, getClientId, getRedirectUri, hasBuiltInClientId, setClientId, startLogin } from '../lib/auth';

export function Welcome({ error }: { error?: string }) {
  const [clientId, setId] = useState(getClientId());
  const [editing, setEditing] = useState(!getClientId());
  const [draft, setDraft] = useState(getClientId());
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const redirect = getRedirectUri();
  const validDraft = /^[0-9a-f]{32}$/i.test(draft.trim());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(redirect);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const login = async () => {
    setBusy(true);
    try {
      await startLogin();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome__glow" aria-hidden="true" />
      <div className="welcome__inner">
        <Logo size={64} />
        <h1 className="welcome__title">
          Deine Musik.
          <br />
          <span className="text-gradient">Endlich sortiert.</span>
        </h1>
        <p className="welcome__lead">
          Geh deine Songs einzeln durch und entscheide mit einem Tipp, in welche Playlists sie gehören. Songs, die
          schon einsortiert sind, blendet Sortify automatisch aus.
        </p>

        <ul className="welcome__features">
          <li>
            <span>1</span>Quelle wählen – z. B. deine Lieblingssongs
          </li>
          <li>
            <span>2</span>Playlists ausschließen, die schon „fertig“ sind
          </li>
          <li>
            <span>3</span>Song für Song einsortieren, wischen oder tippen
          </li>
        </ul>

        {error && <p className="banner banner--error">{error}</p>}

        {editing && !hasBuiltInClientId() ? (
          <div className="card setup">
            <h2>Einmalige Einrichtung</h2>
            <ol className="setup__steps">
              <li>
                Öffne das{' '}
                <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                  Spotify Developer Dashboard <IconExternal size={14} />
                </a>{' '}
                und erstelle eine App (Web API).
              </li>
              <li>
                Trage diese Redirect URI ein:
                <button type="button" className="copy" onClick={copy}>
                  <code>{redirect}</code>
                  <span className="copy__hint">{copied ? <IconCheck size={16} /> : 'Kopieren'}</span>
                </button>
              </li>
              <li>Unter „User Management“ deinen Spotify-Account hinzufügen.</li>
              <li>Client ID kopieren und hier einfügen:</li>
            </ol>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!validDraft) return;
                setClientId(draft);
                setId(draft.trim());
                setEditing(false);
              }}
            >
              <input
                className="mono"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Client ID (32 Zeichen)"
                spellCheck={false}
                autoComplete="off"
              />
              <button className="btn btn--primary btn--block" disabled={!validDraft}>
                Speichern
              </button>
            </form>
          </div>
        ) : (
          <div className="welcome__cta">
            <button className="btn btn--primary btn--lg btn--block" onClick={login} disabled={busy || !clientId}>
              {busy ? <Spinner size={20} /> : 'Mit Spotify anmelden'}
            </button>
            {!hasBuiltInClientId() && (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  clearClientId();
                  setDraft(clientId);
                  setEditing(true);
                }}
              >
                Client ID ändern
              </button>
            )}
          </div>
        )}
        <p className="welcome__fine">
          Sortify läuft komplett in deinem Browser. Es werden keine Daten an andere Server gesendet – nur an Spotify.
        </p>
      </div>
    </div>
  );
}
