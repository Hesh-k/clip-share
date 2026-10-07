import { describe, expect, it } from "vitest";
import { contentTypeFor, generateId, isValidId, renderQrCode, sanitizeOriginalName } from "../src/helpers.js";

describe("CLI helpers", () => {
  it("generates valid 10-character base62 IDs", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9A-Za-z]{10}$/);
    expect(isValidId(id)).toBe(true);
  });

  it("validates IDs", () => {
    expect(isValidId("abC1234567")).toBe(true);
    expect(isValidId("../1234567")).toBe(false);
    expect(isValidId("short")).toBe(false);
  });

  it("maps supported extensions case-insensitively", () => {
    expect(contentTypeFor("movie.MP4")).toBe("video/mp4");
    expect(contentTypeFor("movie.mkv")).toBe("video/x-matroska");
    expect(contentTypeFor("movie.avi")).toBeUndefined();
  });

  it("sanitizes original names", () => {
    expect(sanitizeOriginalName("../a\\b\u0000.mp4")).toBe("b.mp4");
    expect(sanitizeOriginalName("   ")).toBe("video");
  });

  it("renders a link as a terminal QR code", () => {
    const qrCode = renderQrCode("https://clips.example.com/c/abC1234567");
    expect(qrCode).toContain("\u2588");
    expect(qrCode.split("\n").length).toBeGreaterThan(10);
  });
});
