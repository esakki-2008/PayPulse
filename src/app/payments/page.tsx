import { PaymentUniverse } from "@/components/payments/payment-universe";
import { getDashboardSnapshot } from "@/server/dashboard/service";

export default async function PaymentsPage() {
  const snapshot = await getDashboardSnapshot();
  return <PaymentUniverse customers={snapshot.customers} transactions={snapshot.transactions} />;
}
