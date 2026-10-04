import { parseDataSource } from "./provider";
import type { DataSource } from "@/types/domain";

export async function dataSourceFromSearchParams(
  searchParams: Promise<{ source?: string | string[] }>,
): Promise<DataSource> {
  const resolved = await searchParams;
  const value = Array.isArray(resolved.source) ? resolved.source[0] : resolved.source;
  return parseDataSource(value);
}
