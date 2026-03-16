import net from "node:net";
import { execSync } from "node:child_process";

const PORT = 3000;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    // Check against the default bind target (all interfaces), matching Next.js behavior.
    server.listen({ port }, () => {
      server.close(() => resolve(true));
    });
  });
}

function getListeningPidsWindows(port) {
  try {
    const output = execSync(`netstat -ano -p tcp | findstr ":${port}"`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return Array.from(
      new Set(
        output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => /\sLISTENING\s/i.test(line))
          .map((line) => {
            const parts = line.split(/\s+/);
            return Number(parts[parts.length - 1]);
          })
          .filter((pid) => Number.isInteger(pid) && pid > 0)
      )
    );
  } catch {
    return [];
  }
}

function getListeningPidsPosix(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return Array.from(
      new Set(
        output
          .split(/\r?\n/)
          .map((line) => Number(line.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0)
      )
    );
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (process.platform === "win32") {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    return;
  }
  process.kill(pid, "SIGKILL");
}

async function ensurePort3000() {
  const initiallyAvailable = await isPortAvailable(PORT);
  if (initiallyAvailable) {
    console.log(`[port-guard] Port ${PORT} is available.`);
    return;
  }

  console.log(`[port-guard] Port ${PORT} is occupied. Cleaning stale listeners...`);
  const pids =
    process.platform === "win32" ? getListeningPidsWindows(PORT) : getListeningPidsPosix(PORT);

  if (pids.length === 0) {
    throw new Error(
      `[port-guard] Port ${PORT} is occupied but no listener PID could be resolved automatically.`
    );
  }

  for (const pid of pids) {
    if (pid === process.pid) continue;
    try {
      killPid(pid);
      console.log(`[port-guard] Stopped PID ${pid} on port ${PORT}.`);
    } catch (error) {
      throw new Error(
        `[port-guard] Failed to stop PID ${pid} on port ${PORT}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  const availableAfterCleanup = await isPortAvailable(PORT);
  if (!availableAfterCleanup) {
    throw new Error(`[port-guard] Port ${PORT} is still occupied after cleanup.`);
  }

  console.log(`[port-guard] Port ${PORT} is now available.`);
}

await ensurePort3000();
