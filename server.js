// Temp Mail server — wrapper API dari Seika (mob2.temp-mail.org) + static hosting.
// Tanpa dependency. Jalankan: node server.js  (Replit: tekan Run)
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://mob2.temp-mail.org';
const RPC_URL = 'https://papi2.temp-mail.org/rpc/';
const UA = 'okhttp/4.12.0';
const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), 'public');

function request(url, { method = 'GET', headers = {}, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const h = { 'User-Agent': UA, Accept: 'application/json', ...headers };
    let data = null;
    if (body) {
      data = JSON.stringify(body);
      h['Content-Type'] = 'application/json';
      h['Content-Length'] = Buffer.byteLength(data);
    } else if (method === 'POST') h['Content-Length'] = 0;

    const req = https.request(new URL(url), { method, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = text;
        try { parsed = JSON.parse(text); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(raw ? text : parsed);
        const err = new Error(parsed?.error || parsed?.errorMessage || `HTTP ${res.statusCode}`);
        err.status = res.statusCode;
        reject(err);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = {
  create: () => request(`${BASE_URL}/mailbox`, { method: 'POST' }),
  rotate: (t) => request(`${BASE_URL}/mailbox`, { method: 'POST', headers: auth(t) }),
  mailbox: (t) => request(`${BASE_URL}/mailbox`, { headers: auth(t) }),
  messages: (t) => request(`${BASE_URL}/messages`, { headers: auth(t) }),
  message: (t, id) => request(`${BASE_URL}/messages/${encodeURIComponent(id)}/`, { headers: auth(t) }),
  source: (t, id) =>
    request(`${BASE_URL}/messages/${encodeURIComponent(id)}/source`, {
      headers: { ...auth(t), Accept: 'application/octet-stream' }, raw: true,
    }),
  domains: async () =>
    (await request(RPC_URL, { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'getdomains', params: {} } })).result,
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (url.pathname.startsWith('/api/')) {
    try {
      const p = url.pathname.slice(5).split('/');
      if (p[0] === 'mailbox' && req.method === 'POST') return json(200, token ? await api.rotate(token) : await api.create());
      if (p[0] === 'mailbox') return json(200, await api.mailbox(token));
      if (p[0] === 'domains') return json(200, await api.domains());
      if (p[0] === 'messages' && !p[1]) return json(200, await api.messages(token));
      if (p[0] === 'messages' && p[2] === 'source') return json(200, { source: await api.source(token, p[1]) });
      if (p[0] === 'messages') return json(200, await api.message(token, p[1]));
      return json(404, { error: 'Not found' });
    } catch (e) {
      return json(e.status || 500, { error: e.message });
    }
  }

  try {
    const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = await readFile(join(PUBLIC, rel));
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Temp Mail jalan di port', process.env.PORT || 3000));
