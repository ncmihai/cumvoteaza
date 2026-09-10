import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { getPublishBatches, getWorkbenchState, initWorkbenchState } from "../api";
import type { PublishBatchPreview, WorkbenchStateStatus } from "../types";

export function Backbone(): ReactElement {
  const [state, setState] = useState<WorkbenchStateStatus | null>(null);
  const [batches, setBatches] = useState<PublishBatchPreview[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    const [nextState, nextBatches] = await Promise.all([getWorkbenchState(), getPublishBatches()]);
    setState(nextState);
    setBatches(nextBatches);
  }

  async function handleInit(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const initialized = await initWorkbenchState();
      setState(initialized);
      setMessage("Local workflow database is initialized.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const counts = state?.counts ?? {};

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Operational backbone</p>
          <h2>Workbench Backbone</h2>
        </div>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="button" onClick={() => void handleInit()} disabled={busy}>
            {busy ? "Initializing..." : "Initialize state"}
          </button>
        </div>
      </header>

      {message ? <div className="banner">{message}</div> : null}

      <div className="metric-grid">
        <Metric label="SQLite state" value={state?.initialized ? "initialized" : "missing"} tone={state?.initialized ? "good" : "warn"} />
        <Metric label="Jobs" value={String(counts.workflow_jobs ?? 0)} tone="neutral" />
        <Metric label="Steps" value={String(counts.workflow_job_steps ?? 0)} tone="neutral" />
        <Metric label="Logs" value={String(counts.workflow_job_logs ?? 0)} tone="neutral" />
        <Metric label="Patches" value={String(counts.patches ?? 0)} tone="neutral" />
        <Metric label="Source claims" value={String(counts.source_claims ?? 0)} tone="neutral" />
        <Metric label="Source conflicts" value={String(counts.source_conflicts ?? 0)} tone={(counts.source_conflicts ?? 0) > 0 ? "warn" : "neutral"} />
        <Metric label="Atlas terms" value={String(counts.institution_terms ?? 0)} tone="neutral" />
        <Metric label="Atlas events" value={String(counts.institution_events ?? 0)} tone="neutral" />
        <Metric label="Publish batches" value={String(counts.publish_batches ?? batches.length)} tone="neutral" />
      </div>

      <div className="panel-grid wide">
        <section className="panel">
          <h3>Local State</h3>
          <dl className="detail-list">
            <dt>Path</dt>
            <dd className="mono">{state?.path ?? "loading"}</dd>
            <dt>Schema</dt>
            <dd>{state?.schemaVersion ?? "unknown"}</dd>
            <dt>Status</dt>
            <dd>{state?.ok ? "ok" : state?.error ?? "not initialized"}</dd>
          </dl>
        </section>
        <section className="panel">
          <h3>Product Rule</h3>
          <p className="muted">
            Experiments, drafts, model runs, and review patches stay local. Only reviewed publish batches should promote canonical facts or snapshots to Neon.
          </p>
        </section>
      </div>

      <section className="panel">
        <h3>Backbone Tables</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Table</th>
                <th>Rows</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(counts).map(([key, value]) => (
                <tr key={key}>
                  <td className="mono">{key}</td>
                  <td>{value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "neutral" }): ReactElement {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
