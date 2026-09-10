import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { getWikiEntity, searchWiki } from "../api";
import type { WikiRecord } from "../types";

const entityTypes = [
  { value: "", label: "All" },
  { value: "party", label: "Parties" },
  { value: "member", label: "Members" },
  { value: "bill", label: "Bills" },
  { value: "vote", label: "Votes" },
  { value: "document", label: "Documents" },
  { value: "group", label: "Groups" },
  { value: "government", label: "Governments" },
  { value: "data_health_review", label: "Data health" }
];

interface WikiSearchProps {
  onOpenEntity?: (entityType: string, entityId: string) => void;
}

export function WikiSearch({ onOpenEntity }: WikiSearchProps): ReactElement {
  const [query, setQuery] = useState(() => initialSearchParam("q"));
  const [entityType, setEntityType] = useState(() => initialSearchParam("type"));
  const [results, setResults] = useState<WikiRecord[]>([]);
  const [selected, setSelected] = useState<WikiRecord | null>(null);
  const [message, setMessage] = useState<string | null>("Build the wiki from the dashboard, then search names, bills, parties, groups, or vote text.");
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);

  useEffect(() => {
    if (query.trim().length >= 2) void handleSearch();
  }, []);

  async function handleSearch(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      updateSearchUrl(query, entityType);
      const rows = await searchWiki(query, entityType || undefined);
      setResults(rows);
      setSelected(rows[0] ?? null);
      if (rows.length === 0) setMessage("No records matched. Try a bill identifier, party name, person name, or Romanian keyword.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function openEntity(nextEntityType: string, entityId: string): Promise<void> {
    setDetailBusy(true);
    setMessage(null);
    try {
      setSelected(await getWikiEntity(nextEntityType, entityId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDetailBusy(false);
    }
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Generated local knowledge base</p>
          <h2>Wiki Search</h2>
        </div>
      </header>

      <div className="search-row">
        <select aria-label="Entity type" value={entityType} onChange={(event) => setEntityType(event.currentTarget.value)}>
          {entityTypes.map((item) => (
            <option key={item.value || "all"} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search PL-x, L316, party, member, vote, committee..."
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleSearch();
          }}
        />
        <button type="button" className="button" onClick={() => void handleSearch()} disabled={busy || query.trim().length < 2}>
          {busy ? "Searching..." : "Search"}
        </button>
      </div>

      {message ? <p className="message">{message}</p> : null}
      <div className="wiki-browser">
        <section className="panel">
          <h3>Results</h3>
          <div className="result-list compact-results">
            {results.map((record) => (
              <article
                className={selected?.id === record.id ? "result-row active" : "result-row"}
                key={record.id}
              >
                <span className="entity-type">{record.entityType}</span>
                <a
                  className="result-title-link"
                  href={entityHref(record)}
                  onClick={(event) => {
                    if (!onOpenEntity) return;
                    event.preventDefault();
                    onOpenEntity(record.entityType, record.entityId);
                  }}
                >
                  {record.title}
                </a>
                <span>{clip(record.summary, 180)}</span>
                <code>{record.entityId}</code>
                <div className="result-actions">
                  <button type="button" className="button secondary small" onClick={() => setSelected(record)}>
                    Preview
                  </button>
                  <a
                    className="button small entity-open-link"
                    href={entityHref(record)}
                    onClick={(event) => {
                      if (!onOpenEntity) return;
                      event.preventDefault();
                      onOpenEntity(record.entityType, record.entityId);
                    }}
                  >
                    Open page
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>Entity Page</h3>
          {detailBusy ? <p className="muted">Loading entity...</p> : null}
          {selected ? <EntityPage record={selected} onOpenEntity={(type, id) => void openEntity(type, id)} /> : <p className="muted">Select a result to inspect facts, sources, and local references.</p>}
          {selected && onOpenEntity ? (
            <button type="button" className="button" onClick={() => onOpenEntity(selected.entityType, selected.entityId)}>
              Open full entity page
            </button>
          ) : null}
        </section>
      </div>
    </section>
  );
}

interface EntityPageProps {
  record: WikiRecord;
  onOpenEntity: (entityType: string, entityId: string) => void;
}

function EntityPage({ record, onOpenEntity }: EntityPageProps): ReactElement {
  return (
    <article className="entity-page">
      <header>
        <span className="entity-type">{record.entityType}</span>
        <h3>{record.title}</h3>
        <p>{record.summary}</p>
        <code>{record.entityId}</code>
      </header>
      <div className="tag-list">
        {record.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <pre>{record.body}</pre>
      <RelatedReferences relatedIds={record.relatedIds ?? {}} onOpenEntity={onOpenEntity} />
      {record.sourceUrls.length > 0 ? (
        <footer className="source-list">
          <h4>Sources</h4>
          {record.sourceUrls.slice(0, 12).map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          ))}
        </footer>
      ) : null}
    </article>
  );
}

interface RelatedReferencesProps {
  relatedIds: Record<string, string[]>;
  onOpenEntity: (entityType: string, entityId: string) => void;
}

function RelatedReferences({ relatedIds, onOpenEntity }: RelatedReferencesProps): ReactElement | null {
  const entries = Object.entries(relatedIds).flatMap(([type, ids]) => ids.map((id) => ({ type: singularType(type), id }))).filter((item) => Boolean(item.id));
  if (entries.length === 0) return null;
  return (
    <section className="related-list">
      <h4>References</h4>
      <div>
        {entries.slice(0, 80).map(({ type, id }) => (
          <a
            key={`${type}:${id}`}
            className="button secondary small"
            href={entityPath(type, id)}
            onClick={(event) => {
              event.preventDefault();
              onOpenEntity(type, id);
            }}
          >
            {type}: {id}
          </a>
        ))}
      </div>
    </section>
  );
}

function singularType(value: string): string {
  const normalized = value.replace(/s$/, "");
  if (normalized === "documents") return "document";
  if (normalized === "votes") return "vote";
  if (normalized === "groups") return "group";
  return normalized;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

function entityHref(record: WikiRecord): string {
  return entityPath(record.entityType, record.entityId);
}

function entityPath(entityType: string, entityId: string): string {
  return `/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

function initialSearchParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function updateSearchUrl(query: string, entityType: string): void {
  const params = new URLSearchParams(window.location.search);
  params.set("tab", "wiki");
  const normalizedQuery = query.trim();
  if (normalizedQuery) params.set("q", normalizedQuery);
  else params.delete("q");
  if (entityType) params.set("type", entityType);
  else params.delete("type");
  window.history.replaceState({}, "", `/?${params.toString()}`);
}
