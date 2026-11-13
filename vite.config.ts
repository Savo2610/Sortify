import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base, so the build works on any path (e.g. GitHub Pages under /Sortify/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022' },
});
