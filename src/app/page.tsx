import { CommandCenter } from "@/components/command-center/command-center";
import { SandboxCapabilityCommand } from "@/components/command-center/sandbox-capability-command";
import { listActionsForSource } from "@/server/actions/engine";
import { getAgentActionRepository } from "@/server/actions/repository";
import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { requirePageActor } from "@/server/auth/page";
import { DataSourceError, getDashboardForSource, getIntelligenceForSource } from "@/server/data/provider";
import { dataSourceFromSearchParams } from "@/server/data/page-source";

interface CommandPageProps { readonly searchParams: Promise<{ source?: string | string[] }>; }

export default async function CommandPage({ searchParams }: CommandPageProps) {
  const [source, actor] = await Promise.all([dataSourceFromSearchParams(searchParams), requirePageActor()]);
  try {
    const outcomes = getOutcomeLearningRepository(actor.merchantId);
    const [dashboard, intelligence, agentActions, verifiedOutcomes, learningEvents] = await Promise.all([
      getDashboardForSource(source, actor.merchantId),
      getIntelligenceForSource(source, actor.merchantId),
      listActionsForSource(source, getAgentActionRepository(actor.merchantId)),
      outcomes.listOutcomes(source),
      outcomes.listLearningEvents(source),
    ]);
    return <CommandCenter snapshot={dashboard.data} deterministicInsightCount={intelligence.data.insights.filter((insight) => insight.type !== "insufficient_data").length} customerStates={Object.fromEntries(intelligence.data.customerProfiles.map((profile) => [profile.customerId, profile.state]))} agentActions={agentActions} verifiedOutcomes={verifiedOutcomes} learningEvents={learningEvents} />;
  } catch (error) {
    if (error instanceof DataSourceError && source === "paypal_sandbox") return <SandboxCapabilityCommand message={error.message} />;
    throw error;
  }
}
