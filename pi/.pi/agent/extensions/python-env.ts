/**
 * Agent Python environment extension.
 *
 * Bootstraps one uv-managed virtualenv for agent Python work and makes it
 * available to the bash tool by prepending the venv's bin directory to PATH.
 * This keeps agents from relying on system Python packages while preserving
 * their natural habit of running `python3 ...`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool, createLocalBashOperations } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const CONFIG_PATH = join(__dirname, "python-env.json");
const DEFAULT_PYTHON_DEPS = [
  "openpyxl",
  "pandas",
  "python-calamine",
  "xlsxwriter",
];

let pythonDeps = DEFAULT_PYTHON_DEPS;

const ENV_DIR = process.env.PI_AGENT_PYTHON_ENV ?? join(homedir(), ".cache", "pi", "python-env");
const ENV_BIN = join(ENV_DIR, "bin");
const PYTHON = join(ENV_BIN, "python");
const PYTHON3 = join(ENV_BIN, "python3");
const STAMP = join(ENV_DIR, ".pi-deps-stamp");

type RunResult = { stdout: string; stderr: string; code: number | null };

async function loadDependencies(): Promise<string[]> {
  const raw = await readFile(CONFIG_PATH, "utf8").catch(async (error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_PYTHON_DEPS, null, 2) + "\n", "utf8");
    return JSON.stringify(DEFAULT_PYTHON_DEPS);
  });

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string" && item.trim().length > 0)) {
    throw new Error(`Python env config must be a JSON array of package names: ${CONFIG_PATH}`);
  }

  return [...new Set(parsed.map((dep) => dep.trim()))].sort();
}

function dependencyStamp(deps: string[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ deps }))
    .digest("hex");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run(command: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs / 1000}s`));
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}

async function runChecked(command: string, args: string[], timeoutMs: number): Promise<RunResult> {
  const result = await run(command, args, timeoutMs);
  if (result.code !== 0) {
    throw new Error(
      [`${command} ${args.join(" ")} exited with code ${result.code}`, result.stderr, result.stdout]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

async function ensurePython3Alias(): Promise<void> {
  if (await exists(PYTHON3)) return;
  try {
    await symlink("python", PYTHON3);
  } catch {
    // uv-created venvs normally include python3. If creating the compatibility
    // symlink fails, PATH still exposes `python`; report no hard failure here.
  }
}

async function bootstrapPythonEnv(force = false): Promise<void> {
  pythonDeps = await loadDependencies();
  const stamp = dependencyStamp(pythonDeps);
  const currentStamp = await readFile(STAMP, "utf8").catch(() => undefined);

  if (!force && currentStamp === stamp && (await exists(PYTHON)) && (await exists(PYTHON3))) {
    return;
  }

  await runChecked("uv", ["--version"], 30_000);
  await mkdir(ENV_DIR, { recursive: true });
  if (!(await exists(PYTHON))) {
    await runChecked("uv", ["venv", "--clear", ENV_DIR], 120_000);
  }
  await ensurePython3Alias();
  await runChecked("uv", ["pip", "install", "--python", PYTHON, ...pythonDeps], 300_000);
  await ensurePython3Alias();
  await writeFile(STAMP, stamp, "utf8");
}

function withPythonEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    VIRTUAL_ENV: ENV_DIR,
    PI_AGENT_PYTHON_ENV: ENV_DIR,
    PATH: `${ENV_BIN}:${env.PATH ?? process.env.PATH ?? ""}`,
  };
}

function prettyPath(path: string): string {
  const home = homedir();
  if (path === home) return "~";
  if (path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}

function pythonEnvStatus(theme: { fg: (name: string, text: string) => string }): string {
  return [
    theme.fg("success", "🐍 py"),
    theme.fg("muted", prettyPath(ENV_DIR)),
    theme.fg("dim", `· ${pythonDeps.length} deps`),
  ].join(" ");
}

function pythonEnvErrorStatus(theme: { fg: (name: string, text: string) => string }): string {
  return [theme.fg("warning", "🐍 py"), theme.fg("error", "error")].join(" ");
}

export default async function (pi: ExtensionAPI) {
  let bootstrapError: Error | undefined;

  try {
    await bootstrapPythonEnv();
  } catch (error) {
    bootstrapError = error instanceof Error ? error : new Error(String(error));
  }

  const bashTool = createBashTool(process.cwd(), {
    spawnHook: ({ command, cwd, env }) => ({
      command,
      cwd,
      env: bootstrapError ? env : withPythonEnv(env),
    }),
  });

  pi.registerTool({
    ...bashTool,
    promptGuidelines: [
      ...((bashTool as { promptGuidelines?: string[] }).promptGuidelines ?? []),
      bootstrapError
        ? `The agent Python virtualenv failed to bootstrap: ${bootstrapError.message}. Do not assume Python packages are installed. Dependency config: ${CONFIG_PATH}.`
        : `For Python work, use python or python3 from the agent virtualenv at ${ENV_DIR}; it has these dependencies installed from ${CONFIG_PATH}: ${pythonDeps.join(", ")}. If a package is missing, add it to that JSON array and run /python-env-refresh.`,
    ],
    execute: async (id, params, signal, onUpdate) => bashTool.execute(id, params, signal, onUpdate),
  });

  const localBash = createLocalBashOperations();
  pi.on("user_bash", () => ({
    operations: {
      exec(command, cwd, options) {
        return localBash.exec(command, cwd, {
          ...options,
          env: bootstrapError ? options.env : withPythonEnv(options.env ?? process.env),
        });
      },
    },
  }));

  pi.on("session_start", async (_event, ctx) => {
    if (bootstrapError) {
      ctx.ui.setStatus("python-env", pythonEnvErrorStatus(ctx.ui.theme));
      ctx.ui.notify(`Python env bootstrap failed: ${bootstrapError.message}`, "warning");
      return;
    }
    ctx.ui.setStatus("python-env", pythonEnvStatus(ctx.ui.theme));
  });

  pi.on("before_agent_start", async (event) => {
    const note = bootstrapError
      ? `\n\nAgent Python virtualenv bootstrap failed: ${bootstrapError.message}\nDo not assume openpyxl, pandas, or other Python packages are installed in system Python. Dependency config: ${CONFIG_PATH}.`
      : `\n\nAgent Python is bootstrapped with uv at ${ENV_DIR}. The bash environment has ${ENV_BIN} first on PATH, so both \`python\` and \`python3\` use this virtualenv. Installed dependencies are loaded from ${CONFIG_PATH}: ${pythonDeps.join(", ")}. If a Python package is missing, add its package name to that JSON array and run \`/python-env-refresh\` before retrying.`;

    return { systemPrompt: event.systemPrompt + note };
  });

  pi.registerCommand("python-env-refresh", {
    description: "Recreate/update the agent Python virtualenv",
    handler: async (_args, ctx) => {
      try {
        await bootstrapPythonEnv(true);
        bootstrapError = undefined;
        ctx.ui.setStatus("python-env", pythonEnvStatus(ctx.ui.theme));
        ctx.ui.notify(`Python env ready: ${ENV_DIR} (${pythonDeps.length} deps from ${CONFIG_PATH})`, "info");
      } catch (error) {
        bootstrapError = error instanceof Error ? error : new Error(String(error));
        ctx.ui.setStatus("python-env", pythonEnvErrorStatus(ctx.ui.theme));
        ctx.ui.notify(`Python env refresh failed: ${bootstrapError.message}`, "error");
      }
    },
  });
}
