import { Client } from "pg";

// Connects once and disconnects, so a bad connection string fails with a
// message naming which database it was, instead of a bare driver error
// surfacing later from whichever query happened to run first.
export async function assertCanConnect(databaseUrl: string, label: string, hint: string) {
  let client: Client | undefined;

  try {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot connect to ${label}: ${reason}\n${hint}`);
  } finally {
    await client?.end().catch(() => {});
  }
}
