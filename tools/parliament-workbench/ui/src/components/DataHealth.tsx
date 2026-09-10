import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { getHealthSummary } from "../api";
import type { DataHealthSummary } from "../types";

export function DataHealth(): ReactElement {
  const [summary, setSummary] = useState<DataHealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      setError(null);
      setSummary(await getHealthSummary());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Read-only queue overview</p>
          <h2>Data Health</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      {error ? <div className="banner danger">{error}</div> : null}
      <div className="metric-grid">
        <Metric label="Review rows" value={summary?.reviews ?? 0} />
        <Metric label="Open reviews" value={summary?.openReviews ?? 0} />
        <Metric label="Stored documents" value={summary?.storedDocuments ?? 0} />
        <Metric label="Unlinked votes" value={summary?.unlinkedVotes ?? 0} />
        <Metric label="Missing procedures" value={summary?.missingProcedures ?? 0} />
      </div>

      <section className="panel">
        <h3>V1 Behavior</h3>
        <p className="muted">
          This workbench reads health counts and generated suggestion artifacts. It does not mutate bills, votes,
          documents, text chunks, or review state in v1.
        </p>
      </section>
    </section>
  );
}

interface MetricProps {
  label: string;
  value: number;
}

function Metric({ label, value }: MetricProps): ReactElement {
  return (
    <div className="metric neutral">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}
