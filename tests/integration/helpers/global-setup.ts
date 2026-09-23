import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

import "./provided-context.js";

export default async function setup({ provide }: { provide: (key: "pgConnectionUri", value: string) => void }) {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:15-alpine").start();

  provide("pgConnectionUri", container.getConnectionUri());

  return async () => {
    await container.stop();
  };
}
