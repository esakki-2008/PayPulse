import { CommandCenter } from "@/components/command-center/command-center";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import { DataSourceError, getDashboardForSource, getIntelligenceForSource } from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";

interface CommandPageProps { readonly searchParams: Promise<{ source?: string | string[] }>; }

export default async function CommandPage({ searchParams }: CommandPageProps) {
  const source = await dataSourceFromSearchParams(searchParams);
  try {
    const [dashboard, intelligence] = await Promise.all([getDashboardForSource(source), getIntelligenceForSource(source)]);
    return <CommandCenter snapshot={dashboard.data} deterministicInsightCount={intelligence.data.insights.filter((insight) => insight.type !== "insufficient_data").length} customerStates={Object.fromEntries(intelligence.data.customerProfiles.map((profile) => [profile.customerId, profile.state]))} />;
  } catch (error) {
    if (error instanceof DataSourceError) return <DataSourceUnavailable message={error.message} category={error.category} path="/" />;
    throw error;
  }
}
