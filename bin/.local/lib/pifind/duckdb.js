import { spawn } from "node:child_process";
import { join } from "node:path";

export class DuckDbSessionStore {
  constructor({
    skillDir = process.env.PI_SESSIONS_DUCKDB_SKILL_DIR
      ?? join(process.env.HOME, ".pi/agent/skills/pi-sessions-duckdb"),
    spawnProcess = spawn,
  } = {}) {
    this.queryScript = join(skillDir, "scripts/query.sh");
    this.spawnProcess = spawnProcess;
  }

  query(sql) {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess("bash", [this.queryScript, "-json"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`DuckDB session query failed: ${stderr.trim() || `exit ${code}`}`));
          return;
        }
        try {
          resolve(stdout.trim() ? JSON.parse(stdout) : []);
        } catch (error) {
          reject(new Error(`DuckDB returned invalid JSON: ${error.message}`));
        }
      });
      child.stdin.end(`${sql}\n`);
    });
  }
}
