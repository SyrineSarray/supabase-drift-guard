import { execSync } from "node:child_process";

function stderrOf(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    return String((error as { stderr: unknown }).stderr).trim();
  }
  return "";
}

// `supabase status` exits non-zero when the local stack isn't running.
export function isSupabaseRunning(projectPath: string): boolean {
  try {
    execSync("npx supabase status", {
      cwd: projectPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

// Every drift check is a Postgres catalog query, so only the database
// container is needed. Skipping the other services avoids pulling and booting
// about a dozen images, which dominates CI time on a fresh runner. The CLI
// ignores names it doesn't recognize, so a renamed service in a future CLI
// version just starts as before rather than breaking the check.
const UNUSED_SERVICES = [
  "gotrue",
  "realtime",
  "storage-api",
  "imgproxy",
  "kong",
  "mailpit",
  "postgrest",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
].join(",");

export function startSupabase(projectPath: string) {
  try {
    execSync(`npx supabase start --exclude ${UNUSED_SERVICES}`, {
      cwd: projectPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = stderrOf(error);
    throw new Error(`npx supabase start failed${stderr ? `:\n${stderr}` : ""}`);
  }
}

export function stopSupabase(projectPath: string) {
  try {
    execSync("npx supabase stop", {
      cwd: projectPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = stderrOf(error);
    throw new Error(`npx supabase stop failed${stderr ? `:\n${stderr}` : ""}`);
  }
}

export function getLocalDatabaseUrl(projectPath: string): string {
  const output = execSync("npx supabase status -o json", {
    cwd: projectPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  const status = JSON.parse(output);

  return status.DB_URL;
}
