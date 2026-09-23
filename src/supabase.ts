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

export function startSupabase(projectPath: string) {
  try {
    execSync("npx supabase start", {
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
