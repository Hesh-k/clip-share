import { contentDispositionFilename, isValidId, parseRange, sanitizeFilename } from "./helpers.js";
import { renderMissingPage, renderPage } from "./page.js";

interface Env {
  CLIPS: R2Bucket;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function respond(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(body, { ...init, headers });
}

function keyFor(id: string): string {
  return `clips/${id}/video`;
}

function notFound(): Response {
  return respond("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function ifNoneMatchMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//, "");
    return normalized === "*" || normalized === etag;
  });
}

async function servePage(id: string, env: Env): Promise<Response> {
  const object = await env.CLIPS.head(keyFor(id));
  if (!object) {
    return respond(renderMissingPage(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const filename = sanitizeFilename(object.customMetadata?.originalname ?? "video");
  return respond(renderPage(id, filename, object.size), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=3600" },
  });
}

async function streamObject(request: Request, id: string, env: Env, download: boolean): Promise<Response> {
  const key = keyFor(id);
  const metadata = await env.CLIPS.head(key);
  if (!metadata) return notFound();
  const etag = metadata.httpEtag;
  const commonHeaders = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Type": metadata.httpMetadata?.contentType ?? "application/octet-stream",
    ETag: etag,
  });
  if (download) {
    const filename = sanitizeFilename(metadata.customMetadata?.originalname ?? "video");
    commonHeaders.set("Content-Disposition", contentDispositionFilename(filename));
  }
  if (ifNoneMatchMatches(request.headers.get("If-None-Match"), etag)) {
    return respond(null, { status: 304, headers: commonHeaders });
  }

  const parsed = parseRange(request.headers.get("Range"), metadata.size);
  if (parsed?.kind === "invalid") {
    commonHeaders.set("Content-Range", `bytes */${metadata.size}`);
    return respond(null, { status: 416, headers: commonHeaders });
  }

  const status = parsed?.kind === "range" ? 206 : 200;
  const contentLength = parsed?.kind === "range" ? parsed.value.length : metadata.size;
  commonHeaders.set("Content-Length", String(contentLength));
  if (parsed?.kind === "range") {
    const end = parsed.value.offset + parsed.value.length - 1;
    commonHeaders.set("Content-Range", `bytes ${parsed.value.offset}-${end}/${metadata.size}`);
  }
  const object = request.method === "HEAD"
    ? null
    : parsed?.kind === "range"
      ? await env.CLIPS.get(key, { range: parsed.value })
      : await env.CLIPS.get(key);
  if (request.method !== "HEAD" && !object) return notFound();
  return respond(request.method === "HEAD" ? null : object?.body ?? null, {
    status,
    headers: commonHeaders,
  });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/") {
    return respond("OK", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const match = /^\/c\/([^/]+)(?:\/(video|download))?$/.exec(url.pathname);
  if (!match || !isValidId(match[1])) return notFound();
  const [, id, resource] = match;

  if (!resource && request.method === "GET") return servePage(id, env);
  if ((resource === "video" || resource === "download") && ["GET", "HEAD"].includes(request.method)) {
    return streamObject(request, id, env, resource === "download");
  }
  return notFound();
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
