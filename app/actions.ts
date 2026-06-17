"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addExpectedContributor, setRepositoryMonitoring, updateRepositoryContributor } from "@/lib/repository-config";
import { assertCanRunManualSync, syncRepositoryActivity } from "@/lib/github/sync";
import { assertRepositoryWriteAccess } from "@/lib/workspaces";

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function returnTo(formData: FormData, fallback: string) {
  const value = stringValue(formData, "returnTo");
  return value.startsWith("/") ? value : fallback;
}

export async function toggleRepositoryMonitoringAction(formData: FormData) {
  const user = await requireUser();
  const repositoryId = stringValue(formData, "repositoryId");
  const isActive = stringValue(formData, "isActive") === "true";
  const destination = returnTo(formData, "/dashboard/repositories");

  await setRepositoryMonitoring(user.id, repositoryId, isActive);
  revalidatePath(destination);
  redirect(destination);
}

export async function addExpectedContributorAction(formData: FormData) {
  const user = await requireUser();
  const repositoryId = stringValue(formData, "repositoryId");
  const destination = returnTo(formData, "/dashboard/contributors");

  await addExpectedContributor(user.id, repositoryId, {
    username: stringValue(formData, "username"),
    name: stringValue(formData, "name"),
    email: stringValue(formData, "email")
  });

  revalidatePath(destination);
  redirect(destination);
}

export async function removeExpectedContributorAction(formData: FormData) {
  const user = await requireUser();
  const repositoryContributorId = stringValue(formData, "repositoryContributorId");
  const destination = returnTo(formData, "/dashboard/contributors");

  await updateRepositoryContributor(user.id, repositoryContributorId, {
    isExpected: false
  });

  revalidatePath(destination);
  redirect(destination);
}

export async function toggleIgnoredContributorAction(formData: FormData) {
  const user = await requireUser();
  const repositoryContributorId = stringValue(formData, "repositoryContributorId");
  const isIgnored = stringValue(formData, "isIgnored") === "true";
  const destination = returnTo(formData, "/dashboard/contributors");

  await updateRepositoryContributor(user.id, repositoryContributorId, {
    isIgnored
  });

  revalidatePath(destination);
  redirect(destination);
}

export async function syncRepositoryNowAction(formData: FormData) {
  const user = await requireUser();
  const repositoryId = stringValue(formData, "repositoryId");
  const destination = returnTo(formData, "/dashboard/repositories");

  await assertRepositoryWriteAccess(user.id, repositoryId);
  await assertCanRunManualSync(repositoryId);
  await syncRepositoryActivity({
    repositoryId,
    trigger: "MANUAL"
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/repositories");
  revalidatePath("/dashboard/contributors");
  redirect(destination);
}
