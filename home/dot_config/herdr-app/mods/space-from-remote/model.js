const HOST = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;

// Accepts http(s)://, ssh:// and scp-style (git@host:path) remotes, or host/path.
// Returns null for anything that is not a plain, shell-safe host and path.
export function parseRemote(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  let protocol = "https", user, host, port, path;
  const url = text.match(/^([a-z][a-z0-9+.-]*):\/\/(?:([^/@:]*)(?::[^/@]*)?@)?([^/:@]+)(?::(\d+))?\/([^?#]*)/i);
  const scp = text.match(/^(?:([^/@\s]+)@)?([^/:\s]+):(?!\/)([^?#]+)$/);
  const bare = text.match(/^([^/\s]+\.[^/\s]+)\/([^?#]+)$/);
  if (url) {
    const scheme = url[1].toLowerCase();
    if (!["http", "https", "ssh"].includes(scheme)) return null;
    protocol = scheme === "ssh" ? "ssh" : "https";
    [, , user, host, port, path] = url;
  } else if (scp) {
    protocol = "ssh";
    [, user, host, path] = scp;
  } else if (bare) {
    [, host, path] = bare;
  } else return null;
  let segments = path.split("/").filter(Boolean);
  // GitLab puts web-only pages after "/-/".
  const dash = segments.indexOf("-");
  if (dash >= 0) segments = segments.slice(0, dash);
  if (!HOST.test(host) || segments.length < 2 || !segments.every(part => SEGMENT.test(part))) return null;
  if (user && !SEGMENT.test(user)) return null;
  return { host: host.toLowerCase(), segments, protocol, user: user || undefined, port };
}

// GitHub projects are owner/repo, so extra segments are web pages (tree/main).
// GitLab projects may sit in nested groups, so every segment belongs to the path.
export function repoPath(forge, segments) {
  const kept = forge === "github" ? segments.slice(0, 2) : [...segments];
  kept[kept.length - 1] = kept[kept.length - 1].replace(/\.git$/, "");
  return { path: kept.join("/"), name: kept[kept.length - 1] };
}

export function sameRepo(remote, forge, host, repo) {
  const other = parseRemote(remote);
  return Boolean(other) && other.host === host
    && repoPath(forge, other.segments).path.toLowerCase() === repo.path.toLowerCase();
}

// Names that give the forge away without a request. Ambiguous or unknown hosts
// fall through to asking the CLIs and the server.
export function forgeFromHost(host) {
  const gitlab = /gitlab/i.test(host);
  const github = /github/i.test(host);
  return gitlab === github ? null : gitlab ? "gitlab" : "github";
}

const CLI = { github: "gh", gitlab: "glab" };

async function succeeds(exec, command, args) {
  try { return (await exec(command, args)).code === 0; } catch { return false; }
}

async function curl(exec, args) {
  try {
    const result = await exec("curl", ["-s", "-m", "5", ...args]);
    return result.code === 0 ? result.stdout : null;
  } catch { return null; }
}

// GitLab answers its version endpoint (200, or 401 without a token);
// GitHub Enterprise tags API responses with x-github-* headers.
export async function probeForge(host, exec) {
  const gitlab = await curl(exec, ["-o", "/dev/null", "-w", "%{http_code}", `https://${host}/api/v4/version`]);
  if (gitlab === "200" || gitlab === "401") return "gitlab";
  const headers = await curl(exec, ["-I", `https://${host}/api/v3/`]);
  return headers && /^x-github-/im.test(headers) ? "github" : null;
}

// Decide which CLI owns a host: the name first, then which CLI is logged in
// there, then what the server says. `authed` tells whether that CLI is logged in.
export async function detectForge(host, { exec }) {
  const [gitlabLogin, githubLogin] = await Promise.all([
    succeeds(exec, "glab", ["auth", "status", "--hostname", host]),
    succeeds(exec, "gh", ["auth", "status", "--hostname", host]),
  ]);
  const authed = { gitlab: gitlabLogin, github: githubLogin };
  let forge = forgeFromHost(host);
  let how = forge && "hostname";
  if (!forge && gitlabLogin !== githubLogin) {
    forge = gitlabLogin ? "gitlab" : "github";
    how = "login";
  }
  if (!forge) {
    forge = await probeForge(host, exec);
    how = forge && "server";
  }
  return forge ? { forge, authed: authed[forge], how } : null;
}

// A logged-in CLI resolves group/project itself and honours the configured git
// protocol (host through the environment). Without a login, glab needs a URL.
// A machine without the CLI falls back to plain git on the pasted protocol.
export function cloneCommand({ forge, host, path, authed, installed = true, parsed }) {
  if (!installed) return { env: "", words: ["git", "clone", gitUrl(parsed, path)] };
  if (forge === "github") return { env: "GH_HOST", words: [CLI.github, "repo", "clone", path] };
  return authed
    ? { env: "GITLAB_HOST", words: [CLI.gitlab, "repo", "clone", path] }
    : { env: "", words: [CLI.gitlab, "repo", "clone", `https://${host}/${path}`] };
}

export function cliFor(forge) {
  return CLI[forge];
}

// Rebuilt from validated parts, never from the pasted text.
export function gitUrl({ host, protocol, user, port }, path) {
  const where = `${host}${port ? `:${port}` : ""}/${path}.git`;
  return protocol === "ssh" ? `ssh://${user ?? "git"}@${where}` : `https://${where}`;
}

// Runs in the new space's terminal, so a long clone shows progress and can
// prompt for credentials. A failure leaves a shell open with the error visible.
// Arguments: $1 host variable, $2 host, $3 destination, then the clone command.
export const CLONE_SCRIPT = `
if [ -n "$1" ]; then export "$1=$2"; fi
dest=$3
shift 3
if "$@" "$dest"; then cd "$dest" && exec "\${SHELL:-sh}"; fi
printf '\\nClone failed. Fix the problem and run it again:\\n  %s %s\\n\\n' "$*" "$dest"
exec "\${SHELL:-sh}"
`;

export function cloneArgv(clone, host, dest) {
  return ["sh", "-c", CLONE_SCRIPT, "sh", clone.env, host, dest, ...clone.words];
}
