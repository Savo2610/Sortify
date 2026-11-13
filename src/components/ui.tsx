import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { playlistCover, plural } from '../lib/format';
import { playlistTotal } from '../lib/spotify';
import { LIKED, type Playlist } from '../lib/types';
import { IconCheck, IconHeartFill, IconMusic, IconSearch, IconX } from './Icons';

export function Cover({
  src,
  alt = '',
  size,
  liked,
  className = '',
}: {
  src?: string | null;
  alt?: string;
  size?: number;
  liked?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = size ? { width: size, height: size } : undefined;
  if (liked) {
    return (
      <div className={`cover cover--liked ${className}`} style={style}>
        <IconHeartFill size={size ? size * 0.42 : 22} />
      </div>
    );
  }
  if (!src || failed) {
    return (
      <div className={`cover cover--empty ${className}`} style={style}>
        <IconMusic size={size ? size * 0.4 : 22} />
      </div>
    );
  }
  return (
    <img
      className={`cover ${className}`}
      style={style}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="toggle">
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface PickerEntry {
  id: string;
  name: string;
  cover: string | null;
  liked?: boolean;
  count: number;
  sub?: string;
  badge?: ReactNode;
  disabled?: boolean;
}

export function toEntry(p: Playlist, meId: string): PickerEntry {
  return {
    id: p.id,
    name: p.name,
    cover: playlistCover(p),
    count: playlistTotal(p),
    sub: p.owner.id === meId ? undefined : p.collaborative ? 'Gemeinsame Playlist' : undefined,
  };
}

export function likedEntry(count: number | null): PickerEntry {
  return { id: LIKED, name: 'Lieblingssongs', cover: null, liked: true, count: count ?? 0 };
}

export function PlaylistPicker({
  entries,
  selected,
  onToggle,
  mode,
  emptyText = 'Keine Playlists gefunden.',
  header,
}: {
  entries: PickerEntry[];
  selected: string[];
  onToggle: (id: string) => void;
  mode: 'single' | 'multi';
  emptyText?: string;
  header?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, query]);

  return (
    <div className="picker">
      {entries.length > 7 && (
        <div className="search">
          <IconSearch size={18} />
          <input
            type="search"
            placeholder="Playlists durchsuchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Playlists durchsuchen"
          />
          {query && (
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setQuery('')} aria-label="Suche leeren">
              <IconX size={16} />
            </button>
          )}
        </div>
      )}
      {header}
      <ul className="picker__list" role={mode === 'single' ? 'radiogroup' : 'group'}>
        {filtered.map((e) => {
          const isSel = selected.includes(e.id);
          return (
            <li key={e.id}>
              <button
                type="button"
                role={mode === 'single' ? 'radio' : 'checkbox'}
                aria-checked={isSel}
                disabled={e.disabled}
                className={`pl-row ${isSel ? 'is-selected' : ''}`}
                onClick={() => onToggle(e.id)}
              >
                <Cover src={e.cover} liked={e.liked} size={48} />
                <span className="pl-row__text">
                  <span className="pl-row__name">{e.name}</span>
                  <span className="pl-row__sub">
                    {plural(e.count, 'Song', 'Songs')}
                    {e.sub && ` · ${e.sub}`}
                  </span>
                </span>
                {e.badge}
                <span className={`pl-row__check pl-row__check--${mode}`} aria-hidden="true">
                  {isSel && <IconCheck size={14} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="picker__empty">{emptyText}</li>}
      </ul>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal__inner">
        <div className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconX />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}
