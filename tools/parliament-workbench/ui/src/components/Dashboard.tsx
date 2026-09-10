import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { buildWiki, getJobs } from "../api";
import type { JobRecord, StatusPayload } from "../types";

interface DashboardProps {
  status: StatusPayload | null;
  onRefresh: () => Promise<void>;
}

export function Dashboard({ status, onRefresh }: DashboardProps): ReactElement {
  const [limit, setLimit] = useState(5000);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshJobs(): Promise<void> {
    setJobs(await getJobs());
  }

  async function handleBuildWiki(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result = await buildWiki(limit);
      setMessage(`Built ${result.result.recordCount.toLocaleString()} wiki records.`);
      await Promise.all([onRefresh(), refreshJobs()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshJobs();
  }, []);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Local workbench</p>
          <h2>Dashboard</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void onRefresh()}>
          Refresh
        </button>
      </header>

      <div className="metric-grid">
        <Metric label="Database" value={status?.database.ok ? "connected" : status?.database.configured ? "error" : "not configured"} tone={status?.database.ok ? "good" : "warn"} />
        <Metric label="Wiki records" value={(status?.wiki.recordCount ?? 0).toLocaleString()} tone={status?.wiki.built ? "good" : "neutral"} />
        <Metric label="Ollama" value={status?.ollama.ok ? "available" : "offline"} tone={status?.ollama.ok ? "good" : "warn"} />
        <Metric label="Model" value={status?.model ?? "qwen3:8b"} tone="neutral" />
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h3>Build Wiki</h3>
          <p className="muted">Create local JSONL and Markdown records from read-only DB facts.</p>
          <label className="field">
            <span>Row limit</span>
            <input type="number" min={1} max={50000} value={limit} onChange={(event) => setLimit(Number(event.currentTarget.value))} />
          </label>
          <button type="button" className="button" onClick={() => void handleBuildWiki()} disabled={busy}>
            {busy ? "Building..." : "Build local wiki"}
          </button>
          {message ? <p className="message">{message}</p> : null}
        </section>

        <section className="panel">
          <h3>Connection Details</h3>
          <dl className="detail-list">
            <dt>API</dt>
            <dd>{status ? `${status.api.host}:${status.api.port}` : "loading"}</dd>
            <dt>Data directory</dt>
            <dd className="mono">{status?.dataDir ?? "unknown"}</dd>
            <dt>Ollama URL</dt>
            <dd className="mono">{status?.ollama.baseUrl ?? "unknown"}</dd>
            <dt>Ollama models</dt>
            <dd>{status?.ollama.models?.join(", ") || status?.ollama.reason || "unknown"}</dd>
          </dl>
        </section>
      </div>

      <section className="panel">
        <h3>Latest Jobs</h3>
        <JobTable jobs={jobs} />
      </section>
    </section>
  );
}

interface MetricProps {
  label: string;
  value: string;
  tone: "good" | "warn" | "neutral";
}

function Metric({ label, value, tone }: MetricProps): ReactElement {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface JobTableProps {
  jobs: JobRecord[];
}

function JobTable({ jobs }: JobTableProps): ReactElement {
  if (jobs.length === 0) {
    return <p className="muted">No local workbench jobs yet.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Kind</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {jobs.slice(0, 10).map((job) => (
            <tr key={job.id}>
              <td className="mono">{job.id}</td>
              <td>{job.kind}</td>
              <td>
                <span className={`badge ${job.status}`}>{job.status}</span>
              </td>
              <td>{new Date(job.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
