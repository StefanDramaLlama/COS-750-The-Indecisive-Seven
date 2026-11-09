import type { IncomingMessage, ServerResponse } from "node:http";
import { GraphInputError } from "./algorithms/common.js";
import { DecisionError } from "./algorithms/kahn.js";
import { HttpError } from "./errors.js";

export interface ApiRequest {
  method: string;
  query: Record<string, string | undefined>;
  body: unknown;
  cookies: Record<string, string>;
  secure: boolean;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string | string[]>;
}

export type ApiHandler = (req: ApiRequest) => Promise<ApiResponse>;

export const json = (status: number, body: unknown, headers?: ApiResponse["headers"]): ApiResponse => ({
  status,
  body,
  headers,
});

export function requireMethod(req: ApiRequest, ...allowed: string[]): void {
  if (!allowed.includes(req.method)) {
    throw new HttpError(405, "method_not_allowed", `Use ${allowed.join(" or ")}.`);
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) {
    // Vercel pre-parses JSON bodies; a string means it could not.
    if (typeof req.body === "string") return req.body.length ? JSON.parse(req.body) : undefined;
    return req.body;
  }
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new HttpError(400, "too_large", "Request body is too large.");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length ? JSON.parse(text) : undefined;
}

/** Map thrown errors to {error: {code, message}} with the right status. */
export function errorResponse(err: unknown): ApiResponse {
  if (err instanceof HttpError) return json(err.status, { error: { code: err.code, message: err.message } });
  if (err instanceof SyntaxError) return json(400, { error: { code: "bad_json", message: "Body is not valid JSON." } });
  if (err instanceof GraphInputError) return json(422, { error: { code: "unsupported_graph", message: err.message } });
  if (err instanceof DecisionError) return json(422, { error: { code: "invalid_decision", message: err.message } });
  console.error(err);
  return json(500, { error: { code: "internal", message: "Something went wrong on the server." } });
}

/** Adapt a framework-free handler to Node's (req, res), as used by Vercel and the dev server. */
export function toNodeHandler(handler: ApiHandler) {
  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> => {
    let out: ApiResponse;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => (query[k] = v));
      const proto = String(req.headers["x-forwarded-proto"] ?? "");
      out = await handler({
        method: req.method ?? "GET",
        query,
        body: await readBody(req),
        cookies: parseCookies(req.headers.cookie),
        secure: proto === "https" || !!process.env.VERCEL,
      });
    } catch (err) {
      out = errorResponse(err);
    }
    res.statusCode = out.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
    res.end(JSON.stringify(out.body));
  };
}
