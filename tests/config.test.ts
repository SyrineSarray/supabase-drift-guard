import { describe, expect, it } from "vitest";
import { parseRolesConfig } from "../src/config.js";

describe("parseRolesConfig", () => {
  it("defaults to anon and authenticated when raw is undefined", () => {
    expect(parseRolesConfig(undefined)).toEqual(["anon", "authenticated"]);
  });

  it("defaults to anon and authenticated when raw is null", () => {
    expect(parseRolesConfig(null)).toEqual(["anon", "authenticated"]);
  });

  it("defaults to anon and authenticated when roles key is absent", () => {
    expect(parseRolesConfig({})).toEqual(["anon", "authenticated"]);
  });

  it("returns a valid roles array as-is", () => {
    expect(parseRolesConfig({ roles: ["anon", "authenticated", "service_role"] })).toEqual([
      "anon",
      "authenticated",
      "service_role",
    ]);
  });

  it("throws when raw is not an object", () => {
    expect(() => parseRolesConfig("not an object")).toThrow();
  });

  it("throws when raw is a top-level array instead of {roles: [...]}", () => {
    expect(() => parseRolesConfig(["anon", "service_role"])).toThrow();
  });

  it("throws when roles is not an array", () => {
    expect(() => parseRolesConfig({ roles: "anon" })).toThrow();
  });

  it("throws when roles is an empty array", () => {
    expect(() => parseRolesConfig({ roles: [] })).toThrow();
  });

  it("throws when roles contains a non-string entry", () => {
    expect(() => parseRolesConfig({ roles: ["anon", 42] })).toThrow();
  });
});
