import { useState } from 'react';
import { createPlaylist } from '../lib/spotify';
import type { Playlist } from '../lib/types';
import { Modal, Spinner, Toggle } from './ui';

export function CreatePlaylistDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: Playlist) => void;
}) {
  const [name, setName] = useState('');
  const [isPublic, setPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const p = await createPlaylist(name.trim(), isPublic, 'Erstellt mit Sortify');
      onCreated(p);
      setName('');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Neue Playlist">
      <form onSubmit={submit} className="form">
        <label className="field">
          <span className="field__label">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Roadtrip 2026"
            maxLength={100}
          />
        </label>
        <Toggle
          checked={isPublic}
          onChange={setPublic}
          label="Öffentlich"
          hint="Im Profil für andere sichtbar"
        />
        {error && <p className="form__error">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={!name.trim() || busy}>
          {busy ? <Spinner size={18} /> : 'Erstellen'}
        </button>
      </form>
    </Modal>
  );
}
