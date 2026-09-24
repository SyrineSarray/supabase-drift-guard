import { describe, expect, it } from "vitest";

import "./helpers/provided-context.js";
import { inject } from "vitest";
import { assertCanConnect } from "../../src/connection.js";

describe("assertCanConnect", () => {
  it("resolves for a valid connection string", async () => {
    await expect(assertCanConnect(inject("pgConnectionUri"), "test database", "hint")).resolves.toBeUndefined();
  });

  it("names the database and includes the hint when the password is wrong", async () => {
    const url = new URL(inject("pgConnectionUri"));
    url.password = "wrong-password";

    await expect(assertCanConnect(url.toString(), "live database (REMOTE_DATABASE_URL)", "check the secret")).rejects.toThrow(
      /^Cannot connect to live database \(REMOTE_DATABASE_URL\): password authentication failed[\s\S]*check the secret$/,
    );
  });

  it("names the database when the connection string is malformed", async () => {
    await expect(assertCanConnect("not a url", "live database (REMOTE_DATABASE_URL)", "hint")).rejects.toThrow(
      /^Cannot connect to live database \(REMOTE_DATABASE_URL\): /,
    );
  });
});
