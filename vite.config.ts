import { defineConfig } from 'vite';

export default defineConfig({
  root: 'www',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true }
});
