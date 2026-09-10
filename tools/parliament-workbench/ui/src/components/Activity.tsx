import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { cancelJob, getJobLogs, getJobs, getJobSteps, retryJob } from "../api";
import type { JobLog, JobRecord, JobStep } from "../types";

interface ActivityProps {
  onOpenJob?: (jobId: string) => void;
}

export function Activity({ onOpenJob }: ActivityProps): ReactElement {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshJobs(nextSelectedId?: string): Promise<void> {
    const nextJobs = await getJobs();
    setJobs(nextJobs);
    const preferredId = nextSelectedId || selectedId;
    if (preferredId && nextJobs.some((job) => job.id === preferredId)) {
      setSelectedId(preferredId);
    } else {
      setSelectedId(nextJobs[0]?.id ?? null);
    }
  }

  async function refreshDetails(jobId: string | null): Promise<void> {
    if (!jobId) {
      setSteps([]);
      setLogs([]);
      return;
    }
    const [nextSteps, nextLogs] = await Promise.all([getJobSteps(jobId), getJobLogs(jobId)]);
    setSteps(nextSteps);
    setLogs(nextLogs);
  }

  async function handleCancel(): Promise<void> {
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    try {
      await cancelJob(selectedId);
      setMessage("Job was marked canceled locally. Running subprocess termination will be added in the next guarded execution pass.");
      await refreshJobs(selectedId);
      await refreshDetails(selectedId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry(): Promise<void> {
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    try {
      const retry = await retryJob(selectedId);
      setMessage(`Queued retry job ${retry.id}.`);
      await refreshJobs(retry.id);
      await refreshDetails(retry.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshJobs();
  }, []);

  useEffect(() => {
    void refreshDetails(selectedId);
  }, [selectedId]);

  const selectedJob = jobs.find((job) => job.id === selectedId) ?? null;

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Runs and local automation</p>
          <h2>Activity</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void refreshJobs()}>
          Refresh
        </button>
      </header>

      {message ? <div className="banner">{message}</div> : null}

      <div className="activity-layout">
        <section className="panel compact-panel">
          <h3>Jobs</h3>
          <div className="job-list">
            {jobs.length ? (
              jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className={job.id === selectedId ? "job-row active" : "job-row"}
                  onClick={() => {
                    setSelectedId(job.id);
                    onOpenJob?.(job.id);
                  }}
                >
                  <span className={`badge ${job.status}`}>{job.status}</span>
                  <strong>{job.kind}</strong>
                  <code>{job.id}</code>
                  <small>{new Date(job.updatedAt).toLocaleString()}</small>
                </button>
              ))
            ) : (
              <p className="muted">No local jobs yet.</p>
            )}
          </div>
        </section>

        <section className="panel compact-panel">
          <div className="section-toolbar">
            <div>
              <h3>{selectedJob?.kind ?? "Select a job"}</h3>
              {selectedJob ? <code>{selectedJob.id}</code> : null}
            </div>
            <div className="button-row">
              <button type="button" className="button secondary small" onClick={() => void handleRetry()} disabled={!selectedJob || busy}>
                Retry
              </button>
              <button type="button" className="button secondary small" onClick={() => void handleCancel()} disabled={!selectedJob || busy || selectedJob.status === "canceled"}>
                Mark canceled
              </button>
            </div>
          </div>

          {selectedJob ? <JobSummary job={selectedJob} /> : <p className="muted">Select a job to inspect steps and logs.</p>}
          <StepTable steps={steps} />
          <LogList logs={logs} />
        </section>
      </div>
    </section>
  );
}

function JobSummary({ job }: { job: JobRecord }): ReactElement {
  return (
    <dl className="detail-list compact-detail">
      <dt>Status</dt>
      <dd>
        <span className={`badge ${job.status}`}>{job.status}</span>
      </dd>
      <dt>Created</dt>
      <dd>{new Date(job.createdAt).toLocaleString()}</dd>
      <dt>Updated</dt>
      <dd>{new Date(job.updatedAt).toLocaleString()}</dd>
      <dt>Parent</dt>
      <dd className="mono">{job.parentJobId ?? "none"}</dd>
      {job.error ? (
        <>
          <dt>Error</dt>
          <dd>{job.error}</dd>
        </>
      ) : null}
    </dl>
  );
}

function StepTable({ steps }: { steps: JobStep[] }): ReactElement {
  if (!steps.length) return <p className="muted">No steps recorded for this job.</p>;
  return (
    <>
      <h4>Steps</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stage</th>
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
                <td>
                  <span className={`badge ${step.status}`}>{step.status}</span>
                </td>
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

function LogList({ logs }: { logs: JobLog[] }): ReactElement {
  if (!logs.length) return <p className="muted">No logs recorded for this job.</p>;
  return (
    <>
      <h4>Logs</h4>
      <div className="log-list">
        {logs.slice(-80).map((log) => (
          <div key={log.id} className={`log-row ${log.level}`}>
            <code>{log.level}</code>
            <span>{log.message}</span>
            <small>{new Date(log.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </>
  );
}
