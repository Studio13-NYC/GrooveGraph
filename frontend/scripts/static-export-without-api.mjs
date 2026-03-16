/**
 * Run Next.js static export without app/api so API routes are not included.
 * API is served by App Service; SWA only needs static UI.
 * Uses copy/remove instead of rename to avoid EPERM on Windows when folder is in use.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appApi = path.join(root, "app", "api");
const appApiBackup = path.join(root, "_api_backup_static_export");

function hideApi() {
  if (!fs.existsSync(appApi)) return;
  fs.cpSync(appApi, appApiBackup, { recursive: true });
  fs.rmSync(appApi, { recursive: true });
}

function restoreApi() {
  if (!fs.existsSync(appApiBackup)) return;
  if (fs.existsSync(appApi)) fs.rmSync(appApi, { recursive: true });
  fs.cpSync(appApiBackup, appApi, { recursive: true });
  fs.rmSync(appApiBackup, { recursive: true });
}

hideApi();

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
  restoreApi();
}
