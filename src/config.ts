import fs from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";

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
