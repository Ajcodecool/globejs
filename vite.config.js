import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site also works from a file:// or sub-path host.
  base: './',
  server: {
    port: 5175,
  },
  preview: {
    port: 4175,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
