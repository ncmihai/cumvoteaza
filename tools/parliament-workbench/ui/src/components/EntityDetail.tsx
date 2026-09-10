import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  createProposal,
  createSourceClaim,
  getEntityDetail,
  getSourceClaims,
  getSourceConflicts,
  previewProposalCommand,
  rejectProposal,
  reviewProposal,
  updateProposal,
  updateSourceConflict
} from "../api";
import type { CommandPreview, EntityDetail as EntityDetailPayload, LocalProposal, SourceClaim, SourceConflict } from "../types";
import { DocumentDiffPanel } from "./DocumentDiffPanel";
import { DocumentIntelligencePanel } from "./DocumentIntelligencePanel";

type InspectorTabId = "references" | "sources" | "assets" | "health" | "suggestions" | "proposals";

interface EntityDetailProps {
  entityType: string;
  entityId: string;
  onOpenEntity: (entityType: string, entityId: string) => void;
  onBackToSearch: () => void;
}

export function EntityDetail({ entityType, entityId, onOpenEntity, onBackToSearch }: EntityDetailProps): ReactElement {
  const [detail, setDetail] = useState<EntityDetailPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [activeInspector, setActiveInspector] = useState<InspectorTabId>("proposals");

  async function load(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      setDetail(await getEntityDetail(entityType, entityId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setDetail(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [entityType, entityId]);

  if (busy) {
    return (
      <section className="screen">
        <p className="message">Loading entity...</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="screen">
        <button type="button" className="button secondary" onClick={onBackToSearch}>
          Back to search
        </button>
        <p className="message">{message ?? "Entity not found."}</p>
      </section>
    );
  }

  return (
    <section className="screen entity-screen">
      <header className="screen-header entity-hero">
        <div>
          <p className="eyebrow">{detail.entityType}</p>
          <h2>{detail.title}</h2>
          <p>{detail.summary || detail.subtitle}</p>
          <code>{detail.entityId}</code>
        </div>
        <div className="entity-actions">
          <button type="button" className="button secondary" onClick={onBackToSearch}>
            Search
          </button>
          <button type="button" className="button secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      {message ? <p className="message">{message}</p> : null}

      <div className="entity-grid">
        <main className="entity-main">
          <EntityOverview detail={detail} />
          <FactPanel facts={detail.facts} />
          {detail.entityType === "document" ? <DocumentIntelligencePanel documentId={detail.entityId} /> : null}
          {detail.entityType === "bill" ? <DocumentDiffPanel billId={detail.entityId} /> : null}
          <SectionPanels sections={detail.sections} onOpenEntity={onOpenEntity} />
        </main>

        <EntityInspector
          detail={detail}
          activeTab={activeInspector}
          onActiveTabChange={setActiveInspector}
          onOpenEntity={onOpenEntity}
          onChanged={() => void load()}
        />
      </div>
    </section>
  );
}

function EntityOverview({ detail }: { detail: EntityDetailPayload }): ReactElement {
  const sectionCount = Object.values(detail.sections).filter((rows) => rows.length > 0).length;
  const rowCount = Object.values(detail.sections).reduce((sum, rows) => sum + rows.length, 0);
  return (
    <section className="entity-overview" aria-label="Entity review summary">
      <SummaryMetric label="Sections" value={sectionCount.toLocaleString()} />
      <SummaryMetric label="Rows" value={rowCount.toLocaleString()} />
      <SummaryMetric label="Sources" value={detail.sourceUrls.length.toLocaleString()} />
      <SummaryMetric label="Assets" value={detail.assets.length.toLocaleString()} />
      <SummaryMetric label="Health" value={detail.healthIssues.length.toLocaleString()} tone={detail.healthIssues.length ? "warn" : "neutral"} />
      <SummaryMetric label="Proposals" value={detail.proposals.length.toLocaleString()} />
    </section>
  );
}

function SummaryMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" }): ReactElement {
  return (
    <div className={`summary-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EntityInspector({
  detail,
  activeTab,
  onActiveTabChange,
  onOpenEntity,
  onChanged
}: {
  detail: EntityDetailPayload;
  activeTab: InspectorTabId;
  onActiveTabChange: (tab: InspectorTabId) => void;
  onOpenEntity: (type: string, id: string) => void;
  onChanged: () => void;
}): ReactElement {
  const tabs: Array<{ id: InspectorTabId; label: string; count: number }> = [
    { id: "proposals", label: "Proposals", count: detail.proposals.length },
    { id: "health", label: "Health", count: detail.healthIssues.length },
    { id: "sources", label: "Sources", count: detail.sourceUrls.length },
    { id: "references", label: "Refs", count: detail.references.length },
    { id: "assets", label: "Assets", count: detail.assets.length },
    { id: "suggestions", label: "Model", count: detail.suggestions.length }
  ];
  return (
    <aside className="entity-inspector" aria-label="Entity inspector">
      <nav className="inspector-tabs" aria-label="Entity inspector sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "inspector-tab active" : "inspector-tab"}
            onClick={() => onActiveTabChange(tab.id)}
          >
            <span>{tab.label}</span>
            <strong>{tab.count}</strong>
          </button>
        ))}
      </nav>
      <div className="inspector-content">
        {activeTab === "proposals" ? <ProposalPanel detail={detail} onChanged={onChanged} /> : null}
        {activeTab === "health" ? <HealthPanel issues={detail.healthIssues} /> : null}
        {activeTab === "sources" ? <SourcePanel detail={detail} /> : null}
        {activeTab === "references" ? <ReferencePanel references={detail.references} onOpenEntity={onOpenEntity} /> : null}
        {activeTab === "assets" ? <AssetPanel detail={detail} onOpenEntity={onOpenEntity} onChanged={onChanged} /> : null}
        {activeTab === "suggestions" ? <SuggestionPanel suggestions={detail.suggestions} /> : null}
      </div>
    </aside>
  );
}

function FactPanel({ facts }: { facts: Record<string, unknown> }): ReactElement {
  return (
    <section className="panel">
      <h3>Facts</h3>
      <dl className="fact-grid">
        {Object.entries(facts).map(([key, value]) => (
          <div key={key}>
            <dt>{labelize(key)}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SectionPanels({ sections, onOpenEntity }: { sections: Record<string, Array<Record<string, unknown>>>; onOpenEntity: (type: string, id: string) => void }): ReactElement {
  const entries = Object.entries(sections).filter(([, rows]) => rows.length > 0);
  if (entries.length === 0) {
    return (
      <section className="panel">
        <h3>Sections</h3>
        <p className="muted">No section data is available yet.</p>
      </section>
    );
  }
  return (
    <>
      {entries.map(([name, rows]) => (
        <SectionPanel key={name} name={name} rows={rows} onOpenEntity={onOpenEntity} />
      ))}
    </>
  );
}

function SectionPanel({ name, rows, onOpenEntity }: { name: string; rows: Array<Record<string, unknown>>; onOpenEntity: (type: string, id: string) => void }): ReactElement {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const filteredRows = rows.filter((row) => textMatches(filter, name, JSON.stringify(row)));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filteredRows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [filter, rows.length]);

  return (
    <section className="panel">
      <div className="section-toolbar">
        <div>
          <h3>
            {labelize(name)} <span className="muted">({rows.length})</span>
          </h3>
          <p className="muted">
            Showing {visibleRows.length} of {filteredRows.length} matching rows.
          </p>
        </div>
        <div className="pager">
          <button type="button" className="button secondary small" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>
            Prev
          </button>
          <span>
            {safePage + 1}/{pageCount}
          </span>
          <button type="button" className="button secondary small" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1}>
            Next
          </button>
        </div>
      </div>
      <InspectorFilter value={filter} onChange={setFilter} placeholder={`Filter ${labelize(name).toLowerCase()}...`} />
      <div className="record-list">
        {visibleRows.map((row, index) => (
          <article className="record-card" key={`${name}-${safePage}-${index}`}>
            <RecordTitle sectionName={name} row={row} onOpenEntity={onOpenEntity} />
            <dl>
              {Object.entries(row)
                .filter(([key]) => key !== "textExcerpt")
                .slice(0, 12)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{labelize(key)}</dt>
                    <dd>{renderMaybeLink(name, key, value, row, onOpenEntity)}</dd>
                  </div>
                ))}
            </dl>
            {typeof row.textExcerpt === "string" && row.textExcerpt ? <pre>{clip(row.textExcerpt, 2400)}</pre> : null}
          </article>
        ))}
        {visibleRows.length === 0 ? <p className="muted">No rows match this filter.</p> : null}
      </div>
    </section>
  );
}

function ReferencePanel({ references, onOpenEntity }: { references: Array<{ entityType: string; entityId: string; label: string }>; onOpenEntity: (type: string, id: string) => void }): ReactElement {
  const [filter, setFilter] = useState("");
  const filteredReferences = references.filter((reference) => textMatches(filter, reference.entityType, reference.entityId, reference.label));
  return (
    <section className="panel">
      <h3>References</h3>
      {references.length ? (
        <div className="related-list">
          <InspectorFilter value={filter} onChange={setFilter} placeholder="Filter references..." />
          {filteredReferences.slice(0, 120).map((reference) => (
            <EntityLink key={`${reference.entityType}:${reference.entityId}`} target={reference} onOpenEntity={onOpenEntity} className="button secondary small">
              {reference.entityType}: {reference.label}
            </EntityLink>
          ))}
          {filteredReferences.length === 0 ? <p className="muted">No references match this filter.</p> : null}
        </div>
      ) : (
        <p className="muted">No deterministic local references yet.</p>
      )}
    </section>
  );
}

function AssetPanel({ detail, onOpenEntity, onChanged }: { detail: EntityDetailPayload; onOpenEntity: (type: string, id: string) => void; onChanged: () => void }): ReactElement {
  const assets = detail.assets;
  const [filter, setFilter] = useState("");
  const filteredAssets = assets.filter((asset) =>
    textMatches(filter, asset.id, asset.assetType, asset.entityLabel, asset.documentLabel, asset.storagePath, asset.publicGatewayUrl, asset.fetchStatus)
  );
  return (
    <section className="panel">
      <h3>Assets</h3>
      <AssetIssueForm detail={detail} onChanged={onChanged} />
      {assets.length ? (
        <div className="record-list compact">
          <InspectorFilter value={filter} onChange={setFilter} placeholder="Filter assets..." />
          {filteredAssets.map((asset) => (
            <article className="record-card" key={asset.id}>
              <strong>{asset.assetType}</strong>
              <p>
                <AssetEntityLabel asset={asset} onOpenEntity={onOpenEntity} />
              </p>
              <code>{asset.id}</code>
              {asset.publicGatewayUrl ? (
                <a href={asset.publicGatewayUrl} target="_blank" rel="noreferrer">
                  gateway
                </a>
              ) : null}
              {asset.storagePath ? <code>{asset.storagePath}</code> : null}
            </article>
          ))}
          {filteredAssets.length === 0 ? <p className="muted">No assets match this filter.</p> : null}
        </div>
      ) : (
        <p className="muted">No local stored assets are linked to this entity.</p>
      )}
    </section>
  );
}

function HealthPanel({ issues }: { issues: Array<Record<string, unknown>> }): ReactElement {
  return (
    <section className="panel">
      <h3>Health</h3>
      {issues.length ? (
        issues.map((issue) => (
          <article className="record-card" key={String(issue.id ?? issue.issueKey)}>
            <strong>{formatValue(issue.issueType)}</strong>
            <p>{formatValue(issue.issueKey)}</p>
            <span className="status-pill">{formatValue(issue.status)}</span>
          </article>
        ))
      ) : (
        <p className="muted">No health issues are currently attached to this entity.</p>
      )}
    </section>
  );
}

function SuggestionPanel({ suggestions }: { suggestions: EntityDetailPayload["suggestions"] }): ReactElement {
  return (
    <section className="panel">
      <h3>Model Suggestions</h3>
      {suggestions.length ? (
        suggestions.slice(0, 20).map((suggestion) => (
          <article className="record-card" key={suggestion.id}>
            <strong>{suggestion.suggestionType}</strong>
            <p>{suggestion.explanation}</p>
            {suggestion.evidenceQuote ? <blockquote>{suggestion.evidenceQuote}</blockquote> : null}
            <span className="status-pill">{suggestion.status}</span>
          </article>
        ))
      ) : (
        <p className="muted">No local model suggestions are linked yet.</p>
      )}
    </section>
  );
}

function SourcePanel({ detail }: { detail: EntityDetailPayload }): ReactElement {
  const [claims, setClaims] = useState<SourceClaim[]>([]);
  const [conflicts, setConflicts] = useState<SourceConflict[]>([]);
  const [filter, setFilter] = useState("");
  const [fieldPath, setFieldPath] = useState("status");
  const [value, setValue] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [evidenceQuote, setEvidenceQuote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const filteredClaims = claims.filter((claim) => textMatches(filter, claim.id, claim.fieldPath, claim.value, claim.sourceUrl, claim.sourceTitle, claim.evidenceQuote, claim.status));
  const filteredConflicts = conflicts.filter((conflict) => textMatches(filter, conflict.id, conflict.fieldPath, conflict.status, JSON.stringify(conflict.conflict)));
  const filteredSourceUrls = detail.sourceUrls.filter((url) => textMatches(filter, url));

  async function refreshClaims(): Promise<void> {
    const [nextClaims, nextConflicts] = await Promise.all([
      getSourceClaims({ entityType: detail.entityType, entityId: detail.entityId, limit: 200 }),
      getSourceConflicts({ entityType: detail.entityType, entityId: detail.entityId, limit: 100 })
    ]);
    setClaims(nextClaims);
    setConflicts(nextConflicts);
  }

  async function submitClaim(): Promise<void> {
    setMessage(null);
    try {
      await createSourceClaim({
        entityType: detail.entityType,
        entityId: detail.entityId,
        fieldPath,
        value,
        sourceUrl: sourceUrl || undefined,
        sourceTitle: sourceTitle || undefined,
        evidenceQuote: evidenceQuote || undefined,
        sourceType: "official",
        confidence: "official_reference",
        status: "open"
      });
      setValue("");
      setSourceUrl("");
      setSourceTitle("");
      setEvidenceQuote("");
      await refreshClaims();
      setMessage("Source claim saved locally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function transitionConflict(conflict: SourceConflict, status: "reviewed" | "resolved" | "ignored"): Promise<void> {
    setMessage(null);
    try {
      await updateSourceConflict(conflict.id, { status, reviewerNote: status === "resolved" ? "Resolved from entity inspector." : undefined });
      await refreshClaims();
      setMessage(`Conflict marked ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void refreshClaims();
  }, [detail.entityType, detail.entityId]);

  return (
    <section className="panel">
      <h3>Sources</h3>
      <InspectorFilter value={filter} onChange={setFilter} placeholder="Filter claims, conflicts, URLs..." />
      <div className="proposal-form compact-form">
        <label className="field">
          <span>Field path</span>
          <input value={fieldPath} onChange={(event) => setFieldPath(event.currentTarget.value)} />
        </label>
        <label className="field">
          <span>Claimed value</span>
          <input value={value} onChange={(event) => setValue(event.currentTarget.value)} />
        </label>
        <label className="field">
          <span>Official URL</span>
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.currentTarget.value)} />
        </label>
        <label className="field">
          <span>Source title</span>
          <input value={sourceTitle} onChange={(event) => setSourceTitle(event.currentTarget.value)} />
        </label>
        <label className="field">
          <span>Evidence quote</span>
          <textarea placeholder="Paste the exact source text that supports this claim" value={evidenceQuote} onChange={(event) => setEvidenceQuote(event.currentTarget.value)} />
        </label>
        <button type="button" className="button" onClick={() => void submitClaim()} disabled={!fieldPath.trim() || !value.trim()}>
          Save source claim
        </button>
      </div>
      {message ? <p className="message">{message}</p> : null}

      {conflicts.length ? (
        <>
          <h4>Local Conflicts</h4>
          <div className="record-list compact">
            {filteredConflicts.map((conflict) => (
              <article className="record-card conflict-card" key={conflict.id}>
                <strong>{conflict.fieldPath}</strong>
                <span className="status-pill">{conflict.status}</span>
                <p className="muted">Current fact: {formatValue(valueAtPath(detail.facts, conflict.fieldPath))}</p>
                <ConflictValues conflict={conflict} />
                <div className="button-row">
                  <button type="button" className="button secondary small" onClick={() => void transitionConflict(conflict, "reviewed")}>
                    Reviewed
                  </button>
                  <button type="button" className="button secondary small" onClick={() => void transitionConflict(conflict, "resolved")}>
                    Resolve
                  </button>
                  <button type="button" className="button secondary small" onClick={() => void transitionConflict(conflict, "ignored")}>
                    Ignore
                  </button>
                </div>
              </article>
            ))}
            {filteredConflicts.length === 0 ? <p className="muted">No conflicts match this filter.</p> : null}
          </div>
        </>
      ) : null}

      {claims.length ? (
        <>
          <h4>Local Claims</h4>
          <div className="record-list compact">
            {filteredClaims.slice(0, 50).map((claim) => (
              <article className="record-card" key={claim.id}>
                <strong>{claim.fieldPath}</strong>
                <p>{String(claim.value)}</p>
                <p className="muted">Current fact: {formatValue(valueAtPath(detail.facts, claim.fieldPath))}</p>
                <span className="status-pill">{claim.status}</span>
                {claim.evidenceQuote ? <blockquote>{claim.evidenceQuote}</blockquote> : <p className="muted">No evidence quote yet. Required before Review Center can accept this claim.</p>}
                {claim.sourceUrl ? (
                  <a href={claim.sourceUrl} target="_blank" rel="noreferrer">
                    {claim.sourceTitle || claim.sourceUrl}
                  </a>
                ) : null}
                <div className="button-row">
                  <a className="button secondary small" href={`/?tab=reviews&queue=source_claims&entityType=${encodeURIComponent(claim.entityType)}&entityId=${encodeURIComponent(claim.entityId)}&q=${encodeURIComponent(claim.id)}`}>
                    Review in Center
                  </a>
                </div>
              </article>
            ))}
            {filteredClaims.length === 0 ? <p className="muted">No source claims match this filter.</p> : null}
          </div>
        </>
      ) : null}

      {detail.sourceUrls.length ? (
        <div className="source-list">
          {filteredSourceUrls.slice(0, 40).map((url) => (
            <a href={url} key={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          ))}
          {filteredSourceUrls.length === 0 ? <p className="muted">No official source URLs match this filter.</p> : null}
        </div>
      ) : (
        <p className="muted">No source URLs are attached to this entity yet.</p>
      )}
    </section>
  );
}

function ConflictValues({ conflict }: { conflict: SourceConflict }): ReactElement {
  const values = conflictValueGroups(conflict);
  if (!values.length) {
    return <code>{JSON.stringify(conflict.conflict)}</code>;
  }
  return (
    <div className="conflict-values">
      {values.map((group) => (
        <article key={group.value}>
          <strong>{group.value}</strong>
          <span>{group.claims.length} claim(s)</span>
          {group.claims.slice(0, 3).map((claim) => (
            <p key={claim.id}>
              {claim.sourceTitle || claim.sourceUrl || claim.id} <span className="muted">({claim.status})</span>
            </p>
          ))}
        </article>
      ))}
    </div>
  );
}

function AssetIssueForm({ detail, onChanged }: { detail: EntityDetailPayload; onChanged: () => void }): ReactElement {
  const [assetId, setAssetId] = useState(detail.assets[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submitAssetIssue(): Promise<void> {
    setMessage(null);
    try {
      await createProposal({
        proposalType: "asset_issue",
        entityType: detail.entityType,
        entityId: detail.entityId,
        field: assetId ? `assets.${assetId}` : "assets",
        proposedValue: assetId ? `Asset ${assetId}: ${note}` : note,
        officialUrl: officialUrl || undefined,
        explanation: "Local asset issue created from the entity inspector."
      });
      setNote("");
      setOfficialUrl("");
      onChanged();
      setMessage("Asset issue proposal saved locally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="proposal-form compact-form">
      <h4>Create Asset Issue</h4>
      {detail.assets.length ? (
        <label className="field">
          <span>Asset</span>
          <select value={assetId} onChange={(event) => setAssetId(event.currentTarget.value)}>
            {detail.assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.assetType} - {asset.id}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field">
        <span>Issue</span>
        <textarea placeholder="Missing image, wrong logo, broken text artifact, missing metadata..." value={note} onChange={(event) => setNote(event.currentTarget.value)} />
      </label>
      <label className="field">
        <span>Official URL, optional</span>
        <input value={officialUrl} onChange={(event) => setOfficialUrl(event.currentTarget.value)} />
      </label>
      <button type="button" className="button secondary" onClick={() => void submitAssetIssue()} disabled={!note.trim()}>
        Save asset issue
      </button>
      {message ? <p className="message">{message}</p> : null}
    </div>
  );
}

function ProposalPanel({ detail, onChanged }: { detail: EntityDetailPayload; onChanged: () => void }): ReactElement {
  const [proposalType, setProposalType] = useState<LocalProposal["proposalType"]>("review_note");
  const [field, setField] = useState("");
  const [proposedValue, setProposedValue] = useState("");
  const [evidenceQuote, setEvidenceQuote] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [explanation, setExplanation] = useState("");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const submitBlocked = proposalSubmitBlocked(proposalType, field, proposedValue, evidenceQuote, explanation);
  const filteredProposals = detail.proposals.filter((proposal) =>
    textMatches(filter, proposal.id, proposal.status, proposal.proposalType, proposal.field, proposal.proposedValue, proposal.evidenceQuote, proposal.officialUrl, proposal.explanation)
  );

  async function submit(): Promise<void> {
    setMessage(null);
    if (submitBlocked) {
      setMessage(submitBlocked);
      return;
    }
    try {
      await createProposal({
        proposalType,
        entityType: detail.entityType,
        entityId: detail.entityId,
        field: field || undefined,
        proposedValue: proposedValue || explanation,
        evidenceQuote: evidenceQuote || undefined,
        officialUrl: officialUrl || undefined,
        explanation: explanation || undefined
      });
      setField("");
      setProposedValue("");
      setEvidenceQuote("");
      setOfficialUrl("");
      setExplanation("");
      onChanged();
      setMessage("Proposal saved locally.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function transition(proposal: LocalProposal, action: "review" | "accept" | "reject" | "preview"): Promise<void> {
    setMessage(null);
    try {
      if (action === "review") await reviewProposal(proposal.id);
      if (action === "accept") await updateProposal(proposal.id, { status: "accepted" });
      if (action === "reject") await rejectProposal(proposal.id);
      if (action === "preview") setPreview(await previewProposalCommand(proposal.id));
      if (action !== "preview") onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="panel proposal-panel">
      <h3>Local Proposals</h3>
      <div className="proposal-form">
        <label className="field">
          <span>Proposal type</span>
          <select value={proposalType} onChange={(event) => setProposalType(event.currentTarget.value as LocalProposal["proposalType"])}>
            <option value="review_note">Review note</option>
            <option value="field_correction">Field correction</option>
            <option value="relation_link">Relation link</option>
            <option value="text_annotation">Text annotation</option>
            <option value="procedure_event">Procedure event</option>
            <option value="duplicate_merge">Duplicate merge</option>
          </select>
        </label>
        <ProposalTypeHint proposalType={proposalType} />
        <label className="field">
          <span>{proposalType === "review_note" ? "Field path, optional" : "Field path"}</span>
          <input placeholder={fieldPlaceholder(proposalType)} value={field} onChange={(event) => setField(event.currentTarget.value)} />
        </label>
        <label className="field">
          <span>{proposedValueLabel(proposalType)}</span>
          <textarea placeholder={proposedValuePlaceholder(proposalType)} value={proposedValue} onChange={(event) => setProposedValue(event.currentTarget.value)} />
        </label>
        <label className="field">
          <span>Evidence quote</span>
          <textarea placeholder={evidencePlaceholder(proposalType)} value={evidenceQuote} onChange={(event) => setEvidenceQuote(event.currentTarget.value)} />
        </label>
        <label className="field">
          <span>Official URL, optional</span>
          <input placeholder="https://..." value={officialUrl} onChange={(event) => setOfficialUrl(event.currentTarget.value)} />
        </label>
        <label className="field">
          <span>Explanation</span>
          <textarea placeholder="Why this proposal should exist" value={explanation} onChange={(event) => setExplanation(event.currentTarget.value)} />
        </label>
        <button type="button" className="button" onClick={() => void submit()} disabled={Boolean(submitBlocked)}>
          Save structured proposal
        </button>
        {submitBlocked ? <p className="muted">{submitBlocked}</p> : null}
      </div>
      {message ? <p className="message">{message}</p> : null}
      {detail.proposals.length ? <InspectorFilter value={filter} onChange={setFilter} placeholder="Filter proposals..." /> : null}
      <div className="record-list compact">
        {filteredProposals.map((proposal) => (
          <article className="record-card" key={proposal.id}>
            <strong>{proposal.proposalType}</strong>
            <p>{proposal.explanation || formatValue(proposal.proposedValue)}</p>
            <span className="status-pill">{proposal.status}</span>
            {proposal.evidenceQuote ? <blockquote>{proposal.evidenceQuote}</blockquote> : null}
            <div className="button-row">
              <button type="button" className="button secondary small" onClick={() => void transition(proposal, "review")}>
                Review
              </button>
              <button type="button" className="button secondary small" onClick={() => void transition(proposal, "accept")}>
                Accept
              </button>
              <button type="button" className="button secondary small" onClick={() => void transition(proposal, "reject")}>
                Reject
              </button>
              <button type="button" className="button secondary small" onClick={() => void transition(proposal, "preview")}>
                Command
              </button>
            </div>
          </article>
        ))}
        {detail.proposals.length > 0 && filteredProposals.length === 0 ? <p className="muted">No proposals match this filter.</p> : null}
      </div>
      {preview ? (
        <article className="record-card command-preview">
          <strong>Command preview</strong>
          {preview.commands.length > 0 ? preview.commands.map((command) => <code key={command}>{command}</code>) : <p>No command available.</p>}
          {preview.expectedEffects.map((effect) => (
            <p key={effect}>{effect}</p>
          ))}
          <span className="status-pill">{preview.canExecute ? "write-ready" : "local-only"}</span>
        </article>
      ) : null}
    </section>
  );
}

function ProposalTypeHint({ proposalType }: { proposalType: LocalProposal["proposalType"] }): ReactElement {
  const hints: Record<LocalProposal["proposalType"], string> = {
    review_note: "A local note for yourself. It cannot become a canonical write until converted into a structured proposal.",
    field_correction: "Use for one factual field correction. Evidence quote is required before saving.",
    relation_link: "Use for deterministic links such as vote-to-bill or entity-to-entity relationships. Evidence quote is required.",
    text_annotation: "Use for OCR/text review notes tied to an excerpt or text location. Evidence quote is required.",
    asset_issue: "Use the Assets tab for asset-specific issues.",
    procedure_event: "Use for lifecycle events like reexamination, CCR, promulgation, or publication. Evidence quote is required.",
    duplicate_merge: "Use for duplicate lifecycle/entity merge plans. Evidence quote is required."
  };
  return <p className="muted">{hints[proposalType]}</p>;
}

function proposalSubmitBlocked(
  proposalType: LocalProposal["proposalType"],
  field: string,
  proposedValue: string,
  evidenceQuote: string,
  explanation: string
): string | null {
  const hasBody = Boolean(proposedValue.trim() || explanation.trim());
  if (!hasBody) return "Add a proposed value, annotation, or explanation.";
  if (proposalType !== "review_note" && !field.trim()) return "Structured proposals need a field path.";
  if (requiresEvidence(proposalType) && !evidenceQuote.trim()) return "Factual proposals need an evidence quote.";
  return null;
}

function requiresEvidence(proposalType: LocalProposal["proposalType"]): boolean {
  return ["field_correction", "relation_link", "text_annotation", "procedure_event", "duplicate_merge"].includes(proposalType);
}

function fieldPlaceholder(proposalType: LocalProposal["proposalType"]): string {
  if (proposalType === "field_correction") return "status, title, submittedOn, identifiers.deputies...";
  if (proposalType === "relation_link") return "linkedBillId, sponsors.0.memberId...";
  if (proposalType === "text_annotation") return "documents.<documentId>.text";
  if (proposalType === "procedure_event") return "procedure.reexamination, procedure.ccr, procedure.promulgation...";
  if (proposalType === "duplicate_merge") return "duplicates.mergePlan";
  return "Optional field path";
}

function proposedValueLabel(proposalType: LocalProposal["proposalType"]): string {
  if (proposalType === "review_note") return "Note";
  if (proposalType === "text_annotation") return "Annotation";
  if (proposalType === "procedure_event") return "Proposed event";
  if (proposalType === "relation_link") return "Target entity ID or relation";
  return "Proposed value";
}

function proposedValuePlaceholder(proposalType: LocalProposal["proposalType"]): string {
  if (proposalType === "review_note") return "Observation, question, or manual review note";
  if (proposalType === "text_annotation") return "Corrected text, suspicious OCR note, or annotation";
  if (proposalType === "procedure_event") return "eventType/date/description or short event payload";
  if (proposalType === "relation_link") return "bill-l129-2026, document-id, member-id...";
  if (proposalType === "duplicate_merge") return "Merge target and reason";
  return "Correct value";
}

function evidencePlaceholder(proposalType: LocalProposal["proposalType"]): string {
  if (proposalType === "review_note" || proposalType === "asset_issue") return "Optional supporting quote";
  return "Paste the exact source quote that supports this proposal";
}

function InspectorFilter({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }): ReactElement {
  return (
    <label className="field inspector-filter">
      <span>Filter</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function textMatches(filter: string, ...values: unknown[]): boolean {
  const needle = normalizeSearchText(filter);
  if (!needle) return true;
  return values.some((value) => normalizeSearchText(formatValue(value)).includes(needle));
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function valueAtPath(source: Record<string, unknown>, path: string): unknown {
  if (path in source) return source[path];
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

function conflictValueGroups(conflict: SourceConflict): Array<{ value: string; claims: SourceClaim[] }> {
  const claimsByValue = conflict.conflict.claimsByValue;
  if (!claimsByValue || typeof claimsByValue !== "object" || Array.isArray(claimsByValue)) return [];
  return Object.entries(claimsByValue)
    .map(([value, claims]) => ({
      value: displayConflictValue(value),
      claims: Array.isArray(claims) ? (claims.filter(isSourceClaimLike) as SourceClaim[]) : []
    }))
    .filter((group) => group.claims.length > 0);
}

function displayConflictValue(value: string): string {
  try {
    return formatValue(JSON.parse(value));
  } catch {
    return value;
  }
}

function isSourceClaimLike(value: unknown): value is SourceClaim {
  return Boolean(value && typeof value === "object" && "id" in value && "fieldPath" in value);
}

interface EntityTarget {
  entityType: string;
  entityId: string;
}

function RecordTitle({ sectionName, row, onOpenEntity }: { sectionName: string; row: Record<string, unknown>; onOpenEntity: (type: string, id: string) => void }): ReactElement {
  const title = recordTitle(row);
  const target = rowTitleTarget(sectionName, row);
  if (!target) return <strong>{title}</strong>;
  return (
    <strong>
      <EntityLink target={target} onOpenEntity={onOpenEntity} className="record-title-link">
        {title}
      </EntityLink>
    </strong>
  );
}

function renderMaybeLink(sectionName: string, key: string, value: unknown, row: Record<string, unknown>, onOpenEntity: (type: string, id: string) => void): ReactElement | string {
  const text = formatValue(value);
  if (!text || text === "unknown") return text;
  const target = fieldTarget(sectionName, key, text, row);
  if (!target) return text;
  return (
    <EntityLink target={target} onOpenEntity={onOpenEntity} className="inline-link">
      {text}
    </EntityLink>
  );
}

function keyToEntityType(key: string): string | null {
  if (key === "billId") return "bill";
  if (key === "voteId") return "vote";
  if (key === "memberId") return "member";
  if (key === "partyId") return "party";
  if (key === "groupId") return "group";
  if (key === "governmentId") return "government";
  if (key === "institutionId" || key === "actorEntityId") return "institution";
  if (key === "documentId" || key === "sourceDocumentId") return "document";
  return null;
}

function fieldTarget(sectionName: string, key: string, text: string, row: Record<string, unknown>): EntityTarget | null {
  const directType = keyToEntityType(key);
  if (directType) return { entityType: directType, entityId: text };

  if ((key === "partyName" || key === "partyShortName") && stringId(row.partyId)) {
    return { entityType: "party", entityId: stringId(row.partyId)! };
  }
  if ((key === "groupName" || key === "groupShortName") && stringId(row.groupId)) {
    return { entityType: "group", entityId: stringId(row.groupId)! };
  }
  if (key === "billTitle" && stringId(row.billId)) {
    return { entityType: "bill", entityId: stringId(row.billId)! };
  }
  if (key === "governmentName" && stringId(row.governmentId)) {
    return { entityType: "government", entityId: stringId(row.governmentId)! };
  }

  if (isNameLikeKey(key)) return rowTitleTarget(sectionName, row);
  return null;
}

function rowTitleTarget(sectionName: string, row: Record<string, unknown>): EntityTarget | null {
  const sectionTarget = sectionEntityTarget(sectionName, row);
  if (sectionTarget) return sectionTarget;

  for (const key of ["documentId", "voteId", "billId", "memberId", "partyId", "groupId", "governmentId", "institutionId", "actorEntityId", "sourceDocumentId"]) {
    const entityType = keyToEntityType(key);
    const entityId = stringId(row[key]);
    if (entityType && entityId) return { entityType, entityId };
  }
  return null;
}

function sectionEntityTarget(sectionName: string, row: Record<string, unknown>): EntityTarget | null {
  const entityType = sectionEntityType(sectionName);
  if (!entityType) return null;
  const entityId = ["documents", "members", "identityWarnings", "groups"].includes(sectionName) ? stringId(row.id) : stringId(row[`${entityType}Id`]);
  return entityId ? { entityType, entityId } : null;
}

function sectionEntityType(sectionName: string): string | null {
  if (sectionName === "documents") return "document";
  if (sectionName === "votes") return "vote";
  if (sectionName === "sponsors") return "member";
  if (sectionName === "groupMemberships" || sectionName === "groups") return "group";
  if (sectionName === "partyAffiliations") return "party";
  if (sectionName === "sponsoredBills" || sectionName === "bills") return "bill";
  if (sectionName === "members" || sectionName === "identityWarnings") return "member";
  if (sectionName === "governmentParticipations") return "government";
  return null;
}

function isNameLikeKey(key: string): boolean {
  return ["title", "label", "name", "displayName", "shortName"].includes(key);
}

function stringId(value: unknown): string | null {
  const text = formatValue(value);
  if (!text || text === "unknown") return null;
  return text;
}

function recordTitle(row: Record<string, unknown>): string {
  return formatValue(
    row.title ??
      row.label ??
      row.name ??
      row.displayName ??
      row.groupName ??
      row.partyName ??
      row.billTitle ??
      row.governmentName ??
      row.groupShortName ??
      row.partyShortName ??
      row.shortName ??
      row.id ??
      row.billId ??
      row.voteId
  );
}

function EntityLink({ target, onOpenEntity, className, children }: { target: EntityTarget; onOpenEntity: (type: string, id: string) => void; className?: string; children: ReactNode }): ReactElement {
  return (
    <a
      className={className}
      href={entityHref(target.entityType, target.entityId)}
      onClick={(event) => {
        event.preventDefault();
        onOpenEntity(target.entityType, target.entityId);
      }}
    >
      {children}
    </a>
  );
}

function AssetEntityLabel({ asset, onOpenEntity }: { asset: EntityDetailPayload["assets"][number]; onOpenEntity: (type: string, id: string) => void }): ReactElement | string {
  const label = asset.entityLabel ?? asset.documentLabel ?? asset.entityId;
  const target = assetEntityTarget(asset);
  if (!target) return label;
  return (
    <EntityLink target={target} onOpenEntity={onOpenEntity} className="inline-link">
      {label}
    </EntityLink>
  );
}

function assetEntityTarget(asset: EntityDetailPayload["assets"][number]): EntityTarget | null {
  if (asset.entityType === "member" || asset.entityType === "party" || asset.entityType === "bill" || asset.entityType === "vote" || asset.entityType === "group" || asset.entityType === "government") {
    return { entityType: asset.entityType, entityId: asset.entityId };
  }
  if (asset.entityType === "bill_document") {
    return { entityType: "document", entityId: asset.documentId ?? asset.entityId };
  }
  if (asset.documentId) return { entityType: "document", entityId: asset.documentId };
  if (asset.billId) return { entityType: "bill", entityId: asset.billId };
  return null;
}

function entityHref(entityType: string, entityId: string): string {
  return `/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

function labelize(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "unknown";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}
