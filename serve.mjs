/**
 * serve.mjs - zero-dependency static server for local development.
 *
 *   node serve.mjs [port]
 *
 * Two reasons this exists rather than "just open index.html":
 *
 *   1. The app is built from native ES modules. Opening index.html from the
 *      filesystem makes every import a cross-origin request and the browser
 *      refuses all of them. Modules need an http origin.
 *
 *   2. It sends Cache-Control: no-store. Browsers cache ES modules by URL
 *      for the life of the page, so a cached module keeps running after you
 *      have edited it - and because transitive imports keep their original
 *      URLs, a cache-busting query on one file does not reach the ones it
 *      imports. No-store makes edit-then-reload behave the way you expect.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2]) || 5275;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';

    // contain the path inside ROOT - no traversal out of the project
    const target = resolve(ROOT, '.' + normalize(rel));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);

    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(body);
  } catch (err) {
    const code = err && err.code === 'ENOENT' ? 404 : 500;
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(code === 404 ? 'Not found' : 'Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Procedural Z3  ->  http://localhost:${PORT}`);
  console.log(`serving ${ROOT}`);
});
