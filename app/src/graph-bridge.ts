import { spawn } from "node:child_process";
import path from "node:path";

import { getEnv, getEnvValue } from "./env.ts";
import { getRepoRoot, pathExists } from "./runtime-paths.ts";

async function resolvePythonCommand(): Promise<string> {
  const configured = getEnvValue("GRAPH_BRIDGE_PYTHON", "");
  if (configured) {
    return configured;
  }
  const repoRoot = getRepoRoot();
  const venvPython = path.join(repoRoot, "cli", ".venv", "Scripts", "python.exe");
  if (await pathExists(venvPython)) {
    return venvPython;
  }
  return "python";
}

async function runBridge(command: string, payload: unknown): Promise<any> {
  const python = await resolvePythonCommand();
  const repoRoot = getRepoRoot();
  const scriptPath = path.join(repoRoot, "services", "graph-bridge", "bridge.py");
  const env = getEnv();

  return new Promise((resolve, reject) => {
    const child = spawn(python, [scriptPath, command], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `graph bridge exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function readGraphContext(question: string): Promise<any> {
  return runBridge("context", { question });
}

export async function persistGraphPlan(plan: unknown): Promise<any> {
  return runBridge("persist", plan);
}

export async function readGraphBridgeHealth(): Promise<any> {
  return runBridge("health", {});
}
