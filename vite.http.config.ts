import { defineConfig } from 'vite';
import { dropBox, threeDecoders } from './vite.plugins.ts';

// HTTP variant of the dev server for browser-driven smoke checks: automation
// browsers reject basic-ssl's self-signed cert, and http://localhost is still
// a secure context for everything except an actual headset session.
export default defineConfig({
  plugins: [threeDecoders(), dropBox()],
  server: {
    host: true,
    port: 5174,
  },
  build: {
    target: 'es2022',
  },
});
