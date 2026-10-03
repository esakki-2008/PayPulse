import { CustomerNetwork } from "@/components/customers/customer-network";
import { getDemoRepository } from "@/server/database/demo-store";

export default async function CustomersPage() {
  const customers = await getDemoRepository().listCustomers();
  return <CustomerNetwork customers={customers} />;
}
