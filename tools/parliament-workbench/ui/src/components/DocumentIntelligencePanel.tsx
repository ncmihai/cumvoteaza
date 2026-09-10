import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { createTextCorrection, getDocumentTextIntelligence, parseDocumentText } from "../api";
import type { DocumentTextIntelligence } from "../types";

interface DocumentIntelligencePanelProps {
  documentId: string;
}

export function DocumentIntelligencePanel({ documentId }: DocumentIntelligencePanelProps): ReactElement {
  const [payload, setPayload] = useState<DocumentTextIntelligence | null>(null);
  const [correctedText, setCorrectedText] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [evidenceQuote, setEvidenceQuote] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setPayload(await getDocumentTextIntelligence(documentId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleParse(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await parseDocumentText(documentId);
      await load();
      setMessage("Document parsed and citations stored locally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitCorrection(): Promise<void> {
    setMessage(null);
    if (!evidenceQuote.trim()) {
      setMessage("Evidence quote is required.");
      return;
    }
    if (!correctedText.trim() && !correctionNote.trim()) {
      setMessage("Add corrected text or a correction note.");
      return;
    }
    setBusy(true);
    try {
      await createTextCorrection(documentId, {
        correctedText: correctedText || undefined,
        correctionNote: correctionNote || undefined,
        evidenceQuote,
        sourceDocumentId: documentId,
        officialUrl: officialUrl || undefined
      });
      setCorrectedText("");
      setCorrectionNote("");
      setEvidenceQuote("");
      setOfficialUrl("");
      await load();
      setMessage("Text correction saved locally as a draft proposal.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [documentId]);

  return (
    <section className="panel document-intelligence">
      <div className="section-toolbar">
        <div>
          <h3>Document Text Intelligence</h3>
          <p className="muted">Raw extracted text stays immutable. Corrections are local proposals.</p>
        </div>
        <div className="button-row">
          <a className="button secondary small" href={`/?tab=reviews&entityType=document&entityId=${encodeURIComponent(documentId)}`}>
            Review queue
          </a>
          <button type="button" className="button secondary small" onClick={() => void load()} disabled={busy}>
            Refresh
          </button>
          <button type="button" className="button small" onClick={() => void handleParse()} disabled={busy}>
            Parse
          </button>
        </div>
      </div>
      {message ? <p className="message">{message}</p> : null}
      {!payload ? <p className="muted">No document text payload loaded.</p> : null}
      {payload ? (
        <>
          <div className="entity-overview">
            <Metric label="Text chars" value={payload.rawTextLength.toLocaleString()} />
            <Metric label="Sections" value={payload.parse.sections.length.toLocaleString()} />
            <Metric label="Citations" value={payload.parse.citations.length.toLocaleString()} />
            <Metric label="Corrections" value={payload.corrections.length.toLocaleString()} />
          </div>
          {payload.health.warnings.length ? (
            <div className="banner warn">
              {payload.health.warnings.map((warning) => (
                <span key={warning} className="status-pill">
                  {warning}
                </span>
              ))}
            </div>
          ) : null}

          <details className="details-panel" open>
            <summary>Raw stored text</summary>
            <pre>{clip(payload.rawText || "No stored text.", 12000)}</pre>
          </details>

          <div className="two-column">
            <section>
              <h4>Parsed Sections</h4>
              <div className="record-list compact">
                {payload.parse.sections.slice(0, 80).map((section) => (
                  <article className="record-card" key={section.id}>
                    <strong>{section.heading}</strong>
                    <span className="status-pill">{section.kind}</span>
                    <p className="muted">{section.wordCount} words</p>
                    <p>{clip(section.text, 700)}</p>
                  </article>
                ))}
                {payload.parse.sections.length === 0 ? <p className="muted">No sections parsed yet.</p> : null}
              </div>
            </section>
            <section>
              <h4>Citations</h4>
              <div className="record-list compact">
                {payload.parse.citations.slice(0, 80).map((citation) => (
                  <article className="record-card" key={citation.id}>
                    <strong>{citation.rawText}</strong>
                    <span className="status-pill">{citation.citationType}</span>
                    <p className="muted">{citation.normalizedTarget}</p>
                    <p>{citation.snippet}</p>
                    <a className="link-button" href={`/?tab=reviews&queue=citations&q=${encodeURIComponent(citation.id)}`}>
                      Review citation
                    </a>
                  </article>
                ))}
                {payload.parse.citations.length === 0 ? <p className="muted">No citations extracted yet.</p> : null}
              </div>
            </section>
          </div>

          <section className="proposal-form">
            <h4>Local Text Correction</h4>
            <label className="field">
              <span>Corrected text</span>
              <textarea value={correctedText} onChange={(event) => setCorrectedText(event.currentTarget.value)} placeholder="Paste corrected text or leave blank and add an annotation." />
            </label>
            <label className="field">
              <span>Correction note</span>
              <textarea value={correctionNote} onChange={(event) => setCorrectionNote(event.currentTarget.value)} placeholder="What is wrong with the extracted text?" />
            </label>
            <label className="field">
              <span>Evidence quote</span>
              <textarea value={evidenceQuote} onChange={(event) => setEvidenceQuote(event.currentTarget.value)} placeholder="Exact quote from the raw text or official source." />
            </label>
            <label className="field">
              <span>Official URL, optional</span>
              <input value={officialUrl} onChange={(event) => setOfficialUrl(event.currentTarget.value)} />
            </label>
            <button type="button" className="button" onClick={() => void submitCorrection()} disabled={busy}>
              Save local correction
            </button>
          </section>

          {payload.corrections.length ? (
            <section>
              <h4>Correction Versions</h4>
              <div className="record-list compact">
                {payload.corrections.map((correction) => (
                  <article className="record-card" key={correction.id}>
                    <strong>{correction.id}</strong>
                    <span className="status-pill">{correction.status}</span>
                    <blockquote>{correction.evidenceQuote}</blockquote>
                    {correction.correctionNote ? <p>{correction.correctionNote}</p> : null}
                    {correction.proposalId ? <code>{correction.proposalId}</code> : null}
                    <a className="link-button" href={`/?tab=reviews&queue=text_corrections&q=${encodeURIComponent(correction.id)}`}>
                      Review correction
                    </a>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
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

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}
