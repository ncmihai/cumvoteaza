import { useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { searchWiki } from "../api";
import type { StatusPayload, WikiRecord } from "../types";

const entityTypes = [
  { value: "", label: "All" },
  { value: "bill", label: "Bills" },
  { value: "member", label: "Members" },
  { value: "party", label: "Parties" },
  { value: "vote", label: "Votes" },
  { value: "document", label: "Documents" },
  { value: "group", label: "Groups" },
  { value: "government", label: "Governments" }
];

interface CommandBarProps {
  routeLabel: string;
  status: StatusPayload | null;
  quickActions: Array<{ id: string; label: string }>;
  onNavigateTab: (tabId: string) => void;
  onOpenEntity: (entityType: string, entityId: string) => void;
}

export function CommandBar({ routeLabel, status, quickActions, onNavigateTab, onOpenEntity }: CommandBarProps): ReactElement {
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("");
  const [results, setResults] = useState<WikiRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSearch(): Promise<void> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setMessage("Type at least 2 characters.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const rows = entityType ? await searchWiki(trimmed, entityType) : await prioritySearch(trimmed);
      setResults(rows.slice(0, 6));
      if (rows.length === 0) setMessage("No local wiki match.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") void handleSearch();
    if (event.key === "Escape") {
      setResults([]);
      setMessage(null);
    }
  }

  function openResult(record: WikiRecord): void {
    setResults([]);
    setQuery(record.title);
    onOpenEntity(record.entityType, record.entityId);
  }

  return (
    <header className="workspace-topbar">
      <div className="route-context">
        <span className="eyebrow">Current workspace</span>
        <strong>{routeLabel}</strong>
      </div>

      <div className="command-search">
        <select aria-label="Global search type" value={entityType} onChange={(event) => setEntityType(event.currentTarget.value)}>
          {entityTypes.map((type) => (
            <option key={type.value || "all"} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          placeholder="Jump to bill, person, party, vote..."
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="button" onClick={() => void handleSearch()} disabled={busy}>
          {busy ? "Searching..." : "Jump"}
        </button>
        {results.length > 0 || message ? (
          <div className="command-results">
            {message ? <p className="muted">{message}</p> : null}
            {results.map((record) => (
              <a
                key={record.id}
                href={entityPath(record.entityType, record.entityId)}
                onClick={(event) => {
                  event.preventDefault();
                  openResult(record);
                }}
              >
                <span className="entity-type">{record.entityType}</span>
                <strong>{record.title}</strong>
                <small>{record.entityId}</small>
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <div className="topbar-actions">
        {quickActions.map((action) => (
          <button key={action.id} type="button" className="button secondary small" onClick={() => onNavigateTab(action.id)}>
            {action.label}
          </button>
        ))}
      </div>

      <div className="topbar-status" aria-label="Connector status">
        <CompactStatus ok={Boolean(status?.database.ok)} label="DB" />
        <CompactStatus ok={Boolean(status?.ollama.ok)} label="Model" />
        <CompactStatus ok={Boolean(status?.workbenchState?.ok)} label="State" />
        <span className="write-mode">{status?.writeMode?.enabled ? "writes enabled" : "local/read-only"}</span>
      </div>
    </header>
  );
}

async function prioritySearch(query: string): Promise<WikiRecord[]> {
  const [parties, members, bills, votes, all] = await Promise.all([
    searchWiki(query, "party"),
    searchWiki(query, "member"),
    searchWiki(query, "bill"),
    searchWiki(query, "vote"),
    searchWiki(query)
  ]);
  return dedupeRecords([...parties.slice(0, 4), ...members.slice(0, 4), ...bills.slice(0, 6), ...votes.slice(0, 4), ...all]);
}

function dedupeRecords(records: WikiRecord[]): WikiRecord[] {
  const seen = new Set<string>();
  const result: WikiRecord[] = [];
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    result.push(record);
  }
  return result;
}

function CompactStatus({ ok, label }: { ok: boolean; label: string }): ReactElement {
  return <span className={ok ? "compact-status ok" : "compact-status"}>{label}</span>;
}

function entityPath(entityType: string, entityId: string): string {
  return `/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}
