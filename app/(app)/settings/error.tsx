"use client";

import { RouteError } from "@/components/route-error";

type SettingsErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function SettingsError({ error, reset }: SettingsErrorProps) {
  return (
    <RouteError
      error={error}
      message="AveriCode could not load workspace settings."
      reset={reset}
      title="Settings failed to load"
    />
  );
}
