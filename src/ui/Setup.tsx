import { useState } from "react";
import { LIKED } from "../lib/types";
import type { Config, Playlist } from "../lib/types";
import { Thumb } from "./Cover";
import { ArrowRight, Check, Logo, Plus } from "./Icons";

interface Props {
  playlists: Playlist[];
  initial: Config;
  user: string;
  onStart(config: Config): void;
  onCreate(name: string): Promise<Playlist | null>;
  onReset(source: string): void;
  onLogout(): void;
}

const count = (n: number) => n.toLocaleString("de-DE");

export function Setup({ playlists, initial, user, onStart, onCreate, onReset, onLogout }: Props) {
  const [cfg, setCfg] = useState(initial);
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [resetStep, setResetStep] = useState(0);
  const patch = (p: Partial<Config>) => setCfg((c) => ({ ...c, ...p }));

  const needle = filter.trim().toLowerCase();
  const shown = needle ? playlists.filter((p) => p.name.toLowerCase().includes(needle)) : playlists;
  const source = playlists.find((p) => p.id === cfg.source);
  const targets = cfg.targets.filter((id) => id !== cfg.source);

  function pickSource(id: string) {
    setResetStep(0);
    patch({ source: id, targets: cfg.targets.filter((t) => t !== id) });
  }

  function toggleTarget(id: string) {
    patch({
      targets: cfg.targets.includes(id)
        ? cfg.targets.filter((t) => t !== id)
        : [...cfg.targets, id],
    });
  }

  async function create() {
    const title = name.trim();
    if (!title || creating) return;
    setCreating(true);
    const playlist = await onCreate(title);
    setCreating(false);
    if (playlist) {
      setName("");
      setCfg((c) => ({ ...c, targets: [...c.targets, playlist.id] }));
    }
  }

  return (
    <div className="setup">
      <header className="bar">
        <Logo size={22} />
        <strong className="brand">Sortify</strong>
        <span className="grow" />
        <span className="dim user">{user}</span>
        <button className="link" onClick={onLogout}>
          Abmelden
        </button>
      </header>

      <div className="setup-body">
        {playlists.length > 12 && (
          <input
            className="field filter"
            type="search"
            placeholder="Playlists filtern"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}

        <section className="col">
          <h2>Quelle</h2>
          <ul className="rows">
            {shown.map((p) => (
              <li key={p.id}>
                <button
                  className={`row${cfg.source === p.id ? " on" : ""}`}
                  aria-pressed={cfg.source === p.id}
                  onClick={() => pickSource(p.id)}
                >
                  <Thumb playlist={p} />
                  <span className="row-name">{p.name}</span>
                  <span className="row-count">{count(p.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="col">
          <h2>
            Ziele <span className="dim">{targets.length || ""}</span>
          </h2>
          <ul className="rows">
            {shown
              .filter((p) => p.id !== cfg.source)
              .map((p) => {
                const on = cfg.targets.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      className={`row${on ? " on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggleTarget(p.id)}
                    >
                      <span className="box">{on && <Check size={14} />}</span>
                      <Thumb playlist={p} />
                      <span className="row-name">{p.name}</span>
                      <span className="row-count">{count(p.total)}</span>
                    </button>
                  </li>
                );
              })}
            <li>
              <form
                className="row new"
                onSubmit={(e) => {
                  e.preventDefault();
                  create();
                }}
              >
                <span className="box plus">
                  <Plus />
                </span>
                <input
                  className="bare"
                  placeholder="Neue Playlist"
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                />
                {name.trim() && (
                  <button className="link" disabled={creating}>
                    Anlegen
                  </button>
                )}
              </form>
            </li>
          </ul>
        </section>

        <section className="col options">
          <h2>Optionen</h2>
          <div className="option">
            <span>Reihenfolge</span>
            <Segments
              value={cfg.order}
              options={[
                ["oldest", "Älteste zuerst"],
                ["newest", "Neueste zuerst"],
              ]}
              onChange={(order) => patch({ order })}
            />
          </div>
          <div className="option">
            <span>Songs starten bei</span>
            <Segments
              value={String(cfg.startAt)}
              options={[
                ["0", "0:00"],
                ["30", "0:30"],
                ["60", "1:00"],
              ]}
              onChange={(v) => patch({ startAt: Number(v) })}
            />
          </div>
          <Toggle
            label="Bereits einsortierte Songs überspringen"
            checked={cfg.skipSorted}
            onChange={(skipSorted) => patch({ skipSorted })}
          />
          <Toggle
            label={
              cfg.source === LIKED
                ? "Nach dem Einsortieren aus Lieblingssongs entfernen"
                : "Nach dem Einsortieren aus der Quelle entfernen"
            }
            checked={cfg.move}
            onChange={(move) => patch({ move })}
          />
          <Toggle
            label="Nach dem Einsortieren automatisch weiter"
            checked={cfg.autoNext}
            onChange={(autoNext) => patch({ autoNext })}
          />
          {source && (
            <button
              className="link danger"
              onClick={() => {
                if (resetStep === 1) onReset(source.id);
                setResetStep(resetStep === 1 ? 2 : 1);
              }}
              disabled={resetStep === 2}
            >
              {resetStep === 0 && `Fortschritt für „${source.name}“ zurücksetzen`}
              {resetStep === 1 && "Wirklich von vorn beginnen?"}
              {resetStep === 2 && "Zurückgesetzt"}
            </button>
          )}
        </section>
      </div>

      <footer className="setup-foot">
        <button className="btn primary big" disabled={!source} onClick={() => onStart(cfg)}>
          Sortieren <ArrowRight />
        </button>
      </footer>
    </div>
  );
}

function Segments<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange(value: T): void;
}) {
  return (
    <div className="segments" role="group">
      {options.map(([key, label]) => (
        <button
          key={key}
          className={key === value ? "on" : ""}
          aria-pressed={key === value}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="box">{checked && <Check size={14} />}</span>
      <span>{label}</span>
    </label>
  );
}
