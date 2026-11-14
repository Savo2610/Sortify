export const CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? "";

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
