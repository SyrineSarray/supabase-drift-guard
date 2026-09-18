import fs from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";

const DEFAULT_ROLES = ["anon", "authenticated"];

export function parseRolesConfig(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return DEFAULT_ROLES;
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("drift-guard.config.json must be a JSON object");
  }

  const roles = (raw as { roles?: unknown }).roles;

  if (roles === undefined) {
    return DEFAULT_ROLES;
  }

  if (!Array.isArray(roles) || roles.length === 0 || roles.some((role) => typeof role !== "string")) {
    throw new Error('drift-guard.config.json "roles" must be a non-empty array of strings');
  }

  return roles;
}

export function loadRolesConfig(projectPath: string): string[] {
  const configPath = path.join(projectPath, "drift-guard.config.json");

  if (!fs.existsSync(configPath)) {
    return DEFAULT_ROLES;
  }

  const content = fs.readFileSync(configPath, "utf8");

  return parseRolesConfig(JSON.parse(content));
}

export function getExposedSchemas(projectPath: string): string[] {
  const configPath = path.join(projectPath, "supabase", "config.toml");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Supabase config not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, "utf8");
  const config = parse(content) as any;

  const schemas = config?.api?.schemas;

  if (!Array.isArray(schemas) || schemas.length === 0) {
    return ["public"];
  }

  return schemas.map(String);
}
