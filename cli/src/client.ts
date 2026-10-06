import { S3Client } from "@aws-sdk/client-s3";
import type { AppConfig } from "./config.js";

export function createS3Client(config: AppConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    maxAttempts: 5,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function explainR2Error(error: unknown): string {
  const candidate = error as { name?: string; Code?: string; message?: string };
  const name = candidate?.name ?? candidate?.Code ?? "";
  const message = candidate?.message ?? String(error);
  const normalized = `${name} ${message}`.toLowerCase();

  if (normalized.includes("nosuchbucket") || normalized.includes("no such bucket")) {
    return "Bucket not found. Check R2_BUCKET and confirm the bucket exists in this Cloudflare account.";
  }
  if (normalized.includes("signaturedoesnotmatch")) {
    return "SignatureDoesNotMatch. Check R2_ACCOUNT_ID, endpoint, access key ID, and secret access key.";
  }
  if (normalized.includes("accessdenied") || normalized.includes("forbidden")) {
    return "AccessDenied. The API token needs Object Read & Write permissions and must be scoped to R2_BUCKET.";
  }
  if (/endpoint|enotfound|econnrefused/.test(normalized)) {
    return "Could not reach the R2 endpoint. Verify R2_ACCOUNT_ID and network connectivity.";
  }
  return message;
}
