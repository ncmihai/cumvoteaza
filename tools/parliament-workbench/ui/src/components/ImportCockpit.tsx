import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { previewCurrentImport, previewHistoricalYear, runCurrentImport, runHistoricalYear } from "../api";
import type { HistoricalYearPlan, ImportPlan, ImportRunResult, JobLog, JobStep } from "../types";

type Chamber = "both" | "senate" | "deputies";
type HistoricalSource = "projects" | "votes" | "official";

export function ImportCockpit(): ReactElement {
  const [year, setYear] = useState(new Date().getFullYear());
  const [limit, setLimit] = useState(25);
  const [includeText, setIncludeText] = useState(true);
  const [mode, setMode] = useState<"dry_run" | "persist">("dry_run");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [historicalYear, setHistoricalYear] = useState(new Date().getFullYear());
  const [historicalChamber, setHistoricalChamber] = useState<Chamber>("both");
  const [historicalSource, setHistoricalSource] = useState<HistoricalSource>("projects");
  const [historicalLimit, setHistoricalLimit] = useState(10);
  const [historicalIncludeText, setHistoricalIncludeText] = useState(false);
  const [historicalIncludeOcr, setHistoricalIncludeOcr] = useState(false);
  const [historical, setHistorical] = useState<HistoricalYearPlan | null>(null);
  const [result, setResult] = useState<ImportRunResult | null>(null);
  const [historicalResult, setHistoricalResult] = useState<ImportRunResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshPlan(): Promise<void> {
    const nextPlan = await previewCurrentImport({ year, limit, includeText, mode });
    setPlan(nextPlan);
  }

  async function refreshHistoricalPlan(): Promise<void> {
    const nextHistorical = await previewHistoricalYear({
      year: historicalYear,
      chamber: historicalChamber,
      sourceType: historicalSource,
      includeText: historicalIncludeText,
      limit: historicalLimit
    });
    setHistorical(nextHistorical);
  }

  async function handleRunPreview(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const next = await runCurrentImport({ year, limit, includeText, mode, execute: false });
      setResult(next);
      setMessage(next.result.message ?? "Import command preview was stored as a local job.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRunDryRun(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      if (mode !== "dry_run") {
        setMessage("Switch to Dry run mode before executing from the UI. Persist execution stays token-gated and explicit.");
        return;
      }
      const next = await runCurrentImport({ year, limit, includeText, mode: "dry_run", execute: true });
      setResult(next);
      setMessage(next.job.status === "succeeded" ? "Dry-run import job finished." : next.job.error || "Dry-run import job finished with issues.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleHistoricalRun(execute: boolean): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const next = await runHistoricalYear({
        year: historicalYear,
        chamber: historicalChamber,
        sourceType: historicalSource,
        limit: historicalLimit,
        includeText: historicalIncludeText,
        includeOcr: historicalIncludeOcr,
        execute
      });
      setHistoricalResult(next);
      setHistorical(next.result.plan as unknown as HistoricalYearPlan);
      setMessage(execute ? "Historical tiny dry-run finished." : "Historical preview job stored. No commands executed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshPlan();
  }, [year, limit, includeText, mode]);

  useEffect(() => {
    void refreshHistoricalPlan();
  }, [historicalYear, historicalChamber, historicalSource, historicalLimit, historicalIncludeText]);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Current pipeline first</p>
          <h2>Import Cockpit</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void refreshPlan()}>
          Refresh plan
        </button>
      </header>

      <section className="panel">
        <div className="section-toolbar">
          <div>
            <h3>Current Sync</h3>
            <p className="muted">Use this for the latest/current-year import lane. Dry-run commands include --dry-run where the ingest command can write discoveries.</p>
          </div>
        </div>
        <div className="form-grid four">
          <label className="field">
            <span>Year</span>
            <input type="number" min={1990} max={2100} value={year} onChange={(event) => setYear(Number(event.currentTarget.value))} />
          </label>
          <label className="field">
            <span>Limit</span>
            <input type="number" min={1} max={100} value={limit} onChange={(event) => setLimit(Number(event.currentTarget.value))} />
          </label>
          <label className="field">
            <span>Mode</span>
            <select value={mode} onChange={(event) => setMode(event.currentTarget.value as "dry_run" | "persist")}>
              <option value="dry_run">Dry run</option>
              <option value="persist">Persist</option>
            </select>
          </label>
          <label className="check-field">
            <input type="checkbox" checked={includeText} onChange={(event) => setIncludeText(event.currentTarget.checked)} />
            Include text extraction
          </label>
        </div>
        <div className="button-row">
          <button type="button" className="button" onClick={() => void handleRunPreview()} disabled={busy}>
            {busy ? "Saving..." : "Store preview job"}
          </button>
          <button type="button" className="button secondary" onClick={() => void handleRunDryRun()} disabled={busy || mode !== "dry_run"}>
            Run dry-run job
          </button>
          <span className="muted">Persist execution remains disabled in the UI until guarded write actions are implemented.</span>
        </div>
        {message ? <p className="message">{message}</p> : null}
      </section>

      <section className="panel">
        <h3>Current Sync Stages</h3>
        {plan ? <StageTable plan={plan} /> : <p className="muted">Loading plan...</p>}
      </section>

      <section className="panel">
        <h3>Historical Year Batch Preview</h3>
        <p className="muted">Historical backfill stays dry-run only here. Every batch must attach legislature, government, member switches, and party periods before reviewed promotion.</p>
        <div className="form-grid four">
          <label className="field">
            <span>Year</span>
            <input type="number" min={1990} max={2100} value={historicalYear} onChange={(event) => setHistoricalYear(Number(event.currentTarget.value))} />
          </label>
          <label className="field">
            <span>Chamber</span>
            <select value={historicalChamber} onChange={(event) => setHistoricalChamber(event.currentTarget.value as Chamber)}>
              <option value="both">Both</option>
              <option value="deputies">Deputies</option>
              <option value="senate">Senate</option>
            </select>
          </label>
          <label className="field">
            <span>Source</span>
            <select value={historicalSource} onChange={(event) => setHistoricalSource(event.currentTarget.value as HistoricalSource)}>
              <option value="projects">Projects</option>
              <option value="votes">Votes</option>
              <option value="official">Projects and votes</option>
            </select>
          </label>
          <label className="field">
            <span>Limit</span>
            <input type="number" min={1} max={25} value={historicalLimit} onChange={(event) => setHistoricalLimit(Number(event.currentTarget.value))} />
          </label>
        </div>
        <div className="button-row">
          <label className="check-field">
            <input type="checkbox" checked={historicalIncludeText} onChange={(event) => setHistoricalIncludeText(event.currentTarget.checked)} />
            Include text extraction preview
          </label>
          <label className="check-field">
            <input type="checkbox" checked={historicalIncludeOcr} onChange={(event) => setHistoricalIncludeOcr(event.currentTarget.checked)} />
            Track OCR quarantine
          </label>
        </div>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => void refreshHistoricalPlan()} disabled={busy}>
            Refresh historical plan
          </button>
          <button type="button" className="button" onClick={() => void handleHistoricalRun(false)} disabled={busy}>
            Store historical preview job
          </button>
          <button type="button" className="button secondary" onClick={() => void handleHistoricalRun(true)} disabled={busy}>
            Run tiny historical dry-run
          </button>
        </div>
        {historical ? <HistoricalPlanView plan={historical} /> : <p className="muted">Loading historical plan...</p>}
      </section>

      {result ? (
        <section className="panel">
          <h3>Last Stored Job</h3>
          <dl className="detail-list">
            <dt>Job</dt>
            <dd className="mono">{result.job.id}</dd>
            <dt>Status</dt>
            <dd>{result.job.status}</dd>
            <dt>Executed</dt>
            <dd>{result.result.executed ? "yes" : "no"}</dd>
          </dl>
          <JobStepTable steps={result.steps ?? []} />
          <JobLogList logs={result.logs ?? []} />
        </section>
      ) : null}

      {historicalResult ? (
        <section className="panel">
          <h3>Last Historical Job</h3>
          <dl className="detail-list">
            <dt>Job</dt>
            <dd className="mono">{historicalResult.job.id}</dd>
            <dt>Status</dt>
            <dd>{historicalResult.job.status}</dd>
            <dt>Executed</dt>
            <dd>{historicalResult.result.executed ? "yes" : "no"}</dd>
          </dl>
          <JobStepTable steps={historicalResult.steps ?? []} />
          <JobLogList logs={historicalResult.logs ?? []} />
        </section>
      ) : null}
    </section>
  );
}

function StageTable({ plan }: { plan: ImportPlan }): ReactElement {
  return (
    <>
      <div className="banner">
        {plan.warnings.map((warning) => (
          <div key={warning}>{warning}</div>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Source</th>
              <th>Writes</th>
              <th>Command</th>
            </tr>
          </thead>
          <tbody>
            {plan.stages.map((stage) => (
              <tr key={stage.id}>
                <td>
                  <strong>{stage.label}</strong>
                  <p className="muted">{stage.description}</p>
                </td>
                <td>{stage.source}</td>
                <td>{stage.readOnly ? "read-only" : stage.writes}</td>
                <td>
                  <code>{stage.commandText}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HistoricalPlanView({ plan }: { plan: HistoricalYearPlan }): ReactElement {
  return (
    <>
      <div className="command-list">
        {plan.commands.map((command) => (
          <code key={command.commandText}>{command.commandText}</code>
        ))}
      </div>
      {plan.contextChecks ? (
        <details>
          <summary>Context checks</summary>
          <pre>{JSON.stringify(plan.contextChecks, null, 2)}</pre>
        </details>
      ) : null}
    </>
  );
}

function JobStepTable({ steps }: { steps: JobStep[] }): ReactElement {
  if (!steps.length) return <p className="muted">No recorded steps for this job.</p>;
  return (
    <>
      <h4>Recorded Steps</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Status</th>
              <th>Return</th>
              <th>Command</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.id}>
                <td>
                  <strong>{step.label}</strong>
                  <p className="muted mono">{step.stageId}</p>
                </td>
                <td>{step.status}</td>
                <td>{step.returnCode ?? "n/a"}</td>
                <td>
                  <code>{step.commandText}</code>
                  {step.error ? <p className="message">{step.error}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function JobLogList({ logs }: { logs: JobLog[] }): ReactElement {
  if (!logs.length) return <p className="muted">No job logs recorded.</p>;
  return (
    <>
      <h4>Job Logs</h4>
      <div className="transition-list">
        {logs.slice(-30).map((log) => (
          <div key={log.id}>
            <code>{log.level}</code>
            <span>{log.message}</span>
            {log.stepId ? <p className="muted mono">{log.stepId}</p> : null}
          </div>
        ))}
      </div>
    </>
  );
}
