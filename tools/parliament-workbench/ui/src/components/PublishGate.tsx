import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { getProposals, getPublishBatches, previewPublishBatch } from "../api";
import type { LocalProposal, PublishBatchPreview } from "../types";

export function PublishGate(): ReactElement {
  const [title, setTitle] = useState("Manual publish batch");
  const [proposals, setProposals] = useState<LocalProposal[]>([]);
  const [batches, setBatches] = useState<PublishBatchPreview[]>([]);
  const [preview, setPreview] = useState<PublishBatchPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const [nextProposals, nextBatches] = await Promise.all([getProposals({ status: "accepted" }), getPublishBatches()]);
    setProposals(nextProposals);
    setBatches(nextBatches);
  }

  async function handlePreview(create: boolean): Promise<void> {
    setMessage(null);
    try {
      const next = await previewPublishBatch({ title, proposalIds: proposals.map((proposal) => proposal.id), create });
      setPreview(next);
      if (create) await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Manual reviewed releases</p>
          <h2>Publish Gate</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      <section className="panel">
        <label className="field">
          <span>Batch title</span>
          <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        </label>
        <div className="button-row">
          <button type="button" className="button" onClick={() => void handlePreview(false)}>
            Preview strict gate
          </button>
          <button type="button" className="button secondary" onClick={() => void handlePreview(true)}>
            Save local batch draft
          </button>
        </div>
        {message ? <p className="message">{message}</p> : null}
      </section>

      {preview ? (
        <section className="panel">
          <h3>Gate Result</h3>
          <div className={`banner ${preview.strictGate.canPublish ? "" : "danger"}`}>
            {preview.strictGate.canPublish ? "Batch can publish after guarded apply is implemented." : "Batch is blocked by strict gates."}
          </div>
          <div className="metric-grid">
            <Metric label="Accepted patches" value={String(preview.strictGate.acceptedProposalCount)} tone="neutral" />
            <Metric label="Blockers" value={String(preview.strictGate.blockers.length)} tone={preview.strictGate.blockers.length ? "warn" : "good"} />
            <Metric label="Items" value={String(preview.items.length)} tone="neutral" />
            <Metric label="Status" value={preview.status} tone={preview.strictGate.canPublish ? "good" : "warn"} />
          </div>
          <BlockerTable preview={preview} />
        </section>
      ) : null}

      <section className="panel">
        <h3>Accepted Local Proposals</h3>
        {proposals.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => (
                  <tr key={proposal.id}>
                    <td className="mono">{proposal.id}</td>
                    <td>{proposal.proposalType}</td>
                    <td>
                      {proposal.entityType}:{proposal.entityId}
                    </td>
                    <td>{proposal.evidenceQuote || proposal.officialUrl || proposal.sourceDocumentId || "missing"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No accepted local proposals yet.</p>
        )}
      </section>

      <section className="panel">
        <h3>Local Batch Drafts</h3>
        {batches.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id ?? batch.title}>
                    <td>{batch.title}</td>
                    <td>{batch.status}</td>
                    <td>{new Date(batch.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No local publish batches yet.</p>
        )}
      </section>
    </section>
  );
}

function BlockerTable({ preview }: { preview: PublishBatchPreview }): ReactElement {
  if (!preview.strictGate.blockers.length && !preview.strictGate.warnings.length) {
    return <p className="message">No strict blockers or warnings.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Issue</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {preview.strictGate.blockers.map((blocker) => (
            <tr key={blocker.key}>
              <td>blocker</td>
              <td>{blocker.label}</td>
              <td>{blocker.count}</td>
            </tr>
          ))}
          {preview.strictGate.warnings.map((warning) => (
            <tr key={warning}>
              <td>warning</td>
              <td>{warning}</td>
              <td>1</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
