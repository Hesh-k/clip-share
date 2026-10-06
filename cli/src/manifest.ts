import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MANIFEST_PATH = path.resolve(process.cwd(), ".r2-manifest.json");
export type Manifest = Record<string, string>;

export async function readManifest(): Promise<Manifest> {
  try {
    const contents = await readFile(MANIFEST_PATH, "utf8");
    const parsed: unknown = JSON.parse(contents);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Manifest must contain an object.");
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Could not read ${MANIFEST_PATH}: ${String(error)}`);
  }
}

export async function writeManifest(manifest: Manifest): Promise<void> {
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
