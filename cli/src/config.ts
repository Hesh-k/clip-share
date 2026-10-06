import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env") });

const configSchema = z.object({
  R2_ACCOUNT_ID: z.string().trim().min(1),
  R2_ACCESS_KEY_ID: z.string().trim().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().trim().min(1),
  PUBLIC_BASE_URL: z.string().trim().url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "must use HTTP or HTTPS"),
});

export interface AppConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

export function getConfig(): AppConfig {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path[0]).join(", ");
    throw new Error(`Invalid configuration. Set these required environment variables: ${missing}. See .env.example.`);
  }

  const values = result.data;
  return {
    accountId: values.R2_ACCOUNT_ID,
    accessKeyId: values.R2_ACCESS_KEY_ID,
    secretAccessKey: values.R2_SECRET_ACCESS_KEY,
    bucket: values.R2_BUCKET,
    publicBaseUrl: values.PUBLIC_BASE_URL.replace(/\/+$/, ""),
  };
}
