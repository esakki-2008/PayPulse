import { getDemoRepository } from "@/server/database/demo-store";
import { demoDataResponse } from "@/server/http/responses";

export async function GET(): Promise<Response> {
  return demoDataResponse(await getDemoRepository().listSignals());
}
