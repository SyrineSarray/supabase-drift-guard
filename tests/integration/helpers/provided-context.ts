import "vitest";

declare module "vitest" {
  interface ProvidedContext {
    pgConnectionUri: string;
  }
}
