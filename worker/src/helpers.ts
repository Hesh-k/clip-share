export interface ByteRange {
  offset: number;
  length: number;
}

export type ParsedRange = { kind: "range"; value: ByteRange } | { kind: "invalid" };

export function isValidId(value: string): boolean {
  return /^[0-9A-Za-z]{10}$/.test(value);
}

export function parseRange(header: string | null, size: number): ParsedRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return { kind: "invalid" };

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: "invalid" };
    const length = Math.min(suffixLength, size);
    return { kind: "range", value: { offset: size - length, length } };
  }

  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(requestedEnd) ||
    offset < 0 ||
    requestedEnd < offset ||
    offset >= size
  ) {
    return { kind: "invalid" };
  }
  const end = Math.min(requestedEnd, size - 1);
  return { kind: "range", value: { offset, length: end - offset + 1 } };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function sanitizeFilename(value: string): string {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    .slice(0, 255);
  return sanitized || "video";
}

export function contentDispositionFilename(filename: string): string {
  const safeName = sanitizeFilename(filename);
  const asciiName = safeName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(safeName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
