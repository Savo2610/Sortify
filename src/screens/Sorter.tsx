import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CreatePlaylistDialog } from '../components/CreatePlaylist';
import {
  IconCheck,
  IconExternal,
  IconHeart,
  IconHeartFill,
  IconMove,
  IconPlus,
  IconSkip,
  IconTrash,
  IconUndo,
  IconX,
} from '../components/Icons';
import { useToast } from '../components/Toast';
import { Cover } from '../components/ui';
import { dominantColor } from '../lib/color';
import { artists, duration, pickImage, playlistCover, relativeDate, year } from '../lib/format';
import { TrackSet } from '../lib/queue';
import {
  addToPlaylist,
  libraryContains,
  removeFromLibrary,
  removeFromPlaylist,
  saveToLibrary,
} from '../lib/spotify';
import { storage } from '../lib/storage';
import { LIKED, type Playlist, type QueueItem, type SessionConfig, type SessionStats } from '../lib/types';

interface Props {
  config: SessionConfig;
  queue: QueueItem[];
  targetSets: Record<string, TrackSet>;
  playlists: Playlist[];
  initialStats: SessionStats;
  initialProcessed: string[];
  startedAt: number;
  onPlaylistCreated: (p: Playlist) => void;
  onConfigChange: (c: SessionConfig) => void;
  onFinish: (stats: SessionStats, remaining: number) => void;
}

interface HistoryEntry {
  index: number;
  item: QueueItem;
  added: string[];
  removed: boolean;
  prevStats: SessionStats;
}

type Exit = 'left' | 'right' | 'down' | null;

const SWIPE = 110;

export function Sorter({
  config,
  queue,
  targetSets,
  playlists,
  initialStats,
  initialProcessed,
  startedAt,
  onPlaylistCreated,
  onConfigChange,
  onFinish,
}: Props) {
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [stats, setStats] = useState<SessionStats>(initialStats);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [exit, setExit] = useState<Exit>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [likeAvailable, setLikeAvailable] = useState(config.sourceId !== LIKED);
  const [color, setColor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showPlayer, setShowPlayer] = useState(storage.getPrefs().showPlayer);
  const [, bump] = useState(0);

  const processed = useRef(new Set(initialProcessed));
  const seen = useRef(storage.getSeen(config.sourceId));
  const drag = useRef<{ x: number; y: number; id: number; locked: boolean } | null>(null);

  const byId = useMemo(() => new Map(playlists.map((p) => [p.id, p])), [playlists]);
  const item = queue[index] as QueueItem | undefined;
  const track = item?.track;
  const cover = track ? pickImage(track.album.images, 500) : null;
  const total = initialProcessed.length + queue.length;
  const done = initialProcessed.length + index;
  const isLikedSource = config.sourceId === LIKED;

  // ---- persistence -------------------------------------------------------
  useEffect(() => {
    storage.setSession({ config, processed: [...processed.current], stats, total, startedAt });
  }, [stats, config, total, startedAt, index]);

  // ---- finished? -------------------------------------------------------
  useEffect(() => {
    if (index >= queue.length) onFinish(stats, 0);
  }, [index, queue.length, onFinish, stats]);

  // ---- colour + preload -------------------------------------------------
  useEffect(() => {
    if (!cover) return;
    let alive = true;
    dominantColor(cover).then((c) => alive && setColor(c));
    const next = queue[index + 1];
    if (next) {
      const url = pickImage(next.track.album.images, 500);
      if (url) {
        new Image().src = url;
        dominantColor(url);
      }
    }
    return () => {
      alive = false;
    };
  }, [cover, index, queue]);

  // ---- liked state (only when the source isn't the liked songs) ----------
  useEffect(() => {
    if (!likeAvailable || !track || track.id in likedMap) return;
    const slice = queue.slice(index, index + 20).filter((q) => !(q.track.id in likedMap));
    let alive = true;
    libraryContains(slice.map((q) => q.track.uri))
      .then((res) => {
        if (!alive) return;
        setLikedMap((m) => {
          const next = { ...m };
          slice.forEach((q, i) => (next[q.track.id] = Boolean(res[i])));
          return next;
        });
      })
      .catch(() => setLikeAvailable(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, likeAvailable]);

  // ---- actions ----------------------------------------------------------
  const go = useCallback((dir: Exit) => {
    setExit(dir);
    window.setTimeout(() => {
      setIndex((i) => i + 1);
      setSelected([]);
      setExit(null);
      setDx(0);
    }, 210);
  }, []);

  const markProcessed = (id: string) => {
    processed.current.add(id);
    seen.current.add(id);
    storage.setSeen(config.sourceId, seen.current);
  };

  const act = useCallback(
    (remove: boolean) => {
      if (!item || exit) return;
      const t = item.track;
      const targets = selected.filter((id) => !targetSets[id]?.has(t, false));
      targets.forEach((id) => targetSets[id].add(t));

      setHistory((h) => [...h.slice(-49), { index, item, added: targets, removed: remove, prevStats: stats }]);
      setStats((s) => {
        const perTarget = { ...s.perTarget };
        targets.forEach((id) => (perTarget[id] = (perTarget[id] ?? 0) + 1));
        return {
          ...s,
          seen: s.seen + 1,
          added: s.added + (targets.length ? 1 : 0),
          skipped: s.skipped + (!targets.length && !remove ? 1 : 0),
          removed: s.removed + (remove ? 1 : 0),
          perTarget,
        };
      });
      markProcessed(t.id);

      for (const id of targets) {
        addToPlaylist(id, [t.uri]).catch((err) => {
          targetSets[id].delete(t);
          toast(`„${t.name}“ konnte nicht zu ${byId.get(id)?.name ?? 'Playlist'} hinzugefügt werden: ${err.message}`, {
            tone: 'error',
          });
        });
      }
      if (remove) {
        (isLikedSource ? removeFromLibrary([t.uri]) : removeFromPlaylist(config.sourceId, [t.uri])).catch((err) =>
          toast(`Entfernen fehlgeschlagen: ${err.message}`, { tone: 'error' }),
        );
      }
      go(remove ? 'down' : targets.length ? 'right' : 'left');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item, exit, selected, targetSets, index, stats, isLikedSource, config.sourceId, go, byId, toast],
  );

  const skip = useCallback(() => {
    if (!item || exit) return;
    setSelected([]);
    setHistory((h) => [...h.slice(-49), { index, item, added: [], removed: false, prevStats: stats }]);
    setStats((s) => ({ ...s, seen: s.seen + 1, skipped: s.skipped + 1 }));
    markProcessed(item.track.id);
    go('left');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, exit, index, stats, go]);

  const undo = useCallback(() => {
    if (exit) return;
    const last = history[history.length - 1];
    if (!last) return;
    const t = last.item.track;
    setHistory((h) => h.slice(0, -1));
    setStats(last.prevStats);
    processed.current.delete(t.id);
    seen.current.delete(t.id);
    storage.setSeen(config.sourceId, seen.current);
    for (const id of last.added) {
      targetSets[id]?.delete(t);
      removeFromPlaylist(id, [t.uri]).catch((err) => toast(`Rückgängig fehlgeschlagen: ${err.message}`, { tone: 'error' }));
    }
    if (last.removed) {
      const shift = history.filter((h) => h.removed && h !== last && h.item.position < last.item.position).length;
      (isLikedSource
        ? saveToLibrary([t.uri])
        : addToPlaylist(config.sourceId, [t.uri], Math.max(0, last.item.position - shift))
      ).catch((err) => toast(`Wiederherstellen fehlgeschlagen: ${err.message}`, { tone: 'error' }));
    }
    setIndex(last.index);
    setSelected(last.added);
    setDx(0);
    toast('Rückgängig gemacht');
  }, [exit, history, targetSets, isLikedSource, config.sourceId, toast]);

  const toggleTarget = useCallback(
    (id: string) => {
      if (!track || targetSets[id]?.has(track, config.fuzzyMatch)) return;
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    },
    [track, targetSets, config.fuzzyMatch],
  );

  const toggleLike = useCallback(() => {
    if (!track || !likeAvailable) return;
    const now = !likedMap[track.id];
    setLikedMap((m) => ({ ...m, [track.id]: now }));
    if (now) setStats((s) => ({ ...s, liked: s.liked + 1 }));
    (now ? saveToLibrary([track.uri]) : removeFromLibrary([track.uri])).catch((err) => {
      setLikedMap((m) => ({ ...m, [track.id]: !now }));
      toast(err.message, { tone: 'error' });
    });
  }, [track, likeAvailable, likedMap, toast]);

  // ---- keyboard ---------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (creating) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, dialog')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return undo();
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && config.targetIds[n - 1]) {
        e.preventDefault();
        return toggleTarget(config.targetIds[n - 1]);
      }
      switch (e.key) {
        case 'Enter':
        case 'ArrowRight':
          e.preventDefault();
          return act(false);
        case 'ArrowLeft':
        case 's':
        case 'S':
          e.preventDefault();
          return skip();
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          return act(true);
        case 'z':
        case 'Z':
          return undo();
        case 'l':
        case 'L':
          return toggleLike();
        case 'n':
        case 'N':
          e.preventDefault();
          return setCreating(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, skip, undo, toggleTarget, toggleLike, creating, config.targetIds]);

  // ---- swipe ------------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (exit || (e.target as HTMLElement).closest('button, a, iframe')) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.locked) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(mx) < 8) return;
      d.locked = true;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setDx(mx);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d?.locked) return;
    if (dx > SWIPE) act(false);
    else if (dx < -SWIPE) skip();
    else setDx(0);
  };

  if (!item || !track) return <div className="sorter" />;

  const hasSel = selected.length > 0;
  const swipeRight = Math.max(0, Math.min(1, dx / SWIPE));
  const swipeLeft = Math.max(0, Math.min(1, -dx / SWIPE));
  const cardStyle: CSSProperties =
    exit === null
      ? {
          transform: `translateX(${dx}px) rotate(${dx / 22}deg)`,
          transition: dragging ? 'none' : undefined,
        }
      : {};
  const next = queue[index + 1];
  const sourceName = isLikedSource ? 'Lieblingssongs' : (byId.get(config.sourceId)?.name ?? 'Quelle');
  const pct = (done / Math.max(total, 1)) * 100;
  const added = relativeDate(item.addedAt);
  const liked = likedMap[track.id];

  return (
    <div className="sorter" style={{ '--dyn': color ?? 'var(--accent)' } as CSSProperties}>
      <div className="sorter__bg" aria-hidden="true">
        {cover && <img key={cover} src={cover} alt="" />}
      </div>

      <header className="sorter__top">
        <button className="icon-btn" onClick={() => onFinish(stats, queue.length - index)} aria-label="Sortieren beenden" title="Beenden">
          <IconX />
        </button>
        <div className="sorter__progress">
          <span className="sorter__count">
            <strong>{(done + 1).toLocaleString('de-DE')}</strong> von {total.toLocaleString('de-DE')}
            <span className="sorter__source"> · {sourceName}</span>
          </span>
          <div className="progress">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={undo}
          disabled={!history.length}
          aria-label="Rückgängig"
          title="Rückgängig (Z)"
        >
          <IconUndo />
        </button>
      </header>

      <main className="sorter__main">
        <div className="stack">
          {next && (
            <div className="stack__ghost" aria-hidden="true">
              <Cover src={pickImage(next.track.album.images, 300)} />
            </div>
          )}
          <article
            key={track.id}
            className={`track-card ${exit ? `is-exit-${exit}` : ''} ${dragging ? 'is-dragging' : ''}`}
            style={cardStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="track-card__art">
              <Cover src={cover} alt={`Cover von ${track.album.name}`} />
              <span className="stamp stamp--left" style={{ opacity: swipeLeft }}>
                Überspringen
              </span>
              <span className="stamp stamp--right" style={{ opacity: swipeRight }}>
                {hasSel ? 'Hinzufügen' : 'Weiter'}
              </span>
              {likeAvailable && (
                <button
                  className={`like-btn ${liked ? 'is-liked' : ''}`}
                  onClick={toggleLike}
                  aria-pressed={Boolean(liked)}
                  aria-label={liked ? 'Aus Lieblingssongs entfernen' : 'Zu Lieblingssongs hinzufügen'}
                  title="Liken (L)"
                >
                  {liked ? <IconHeartFill size={22} /> : <IconHeart size={22} />}
                </button>
              )}
            </div>
            <div className="track-card__info">
              <h2 className="track-card__title">
                {track.name}
                {track.explicit && (
                  <span className="explicit" title="Explicit">
                    E
                  </span>
                )}
              </h2>
              <p className="track-card__artist">{artists(track)}</p>
              <p className="track-card__meta">
                <span>{track.album.name}</span>
                {year(track) && <span>{year(track)}</span>}
                <span>{duration(track.duration_ms)}</span>
              </p>
              <div className="track-card__foot">
                {added && <span className="muted">Hinzugefügt am {added}</span>}
                <a
                  className="open-link"
                  href={track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Auf Spotify öffnen <IconExternal size={13} />
                </a>
              </div>
            </div>
          </article>
        </div>

        <aside className="panel">
          {showPlayer && (
            <div className="player">
              <iframe
                key={track.id}
                title={`Vorschau: ${track.name}`}
                src={`https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0`}
                width="100%"
                height="80"
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              />
            </div>
          )}

          <div className="targets">
            <div className="targets__head">
              <span className="eyebrow">Hinzufügen zu</span>
              <button className="btn btn--ghost btn--xs" onClick={() => setCreating(true)}>
                <IconPlus size={15} /> Neue Playlist
              </button>
            </div>
            <div className="targets__grid">
              {config.targetIds.map((id, i) => {
                const p = byId.get(id);
                const inside = targetSets[id]?.has(track, config.fuzzyMatch);
                const on = selected.includes(id);
                return (
                  <button
                    key={id}
                    className={`target ${on ? 'is-on' : ''} ${inside ? 'is-inside' : ''}`}
                    onClick={() => toggleTarget(id)}
                    aria-pressed={on}
                    disabled={inside}
                    title={inside ? 'Song ist schon in dieser Playlist' : undefined}
                  >
                    <Cover src={p ? playlistCover(p, 60) : null} size={36} />
                    <span className="target__name">{p?.name ?? 'Playlist'}</span>
                    <span className="target__state">
                      {inside ? (
                        <span className="target__inside">
                          <IconCheck size={13} strokeWidth={3} /> drin
                        </span>
                      ) : on ? (
                        <IconCheck size={16} strokeWidth={3} />
                      ) : (
                        i < 9 && <kbd>{i + 1}</kbd>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            className="link link--muted player-toggle"
            onClick={() => {
              setShowPlayer((v) => {
                storage.setPrefs({ showPlayer: !v });
                return !v;
              });
            }}
          >
            {showPlayer ? 'Vorschau-Player ausblenden' : 'Vorschau-Player einblenden'}
          </button>
        </aside>
      </main>

      <footer className="sorter__actions">
        <div className="actions">
          <button
            className="action action--danger"
            onClick={() => act(true)}
            title={hasSel ? 'Hinzufügen und aus der Quelle entfernen (Entf)' : 'Aus der Quelle entfernen (Entf)'}
          >
            {hasSel ? <IconMove size={20} /> : <IconTrash size={20} />}
            <span>{hasSel ? 'Verschieben' : isLikedSource ? 'Entliken' : 'Entfernen'}</span>
          </button>
          <button className="action" onClick={skip} title="Überspringen (S / ←)">
            <IconSkip size={20} />
            <span>Überspringen</span>
          </button>
          <button
            className={`action action--primary ${hasSel ? 'is-ready' : ''}`}
            onClick={() => act(false)}
            title="Weiter (Enter / →)"
          >
            <IconCheck size={22} strokeWidth={2.6} />
            <span>{hasSel ? `Hinzufügen${selected.length > 1 ? ` (${selected.length})` : ''}` : 'Weiter'}</span>
          </button>
        </div>
        <p className="kbd-hints">
          <kbd>1</kbd>–<kbd>9</kbd> Playlist wählen · <kbd>Enter</kbd> weiter · <kbd>S</kbd> überspringen ·{' '}
          <kbd>Entf</kbd> entfernen · <kbd>Z</kbd> rückgängig{likeAvailable && <> · <kbd>L</kbd> liken</>}
        </p>
      </footer>

      <CreatePlaylistDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(p) => {
          onPlaylistCreated(p);
          targetSets[p.id] = new TrackSet();
          onConfigChange({ ...config, targetIds: [...config.targetIds, p.id] });
          setSelected((s) => [...s, p.id]);
          bump((v) => v + 1);
          toast(`Playlist „${p.name}“ erstellt`, { tone: 'success' });
        }}
      />
    </div>
  );
}
