import { IconArrowLeft, IconExternal, IconSparkle } from '../components/Icons';
import { Cover } from '../components/ui';
import { playlistCover, plural } from '../lib/format';
import type { Playlist, SessionStats } from '../lib/types';

export interface SummaryInfo {
  finished: boolean;
  remaining: number;
  sourceCount?: number;
  excludedCount?: number;
  inTargetsCount?: number;
  seenCount?: number;
}

export function Summary({
  stats,
  info,
  playlists,
  onHome,
  onContinue,
}: {
  stats: SessionStats;
  info: SummaryInfo;
  playlists: Playlist[];
  onHome: () => void;
  onContinue?: () => void;
}) {
  const byId = new Map(playlists.map((p) => [p.id, p]));
  const perTarget = Object.entries(stats.perTarget)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...perTarget.map(([, n]) => n));
  const empty = stats.seen === 0 && info.finished;

  return (
    <div className="summary">
      <div className="summary__hero">
        <span className="summary__badge">
          <IconSparkle size={28} />
        </span>
        <h1>{empty ? 'Nichts mehr zu sortieren' : info.finished ? 'Alles sortiert!' : 'Pause gemacht'}</h1>
        <p className="muted">
          {empty
            ? 'Alle Songs dieser Quelle sind bereits einsortiert oder ausgeschlossen.'
            : info.finished
              ? 'Du hast dich durch alle Songs gearbeitet.'
              : `Noch ${plural(info.remaining, 'Song', 'Songs')} übrig – dein Fortschritt ist gespeichert.`}
        </p>
      </div>

      {!empty && (
        <div className="stats">
          <Stat value={stats.seen} label="angesehen" />
          <Stat value={stats.added} label="einsortiert" accent />
          <Stat value={stats.skipped} label="übersprungen" />
          <Stat value={stats.removed} label="entfernt" />
        </div>
      )}

      {empty && info.sourceCount !== undefined && (
        <div className="card breakdown">
          <Row label="Songs in der Quelle" value={info.sourceCount} />
          <Row label="In ausgeschlossenen Playlists" value={info.excludedCount ?? 0} />
          <Row label="Schon in Ziel-Playlists" value={info.inTargetsCount ?? 0} />
          {Boolean(info.seenCount) && <Row label="Früher bereits bewertet" value={info.seenCount ?? 0} />}
        </div>
      )}

      {perTarget.length > 0 && (
        <div className="card per-target">
          <h2 className="eyebrow">Neu in deinen Playlists</h2>
          <ul>
            {perTarget.map(([id, n]) => {
              const p = byId.get(id);
              return (
                <li key={id}>
                  <Cover src={p ? playlistCover(p, 60) : null} size={40} />
                  <div className="per-target__body">
                    <div className="per-target__line">
                      <span className="per-target__name">{p?.name ?? 'Playlist'}</span>
                      <strong>+{n}</strong>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${(n / max) * 100}%` }} />
                    </div>
                  </div>
                  {p?.external_urls?.spotify && (
                    <a className="icon-btn icon-btn--sm" href={p.external_urls.spotify} target="_blank" rel="noreferrer" aria-label={`${p.name} auf Spotify öffnen`}>
                      <IconExternal size={16} />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="summary__actions">
        {onContinue && info.remaining > 0 && (
          <button className="btn btn--primary btn--lg btn--block" onClick={onContinue}>
            Weiter sortieren
          </button>
        )}
        <button className={`btn btn--block ${onContinue && info.remaining > 0 ? 'btn--ghost' : 'btn--primary btn--lg'}`} onClick={onHome}>
          <IconArrowLeft size={18} /> Zur Übersicht
        </button>
      </div>
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? 'stat--accent' : ''}`}>
      <strong>{value.toLocaleString('de-DE')}</strong>
      <span>{label}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="breakdown__row">
      <span>{label}</span>
      <strong>{value.toLocaleString('de-DE')}</strong>
    </div>
  );
}
