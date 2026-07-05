import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// basicSsl() generates a self-signed cert and switches the dev server to
// HTTPS automatically. host: true exposes the server on the LAN so the
// headset can reach it. WebXR requires a secure context (localhost is
// exempt, but the headset is not localhost).
export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
});
