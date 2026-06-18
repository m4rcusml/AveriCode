import { redirect } from "next/navigation";
import {
  DashboardPageContent,
  type DashboardNoticeSearchParams
} from "@/components/dashboard/dashboard-page-content";
import { getAuthSession } from "@/lib/auth";
import { getDashboardData, type DashboardSearchParams } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<DashboardSearchParams & DashboardNoticeSearchParams>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const data = await getDashboardData(session.user.id, resolvedSearchParams);

  return <DashboardPageContent data={data} searchParams={resolvedSearchParams} />;
}
