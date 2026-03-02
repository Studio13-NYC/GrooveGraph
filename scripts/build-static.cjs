/**
 * Run Next.js static export after moving app/api aside (API routes are incompatible with output: export).
 * Restores app/api after build. Uses copy+rm to avoid Windows EPERM on rename.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) rmDir(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

const appDir = path.join(process.cwd(), "app");
const apiDir = path.join(appDir, "api");
const apiBackup = path.join(process.cwd(), ".api-backup-static-build");

if (!fs.existsSync(apiDir)) {
  console.log("No app/api, running next build");
  execSync("next build", { stdio: "inherit", cwd: process.cwd() });
  process.exit(0);
}

try {
  copyDir(apiDir, apiBackup);
  rmDir(apiDir);
  console.log("Moved app/api aside for static export");
  execSync("next build", { stdio: "inherit", cwd: process.cwd() });
} finally {
  if (fs.existsSync(apiBackup)) {
    copyDir(apiBackup, apiDir);
    rmDir(apiBackup);
    console.log("Restored app/api");
  }
}
