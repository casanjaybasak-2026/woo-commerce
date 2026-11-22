// The single place that knows how the Cloudflare adapter exposes bindings.
// If a future adapter changes the API, only this file changes.
import { env } from "cloudflare:workers";

export function getEnv(): Env {
  return env as unknown as Env;
}

export function isProduction(e: Pick<Env, "ENVIRONMENT"> = getEnv()): boolean {
  return e.ENVIRONMENT === "production";
}
