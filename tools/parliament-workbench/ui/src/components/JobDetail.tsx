import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { cancelJob, getJobDetail, previewJobStepRetry, retryJob } from "../api";
import type { JobRecord, JobStep } from "../types";

interface JobDetailProps {
  jobId: string;
  onBack: () => void;
  onOpenJob: (jobId: string) => void;
}

export function JobDetail({ jobId, onBack, onOpenJob }: JobDetailProps): ReactElement {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setJob(await getJobDetail(jobId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setJob(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await cancelJob(jobId);
      await load();
      setMessage("Job marked canceled locally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const retry = await retryJob(jobId);
      setMessage(`Queued retry ${retry.id}.`);
      onOpenJob(retry.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleStepPreview(step: JobStep): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const preview = await previewJobStepRetry(jobId, step.id);
      setMessage(String(preview.commandText ?? preview.message ?? "Retry preview created."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [jobId]);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Durable local job</p>
          <h2>{job?.kind ?? "Job detail"}</h2>
          <code>{jobId}</code>
        </div>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={onBack}>
            Activity
          </button>
          <button type="button" className="button secondary" onClick={() => void load()} disabled={busy}>
            Refresh
          </button>
        </div>
      </header>

      {message ? <p className="message">{message}</p> : null}
      {!job ? <p className="muted">Job not loaded.</p> : null}
      {job ? (
        <>
          <section className="panel">
            <div className="section-toolbar">
              <div>
                <h3>Summary</h3>
                <span className={`badge ${job.status}`}>{job.status}</span>
              </div>
              <div className="button-row">
                <button type="button" className="button secondary small" onClick={() => void handleRetry()} disabled={busy}>
                  Retry
                </button>
                <button type="button" className="button secondary small" onClick={() => void handleCancel()} disabled={busy || job.status === "canceled"}>
                  Mark canceled
                </button>
              </div>
            </div>
            <dl className="detail-list compact-detail">
              <dt>Created</dt>
              <dd>{new Date(job.createdAt).toLocaleString()}</dd>
              <dt>Updated</dt>
              <dd>{new Date(job.updatedAt).toLocaleString()}</dd>
              <dt>Started</dt>
              <dd>{job.startedAt ? new Date(job.startedAt).toLocaleString() : "not started"}</dd>
              <dt>Finished</dt>
              <dd>{job.finishedAt ? new Date(job.finishedAt).toLocaleString() : "not finished"}</dd>
              <dt>Input</dt>
              <dd>
                <code>{JSON.stringify(job.input)}</code>
              </dd>
              {job.output ? (
                <>
                  <dt>Output</dt>
                  <dd>
                    <code>{JSON.stringify(job.output)}</code>
                  </dd>
                </>
              ) : null}
              {job.error ? (
                <>
                  <dt>Error</dt>
                  <dd>{job.error}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="panel">
            <h3>Parent / Retry Chain</h3>
            <div className="button-row">
              {job.parentJob ? (
                <button type="button" className="button secondary small" onClick={() => onOpenJob(job.parentJob!.id)}>
                  Parent {job.parentJob.id}
                </button>
              ) : (
                <span className="muted">No parent job.</span>
              )}
              {job.retryJobs?.map((retry) => (
                <button type="button" className="button secondary small" key={retry.id} onClick={() => onOpenJob(retry.id)}>
                  Retry {retry.id}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>Steps</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Status</th>
                    <th>Command</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(job.steps ?? []).map((step) => (
                    <tr key={step.id}>
                      <td>
                        <strong>{step.label}</strong>
                        <p className="muted mono">{step.stageId}</p>
                      </td>
                      <td>
                        <span className={`badge ${step.status}`}>{step.status}</span>
                      </td>
                      <td>
                        <code>{step.commandText || "local step"}</code>
                        {step.error ? <p className="message">{step.error}</p> : null}
                      </td>
                      <td>
                        <button type="button" className="button secondary small" onClick={() => void handleStepPreview(step)}>
                          Retry preview
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h3>Logs</h3>
            <div className="log-list">
              {(job.logs ?? []).map((log) => (
                <div key={log.id} className={`log-row ${log.level}`}>
                  <code>{log.level}</code>
                  <span>{log.message}</span>
                  <small>{new Date(log.createdAt).toLocaleString()}</small>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
