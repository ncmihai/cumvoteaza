import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { getBillDocumentDiff } from "../api";
import type { DocumentDiffPayload } from "../types";

interface DocumentDiffPanelProps {
  billId: string;
}

export function DocumentDiffPanel({ billId }: DocumentDiffPanelProps): ReactElement {
  const [payload, setPayload] = useState<DocumentDiffPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setPayload(await getBillDocumentDiff(billId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [billId]);

  return (
    <section className="panel">
      <div className="section-toolbar">
        <div>
          <h3>Ce s-a schimbat</h3>
          <p className="muted">Deterministic article-level comparison across stored derived text.</p>
        </div>
        <button type="button" className="button secondary small" onClick={() => void load()} disabled={busy}>
          Refresh
        </button>
      </div>
      {message ? <p className="message">{message}</p> : null}
      {!payload ? <p className="muted">No diff payload loaded.</p> : null}
      {payload ? (
        <>
          {payload.warnings.length ? (
            <div className="banner warn">
              {payload.warnings.map((warning) => (
                <span className="status-pill" key={warning}>
                  {warning}
                </span>
              ))}
            </div>
          ) : null}
          <div className="record-list compact">
            {payload.documents.map((document) => (
              <article className="record-card" key={document.documentId}>
                <strong>{document.documentKind}</strong>
                <p>{document.label}</p>
                <span className="status-pill">{document.quality}</span>
                <p className="muted">
                  {document.sectionCount} sections, {document.textLength.toLocaleString()} chars
                </p>
                {document.sourceUrl ? (
                  <a href={document.sourceUrl} target="_blank" rel="noreferrer">
                    official source
                  </a>
                ) : null}
              </article>
            ))}
          </div>
          {payload.comparisons.length === 0 ? <p className="muted">Need at least two stored canonical document kinds for a diff.</p> : null}
          {payload.comparisons.map((comparison) => (
            <details className="details-panel" key={`${comparison.fromDocumentId}:${comparison.toDocumentId}`} open>
              <summary>
                {comparison.fromKind} {"->"} {comparison.toKind}
              </summary>
              <div className="entity-overview">
                <Metric label="Added" value={comparison.added.length.toLocaleString()} />
                <Metric label="Removed" value={comparison.removed.length.toLocaleString()} />
                <Metric label="Changed" value={comparison.changed.length.toLocaleString()} />
                <Metric label="Unchanged" value={comparison.unchangedCount.toLocaleString()} />
              </div>
              {comparison.weakParse ? <p className="message">Partial parse. Treat this diff as a review aid, not a verified legal summary.</p> : null}
              <DiffBucket title="Added sections" rows={comparison.added} />
              <DiffBucket title="Removed sections" rows={comparison.removed} />
              <section>
                <h4>Changed sections</h4>
                <div className="record-list compact">
                  {comparison.changed.slice(0, 40).map((row, index) => (
                    <article className="record-card" key={`${row.normalizedHeading}-${index}`}>
                      <strong>{String(row.heading ?? "section")}</strong>
                      <div className="two-column">
                        <p>
                          <span className="muted">Before</span>
                          <br />
                          {String(row.beforeExcerpt ?? "")}
                        </p>
                        <p>
                          <span className="muted">After</span>
                          <br />
                          {String(row.afterExcerpt ?? "")}
                        </p>
                      </div>
                      {Array.isArray(row.diff) && row.diff.length ? (
                        <p className="word-diff">
                          {row.diff.map((part, partIndex) => (
                            <span key={`${partIndex}-${String(part.type)}`} className={`diff-${String(part.type)}`}>
                              {String(part.text)}{" "}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </article>
                  ))}
                  {comparison.changed.length === 0 ? <p className="muted">No changed sections.</p> : null}
                </div>
              </section>
            </details>
          ))}
        </>
      ) : null}
    </section>
  );
}

function DiffBucket({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }): ReactElement {
  return (
    <section>
      <h4>{title}</h4>
      <div className="record-list compact">
        {rows.slice(0, 40).map((row, index) => (
          <article className="record-card" key={`${String(row.normalizedHeading)}-${index}`}>
            <strong>{String(row.heading ?? "section")}</strong>
            <span className="status-pill">{String(row.kind ?? "section")}</span>
            <p>{String(row.excerpt ?? "")}</p>
          </article>
        ))}
        {rows.length === 0 ? <p className="muted">None.</p> : null}
      </div>
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
