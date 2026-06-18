import { redirect } from "next/navigation";
import { SettingsPageContent } from "@/components/settings/settings-page-content";
import type { SettingsSearchParams } from "@/components/settings/settings-notice";
import { getAuthSession } from "@/lib/auth";
import { getSettingsData } from "@/lib/settings/queries";

export const dynamic = "force-dynamic";

type SettingsPageProps = {
  searchParams?: Promise<SettingsSearchParams>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const [resolvedSearchParams, data] = await Promise.all([
    searchParams,
    getSettingsData(session.user.id)
  ]);

  return <SettingsPageContent data={data} searchParams={resolvedSearchParams} />;
}
