import { useMemo, useState } from 'react';
import { CreatePlaylistDialog } from '../components/CreatePlaylist';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBan,
  IconLogout,
  IconMusic,
  IconPlay,
  IconPlus,
  IconShuffle,
  IconTarget,
} from '../components/Icons';
import { Logo } from '../components/Logo';
import { Cover, likedEntry, PlaylistPicker, Segmented, toEntry, Toggle, type PickerEntry } from '../components/ui';
import { plural } from '../lib/format';
import { storage } from '../lib/storage';
import { LIKED, type Order, type Playlist, type SavedSession, type SessionConfig, type User } from '../lib/types';

interface Props {
  me: User;
  playlists: Playlist[];
  likedTotal: number | null;
  saved: SavedSession | null;
  onStart: (c: SessionConfig) => void;
  onResume: () => void;
  onDiscard: () => void;
  onPlaylistCreated: (p: Playlist) => void;
  onLogout: () => void;
}

const STEPS = [
  { key: 'source', title: 'Was möchtest du sortieren?', short: 'Quelle', icon: IconMusic },
  { key: 'exclude', title: 'Was ist schon einsortiert?', short: 'Ausschließen', icon: IconBan },
  { key: 'targets', title: 'Wohin soll sortiert werden?', short: 'Ziele', icon: IconTarget },
  { key: 'review', title: 'Alles bereit', short: 'Start', icon: IconPlay },
] as const;

const DEFAULT: SessionConfig = {
  sourceId: LIKED,
  excludeIds: [],
  targetIds: [],
  skipInTargets: true,
  fuzzyMatch: true,
  hideSeen: false,
  order: 'newest',
};

export function Home({
  me,
  playlists,
  likedTotal,
  saved,
  onStart,
  onResume,
  onDiscard,
  onPlaylistCreated,
  onLogout,
}: Props) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<SessionConfig>(() => {
    const last = storage.getLastConfig();
    if (!last) return DEFAULT;
    const ids = new Set([LIKED, ...playlists.map((p) => p.id)]);
    return {
      ...DEFAULT,
      ...last,
      sourceId: ids.has(last.sourceId) ? last.sourceId : LIKED,
      excludeIds: last.excludeIds.filter((id) => ids.has(id)),
      targetIds: last.targetIds.filter((id) => ids.has(id)),
    };
  });
  const [creating, setCreating] = useState(false);
  const [seenVersion, setSeenVersion] = useState(0);

  const set = (patch: Partial<SessionConfig>) => setConfig((c) => ({ ...c, ...patch }));

  // Since Feb 2026 Spotify only returns the contents of playlists you own or collaborate on.
  const editable = useMemo(
    () => playlists.filter((p) => p.owner.id === me.id || p.collaborative),
    [playlists, me.id],
  );
  const hiddenCount = playlists.length - editable.length;
  const byId = useMemo(() => new Map(playlists.map((p) => [p.id, p])), [playlists]);
  const liked = likedEntry(likedTotal);
  const entries: PickerEntry[] = useMemo(() => editable.map((p) => toEntry(p, me.id)), [editable, me.id]);

  const nameOf = (id: string) => (id === LIKED ? 'Lieblingssongs' : (byId.get(id)?.name ?? 'Playlist'));

  const sourceEntries = [liked, ...entries];
  const excludeEntries = [liked, ...entries].filter((e) => e.id !== config.sourceId);
  const targetEntries = entries.filter((e) => e.id !== config.sourceId);

  const toggle = (key: 'excludeIds' | 'targetIds', id: string) =>
    setConfig((c) => {
      const has = c[key].includes(id);
      const next = has ? c[key].filter((x) => x !== id) : [...c[key], id];
      // a playlist can't be both excluded and a target
      const other = key === 'excludeIds' ? 'targetIds' : 'excludeIds';
      return { ...c, [key]: next, [other]: has ? c[other] : c[other].filter((x) => x !== id) };
    });

  const seenCount = useMemo(
    () => storage.getSeen(config.sourceId).size,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.sourceId, seenVersion],
  );

  const canNext = step === 0 ? Boolean(config.sourceId) : step === 2 ? config.targetIds.length > 0 : true;
  const current = STEPS[step];

  const start = () => {
    storage.setLastConfig(config);
    onStart(config);
  };

  return (
    <div className="home">
      <header className="topbar">
        <Logo size={30} withText />
        <div className="topbar__right">
          <span className="user-chip">
            <Cover src={me.images?.[0]?.url} size={28} />
            <span className="user-chip__name">{me.display_name ?? me.id}</span>
          </span>
          <button className="icon-btn" onClick={onLogout} aria-label="Abmelden" title="Abmelden">
            <IconLogout size={19} />
          </button>
        </div>
      </header>

      <main className="home__main">
        {saved && step === 0 && (
          <div className="resume card">
            <div className="resume__text">
              <span className="eyebrow">Weitermachen?</span>
              <strong>{nameOf(saved.config.sourceId)}</strong>
              <span className="muted">
                {saved.processed.length} von {saved.total} Songs erledigt · {saved.stats.added} hinzugefügt
              </span>
              <div className="progress progress--thin">
                <span style={{ width: `${(saved.processed.length / Math.max(saved.total, 1)) * 100}%` }} />
              </div>
            </div>
            <div className="resume__actions">
              <button className="btn btn--ghost btn--sm" onClick={onDiscard}>
                Verwerfen
              </button>
              <button className="btn btn--primary btn--sm" onClick={onResume}>
                Fortsetzen
              </button>
            </div>
          </div>
        )}

        <nav className="stepper" aria-label="Schritte">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              className={`stepper__item ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`}
              onClick={() => i <= step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="stepper__dot">{i + 1}</span>
              <span className="stepper__label">{s.short}</span>
            </button>
          ))}
        </nav>

        <section className="step" key={current.key}>
          <h1 className="step__title">{current.title}</h1>

          {step === 0 && (
            <>
              <p className="step__lead">Diese Songs bekommst du nacheinander angezeigt.</p>
              <PlaylistPicker
                mode="single"
                entries={sourceEntries}
                selected={[config.sourceId]}
                onToggle={(id) =>
                  set({
                    sourceId: id,
                    excludeIds: config.excludeIds.filter((x) => x !== id),
                    targetIds: config.targetIds.filter((x) => x !== id),
                  })
                }
              />
            </>
          )}

          {step === 1 && (
            <>
              <p className="step__lead">
                Songs aus <strong>{nameOf(config.sourceId)}</strong>, die bereits in einer dieser Playlists sind,
                werden übersprungen. Optional – du kannst auch nichts auswählen.
              </p>
              <PlaylistPicker
                mode="multi"
                entries={excludeEntries}
                selected={config.excludeIds}
                onToggle={(id) => toggle('excludeIds', id)}
              />
            </>
          )}

          {step === 2 && (
            <>
              <p className="step__lead">
                Diese Playlists erscheinen beim Sortieren als Buttons. Ein Song kann in mehrere gleichzeitig.
              </p>
              <PlaylistPicker
                mode="multi"
                entries={targetEntries}
                selected={config.targetIds}
                onToggle={(id) => toggle('targetIds', id)}
                emptyText="Noch keine eigenen Playlists – erstelle einfach eine neue."
                header={
                  <button className="pl-row pl-row--create" onClick={() => setCreating(true)}>
                    <span className="cover cover--create" style={{ width: 48, height: 48 }}>
                      <IconPlus size={22} />
                    </span>
                    <span className="pl-row__text">
                      <span className="pl-row__name">Neue Playlist erstellen</span>
                      <span className="pl-row__sub">Direkt in deinem Spotify-Account</span>
                    </span>
                  </button>
                }
              />
            </>
          )}

          {step === 3 && (
            <div className="review">
              <div className="flow card">
                <FlowRow label="Quelle" icon={<IconMusic size={16} />}>
                  <Chip id={config.sourceId} name={nameOf(config.sourceId)} byId={byId} />
                </FlowRow>
                <FlowRow label="Ohne Songs aus" icon={<IconBan size={16} />}>
                  {config.excludeIds.length ? (
                    config.excludeIds.map((id) => <Chip key={id} id={id} name={nameOf(id)} byId={byId} />)
                  ) : (
                    <span className="muted">–</span>
                  )}
                </FlowRow>
                <FlowRow label="Einsortieren in" icon={<IconTarget size={16} />}>
                  {config.targetIds.map((id) => (
                    <Chip key={id} id={id} name={nameOf(id)} byId={byId} />
                  ))}
                </FlowRow>
              </div>

              <div className="card options">
                <div className="options__row">
                  <span className="options__label">Reihenfolge</span>
                  <Segmented<Order>
                    value={config.order}
                    onChange={(order) => set({ order })}
                    options={[
                      { value: 'newest', label: 'Neueste' },
                      { value: 'oldest', label: 'Älteste' },
                      { value: 'source', label: 'Original' },
                      { value: 'shuffle', label: 'Zufall', icon: <IconShuffle size={14} /> },
                    ]}
                  />
                </div>
                <Toggle
                  checked={config.skipInTargets}
                  onChange={(v) => set({ skipInTargets: v })}
                  label="Schon einsortierte überspringen"
                  hint="Songs, die bereits in einer Ziel-Playlist sind, nicht anzeigen"
                />
                <Toggle
                  checked={config.fuzzyMatch}
                  onChange={(v) => set({ fuzzyMatch: v })}
                  label="Andere Versionen erkennen"
                  hint="Remaster, Single- & Album-Version gelten als derselbe Song"
                />
                <Toggle
                  checked={config.hideSeen}
                  onChange={(v) => set({ hideSeen: v })}
                  label="Bereits bewertete ausblenden"
                  hint={
                    seenCount ? (
                      <>
                        {plural(seenCount, 'Song', 'Songs')} aus früheren Runden ·{' '}
                        <button
                          type="button"
                          className="link"
                          onClick={(e) => {
                            e.preventDefault();
                            storage.clearSeen(config.sourceId);
                            setSeenVersion((v) => v + 1);
                          }}
                        >
                          zurücksetzen
                        </button>
                      </>
                    ) : (
                      'Auch übersprungene Songs aus früheren Runden nicht mehr zeigen'
                    )
                  }
                />
              </div>
            </div>
          )}

          {step === 0 && hiddenCount > 0 && (
            <p className="footnote">
              {plural(hiddenCount, 'gefolgte Playlist', 'gefolgte Playlists')} ausgeblendet – Spotify gibt die Inhalte
              fremder Playlists nicht mehr an Apps heraus.
            </p>
          )}
        </section>
      </main>

      <footer className="bottombar">
        <div className="bottombar__inner">
          {step > 0 ? (
            <button className="btn btn--ghost" onClick={() => setStep(step - 1)}>
              <IconArrowLeft size={18} /> Zurück
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn--primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {step === 1 && config.excludeIds.length === 0 ? 'Überspringen' : 'Weiter'} <IconArrowRight size={18} />
            </button>
          ) : (
            <button className="btn btn--primary btn--lg" onClick={start}>
              <IconPlay size={16} /> Sortieren starten
            </button>
          )}
        </div>
        {step === 2 && config.targetIds.length === 0 && (
          <p className="bottombar__hint">Wähle mindestens eine Ziel-Playlist.</p>
        )}
      </footer>

      <CreatePlaylistDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(p) => {
          onPlaylistCreated(p);
          setConfig((c) => ({ ...c, targetIds: [...c.targetIds, p.id] }));
        }}
      />
    </div>
  );
}

function FlowRow({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flow__row">
      <span className="flow__label">
        {icon}
        {label}
      </span>
      <div className="flow__chips">{children}</div>
    </div>
  );
}

function Chip({ id, name, byId }: { id: string; name: string; byId: Map<string, Playlist> }) {
  const p = byId.get(id);
  return (
    <span className="mini-chip">
      <Cover src={p?.images?.[p.images.length - 1]?.url} liked={id === LIKED} size={22} />
      {name}
    </span>
  );
}
