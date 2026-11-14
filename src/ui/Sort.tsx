import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LOCAL } from "../lib/player";
import type { Player } from "../lib/player";
import type { Session } from "../lib/session";
import { LIKED } from "../lib/types";
import type { Config, Device, Playlist } from "../lib/types";
import { Thumb } from "./Cover";
import { ArrowRight, Check, Pause, Play, Plus, Sliders, Speaker, Trash, Undo } from "./Icons";
import { Toggle } from "./Setup";

interface Props {
  session: Session;
  player: Player;
  config: Config;
  source: Playlist;
  onSetup(): void;
  onConfig(patch: Partial<Config>): void;
  onRestart(): void;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

export function Sort({ session, player, config, source, onSetup, onConfig, onRestart }: Props) {
  const s = useSyncExternalStore(session.subscribe, session.get);
  const p = useSyncExternalStore(player.subscribe, player.get);
  const [devices, setDevices] = useState(false);
  const entry = s.entry;
  const track = entry?.track;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
      const digit = Number(e.key);
      if (e.key === " ") player.toggle();
      else if (e.key === "Enter") session.next();
      else if (e.key === "Backspace") session.back();
      else if (e.key === "Delete") session.drop();
      else if (e.key === "ArrowLeft") player.seekBy(-10_000);
      else if (e.key === "ArrowRight") player.seekBy(30_000);
      else if (digit >= 1 && digit <= 9) {
        const target = session.get().targets[digit - 1];
        if (target) session.toggle(target.id);
      } else return;
      e.preventDefault();
      // Sonst löst die Leertaste den zuletzt angeklickten Knopf noch einmal aus.
      if (el.tagName === "BUTTON") el.blur();
    }
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [session, player]);

  const armed = config.move && !!entry && entry.added.size > 0 && entry.dropped === "no";
  const sourceLabel = source.id === LIKED ? "Lieblingssongs" : `„${source.name}“`;

  return (
    <div className="sort" onPointerDown={() => player.activate()}>
      <header className="bar">
        <button className="source" onClick={onSetup} title="Quelle, Ziele und Optionen">
          <Thumb playlist={source} />
          <span className="source-name">{source.name}</span>
          <Sliders />
        </button>
        <span className="grow" />
        {s.total > 0 && s.phase === "ready" && (
          <span className="count">
            {s.pos.toLocaleString("de-DE")} <span className="dim">/ {s.total.toLocaleString("de-DE")}</span>
          </span>
        )}
        <button
          className={`icon-btn${p.error ? " warn" : ""}`}
          onClick={() => setDevices(true)}
          title="Wiedergabegerät"
        >
          <Speaker />
        </button>
      </header>
      <div className="progress">
        <i style={{ width: `${s.total ? (s.pos / s.total) * 100 : 0}%` }} />
      </div>

      {s.phase === "loading" && (
        <div className="center">
          <div className="spinner" />
          <span className="dim">{s.note}</span>
        </div>
      )}

      {s.phase === "error" && (
        <div className="center">
          <span>{s.note}</span>
          <button className="btn" onClick={onRestart}>
            Nochmal versuchen
          </button>
        </div>
      )}

      {s.phase === "done" && (
        <div className="center">
          <span className="done-mark">
            <Check size={28} />
          </span>
          <strong>Alles einsortiert</strong>
          <button className="btn" onClick={onSetup}>
            Andere Quelle wählen
          </button>
        </div>
      )}

      {s.phase === "ready" && track && (
        <main className="stage">
          <section className="now">
            <div className="cover">
              {track.cover && <img key={track.id} src={track.cover} alt="" />}
            </div>
            <div className="meta">
              <a className="title" href={track.url} target="_blank" rel="noreferrer">
                {track.name}
              </a>
              <div className="artist">{track.artists}</div>
              <div className="album">
                {track.album}
                {track.year && ` · ${track.year}`}
              </div>
              {track.addedAt && <div className="added">Hinzugefügt {day(track.addedAt)}</div>}
            </div>
            <Seek player={player} />
            <div className="transport">
              <button className="skip" onClick={() => player.seekBy(-10_000)} title="10 s zurück (←)">
                −10
              </button>
              <button
                className={`play${p.loading ? " loading" : ""}`}
                onClick={() => player.toggle()}
                title="Wiedergabe (Leertaste)"
              >
                {p.paused ? <Play /> : <Pause />}
              </button>
              <button className="skip" onClick={() => player.seekBy(30_000)} title="30 s vor (→)">
                +30
              </button>
            </div>
            {p.error && (
              <button className="player-error" onClick={() => setDevices(true)}>
                {p.error} · Gerät wählen
              </button>
            )}
          </section>

          <section className="targets">
            <div className="targets-head">
              <h2>Hinzufügen zu</h2>
              <Toggle
                label="Auto-weiter"
                checked={config.autoNext}
                onChange={(autoNext) => onConfig({ autoNext })}
              />
            </div>
            <div className="grid">
              {s.targets.map((t, i) => {
                const on = s.member[t.id];
                return (
                  <button
                    key={t.id}
                    className={`target${on ? " on" : ""}${s.busy[t.id] ? " busy" : ""}`}
                    aria-pressed={on}
                    onClick={() => session.toggle(t.id)}
                  >
                    <Thumb playlist={t} />
                    <span className="target-name">{t.name}</span>
                    {on ? <Check /> : i < 9 && <kbd>{i + 1}</kbd>}
                  </button>
                );
              })}
              <NewTarget onCreate={(name) => session.createTarget(name)} />
            </div>
          </section>
        </main>
      )}

      <footer className="actions">
        <button className="btn" onClick={() => session.back()} disabled={!s.canBack} title="Zurück (⌫)">
          <Undo />
          <span>Zurück</span>
        </button>
        <button
          className={`btn${armed ? " armed" : ""}`}
          onClick={() => session.drop()}
          disabled={s.phase !== "ready"}
          title={
            entry?.dropped === "done"
              ? `Wieder zu ${sourceLabel} hinzufügen`
              : `Aus ${sourceLabel} entfernen (Entf)`
          }
        >
          {entry?.dropped === "done" ? <Plus /> : <Trash />}
          <span>{entry?.dropped === "done" ? "Zurücklegen" : "Entfernen"}</span>
        </button>
        <button
          className="btn primary"
          onClick={() => session.next()}
          disabled={s.phase !== "ready"}
          title="Weiter (Enter)"
        >
          <span>Weiter</span>
          <ArrowRight />
        </button>
      </footer>

      {s.toast && <div className="toast">{s.toast.text}</div>}
      {devices && <Devices player={player} onClose={() => setDevices(false)} />}
    </div>
  );
}

function Seek({ player }: { player: Player }) {
  const p = useSyncExternalStore(player.subscribe, player.get);
  const [, tick] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (p.paused) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [p.paused]);

  const at = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * p.duration;
  };
  const pos = drag ?? player.position();
  const pct = p.duration ? (pos / p.duration) * 100 : 0;

  return (
    <div className="seek">
      <div
        className="seek-bar"
        ref={bar}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(at(e.clientX));
        }}
        onPointerMove={(e) => drag !== null && setDrag(at(e.clientX))}
        onPointerUp={(e) => {
          if (drag === null) return;
          player.seek(at(e.clientX));
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="seek-track">
          <i style={{ width: `${pct}%` }} />
        </div>
        <b style={{ left: `${pct}%` }} />
      </div>
      <div className="seek-times">
        <span>{clock(pos)}</span>
        <span>{clock(p.duration)}</span>
      </div>
    </div>
  );
}

function NewTarget({ onCreate }: { onCreate(name: string): Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button className="target new" onClick={() => setOpen(true)}>
        <span className="thumb">
          <Plus />
        </span>
        <span className="target-name">Neue Playlist</span>
      </button>
    );
  }
  return (
    <form
      className="target new open"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        await onCreate(name.trim());
        setBusy(false);
        setName("");
        setOpen(false);
      }}
    >
      <input
        className="bare"
        autoFocus
        placeholder="Name"
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => !name.trim() && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <button className="link" disabled={busy || !name.trim()}>
        Anlegen
      </button>
    </form>
  );
}

function Devices({ player, onClose }: { player: Player; onClose(): void }) {
  const p = useSyncExternalStore(player.subscribe, player.get);
  const [list, setList] = useState<Device[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      player.devices().then(
        (d) => alive && setList(d),
        () => alive && setList([]),
      );
    load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [player]);

  const pick = (id: string, name: string) => {
    player.use(id, name);
    onClose();
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Wiedergabe auf</h2>
        <ul className="rows">
          <li>
            <button
              className={`row${p.device === LOCAL ? " on" : ""}`}
              disabled={!p.localReady}
              onClick={() => pick(LOCAL, "")}
            >
              <span className="row-name">Dieser Browser</span>
              {!p.localReady && <span className="row-count">nicht verfügbar</span>}
              {p.device === LOCAL && <Check />}
            </button>
          </li>
          {list?.map((d) => (
            <li key={d.id}>
              <button className={`row${p.device === d.id ? " on" : ""}`} onClick={() => pick(d.id, d.name)}>
                <span className="row-name">{d.name}</span>
                <span className="row-count">{d.type}</span>
                {p.device === d.id && <Check />}
              </button>
            </li>
          ))}
        </ul>
        {list === null && <div className="dim sheet-note">Suche Geräte …</div>}
        {list?.length === 0 && (
          <div className="dim sheet-note">Für weitere Geräte dort Spotify öffnen.</div>
        )}
      </div>
    </div>
  );
}
