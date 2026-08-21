import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

async function defaultExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function validateSessionPath(sessionFile, options = {}) {
  const root = resolve(options.root ?? `${process.env.HOME}/.pi/agent/sessions`);
  const exists = options.exists ?? defaultExists;
  const canonicalize = options.canonicalize ?? realpath;
  const requested = resolve(sessionFile);

  if (extname(requested) !== ".jsonl") {
    throw new Error(`Selected file is not a JSONL session: ${requested}`);
  }
  if (!(await exists(requested))) {
    throw new Error(`Selected session does not exist: ${requested}`);
  }

  const [canonicalRoot, canonicalFile] = await Promise.all([
    canonicalize(root),
    canonicalize(requested),
  ]);
  const fromRoot = relative(canonicalRoot, canonicalFile);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`Selected session is outside the Pi sessions directory: ${canonicalFile}`);
  }

  return canonicalFile;
}
