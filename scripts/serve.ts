import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { lessonsEndpoint, practiceEndpoint, progressEndpoint, runsEndpoint } from '../src/server/http.ts';

const endpoints = new Map([
  ['/api/lessons', lessonsEndpoint], ['/api/runs', runsEndpoint],
  ['/api/practice', practiceEndpoint], ['/api/progress', progressEndpoint]
]);
const types: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4173);
const dist = resolve('dist');
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url || '/', `http://${incoming.headers.host || `localhost:${port}`}`);
    const handler = endpoints.get(url.pathname);
    if (handler) {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > 32_768) {
          outgoing.writeHead(413).end('Request too large');
          return;
        }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const request = new Request(url, {
        method: incoming.method, headers,
        ...(chunks.length && incoming.method !== 'GET' && incoming.method !== 'HEAD' ? { body: new Uint8Array(Buffer.concat(chunks)) } : {})
      });
      const response = await handler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const adtPage = /^\/graph-adt(?:\/[^/]+)?\/?$/.test(pathname);
    const page = adtPage || pathname === '/' || /^\/algorithms(?:\/[^/]+)?\/?$/.test(pathname);
    const file = resolve(dist, adtPage ? 'graph-adt.html' : page ? 'index.html' : `.${pathname}`);
    if (!file.startsWith(`${dist}${sep}`) || (!page && !pathname.startsWith('/assets/'))) {
      outgoing.writeHead(404).end('Not found');
      return;
    }
    const content = await readFile(file);
    outgoing.writeHead(200, { 'Content-Type': `${types[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` });
    outgoing.end(incoming.method === 'HEAD' ? undefined : content);
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    outgoing.writeHead(missing ? 404 : 500).end(missing ? 'Not found' : 'Server error');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Graphwise is ready at http://127.0.0.1:${port}/algorithms/dijkstra`));
