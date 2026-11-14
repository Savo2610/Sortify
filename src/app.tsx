import { useEffect, useRef, useState } from "react";
import { DEMO } from "./config";
import { AuthError, completeLogin, isLoggedIn, logout } from "./lib/auth";
import { demo } from "./lib/demo";
import { DemoPlayer, SpotifyPlayer } from "./lib/player";
import { Session } from "./lib/session";
import { spotify } from "./lib/spotify";
import { Sync } from "./lib/sync";
import { DEFAULT_CONFIG } from "./lib/types";
import type { Config, Playlist } from "./lib/types";
import { Login } from "./ui/Login";
import { Setup } from "./ui/Setup";
import { Sort } from "./ui/Sort";

const api = DEMO ? demo : spotify;
const player = DEMO ? new DemoPlayer() : new SpotifyPlayer(api);
const sync = new Sync(DEMO ? "sortify.demo" : "sortify", !DEMO);

// Einmal pro Seitenaufruf: der Code aus der Spotify-Rückkehr ist nur einmal gültig.
const loginResult = completeLogin();

type View = "boot" | "login" | "setup" | "sort" | "error";

export function App() {
  const [view, setView] = useState<View>("boot");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [session, setSession] = useState<Session | null>(null);
  const live = useRef({ config, playlists, session });
  live.current = { config, playlists, session };

  function saveConfig(next: Config) {
    setConfig(next);
    sync.saveConfig(next);
    live.current.session?.setConfig(next);
  }

  function startSession(cfg: Config, lists: Playlist[]) {
    live.current.session?.stop();
    const next = new Session(api, player, sync, cfg, lists, {
      onPlaylist(playlist, created) {
        setPlaylists((all) =>
          created ? [...all, playlist] : all.map((p) => (p.id === playlist.id ? playlist : p)),
        );
        if (created) {
          const cur = live.current.config;
          saveConfig({ ...cur, targets: [...cur.targets, playlist.id] });
        }
      },
    });
    setSession(next);
    setView("sort");
    next.start();
  }

  async function load() {
    try {
      const [me, lists, saved] = await Promise.all([api.me(), api.playlists(), sync.loadConfig()]);
      // Gelöschte Playlists aus den gespeicherten Einstellungen nehmen.
      const known = new Set(lists.map((p) => p.id));
      const cfg: Config = {
        ...saved,
        source: saved.source && known.has(saved.source) ? saved.source : null,
        targets: saved.targets.filter((id) => known.has(id)),
      };
      setUser(me.name);
      setPlaylists(lists);
      setConfig(cfg);
      player.init();
      if (cfg.source) startSession(cfg, lists);
      else setView("setup");
    } catch (err) {
      if (err instanceof AuthError) return setView("login");
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
      setView("error");
    }
  }

  useEffect(() => {
    const onLogout = () => {
      live.current.session?.stop();
      setSession(null);
      setView("login");
    };
    addEventListener("sortify:logout", onLogout);
    loginResult.then((err) => {
      setError(err);
      if (DEMO || isLoggedIn()) load();
      else setView("login");
    });
    return () => removeEventListener("sortify:logout", onLogout);
  }, []);

  if (view === "boot") {
    return (
      <div className="center full">
        <div className="spinner" />
      </div>
    );
  }

  if (view === "login") return <Login error={error} />;

  if (view === "error") {
    return (
      <div className="center full">
        <span>{error}</span>
        <button className="btn" onClick={() => (setView("boot"), load())}>
          Nochmal versuchen
        </button>
        <button className="link" onClick={logout}>
          Abmelden
        </button>
      </div>
    );
  }

  const source = playlists.find((p) => p.id === config.source);

  if (view === "sort" && session && source) {
    return (
      <Sort
        key={source.id}
        session={session}
        player={player}
        config={config}
        source={source}
        onConfig={(patch) => saveConfig({ ...config, ...patch })}
        onSetup={() => {
          session.stop();
          setSession(null);
          setView("setup");
        }}
        onRestart={() => startSession(config, playlists)}
      />
    );
  }

  return (
    <Setup
      playlists={playlists}
      initial={config}
      user={user}
      onLogout={() => {
        if (DEMO) {
          sessionStorage.removeItem("sortify.demo");
          location.assign("/");
        } else logout();
      }}
      onReset={(id) => sync.reset(id)}
      onCreate={async (name) => {
        try {
          const playlist = await api.createPlaylist(name);
          setPlaylists((all) => [...all, playlist]);
          return playlist;
        } catch {
          return null;
        }
      }}
      onStart={(cfg) => {
        saveConfig(cfg);
        // Die Liste kann im Setup gewachsen sein (neue Playlist).
        startSession(cfg, live.current.playlists);
      }}
    />
  );
}
