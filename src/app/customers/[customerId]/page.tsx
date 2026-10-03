import { notFound } from "next/navigation";

import { CustomerIntelligence } from "@/components/customers/customer-intelligence";
import { getDemoRepository } from "@/server/database/demo-store";

interface CustomerPageProps {
  readonly params: Promise<{ customerId: string }>;
}

export default async function CustomerPage({ params }: CustomerPageProps) {
  const { customerId } = await params;
  const repository = getDemoRepository();
  const [customer, transactions, signals] = await Promise.all([
    repository.getCustomer(customerId),
    repository.listTransactions(),
    repository.listSignals(),
  ]);

  if (!customer) {
    notFound();
  }

  return <CustomerIntelligence customer={customer} transactions={transactions} signals={signals} />;
}
