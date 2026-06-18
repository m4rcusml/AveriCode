"use client";

import { RouteError } from "@/components/route-error";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  return (
    <RouteError
      error={error}
      message="AveriCode could not load the dashboard data for the selected workspace."
      reset={reset}
      title="Dashboard failed to load"
    />
  );
}
