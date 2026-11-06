// Vite plugins shared by vite.config.ts (HTTPS, headset) and vite.http.config.ts
// (HTTP, desktop smokes).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * three.js decoder files for compressed glTF (Draco geometry, KTX2/Basis
 * textures). Served at <base>decoders/... from node_modules in dev and copied
 * into the build, so the binaries are never committed to the repo.
 */
const DECODER_FILES: Readonly<Record<string, readonly string[]>> = {
  draco: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'],
  basis: ['basis_transcoder.js', 'basis_transcoder.wasm'],
};
const DECODER_SOURCE: Readonly<Record<string, string>> = {
  draco: 'node_modules/three/examples/jsm/libs/draco/gltf',
  basis: 'node_modules/three/examples/jsm/libs/basis',
};

export function threeDecoders(): Plugin {
  let root = process.cwd();
  const fileFor = (dir: string, name: string): string | null =>
    DECODER_FILES[dir]?.includes(name) ? resolve(root, DECODER_SOURCE[dir], name) : null;
  return {
    name: 'setview-three-decoders',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      const base = server.config.base.endsWith('/') ? server.config.base : `${server.config.base}/`;
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith(`${base}decoders/`)) return next();
        const [dir, name] = url.slice(base.length + 'decoders/'.length).split('/');
        const file = dir && name ? fileFor(dir, name) : null;
        if (!file) return next();
        try {
          const body = readFileSync(file);
          res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(body);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const [dir, names] of Object.entries(DECODER_FILES)) {
        for (const name of names) {
          this.emitFile({ type: 'asset', fileName: `decoders/${dir}/${name}`, source: readFileSync(fileFor(dir, name)!) });
        }
      }
    },
  };
}
