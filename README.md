# Sortify

Songs aus den Lieblingssongs (oder einer Playlist) nacheinander anhören und in
Playlists einsortieren. PWA für Handy und PC, läuft auf `sortify.veerka.mp`.

## Einrichten

1. Im [Spotify-Dashboard](https://developer.spotify.com/dashboard) eine App anlegen
   (API: „Web API“ und „Web Playback SDK“). Redirect-URIs:
   - `https://sortify.veerka.mp/callback`
   - `http://127.0.0.1:5173/callback`
2. Die Client-ID in `.env` als `VITE_SPOTIFY_CLIENT_ID` eintragen. Sie ist
   öffentlich (Login per PKCE, kein Secret).

Wiedergabe braucht Spotify Premium. Im Development Mode der Spotify-App können
sich höchstens fünf eingetragene Konten anmelden (Dashboard → Settings → User
Management). Wer nicht dazugehört, legt selbst eine Spotify-App an und trägt
deren Client-ID auf der Anmeldeseite unter „Eigene Client-ID verwenden“ ein;
sie bleibt nur im jeweiligen Browser gespeichert.

## Entwickeln

```bash
npm run dev      # http://127.0.0.1:5173 (nicht localhost – Spotify verlangt die IP)
npm run check    # Typprüfung
npm test         # Tests für den Durchlauf durch die Quelle
```

`http://127.0.0.1:5173/?demo` zeigt die App mit erfundenen Songs, ohne Spotify.

## Aufbau

- `src/lib/spotify.ts` – Spotify Web API (Stand der Umstellung vom Februar 2026)
- `src/lib/source.ts` – läuft seitenweise durch die Quelle, auch beim Wiedereinstieg
- `src/lib/session.ts` – Sortier-Sitzung: Warteschlange, Einsortieren, Zurück, verzögertes Löschen
- `src/lib/player.ts` – Wiedergabe im Browser (Web Playback SDK) oder auf einem Connect-Gerät
- `src/lib/sync.ts` + `worker/index.ts` – Einstellungen und Fortschritt pro Spotify-Konto
  in einem Durable Object, damit man auf einem anderen Gerät weitermachen kann
