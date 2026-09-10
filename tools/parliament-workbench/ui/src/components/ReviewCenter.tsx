import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { convertReviewItemToProposal, getReviewQueue, getReviewQueueSummary, previewReviewProposal, transitionReviewItem } from "../api";
import type { ReviewProposalPreview, ReviewQueueItem, ReviewQueuePayload, ReviewQueueSummary } from "../types";

const queueOptions = [
  { value: "", label: "All queues" },
  { value: "citations", label: "Citations" },
  { value: "text_corrections", label: "Text corrections" },
  { value: "taxonomy_labels", label: "Taxonomy labels" },
  { value: "source_claims", label: "Source claims" },
  { value: "model_suggestions", label: "Model suggestions" },
  { value: "export_blockers", label: "Export blockers" }
];

const statusOptions = ["", "candidate", "draft", "open", "reviewed", "accepted", "rejected", "ignored", "failed"];

interface ReviewCenterProps {
  onOpenEntity: (entityType: string, entityId: string) => void;
}

export function ReviewCenter({ onOpenEntity }: ReviewCenterProps): ReactElement {
  const initial = useMemo(() => new URLSearchParams(window.location.search), []);
  const [summary, setSummary] = useState<ReviewQueueSummary | null>(null);
  const [payload, setPayload] = useState<ReviewQueuePayload | null>(null);
  const [queue, setQueue] = useState(initial.get("queue") ?? "");
  const [status, setStatus] = useState(initial.get("status") ?? "");
  const [entityType, setEntityType] = useState(initial.get("entityType") ?? "");
  const [entityId, setEntityId] = useState(initial.get("entityId") ?? "");
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [source, setSource] = useState(initial.get("source") ?? "");
  const [blocksOnly, setBlocksOnly] = useState(initial.get("blocksExport") === "true");
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeItem, setActiveItem] = useState<ReviewQueueItem | null>(null);
  const [targetStatus, setTargetStatus] = useState("reviewed");
  const [reviewer, setReviewer] = useState("local");
  const [reviewerNote, setReviewerNote] = useState("");
  const [proposalPreview, setProposalPreview] = useState<ReviewProposalPreview | null>(null);
  const limit = 50;

  async function load(nextOffset = offset): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const [nextSummary, nextPayload] = await Promise.all([
        getReviewQueueSummary(),
        getReviewQueue({
          queue: queue || undefined,
          status: status || undefined,
          entityType: entityType || undefined,
          entityId: entityId || undefined,
          q: query || undefined,
          source: source || undefined,
          blocksExport: blocksOnly ? true : undefined,
          limit,
          offset: nextOffset
        })
      ]);
      setSummary(nextSummary);
      setPayload(nextPayload);
      setOffset(nextOffset);
      syncUrl();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function syncUrl(): void {
    const params = new URLSearchParams();
    params.set("tab", "reviews");
    if (queue) params.set("queue", queue);
    if (status) params.set("status", status);
    if (entityType) params.set("entityType", entityType);
    if (entityId) params.set("entityId", entityId);
    if (query) params.set("q", query);
    if (source) params.set("source", source);
    if (blocksOnly) params.set("blocksExport", "true");
    window.history.replaceState({}, "", `/?${params.toString()}`);
  }

  async function transition(item: ReviewQueueItem): Promise<void> {
    setBusy(true);
    setMessage(null);
    const itemIsActive = isSameItem(activeItem, item);
    const nextStatus = itemIsActive ? targetStatus : "reviewed";
    const nextReviewer = itemIsActive ? reviewer : "local";
    const nextNote = itemIsActive ? reviewerNote : "";
    try {
      await transitionReviewItem(item.queue, item.id, { status: nextStatus, reviewer: nextReviewer, reviewerNote: nextNote, decisionReason: nextNote });
      setMessage(`${item.id} moved to ${nextStatus}.`);
      setReviewerNote("");
      setProposalPreview(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function previewProposal(item: ReviewQueueItem): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setActiveItem(item);
      setProposalPreview(await previewReviewProposal(item.queue, item.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function convertToProposal(item: ReviewQueueItem): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const proposal = await convertReviewItemToProposal(item.queue, item.id);
      setMessage(`Proposal ${proposal.id} created.`);
      setProposalPreview(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load(0);
  }, []);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Local review state</p>
          <h2>Review Center</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void load()} disabled={busy}>
          Refresh
        </button>
      </header>

      {summary ? (
        <div className="metric-grid">
          <Metric label="Total" value={String(summary.total)} />
          <Metric label="Blocks export" value={String(summary.blockers)} tone={summary.blockers ? "warn" : "good"} />
          <Metric label="Queues" value={String(summary.byQueue.length)} />
          <Metric label="Statuses" value={String(summary.byStatus.length)} />
        </div>
      ) : null}

      <section className="panel">
        <div className="form-grid four">
          <label className="field">
            <span>Queue</span>
            <select value={queue} onChange={(event) => setQueue(event.currentTarget.value)}>
              {queueOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
              {statusOptions.map((option) => (
                <option key={option || "all"} value={option}>
                  {option || "All statuses"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Entity type</span>
            <input value={entityType} onChange={(event) => setEntityType(event.currentTarget.value)} placeholder="bill, document, party..." />
          </label>
          <label className="field">
            <span>Entity ID</span>
            <input value={entityId} onChange={(event) => setEntityId(event.currentTarget.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="citation, bill id, evidence..." />
          </label>
          <label className="field">
            <span>Source</span>
            <input value={source} onChange={(event) => setSource(event.currentTarget.value)} placeholder="document id or official URL" />
          </label>
        </div>
        <div className="button-row">
          <label className="check-field">
            <input type="checkbox" checked={blocksOnly} onChange={(event) => setBlocksOnly(event.currentTarget.checked)} />
            Blocks export
          </label>
          <button type="button" className="button" onClick={() => void load(0)} disabled={busy}>
            Apply filters
          </button>
        </div>
        {message ? <p className="message">{message}</p> : null}
      </section>

      <section className="panel">
        <div className="section-toolbar">
          <div>
            <h3>Queue Items</h3>
            <p className="muted">{payload ? `${payload.total} matching items` : "No queue payload loaded."}</p>
          </div>
          <div className="button-row">
            <button type="button" className="button secondary small" onClick={() => void load(Math.max(0, offset - limit))} disabled={busy || offset === 0}>
              Previous
            </button>
            <button type="button" className="button secondary small" onClick={() => void load(offset + limit)} disabled={busy || !payload || offset + limit >= payload.total}>
              Next
            </button>
          </div>
        </div>
        <div className="record-list compact">
          {payload?.items.map((item) => (
            <article className={item.blocksExport ? "record-card review-card blocking" : "record-card review-card"} key={`${item.queue}:${item.id}`}>
              <div className="review-card-header">
                <div>
                  <span className="status-pill">{item.queue}</span>
                  <span className="status-pill">{item.status}</span>
                  {item.blocksExport ? <span className="status-pill danger">blocks export</span> : null}
                </div>
                <button type="button" className="link-button" onClick={() => onOpenEntity(item.entityType, item.entityId)}>
                  {item.entityType}:{item.entityId}
                </button>
              </div>
              <strong>{item.title}</strong>
              {item.subtitle ? <p className="muted">{item.subtitle}</p> : null}
              {item.snippet ? <p>{clip(item.snippet, 360)}</p> : null}
              {item.evidenceQuote ? <blockquote>{clip(item.evidenceQuote, 260)}</blockquote> : null}
              <div className="review-meta">
                {item.sourceId ? <code>{item.sourceId}</code> : null}
                {item.confidence !== undefined && item.confidence !== null ? <span className="status-pill">confidence {formatConfidence(item.confidence)}</span> : null}
                {item.proposalId ? <code>{item.proposalId}</code> : null}
                {item.reviewer ? <span className="status-pill">reviewer {item.reviewer}</span> : null}
                {item.officialUrl ? (
                  <a href={item.officialUrl} target="_blank" rel="noreferrer">
                    official source
                  </a>
                ) : null}
              </div>
              <div className="review-actions">
                <select value={isSameItem(activeItem, item) ? targetStatus : "reviewed"} onChange={(event) => { setActiveItem(item); setTargetStatus(event.currentTarget.value); }}>
                  <option value="reviewed">Reviewed</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="ignored">Ignored</option>
                </select>
                <input value={isSameItem(activeItem, item) ? reviewer : "local"} onFocus={() => setActiveItem(item)} onChange={(event) => setReviewer(event.currentTarget.value)} aria-label="Reviewer" />
                <input value={isSameItem(activeItem, item) ? reviewerNote : ""} onFocus={() => setActiveItem(item)} onChange={(event) => setReviewerNote(event.currentTarget.value)} placeholder="Reviewer note" aria-label="Reviewer note" />
                <button type="button" className="button small" onClick={() => { setActiveItem(item); void transition(item); }} disabled={busy || item.queue === "export_blockers"}>
                  Save status
                </button>
                <button type="button" className="button secondary small" onClick={() => void previewProposal(item)} disabled={busy || item.queue === "export_blockers"}>
                  Proposal
                </button>
              </div>
            </article>
          ))}
          {payload?.items.length === 0 ? <p className="muted">No review items match these filters.</p> : null}
        </div>
      </section>

      {proposalPreview ? (
        <section className="panel">
          <h3>Proposal Preview</h3>
          <p className="muted">{activeItem ? `${activeItem.queue}:${activeItem.id}` : "Selected item"}</p>
          {proposalPreview.proposalId ? <code>{proposalPreview.proposalId}</code> : null}
          {proposalPreview.proposalPayload ? <pre>{JSON.stringify(proposalPreview.proposalPayload, null, 2)}</pre> : null}
          {proposalPreview.commandPreview ? <pre>{JSON.stringify(proposalPreview.commandPreview, null, 2)}</pre> : null}
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => activeItem && void convertToProposal(activeItem)}
              disabled={busy || !proposalPreview.canConvert || !activeItem}
            >
              Convert to proposal
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }): ReactElement {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

function isSameItem(left: ReviewQueueItem | null, right: ReviewQueueItem): boolean {
  return Boolean(left && left.id === right.id && left.queue === right.queue);
}

function formatConfidence(value: number | string): string {
  if (typeof value === "number") {
    return value.toFixed(2);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : value;
}
