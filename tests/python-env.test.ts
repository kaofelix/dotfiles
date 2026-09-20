import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnvDir = process.env.PI_AGENT_PYTHON_ENV;
const originalPath = process.env.PATH;
const directory = await mkdtemp(join(tmpdir(), "pi-python-env-test-"));
const envDir = join(directory, "env");
const fakeBin = join(directory, "bin");
const python = join(envDir, "bin", "python");
const python3 = join(envDir, "bin", "python3");
const stampPath = join(envDir, ".pi-deps-stamp");
const configPath = join(import.meta.dir, "..", "home", "dot_pi", "agent", "extensions", "python-env.json");

mock.module("@earendil-works/pi-coding-agent", () => ({
  createBashTool: () => ({}),
  createLocalBashOperations: () => ({}),
}));

beforeAll(async () => {
  await mkdir(join(envDir, "bin"), { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await writeFile(python, "#!/bin/sh\nexit 86\n");
  await chmod(python, 0o755);
  await symlink("python", python3);

  const deps = (JSON.parse(await readFile(configPath, "utf8")) as string[]).sort();
  const stamp = createHash("sha256").update(JSON.stringify({ deps })).digest("hex");
  await writeFile(stampPath, stamp);

  const fakeUv = join(fakeBin, "uv");
  await writeFile(
    fakeUv,
    `#!/bin/sh
set -eu
if [ "$1" = "--version" ]; then
  echo "uv test"
  exit 0
fi
if [ "$1" = "venv" ]; then
  target="$3"
  mkdir -p "$target/bin"
  printf '#!/bin/sh\\nexit 0\\n' > "$target/bin/python"
  chmod +x "$target/bin/python"
  exit 0
fi
if [ "$1" = "pip" ]; then
  exit 0
fi
exit 2
`,
  );
  await chmod(fakeUv, 0o755);

  process.env.PI_AGENT_PYTHON_ENV = envDir;
  process.env.PATH = `${fakeBin}:${originalPath ?? ""}`;
});

afterAll(async () => {
  if (originalEnvDir === undefined) delete process.env.PI_AGENT_PYTHON_ENV;
  else process.env.PI_AGENT_PYTHON_ENV = originalEnvDir;
  process.env.PATH = originalPath;
  await rm(directory, { recursive: true, force: true });
});

describe("python environment bootstrap", () => {
  test("recreates a stamped environment when its Python cannot run", async () => {
    const { bootstrapPythonEnv } = await import("../home/dot_pi/agent/extensions/python-env.ts");

    await bootstrapPythonEnv();

    expect(Bun.spawnSync([python, "--version"]).exitCode).toBe(0);
  });
});
