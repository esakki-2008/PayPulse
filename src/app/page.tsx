import { CommandCenter } from "@/components/command-center/command-center";
import { DataSourceUnavailable } from "@/components/ui/data-source-unavailable";
import { listActionsForSource } from "@/server/actions/engine";
import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { DataSourceError, getDashboardForSource, getIntelligenceForSource } from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";

interface CommandPageProps { readonly searchParams: Promise<{ source?: string | string[] }>; }

export default async function CommandPage({ searchParams }: CommandPageProps) {
  const source = await dataSourceFromSearchParams(searchParams);
  try {
    const outcomes = getOutcomeLearningRepository();
    const [dashboard, intelligence, agentActions, verifiedOutcomes, learningEvents] = await Promise.all([
      getDashboardForSource(source),
      getIntelligenceForSource(source),
      listActionsForSource(source),
      outcomes.listOutcomes(source),
      outcomes.listLearningEvents(source),
    ]);
    return <CommandCenter snapshot={dashboard.data} deterministicInsightCount={intelligence.data.insights.filter((insight) => insight.type !== "insufficient_data").length} customerStates={Object.fromEntries(intelligence.data.customerProfiles.map((profile) => [profile.customerId, profile.state]))} agentActions={agentActions} verifiedOutcomes={verifiedOutcomes} learningEvents={learningEvents} />;
  } catch (error) {
    if (error instanceof DataSourceError) return <DataSourceUnavailable message={error.message} category={error.category} capabilities={error.capabilities} path="/" />;
    throw error;
  }
}
