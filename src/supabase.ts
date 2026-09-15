import { execSync } from "node:child_process";

export function startSupabase(projectPath: string) {
  execSync("npx supabase start", {
    cwd: projectPath,
    stdio: "ignore",
  });
}

export function stopSupabase(projectPath: string) {
  execSync("npx supabase stop", {
    cwd: projectPath,
    stdio: "ignore",
  });
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
