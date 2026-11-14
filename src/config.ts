// Die eingebaute Client-ID gehört zur Spotify-App des Betreibers. Spotify lässt
// dort nur fünf eingetragene Konten zu – wer nicht dazugehört, legt eine eigene
// Spotify-App an und trägt deren Client-ID hier im Browser ein.
const BUILT_IN: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? "";
const OWN = "sortify.clientId";

export const hasBuiltInClientId = BUILT_IN !== "";
export const ownClientId = () => localStorage.getItem(OWN) ?? "";
export const clientId = () => ownClientId() || BUILT_IN;
export const isClientId = (value: string) => /^[0-9a-f]{32}$/i.test(value);

export function setOwnClientId(id: string) {
  if (id) localStorage.setItem(OWN, id);
  else localStorage.removeItem(OWN);
}

export const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
  "user-library-modify",
  // Wiedergabe im Browser (Web Playback SDK) und Steuerung anderer Geräte
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
];

// ?demo zeigt die App mit erfundenen Songs, ohne Spotify-Konto.
const params = new URLSearchParams(location.search);
if (params.has("demo")) sessionStorage.setItem("sortify.demo", "1");
export const DEMO = sessionStorage.getItem("sortify.demo") === "1";
