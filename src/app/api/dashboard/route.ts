import { getDashboardSnapshot } from "@/server/dashboard/service";
import { demoDataResponse } from "@/server/http/responses";

export async function GET(): Promise<Response> {
  return demoDataResponse(await getDashboardSnapshot());
}
