import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from './components/Toast';
import { AuthExpiredError, handleRedirect, isLoggedIn, logout } from './lib/auth';
import type { TrackSet } from './lib/queue';
import { buildSession, type LoadStep } from './lib/session';
import { getMe, getMyPlaylists, likedCount } from './lib/spotify';
import { storage } from './lib/storage';
import {
  LIKED,
  type Playlist,
  type QueueItem,
  type SavedSession,
  type SessionConfig,
  type SessionStats,
  type User,
} from './lib/types';
import { Home } from './screens/Home';
import { Loading } from './screens/Loading';
import { Sorter } from './screens/Sorter';
import { Summary, type SummaryInfo } from './screens/Summary';
import { Welcome } from './screens/Welcome';

type View =
  | { name: 'boot' }
  | { name: 'welcome'; error?: string }
  | { name: 'home' }
  | { name: 'loading'; steps: LoadStep[]; title?: string }
  | { name: 'sort' }
  | { name: 'summary'; info: SummaryInfo; stats: SessionStats };

interface ActiveSession {
  config: SessionConfig;
  queue: QueueItem[];
  targetSets: Record<string, TrackSet>;
  stats: SessionStats;
  processed: string[];
  startedAt: number;
}

const emptyStats = (): SessionStats => ({ seen: 0, added: 0, skipped: 0, removed: 0, liked: 0, perTarget: {} });

export default function App() {
  const toast = useToast();
  const [view, setView] = useState<View>({ name: 'boot' });
  const [me, setMe] = useState<User | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedTotal, setLikedTotal] = useState<number | null>(null);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [saved, setSaved] = useState<SavedSession | null>(storage.getSession());

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof AuthExpiredError) {
        logout();
        setView({ name: 'welcome', error: err.message });
        return;
      }
      toast((err as Error).message || 'Unbekannter Fehler', { tone: 'error' });
    },
    [toast],
  );

  const loadAccount = useCallback(async () => {
    setView({ name: 'loading', steps: [], title: 'Deine Bibliothek wird geladen' });
    try {
      const [user, lists, liked] = await Promise.all([getMe(), getMyPlaylists(), likedCount().catch(() => null)]);
      setMe(user);
      setPlaylists(lists);
      setLikedTotal(liked);
      setView({ name: 'home' });
    } catch (err) {
      if (err instanceof AuthExpiredError) return fail(err);
      setView({ name: 'welcome', error: (err as Error).message });
    }
  }, [fail]);

  // ---- boot ----------------------------------------------------------------
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        await handleRedirect();
      } catch (err) {
        setView({ name: 'welcome', error: (err as Error).message });
        return;
      }
      if (isLoggedIn()) loadAccount();
      else setView({ name: 'welcome' });
    })();
  }, [loadAccount]);

  const nameOf = useCallback(
    (id: string) => (id === LIKED ? 'Lieblingssongs' : (playlists.find((p) => p.id === id)?.name ?? 'Playlist')),
    [playlists],
  );

  const start = useCallback(
    async (config: SessionConfig, resume?: SavedSession) => {
      setView({ name: 'loading', steps: [] });
      try {
        const processed = new Set(resume?.processed ?? []);
        const built = await buildSession(config, nameOf, (steps) => setView({ name: 'loading', steps }), processed);
        const stats = resume?.stats ?? emptyStats();
        if (!built.queue.length) {
          storage.clearSession();
          setSaved(null);
          setView({
            name: 'summary',
            stats,
            info: {
              finished: true,
              remaining: 0,
              sourceCount: built.sourceCount,
              excludedCount: built.excludedCount,
              inTargetsCount: built.inTargetsCount,
              seenCount: built.seenCount,
            },
          });
          return;
        }
        setSession({
          config,
          queue: built.queue,
          targetSets: built.targetSets,
          stats,
          processed: [...processed],
          startedAt: resume?.startedAt ?? Date.now(),
        });
        setView({ name: 'sort' });
        if (!resume) {
          const hidden = built.excludedCount + built.inTargetsCount + built.seenCount;
          if (hidden > 0) toast(`${hidden.toLocaleString('de-DE')} Songs ausgeblendet, ${built.queue.length.toLocaleString('de-DE')} zu sortieren`);
        }
      } catch (err) {
        fail(err);
        setView({ name: 'home' });
      }
    },
    [nameOf, fail, toast],
  );

  const finish = useCallback((stats: SessionStats, remaining: number) => {
    if (remaining === 0) {
      storage.clearSession();
      setSaved(null);
    } else {
      setSaved(storage.getSession());
    }
    setView({ name: 'summary', stats, info: { finished: remaining === 0, remaining } });
  }, []);

  const addPlaylist = useCallback((p: Playlist) => setPlaylists((ps) => [p, ...ps]), []);

  switch (view.name) {
    case 'boot':
      return <div className="boot" />;
    case 'welcome':
      return <Welcome error={view.error} />;
    case 'loading':
      return <Loading steps={view.steps} title={view.title} />;
    case 'home':
      return (
        <Home
          me={me!}
          playlists={playlists}
          likedTotal={likedTotal}
          saved={saved}
          onStart={(c) => {
            storage.clearSession();
            setSaved(null);
            start(c);
          }}
          onResume={() => saved && start(saved.config, saved)}
          onDiscard={() => {
            storage.clearSession();
            setSaved(null);
          }}
          onPlaylistCreated={addPlaylist}
          onLogout={() => {
            logout();
            setView({ name: 'welcome' });
          }}
        />
      );
    case 'sort':
      return session ? (
        <Sorter
          key={session.startedAt + ':' + session.processed.length}
          config={session.config}
          queue={session.queue}
          targetSets={session.targetSets}
          playlists={playlists}
          initialStats={session.stats}
          initialProcessed={session.processed}
          startedAt={session.startedAt}
          onPlaylistCreated={addPlaylist}
          onConfigChange={(config) => {
            setSession((s) => (s ? { ...s, config } : s));
            storage.setLastConfig(config);
          }}
          onFinish={finish}
        />
      ) : null;
    case 'summary':
      return (
        <Summary
          stats={view.stats}
          info={view.info}
          playlists={playlists}
          onHome={() => {
            setSaved(storage.getSession());
            setView({ name: 'home' });
            // refresh counts in the background
            getMyPlaylists().then(setPlaylists).catch(() => {});
            likedCount().then(setLikedTotal).catch(() => {});
          }}
          onContinue={saved ? () => start(saved.config, saved) : undefined}
        />
      );
  }
}
