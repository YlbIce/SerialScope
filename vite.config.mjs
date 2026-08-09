import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'src/renderer-react',
  plugins: [react()],
  base: './',
  build: {
    outDir: path.resolve(import.meta.dirname, 'src/renderer-dist'),
    emptyOutDir: true
  }
});
