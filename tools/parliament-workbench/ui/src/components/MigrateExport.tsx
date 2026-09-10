import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { exportMigrationPreview, getMigrationPreview } from "../api";
import type { MigrationExportResult, MigrationPreview } from "../types";

export function MigrateExport(): ReactElement {
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [exportResult, setExportResult] = useState<MigrationExportResult | null>(null);
  const [title, setTitle] = useState("Local workbench export preview");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setPreview(await getMigrationPreview());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result = await exportMigrationPreview(title);
      setExportResult(result);
      setPreview(result.preview);
      setMessage(`Export preview ${result.id} created locally.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Preview only, no Neon writes</p>
          <h2>Migrate / Export</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void load()} disabled={busy}>
          Refresh
        </button>
      </header>

      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span>Export title</span>
            <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          </label>
        </div>
        <div className="button-row">
          <button type="button" className="button" onClick={() => void handleExport()} disabled={busy}>
            Generate local export files
          </button>
        </div>
        {message ? <p className="message">{message}</p> : null}
      </section>

      {preview ? (
        <section className="panel">
          <h3>Preview</h3>
          <div className="entity-overview">
            <Metric label="Status" value={preview.status} />
            {Object.entries(preview.counts).map(([key, value]) => (
              <Metric key={key} label={key} value={String(value)} />
            ))}
          </div>
          <h4>Blockers</h4>
          <div className="record-list compact">
            {preview.blockers.map((blocker) => (
              <article className="record-card" key={blocker.key}>
                <strong>{blocker.key}</strong>
                <span className="status-pill">{blocker.count}</span>
                {blocker.entityIds?.length ? <p className="muted">{blocker.entityIds.slice(0, 10).join(", ")}</p> : null}
              </article>
            ))}
            {preview.blockers.length === 0 ? <p className="muted">No blockers in local preview.</p> : null}
          </div>
          <h4>Preview items</h4>
          <div className="record-list compact">
            {Object.entries(preview.items).map(([key, rows]) => (
              <article className="record-card" key={key}>
                <strong>{key}</strong>
                <span className="status-pill">{rows.length}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {exportResult ? (
        <section className="panel">
          <h3>Generated Files</h3>
          <div className="record-list compact">
            {exportResult.files.map((file) => (
              <article className="record-card" key={file}>
                <code>{file}</code>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="summary-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
