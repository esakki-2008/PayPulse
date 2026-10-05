import { headers } from "next/headers";

import { requireAuthenticatedActor, type AuthenticatedActor } from "./auth";

/** Authenticates a server-rendered page with the same cookie/header semantics as APIs. */
export async function requirePageActor(): Promise<AuthenticatedActor> {
  const incoming = await headers();
  return requireAuthenticatedActor(new Request("http://paypulse.internal/page", { headers: incoming }));
}
