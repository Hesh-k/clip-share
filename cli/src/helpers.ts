import { randomBytes } from "node:crypto";
import path from "node:path";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
};

export function generateId(): string {
  let id = "";
  while (id.length < 10) {
    // Reject values outside a multiple of 62 to avoid modulo bias.
    for (const byte of randomBytes(16)) {
      if (byte < 248) id += BASE62[byte % BASE62.length];
      if (id.length === 10) break;
    }
  }
  return id;
}

export function isValidId(value: string): boolean {
  return /^[0-9A-Za-z]{10}$/.test(value);
}

export function contentTypeFor(filename: string): string | undefined {
  return CONTENT_TYPES[path.extname(filename).toLowerCase()];
}

export function sanitizeOriginalName(filename: string): string {
  const basename = path.basename(filename.replace(/[\\/]/g, path.sep));
  const safe = basename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    .slice(0, 255);
  return safe || "video";
}
