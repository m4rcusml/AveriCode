"use client";

type RouteErrorProps = {
  error: Error & { digest?: string };
  message: string;
  reset: () => void;
  title: string;
};

export function RouteError({ error, message, reset, title }: RouteErrorProps) {
  return (
    <main className="page" id="main-content">
      <div className="empty-state dashboard-empty" role="alert">
        <div>
          <h1>{title}</h1>
          <p>{message}</p>
          {error.digest ? <p className="muted">Identificador do erro: {error.digest}</p> : null}
          <button className="button button-primary" onClick={reset} type="button">
            Tentar novamente
          </button>
        </div>
      </div>
    </main>
  );
}
