/**
 * Run Next.js static export without app/api so API routes are not included.
 * API is served by App Service; SWA only needs static UI.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appApi = path.join(root, "app", "api");
const appApiBackup = path.join(root, "app", "_api_backup_static_export");

function move(from, to) {
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
  }
}

// Move app/api out so Next static export doesn't see it
move(appApi, appApiBackup);

try {
  const result = spawnSync(
    "npx",
    [
      "cross-env",
      "NEXT_STATIC_EXPORT=1",
      "NEXT_PUBLIC_API_BASE_URL=https://as-groovegraph-api.azurewebsites.net",
      "next",
      "build",
    ],
    { cwd: root, stdio: "inherit", shell: true }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  // Restore app/api
  move(appApiBackup, appApi);
}
