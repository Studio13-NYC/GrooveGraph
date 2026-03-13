import { execSync, spawn } from "node:child_process";

const TARGET_PORT = "3000";
const MAX_ATTEMPTS = 3;

function runPortGuard() {
  execSync("node scripts/ensure-port-3000.mjs", {
    stdio: "inherit",
    encoding: "utf8",
  });
}

function runNextDevOnce() {
  return new Promise((resolve) => {
    const child =
      process.platform === "win32"
        ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx next dev -p ${TARGET_PORT}`], {
            stdio: ["inherit", "pipe", "pipe"],
          })
        : spawn("npx", ["next", "dev", "-p", TARGET_PORT], {
            stdio: ["inherit", "pipe", "pipe"],
          });

    let combined = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      combined += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      combined += text;
      process.stderr.write(text);
    });

    child.on("close", (code, signal) => {
      resolve({
        code: code ?? 1,
        signal,
        output: combined,
      });
    });
  });
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    runPortGuard();
  } catch (error) {
    console.error(
      `[dev-launcher] Port guard failed on attempt ${attempt}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }

  const result = await runNextDevOnce();
  const addressInUse = /EADDRINUSE/i.test(result.output);
  if (!addressInUse || attempt === MAX_ATTEMPTS) {
    if (result.signal) {
      process.kill(process.pid, result.signal);
    }
    process.exit(result.code);
  }

  console.warn(
    `[dev-launcher] Detected EADDRINUSE after startup attempt ${attempt}. Retrying (${attempt + 1}/${MAX_ATTEMPTS})...`
  );
}
