import { Command } from "commander";
import { getConfig } from "./config.js";
import { createS3Client } from "./client.js";
import { check, deleteClip, listClips, uploadFolder } from "./commands.js";

const program = new Command();
program.name("r2-clip-test").description("Upload and share private R2 video clips.").version("1.0.0");

program.command("check")
  .description("Verify bucket access and read/write credentials")
  .action(async () => run(async (client, config) => check(client, config)));

program.command("upload")
  .description("Upload supported videos from a folder")
  .argument("<folder>")
  .option("--dry-run", "List eligible files without uploading")
  .option("--concurrency <count>", "Number of simultaneous uploads", "2")
  .action(async (folder: string, options: { dryRun?: boolean; concurrency: string }) => {
    const concurrency = Number(options.concurrency);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
      throw new Error("--concurrency must be an integer between 1 and 16.");
    }
    await run((client, config) => uploadFolder(client, config, folder, Boolean(options.dryRun), concurrency));
  });

program.command("list")
  .description("List clips stored in the bucket")
  .action(async () => run((client, config) => listClips(client, config)));

program.command("delete")
  .description("Delete a clip")
  .argument("<id>")
  .option("--yes", "Skip confirmation")
  .action(async (id: string, options: { yes?: boolean }) =>
    run((client, config) => deleteClip(client, config, id, Boolean(options.yes))),
  );

async function run(action: (client: ReturnType<typeof createS3Client>, config: ReturnType<typeof getConfig>) => Promise<void>): Promise<void> {
  let client: ReturnType<typeof createS3Client> | undefined;
  try {
    const config = getConfig();
    client = createS3Client(config);
    await action(client, config);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    client?.destroy();
  }
}

await program.parseAsync(process.argv);
