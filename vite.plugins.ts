// Vite plugins shared by vite.config.ts (HTTPS, headset) and vite.http.config.ts
// (HTTP, desktop smokes).
import { createReadStream, createWriteStream, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import {
  DROP_MAX_BYTES,
  isSameOriginRequest,
  parseByteRange,
  sanitizeDropName,
  uniqueDropName,
  type DropEntry,
} from './src/dropBox.ts';

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

/**
 * LAN drop box (roadmap P1.5), dev server only. A folder, ./drop (gitignored),
 * that a phone or laptop on the same network uploads to (public/drop.html) and
 * the headset's landing page lists and imports from, with no file picker.
 *
 *   POST   <base>drop/upload?name=...  body = the file (streamed to disk, capped)
 *   GET    <base>drop/list             JSON [{ name, size, mtime }], newest first
 *   GET    <base>drop/info             JSON { network: [dev server LAN URLs] }
 *   GET    <base>drop/file/<name>      the bytes, as an attachment (Range supported)
 *   DELETE <base>drop/file/<name>
 *
 * There is no authentication: anyone on the network can use it while
 * `npm run dev` runs. So every path under <base>drop/ is answered here (Vite
 * never serves an uploaded file itself, which could run script on the app's
 * origin), files are sent as inert downloads, names are sanitized and must
 * resolve inside the folder, uploads are size-capped, and uploads and deletes
 * from another site's page are refused.
 */
export function dropBox(): Plugin {
  let dir = resolve(process.cwd(), 'drop');
  const inside = (name: string): string | null => {
    const clean = sanitizeDropName(name);
    if (!clean || clean !== name) return null;
    const full = resolve(dir, clean);
    return full.startsWith(dir + sep) ? full : null;
  };
  const list = (): DropEntry[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isFile() && !d.name.endsWith('.part') && !d.name.startsWith('.'))
        .map((d) => {
          const st = statSync(join(dir, d.name));
          return { name: d.name, size: st.size, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
    } catch {
      return [];
    }
  };
  return {
    name: 'setview-drop-box',
    apply: 'serve',
    config() {
      // Large uploads must not wake the file watcher.
      return { server: { watch: { ignored: ['**/drop/**'] } } };
    },
    configResolved(config) {
      dir = resolve(config.root, 'drop');
    },
    configureServer(server) {
      const base = server.config.base.endsWith('/') ? server.config.base : `${server.config.base}/`;
      const prefix = `${base}drop/`;
      server.middlewares.use((req, res, next) => {
        const [path, query = ''] = (req.url ?? '').split('?');
        if (!path.startsWith(prefix)) return next();
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        const route = path.slice(prefix.length);
        const method = req.method ?? 'GET';
        if ((method === 'POST' || method === 'DELETE') && !isSameOriginRequest(req.headers.origin, req.headers.host)) {
          return send(403, { error: 'cross-origin request refused' });
        }
        try {
          mkdirSync(dir, { recursive: true });
        } catch {
          return send(500, { error: 'cannot create the drop folder' });
        }

        if (route === 'list' && method === 'GET') return send(200, list());
        // The dev server's LAN URLs, so a page opened on localhost can tell the phone where to go.
        if (route === 'info' && method === 'GET') return send(200, { network: server.resolvedUrls?.network ?? [] });

        if (route === 'upload' && method === 'POST') {
          const raw = new URLSearchParams(query).get('name') ?? '';
          const clean = sanitizeDropName(raw);
          if (!clean) return send(400, { error: 'missing or unusable file name' });
          const declared = Number(req.headers['content-length'] ?? NaN);
          if (Number.isFinite(declared) && declared > DROP_MAX_BYTES) return send(413, { error: 'file too large' });
          const name = uniqueDropName(clean, new Set(list().map((e) => e.name)));
          const finalPath = inside(name);
          if (!finalPath) return send(400, { error: 'unusable file name' });
          const partPath = `${finalPath}.part`;
          const out = createWriteStream(partPath);
          let received = 0;
          let failed = false;
          const fail = (status: number, error: string) => {
            if (failed) return;
            failed = true;
            req.unpipe(out);
            out.destroy();
            try {
              unlinkSync(partPath);
            } catch {
              /* already gone */
            }
            send(status, { error });
          };
          req.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > DROP_MAX_BYTES) fail(413, 'file too large');
          });
          req.on('aborted', () => fail(400, 'upload aborted'));
          out.on('error', () => fail(500, 'could not write the file (disk full?)'));
          out.on('finish', () => {
            if (failed) return;
            try {
              renameSync(partPath, finalPath);
              send(201, { name, size: received });
            } catch {
              fail(500, 'could not store the file');
            }
          });
          req.pipe(out);
          return;
        }

        if (route.startsWith('file/')) {
          let name: string;
          try {
            name = decodeURIComponent(route.slice('file/'.length));
          } catch {
            return send(400, { error: 'bad file name' });
          }
          const full = inside(name);
          if (!full) return send(404, { error: 'not found' });
          let size: number;
          try {
            const st = statSync(full);
            if (!st.isFile()) return send(404, { error: 'not found' });
            size = st.size;
          } catch {
            return send(404, { error: 'not found' });
          }
          if (method === 'DELETE') {
            try {
              unlinkSync(full);
              return send(200, { deleted: name });
            } catch {
              return send(500, { error: 'could not delete the file' });
            }
          }
          if (method === 'GET' || method === 'HEAD') {
            // Inert download: never rendered or sniffed as a page on this origin.
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Accept-Ranges', 'bytes');
            const range = parseByteRange(req.headers.range, size);
            if (req.headers.range && !range) {
              res.statusCode = 416;
              res.setHeader('Content-Range', `bytes */${size}`);
              return res.end();
            }
            const start = range?.start ?? 0;
            const end = range?.end ?? size - 1;
            res.statusCode = range ? 206 : 200;
            if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
            res.setHeader('Content-Length', String(size === 0 ? 0 : end - start + 1));
            if (method === 'HEAD' || size === 0) return res.end();
            createReadStream(full, { start, end }).on('error', () => res.destroy()).pipe(res);
            return;
          }
        }
        return send(404, { error: 'not found' });
      });
    },
  };
}
