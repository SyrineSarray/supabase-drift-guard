import { execSync } from "node:child_process";

// The Supabase CLI reports some failures on stderr and others as a JSON
// object on stdout ({"_tag":"Error","error":{"message":...}}), so check both
// and unwrap the JSON message when there is one.
function cliOutputOf(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const { stderr, stdout } = error as { stderr?: unknown; stdout?: unknown };
  const output = String(stderr ?? "").trim() || String(stdout ?? "").trim();

  try {
    const message = JSON.parse(output)?.error?.message;
    if (typeof message === "string" && message) {
      return message;
    }
  } catch {
    // Not JSON: plain CLI text, returned as is.
  }

  return output;
}

function cliFailure(command: string, error: unknown): Error {
  const output = cliOutputOf(error);
  const hint = /docker daemon/i.test(output) ? "\nStart Docker, then re-run the check." : "";
  return new Error(`${command} failed${output ? `:\n${output}` : ""}${hint}`);
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
    throw cliFailure("npx supabase start", error);
  }
}

export function stopSupabase(projectPath: string) {
  try {
    execSync("npx supabase stop", {
      cwd: projectPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw cliFailure("npx supabase stop", error);
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
