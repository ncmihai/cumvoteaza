import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { createTaxonomyLabel, getEvidenceProfile, getTaxonomy } from "../api";
import type { EvidenceProfile, TaxonomyPayload } from "../types";

export function AnalyticsLab(): ReactElement {
  const [taxonomy, setTaxonomy] = useState<TaxonomyPayload | null>(null);
  const [entityType, setEntityType] = useState("bill");
  const [entityId, setEntityId] = useState("");
  const [topicCode, setTopicCode] = useState("");
  const [stanceCode, setStanceCode] = useState("unknown");
  const [evidenceQuote, setEvidenceQuote] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("draft");
  const [profile, setProfile] = useState<EvidenceProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    const nextTaxonomy = await getTaxonomy();
    setTaxonomy(nextTaxonomy);
    setTopicCode((current) => current || nextTaxonomy.topics[0]?.code || "");
  }

  async function submitLabel(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await createTaxonomyLabel({
        entityType,
        entityId,
        topicCode,
        stanceCode,
        evidenceQuote: evidenceQuote || undefined,
        sourceId: sourceId || undefined,
        status
      });
      setEvidenceQuote("");
      setSourceId("");
      setMessage("Taxonomy label saved locally.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadProfile(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setProfile(await getEvidenceProfile({ entityType, entityId }));
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
          <p className="eyebrow">Internal only, coverage-gated</p>
          <h2>Taxonomy + Analytics</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void load()} disabled={busy}>
          Refresh taxonomy
        </button>
      </header>

      <div className="two-column">
        <section className="panel">
          <h3>Reviewed Label</h3>
          <div className="form-grid">
            <label className="field">
              <span>Entity type</span>
              <select value={entityType} onChange={(event) => setEntityType(event.currentTarget.value)}>
                <option value="bill">Bill</option>
                <option value="vote">Vote</option>
                <option value="document">Document</option>
                <option value="member">Member</option>
                <option value="party">Party</option>
              </select>
            </label>
            <label className="field">
              <span>Entity ID</span>
              <input value={entityId} onChange={(event) => setEntityId(event.currentTarget.value)} />
            </label>
            <label className="field">
              <span>Topic</span>
              <select value={topicCode} onChange={(event) => setTopicCode(event.currentTarget.value)}>
                {taxonomy?.topics.map((topic) => (
                  <option key={topic.code} value={topic.code}>
                    {topic.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Stance/effect</span>
              <select value={stanceCode} onChange={(event) => setStanceCode(event.currentTarget.value)}>
                {taxonomy?.stances.map((stance) => (
                  <option key={stance.code} value={stance.code}>
                    {stance.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
                <option value="draft">Draft</option>
                <option value="reviewed">Reviewed</option>
                <option value="accepted">Accepted</option>
              </select>
            </label>
            <label className="field">
              <span>Source ID</span>
              <input value={sourceId} onChange={(event) => setSourceId(event.currentTarget.value)} placeholder="document id, vote id, source claim id..." />
            </label>
          </div>
          <label className="field">
            <span>Evidence quote</span>
            <textarea value={evidenceQuote} onChange={(event) => setEvidenceQuote(event.currentTarget.value)} placeholder="Exact source text used for this label." />
          </label>
          <div className="button-row">
            <button type="button" className="button" onClick={() => void submitLabel()} disabled={busy || !entityId.trim() || !topicCode}>
              Save label
            </button>
            <button type="button" className="button secondary" onClick={() => void loadProfile()} disabled={busy || !entityId.trim()}>
              Compute profile
            </button>
            <a className="button secondary" href={`/?tab=reviews&queue=taxonomy_labels&entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`}>
              Review labels
            </a>
          </div>
          {message ? <p className="message">{message}</p> : null}
          {status !== "draft" && !evidenceQuote.trim() ? <p className="muted">Reviewed/accepted labels require evidence.</p> : null}
          {status !== "draft" && !sourceId.trim() ? <p className="muted">Reviewed/accepted labels require a source ID.</p> : null}
        </section>

        <section className="panel">
          <h3>Taxonomy</h3>
          <p className="muted">{taxonomy?.reviewedLabelCount ?? 0} reviewed labels stored locally.</p>
          <div className="record-list compact">
            {taxonomy?.topics.map((topic) => (
              <article className="record-card" key={topic.code}>
                <strong>{topic.label}</strong>
                <code>{topic.code}</code>
                {topic.capCode ? <span className="status-pill">CAP {topic.capCode}</span> : null}
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <h3>Evidence Profile</h3>
        {!profile ? <p className="muted">Compute a profile from accepted/reviewed local labels and vote context.</p> : null}
        {profile ? (
          <>
            <div className="entity-overview">
              <Metric label="Reviewed labels" value={String(profile.coverage.reviewedLabelCount ?? 0)} />
              <Metric label="Votes" value={String(profile.coverage.voteCount ?? 0)} />
              <Metric label="Confidence" value={String(profile.coverage.confidence ?? "unknown")} />
            </div>
            <div className="two-column">
              <CountPanel title="Topics" counts={profile.topicCounts} />
              <CountPanel title="Stances" counts={profile.stanceCounts} />
            </div>
            <h4>Party discipline / vote buckets</h4>
            <div className="record-list compact">
              {profile.partyDiscipline.map((row, index) => (
                <article className="record-card" key={index}>
                  <strong>{String(row.bucket ?? "unknown")}</strong>
                  <p>{String(row.voteCount ?? 0)} votes</p>
                  <span className="status-pill">{String(row.share ?? 0)}</span>
                </article>
              ))}
              {profile.partyDiscipline.length === 0 ? <p className="muted">No vote-context profile yet.</p> : null}
            </div>
          </>
        ) : null}
      </section>
    </section>
  );
}

function CountPanel({ title, counts }: { title: string; counts: Record<string, number> }): ReactElement {
  const entries = Object.entries(counts);
  return (
    <section>
      <h4>{title}</h4>
      <div className="record-list compact">
        {entries.map(([key, value]) => (
          <article className="record-card" key={key}>
            <strong>{key}</strong>
            <span className="status-pill">{value}</span>
          </article>
        ))}
        {entries.length === 0 ? <p className="muted">Insufficient reviewed data.</p> : null}
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
