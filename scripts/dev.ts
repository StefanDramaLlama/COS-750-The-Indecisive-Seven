// npm run dev: watch-build the browser bundle and serve dist/ plus the same API handlers Vercel uses.
import { readFile, stat, watch } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import * as esbuild from "esbuild";
import { ensureLocalDbDir, getDb, migrate } from "../src/server/db.js";
import { lessonsHandler, practiceHandler, progressHandler, runsHandler, ttsHandler, tutorHandler } from "../src/server/handlers.js";
import { toNodeHandler } from "../src/server/http.js";
import { DIST, browserBuild, checkCatalog, copyStatic } from "./build-lib.js";

// Load .env for local development (Vercel injects environment variables itself).
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: the study helper reports that it is not configured.
}

const PORT = Number(process.env.PORT ?? 3000);

checkCatalog();
await copyStatic();
const ctx = await esbuild.context({ ...browserBuild, minify: false });
await ctx.watch();

if (!process.env.TURSO_DATABASE_URL) {
  // Local convenience only: hosted databases are migrated explicitly with npm run migrate.
  await ensureLocalDbDir();
  const applied = await migrate(getDb());
  if (applied.length) console.log(`Applied migrations: ${applied.join(", ")}`);
}

// Re-copy HTML/CSS when they change.
void (async () => {
  for (const dir of ["src/styles", "."]) {
    void (async () => {
      try {
        for await (const ev of watch(dir)) {
          if (ev.filename && /\.(css|html)$/.test(ev.filename)) await copyStatic();
        }
      } catch {
        /* watching is best-effort */
      }
    })();
  }
})();

const api: Record<string, ReturnType<typeof toNodeHandler>> = {
  "/api/lessons": toNodeHandler(lessonsHandler),
  "/api/runs": toNodeHandler(runsHandler),
  "/api/practice": toNodeHandler(practiceHandler),
  "/api/progress": toNodeHandler(progressHandler),
  "/api/tutor": toNodeHandler(tutorHandler),
  "/api/tts": toNodeHandler(ttsHandler),
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const handler = api[url.pathname];
  if (handler) return handler(req, res);
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { code: "not_found", message: "No such endpoint." } }));
    return;
  }
  // Same rewrites as vercel.json: /algorithms and /algorithms/:lessonId serve index.html.
  let file = url.pathname === "/" || /^\/algorithms(\/[^/]+)?\/?$/.test(url.pathname) ? "/index.html" : url.pathname;
  file = path.join(DIST, path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
  try {
    if (!file.startsWith(DIST) || !(await stat(file)).isFile()) throw new Error("not found");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(PORT, () => {
  console.log(`\n  Graphwise dev server → http://localhost:${PORT}/algorithms/dijkstra\n`);
});
