# Sortify

Eine Progressive Web App, mit der du deine Spotify-Songs **Song für Song** in Playlists einsortierst.

- **Quelle wählen** – Lieblingssongs oder eine eigene Playlist
- **Ausschließen** – Songs, die schon in bestimmten Playlists sind, werden übersprungen
  (z. B. „alle Lieblingssongs, die nicht in Playlist 1 und Playlist 2 sind“)
- **Einsortieren** – pro Song eine oder mehrere Ziel-Playlists antippen, neue Playlists direkt erstellen
- **Schon einsortierte überspringen** – Songs, die bereits in einer Ziel-Playlist sind, werden nicht angezeigt
- **Andere Versionen erkennen** – Remaster / Single- / Album-Version zählen als derselbe Song (ISRC + Titel/Interpret)
- **Verschieben / Entfernen** – Song aus der Quelle entfernen (bei Lieblingssongs: „entliken“)
- **Liken** – Songs aus einer Playlist direkt zu den Lieblingssongs hinzufügen
- **Rückgängig** – die letzten 50 Aktionen lassen sich zurücknehmen (inkl. Spotify-Änderungen)
- **Wischen & Tastatur** – rechts = weiter/hinzufügen, links = überspringen; `1–9`, `Enter`, `S`, `Entf`, `Z`, `L`, `N`
- **Vorschau-Player** – eingebetteter Spotify-Player für jeden Song
- **Fortschritt wird gespeichert** – Sitzung jederzeit unterbrechen und später fortsetzen
- **Installierbar** – als App auf dem Homescreen, startet auch offline

Alles läuft im Browser (OAuth PKCE, kein Server, kein Client Secret).

## Einrichtung

1. Im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) eine App anlegen (API: *Web API*).
2. Als **Redirect URI** die Adresse eintragen, unter der Sortify läuft – genau so, wie sie im
   Einrichtungsdialog der App angezeigt wird, z. B.
   - lokal: `http://127.0.0.1:5173/` (Spotify erlaubt `localhost` nicht mehr, nur `127.0.0.1`)
   - GitHub Pages: `https://<user>.github.io/Sortify/`
3. Unter **User Management** den eigenen Spotify-Account eintragen (Development Mode: max. 5 Nutzer,
   der App-Besitzer braucht Spotify Premium).
4. Die **Client ID** beim ersten Start in Sortify einfügen – oder fest einbauen über
   `VITE_SPOTIFY_CLIENT_ID` (`.env.local` bzw. Repository-Variable `SPOTIFY_CLIENT_ID` für GitHub Pages).

## Entwicklung

```bash
npm install
npm run dev      # http://127.0.0.1:5173/
npm run build    # Produktions-Build nach dist/
npm run preview  # Build lokal testen (http://127.0.0.1:4173/, eigene Redirect URI nötig)
```

## Deployment (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut bei jedem Push auf `main` und veröffentlicht auf GitHub Pages.
Einmalig unter *Settings → Pages → Source* „GitHub Actions“ auswählen.

## Hinweise zur Spotify-API

Seit Februar 2026 gelten für Apps im Development Mode Einschränkungen:

- Inhalte von Playlists sind nur noch für **eigene oder gemeinsame (kollaborative)** Playlists abrufbar.
  Gefolgte Playlists anderer Nutzer können daher weder Quelle noch Ausschluss/Ziel sein und werden ausgeblendet.
- Sortify nutzt bereits die neuen Endpunkte (`/playlists/{id}/items`, `/me/library`, `POST /me/playlists`).

## Tech

React 19 · TypeScript · Vite · handgeschriebener Service Worker · keine weiteren Laufzeit-Abhängigkeiten.
