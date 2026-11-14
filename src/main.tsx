import "@fontsource-variable/geist";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./app";

// Spotify akzeptiert lokal nur http://127.0.0.1 als Redirect-URI. Unter
// "localhost" wären Login und gespeicherter Stand eine andere Herkunft.
if (location.hostname === "localhost") {
  location.replace(location.href.replace("//localhost", "//127.0.0.1"));
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
