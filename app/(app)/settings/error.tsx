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
      message="Não foi possível carregar as configurações do workspace. Tente novamente."
      reset={reset}
      title="Não foi possível carregar as configurações"
    />
  );
}
