// Card Recon local server. No dependencies. Run: node server.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4747);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    // Serve only the app's own files. Anything else in the folder (HANDOFF.md has guest names and card digits,
    // mock pages, .git, test data) must never be reachable from another device on the Wi-Fi.
    const rel = file.slice(ROOT.length + 1), ok = /^(index\.html|app\.js|engine\.js|report\.js|styles\.css|manifest\.webmanifest|icon[\w-]*\.(png|svg)|fonts\/[\w-]+\.woff2|vendor\/[\w.-]+\.js)$/;
    if (!file.startsWith(ROOT + '/') || !ok.test(rel)) { res.writeHead(404); return res.end('Not found'); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n  Card Recon is running\n\n  On this Mac:   http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  On your phone: http://${ip}:${PORT}   (same Wi-Fi)`);
  console.log('\n  Leave this window open. Press Ctrl+C to stop.\n');
});
