import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import {
  addLeadNote,
  buildDashboardPayload,
  createLeadRecord,
  dispatchOutreachBatch,
  exportLeadsCsv,
  updateLeadStatus,
} from './src/engine.js';
import { ensureRuntimeStore, readStore, writeStore } from './src/store.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(process.cwd(), 'public');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

await ensureRuntimeStore();

const server = http.createServer(async (request, response) => {
  const baseUrl = `http://${request.headers.host || `${host}:${port}`}`;
  const url = new URL(request.url || '/', baseUrl);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url, baseUrl);
      return;
    }

    await handleStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unexpected failure',
    });
  }
});

server.listen(port, host, () => {
  console.log(`Lead engine running on http://${host}:${port}`);
  console.log(`Operator dashboard: http://${host}:${port}/`);
  console.log(`Capture funnel:      http://${host}:${port}/capture`);
});

async function handleApi(request, response, url, baseUrl) {
  const { method = 'GET' } = request;

  if (method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, timestamp: new Date().toISOString() });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/bootstrap') {
    const store = await readStore();
    sendJson(response, 200, buildDashboardPayload(store, baseUrl));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/intake') {
    const payload = await readJsonBody(request);
    const store = await readStore();
    const { lead, outreach } = createLeadRecord(payload, store);

    store.leads.unshift(lead);
    store.outreach.unshift(...outreach);
    await writeStore(store);

    sendJson(response, 201, {
      ok: true,
      lead,
      outreachCreated: outreach.length,
      message: 'Lead captured and queued for operations review.',
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/outreach/dispatch') {
    const payload = await readJsonBody(request);
    const store = await readStore();
    const result = dispatchOutreachBatch(store, Number(payload.limit || 5));

    await writeStore(store);
    sendJson(response, 200, result);
    return;
  }

  if (method === 'GET' && url.pathname === '/api/export/leads.csv') {
    const store = await readStore();
    const csv = exportLeadsCsv(store);

    response.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lead-export.csv"',
    });
    response.end(csv);
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/status$/);
  if (method === 'POST' && statusMatch) {
    const payload = await readJsonBody(request);
    const store = await readStore();
    const lead = updateLeadStatus(store, statusMatch[1], payload.status);

    await writeStore(store);
    sendJson(response, 200, { ok: true, lead });
    return;
  }

  const notesMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/notes$/);
  if (method === 'POST' && notesMatch) {
    const payload = await readJsonBody(request);
    const store = await readStore();
    const lead = addLeadNote(store, notesMatch[1], payload.note);

    await writeStore(store);
    sendJson(response, 200, { ok: true, lead });
    return;
  }

  sendJson(response, 404, { error: 'Route not found' });
}

async function handleStatic(response, pathname) {
  const normalizedPath =
    pathname === '/'
      ? '/index.html'
      : pathname === '/capture'
        ? '/capture.html'
        : pathname;

  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(publicDir, safePath);

  try {
    const content = await readFile(filePath);
    const extension = path.extname(filePath);

    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
    });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}
