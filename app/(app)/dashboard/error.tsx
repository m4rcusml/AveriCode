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
      message="Não foi possível carregar os projetos deste workspace. Confira a conexão e tente novamente."
      reset={reset}
      title="Não foi possível carregar o portfólio"
    />
  );
}
