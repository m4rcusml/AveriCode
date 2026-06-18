type PageLoadingProps = {
  title: string;
};

export function PageLoading({ title }: PageLoadingProps) {
  return (
    <main className="page" aria-busy="true">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-copy">Loading workspace data...</p>
        </div>
      </div>
      <section className="metric-grid" aria-label="Loading metrics">
        {[0, 1, 2, 3].map((item) => (
          <div className="metric-card skeleton-card" key={item}>
            <div className="skeleton-line skeleton-line-short" />
            <div className="skeleton-line skeleton-line-value" />
            <div className="skeleton-line" />
          </div>
        ))}
      </section>
      <section className="section skeleton-section">
        <div className="skeleton-line skeleton-line-short" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </section>
    </main>
  );
}
