import { CommandCenter } from "@/components/command-center/command-center";
import { getDashboardSnapshot } from "@/server/dashboard/service";

export default async function CommandPage() {
  const snapshot = await getDashboardSnapshot();
  return <CommandCenter snapshot={snapshot} />;
}
