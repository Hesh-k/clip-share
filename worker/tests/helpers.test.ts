import { describe, expect, it } from "vitest";
import {
  contentDispositionFilename,
  escapeHtml,
  isValidId,
  parseRange,
  sanitizeFilename,
} from "../src/helpers.js";

describe("Worker pure helpers", () => {
  it("validates clip IDs", () => {
    expect(isValidId("abc1234567")).toBe(true);
    expect(isValidId("abc-234567")).toBe(false);
  });

  it("parses normal, open-ended, and suffix byte ranges", () => {
    expect(parseRange("bytes=2-5", 10)).toEqual({ kind: "range", value: { offset: 2, length: 4 } });
    expect(parseRange("bytes=7-", 10)).toEqual({ kind: "range", value: { offset: 7, length: 3 } });
    expect(parseRange("bytes=-4", 10)).toEqual({ kind: "range", value: { offset: 6, length: 4 } });
    expect(parseRange(null, 10)).toBeNull();
  });

  it("rejects unsatisfiable or malformed byte ranges", () => {
    expect(parseRange("bytes=10-", 10)).toEqual({ kind: "invalid" });
    expect(parseRange("bytes=5-2", 10)).toEqual({ kind: "invalid" });
    expect(parseRange("bytes=0-1,4-5", 10)).toEqual({ kind: "invalid" });
  });

  it("escapes HTML and sanitizes filenames", () => {
    expect(escapeHtml(`<video a="b">&'`)).toBe("&lt;video a=&quot;b&quot;&gt;&amp;&#39;");
    expect(sanitizeFilename("../foo\\bar\u0000.mp4")).toBe(".._foo_bar.mp4");
  });

  it("builds a safe dual-format download filename", () => {
    const disposition = contentDispositionFilename("clip name.mp4");
    expect(disposition).toContain('filename="clip name.mp4"');
    expect(disposition).toContain("filename*=UTF-8''clip%20name.mp4");
    expect(contentDispositionFilename("fílm.mp4")).toContain("filename*=UTF-8''f%C3%ADlm.mp4");
  });
});
