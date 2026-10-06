import { escapeHtml, formatSize } from "./helpers.js";

export function renderPage(id: string, filename: string, size: number): string {
  const escapedName = escapeHtml(filename);
  const formattedSize = escapeHtml(formatSize(size));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapedName} - Video</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { box-sizing: border-box; min-height: 100vh; margin: 0; padding: 1.25rem; display: grid; place-items: center; background: #f4f5f7; color: #172033; }
    main { width: min(100%, 760px); }
    h1 { margin: 0 0 .5rem; overflow-wrap: anywhere; font-size: clamp(1.25rem, 4vw, 1.8rem); }
    .size { margin: 0 0 1rem; color: #606b7c; }
    video { display: block; width: 100%; max-height: 72vh; border-radius: 12px; background: #101318; }
    a { display: block; margin-top: 1rem; padding: 1rem; border-radius: 10px; background: #1769e0; color: white; text-align: center; text-decoration: none; font-weight: 700; font-size: 1.1rem; }
    a:focus-visible { outline: 3px solid #ffbf47; outline-offset: 3px; }
    @media (prefers-color-scheme: dark) { body { background: #11151c; color: #f1f4f8; } .size { color: #aab4c2; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapedName}</h1>
    <p class="size">${formattedSize}</p>
    <video controls playsinline preload="metadata" src="/c/${id}/video"></video>
    <a href="/c/${id}/download">Download video</a>
  </main>
</body>
</html>`;
}

export function renderMissingPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Video unavailable</title></head><body><main><h1>This video isn't available</h1><p>The link may be incorrect or the video may have been removed.</p></main></body></html>`;
}
