import { IntelligenceLab } from "@/components/intelligence/intelligence-lab";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import { DataSourceError, getIntelligenceForSource } from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";
import { requirePageActor } from "@/server/auth/page";

interface IntelligencePageProps {
  readonly searchParams: Promise<{ source?: string | string[] }>;
}

export default async function IntelligencePage({ searchParams }: IntelligencePageProps) {
  const [source, actor] = await Promise.all([dataSourceFromSearchParams(searchParams), requirePageActor()]);
  try {
    const result = await getIntelligenceForSource(source, actor.merchantId);
    return <IntelligenceLab intelligence={result.data} />;
  } catch (error) {
    if (error instanceof DataSourceError) {
      return <DataSourceUnavailable message={error.message} category={error.category} capabilities={error.capabilities} path="/intelligence" />;
    }
    throw error;
  }
}
