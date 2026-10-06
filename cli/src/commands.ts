import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { AppConfig } from "./config.js";
import { contentTypeFor, generateId, isValidId, sanitizeOriginalName } from "./helpers.js";
import { explainR2Error } from "./client.js";
import { readManifest, writeManifest } from "./manifest.js";

const PART_SIZE = 10 * 1024 * 1024;

function objectKey(id: string): string {
  return `clips/${id}/video`;
}

function linkFor(config: AppConfig, id: string): string {
  return `${config.publicBaseUrl}/c/${id}`;
}

class ProgressDisplay {
  private readonly percentages = new Map<string, number>();
  private renderedLines = 0;

  reporter(label: string, total: number): (loaded: number) => void {
    let previous = -1;
    return (loaded) => {
      const percent = total === 0 ? 100 : Math.min(100, Math.floor((loaded / total) * 100));
      if (percent === previous) return;
      previous = percent;
      this.percentages.set(label, percent);
      this.render();
    };
  }

  finish(): void {
    if (process.stdout.isTTY && this.renderedLines > 0) process.stdout.write("\n");
  }

  private render(): void {
    const lines = [...this.percentages].map(([label, percent]) => `${label}: ${percent}%`);
    if (!process.stdout.isTTY) {
      console.log(lines[lines.length - 1]);
      return;
    }

    if (this.renderedLines > 0) process.stdout.write(`\u001b[${this.renderedLines}A`);
    for (const line of lines) process.stdout.write(`\r\u001b[2K${line}\n`);
    this.renderedLines = lines.length;
  }
}

async function hashFile(filename: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retryFile<T>(filename: string, action: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= 3) throw error;
      console.warn(`${filename}: attempt ${attempt + 1} failed; retrying (${explainR2Error(error)})`);
      await sleep(500 * 2 ** attempt);
    }
  }
}

interface Candidate {
  filename: string;
  fullPath: string;
  size: number;
}

async function scanFolder(folder: string): Promise<Candidate[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const candidates: Candidate[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!contentTypeFor(entry.name)) {
      console.warn(`Skipping unsupported file: ${entry.name}`);
      continue;
    }
    const fullPath = path.join(folder, entry.name);
    candidates.push({ filename: entry.name, fullPath, size: (await stat(fullPath)).size });
  }
  return candidates;
}

async function objectExists(client: S3Client, bucket: string, id: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey(id) }));
    return true;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey" || name === "404") return false;
    throw error;
  }
}

async function uploadOne(
  client: S3Client,
  config: AppConfig,
  candidate: Candidate,
  manifest: Record<string, string>,
  progressDisplay: ProgressDisplay,
): Promise<{ filename: string; size: number; link: string; status: string }> {
  const sha256 = await hashFile(candidate.fullPath);
  const priorId = manifest[sha256];
  if (priorId && isValidId(priorId) && await objectExists(client, config.bucket, priorId)) {
    return { filename: candidate.filename, size: candidate.size, link: linkFor(config, priorId), status: "already uploaded" };
  }

  const id = generateId();
  const safeName = sanitizeOriginalName(candidate.filename);
  await retryFile(candidate.filename, async () => {
    const reporter = progressDisplay.reporter(candidate.filename.slice(0, 55), candidate.size);
    const upload = new Upload({
      client,
      params: {
        Bucket: config.bucket,
        Key: objectKey(id),
        Body: createReadStream(candidate.fullPath),
        ContentType: contentTypeFor(candidate.filename),
        Metadata: {
          originalname: safeName,
          uploadedat: new Date().toISOString(),
          sha256,
        },
      },
      partSize: PART_SIZE,
      queueSize: 4,
    });
    upload.on("httpUploadProgress", (progress) => reporter(progress.loaded ?? 0));
    await upload.done();
    const remote = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey(id) }));
    if (remote.ContentLength !== candidate.size) {
      throw new Error(`Size verification failed for ${candidate.filename}: local ${candidate.size}, remote ${remote.ContentLength ?? "unknown"}.`);
    }
  });
  manifest[sha256] = id;
  return { filename: candidate.filename, size: candidate.size, link: linkFor(config, id), status: "uploaded" };
}

function printTable(rows: Array<Record<string, string | number>>): void {
  if (rows.length === 0) {
    console.log("No clips found.");
    return;
  }
  const columns = Object.keys(rows[0]);
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column]).length)),
  );
  const format = (values: string[]) => values.map((value, index) => value.padEnd(widths[index])).join("  ");
  console.log(format(columns));
  console.log(format(widths.map((width) => "-".repeat(width))));
  for (const row of rows) console.log(format(columns.map((column) => String(row[column]))));
}

export async function check(client: S3Client, config: AppConfig): Promise<void> {
  const key = `clips/check-${randomBytes(12).toString("hex")}`;
  let putSucceeded = false;
  let failure: unknown;
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: "r2-clip-test" }));
    putSucceeded = true;
    await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) {
    failure = error;
  }
  if (putSucceeded) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    } catch (error) {
      failure = failure
        ? new Error(`${explainR2Error(failure)} Test object cleanup also failed: ${explainR2Error(error)}`)
        : error;
    }
  }
  if (failure) {
    throw new Error(explainR2Error(failure), { cause: failure });
  }
  console.log(`OK: R2 bucket "${config.bucket}" is reachable and test read/write permissions work.`);
}

export async function uploadFolder(
  client: S3Client,
  config: AppConfig,
  folder: string,
  dryRun: boolean,
  concurrency: number,
): Promise<void> {
  const candidates = await scanFolder(path.resolve(folder));
  if (candidates.length === 0) {
    console.log("No supported video files found.");
    return;
  }
  if (dryRun) {
    printTable(candidates.map(({ filename, size }) => ({ File: filename, Size: size, Status: "dry run" })));
    return;
  }

  const manifest = await readManifest();
  const results: Array<{ filename: string; size: number; link: string; status: string }> = [];
  const failures: string[] = [];
  const progressDisplay = new ProgressDisplay();
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (next < candidates.length) {
      const candidate = candidates[next++];
      try {
        const result = await uploadOne(
          client,
          config,
          candidate,
          manifest,
          progressDisplay,
        );
        results.push(result);
      } catch (error) {
        failures.push(`${candidate.filename}: FAILED - ${explainR2Error(error)}`);
      }
    }
  });
  await Promise.all(workers);
  progressDisplay.finish();
  for (const failure of failures) console.error(failure);
  if (results.some((result) => result.status === "uploaded")) await writeManifest(manifest);
  if (results.length > 0) {
    printTable(results.map(({ filename, size, link, status }) => ({ File: filename, Size: size, Link: link, Status: status })));
  } else if (failures.length > 0) {
    console.log("No clips were uploaded successfully.");
  }
  if (failures.length > 0) process.exitCode = 1;
}

export async function listClips(client: S3Client, config: AppConfig): Promise<void> {
  const rows: Array<Record<string, string | number>> = [];
  let continuationToken: string | undefined;
  do {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: "clips/",
      ContinuationToken: continuationToken,
    }));
    for (const object of result.Contents ?? []) {
      const match = object.Key?.match(/^clips\/([0-9A-Za-z]{10})\/video$/);
      if (!match) continue;
      const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: object.Key }));
      rows.push({
        ID: match[1],
        Name: head.Metadata?.originalname ?? "(unknown)",
        Size: object.Size ?? 0,
        Uploaded: head.Metadata?.uploadedat ?? "(unknown)",
        Link: linkFor(config, match[1]),
      });
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  printTable(rows);
}

export async function deleteClip(client: S3Client, config: AppConfig, id: string, yes: boolean): Promise<void> {
  if (!isValidId(id)) throw new Error("Invalid clip ID. IDs must be 10 base62 characters.");
  if (!await objectExists(client, config.bucket, id)) throw new Error(`Clip "${id}" was not found.`);
  if (!yes) {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await readline.question(`Delete ${linkFor(config, id)}? [y/N] `);
      if (!/^y(es)?$/i.test(answer.trim())) {
        console.log("Deletion cancelled.");
        return;
      }
    } finally {
      readline.close();
    }
  }
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey(id) }));
  console.log(`Deleted clip ${id}.`);
}
