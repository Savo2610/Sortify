import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// Spotify erlaubt als lokale Redirect-URI nur die Loopback-IP, nicht "localhost".
export default defineConfig({
  plugins: [react(), cloudflare()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
