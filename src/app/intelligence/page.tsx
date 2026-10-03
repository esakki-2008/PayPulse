import { IntelligenceLab } from "@/components/intelligence/intelligence-lab";
import { getDemoRepository } from "@/server/database/demo-store";

export default async function IntelligencePage() {
  const signals = await getDemoRepository().listSignals();
  return <IntelligenceLab signals={signals} />;
}
