/**
 * serve.mjs — pelayan statik kecil untuk dashboard.
 *
 * Guna: node tools/serve.mjs [port]
 * Lalai: 8082. Hanya mendengar pada 127.0.0.1.
 */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8082);
const host = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      send(res, 405, 'Kaedah tidak dibenarkan.');
      return;
    }

    const requestUrl = new URL(req.url || '/', `http://${host}:${port}`);
    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      send(res, 400, 'URL tidak sah.');
      return;
    }

    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = path.resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      send(res, 403, 'Akses ditolak.');
      return;
    }

    let info;
    try {
      info = await stat(target);
    } catch {
      send(res, 404, 'Fail tidak ditemui.');
      return;
    }

    if (info.isDirectory()) {
      const index = path.join(target, 'index.html');
      try {
        info = await stat(index);
        return serveFile(index, info, req, res);
      } catch {
        send(res, 404, 'Direktori tidak mempunyai index.html.');
        return;
      }
    }

    return serveFile(target, info, req, res);
  } catch (error) {
    console.error(error);
    send(res, 500, 'Ralat pelayan.');
  }
});

function serveFile(file, info, req, res) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': ext === '.html' || ext === '.json' ? 'no-store' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on('error', () => {
    if (!res.headersSent) send(res, 500, 'Ralat membaca fail.');
    else res.destroy();
  });
  stream.pipe(res);
}

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} sudah digunakan. Hentikan pelayan lain atau guna port lain:`);
    console.error(`  node tools/serve.mjs 8083`);
    process.exitCode = 1;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log('');
  console.log('  PERKIM Monitor');
  console.log(`  http://${host}:${port}/`);
  console.log('  Henti: Ctrl+C');
  console.log('');
});
