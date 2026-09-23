import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

declare module "vitest" {
  export interface ProvidedContext {
    pgConnectionUri: string;
  }
}

type Provide = (key: "pgConnectionUri", value: string) => void;

export default async function setup({ provide }: { provide: Provide }) {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:15-alpine").start();

  provide("pgConnectionUri", container.getConnectionUri());

  return async () => {
    await container.stop();
  };
}
