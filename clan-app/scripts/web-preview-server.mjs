/**
 * ⚡ سيرفر المعاينة — يخدم واجهة Flutter (build/web) ويحوّل /api إلى الباك
 * (4000) ← static + proxy → (3000)
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(__dirname, '..', 'bal_app', 'build', 'web');
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:3000';
const PORT = Number(process.env.PORT || 4000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── تحويل API للباك ──
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') ||
      url.pathname === '/health/live') {
    const proxyReq = http.request(
      `${API_TARGET}${url.pathname}${url.search}`,
      { method: req.method, headers: { ...req.headers, host: new URL(API_TARGET).host } },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*',
        });
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'الباك مش شغال' }));
    });
    req.pipe(proxyReq);
    return;
  }

  // ── الملفات الثابتة ──
  let filePath = path.join(WEB_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!existsSync(filePath) || url.pathname === '/') {
    // SPA fallback
    filePath = path.join(WEB_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ واجهة «بال» على http://0.0.0.0:${PORT} (API → ${API_TARGET})`);
});
