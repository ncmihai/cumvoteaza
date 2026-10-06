"use client";

import { Search } from "lucide-react";
import { useState } from "react";

interface SearchResult {
  documentId: string;
  label: string;
  documentKind: string;
  snippets: string[];
}

export function BillTextSearch({
  billId,
  labels
}: {
  billId: string;
  labels: {
    title: string;
    placeholder: string;
    search: string;
    empty: string;
    noQuery: string;
    loading: string;
    failed: string;
  };
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "failed">("idle");

  async function runSearch() {
    if (query.trim().length < 2) return;
    setState("loading");
    try {
      const response = await fetch(`/api/bills/${encodeURIComponent(billId)}/text-search?q=${encodeURIComponent(query.trim())}`);
      const json = await response.json() as { results?: SearchResult[] };
      setResults(json.results ?? []);
      setState(response.ok ? "loaded" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <section className="border border-slate-300 bg-white p-4 rounded-card">
      <h2 className="font-semibold text-slate-950">{labels.title}</h2>
      <div className="mt-3 flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 border border-slate-300 px-3 py-2">
          <Search size={16} className="text-slate-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runSearch();
            }}
            placeholder={labels.placeholder}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
          />
        </div>
        <button type="button" onClick={runSearch} className="border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-medium text-white">
          {labels.search}
        </button>
      </div>
      {state === "idle" ? <p className="mt-3 text-xs leading-5 text-slate-500">{labels.noQuery}</p> : null}
      {state === "loading" ? <p className="mt-3 text-sm text-slate-600">{labels.loading}</p> : null}
      {state === "failed" ? <p className="mt-3 text-sm text-slate-600">{labels.failed}</p> : null}
      {state === "loaded" && results.length === 0 ? <p className="mt-3 text-sm text-slate-600">{labels.empty}</p> : null}
      {results.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {results.map((result) => (
            <div key={result.documentId} className="border border-slate-200 px-3 py-2 text-sm">
              <div className="font-medium text-slate-950">{result.label}</div>
              <div className="mt-1 text-xs uppercase text-slate-500">{result.documentKind}</div>
              <div className="mt-2 space-y-2">
                {result.snippets.map((snippet, index) => (
                  <p key={`${result.documentId}-${index}`} className="leading-6 text-slate-700">{snippet}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
