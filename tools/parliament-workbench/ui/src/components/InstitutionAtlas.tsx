import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { askInstitutionAtlas, getInstitution, getInstitutionProcedureGraph, getInstitutions } from "../api";
import type { InstitutionAnswer, InstitutionEntity, InstitutionEvent, InstitutionExample, InstitutionTerm, ProcedureNode, ProcedureTransition } from "../types";

const institutionCategories = ["parliament", "executive", "ministry", "presidency", "constitutional_review", "publication", "advisory"];

export function InstitutionAtlas(): ReactElement {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [institutions, setInstitutions] = useState<InstitutionEntity[]>([]);
  const [selectedId, setSelectedId] = useState("institution-parliament");
  const [selected, setSelected] = useState<InstitutionEntity | null>(null);
  const [nodes, setNodes] = useState<ProcedureNode[]>([]);
  const [transitions, setTransitions] = useState<ProcedureTransition[]>([]);
  const [question, setQuestion] = useState("Ce poate face Presedintele dupa adoptarea unei legi?");
  const [answer, setAnswer] = useState<InstitutionAnswer | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshList(): Promise<void> {
    setInstitutions(await getInstitutions(query, category));
  }

  async function refreshSelected(id: string): Promise<void> {
    setSelectedId(id);
    setSelected(await getInstitution(id));
  }

  async function refreshGraph(): Promise<void> {
    const graph = await getInstitutionProcedureGraph();
    setNodes(graph.nodes);
    setTransitions(graph.transitions);
  }

  async function handleAsk(): Promise<void> {
    setMessage(null);
    try {
      setAnswer(await askInstitutionAtlas(question));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void refreshList();
  }, [query, category]);

  useEffect(() => {
    void Promise.all([refreshSelected(selectedId), refreshGraph()]);
  }, []);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Cited institutional graph</p>
          <h2>Institution Atlas</h2>
        </div>
      </header>

      <div className="panel-grid wide">
        <section className="panel">
          <h3>Institutions</h3>
          <div className="search-row">
            <select value={category} onChange={(event) => setCategory(event.currentTarget.value)}>
              <option value="">All categories</option>
              {institutionCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search Parliament, CCR, President..." />
          </div>
          <div className="result-list compact-results">
            {institutions.map((institution) => (
              <button
                key={institution.id}
                type="button"
                className={institution.id === selectedId ? "result-row active" : "result-row"}
                onClick={() => void refreshSelected(institution.id)}
              >
                <span className="badge">{institution.category}</span>
                <strong>{institution.name}</strong>
                <span>{institution.summary}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>{selected?.name ?? "Select institution"}</h3>
          {selected ? (
            <>
              <p>{selected.summary}</p>
              <p className="muted">{selected.body}</p>
              <dl className="detail-list">
                <dt>Status</dt>
                <dd>{selected.status}</dd>
                <dt>Temporal</dt>
                <dd>{selected.temporalScope}</dd>
                <dt>Confidence</dt>
                <dd>{selected.sourceConfidence}</dd>
              </dl>
              <h4>Official Sources</h4>
              <ul className="source-list">
                {(selected.sources ?? []).map((source) => (
                  <li key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                    <span>{source.citationNote}</span>
                  </li>
                ))}
              </ul>
              <InstitutionTerms terms={selected.terms ?? []} />
              <InstitutionEvents events={selected.events ?? []} />
              <InstitutionExamples examples={selected.examples ?? []} />
            </>
          ) : (
            <p className="muted">Loading...</p>
          )}
        </section>
      </div>

      <section className="panel">
        <h3>Procedure Graph</h3>
        <div className="procedure-grid">
          {nodes.map((node) => (
            <div key={node.id} className="procedure-node">
              <span>{node.stageOrder}</span>
              <strong>{node.label}</strong>
              <p>{node.description}</p>
            </div>
          ))}
        </div>
        <h4>Transitions</h4>
        <div className="transition-list">
          {transitions.map((transition) => (
            <div key={transition.id}>
              <code>{transition.fromNodeId}</code>
              <span>{" -> "}</span>
              <code>{transition.toNodeId}</code>
              <strong>{transition.conditionLabel}</strong>
              <p className="muted">{transition.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Grounded Q&A</h3>
        <p className="muted">The answer is constrained to seeded official-source references. Missing facts should stay unknown until reviewed.</p>
        <div className="search-row">
          <input value={question} onChange={(event) => setQuestion(event.currentTarget.value)} />
          <button type="button" className="button" onClick={() => void handleAsk()}>
            Ask
          </button>
        </div>
        {message ? <p className="message">{message}</p> : null}
        {answer ? (
          <div className="result">
            <pre>{answer.answer}</pre>
            <h4>Citations</h4>
            <ul className="source-list">
              {answer.citations.map((source) => (
                <li key={source.id}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  <span>{source.citationNote}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function InstitutionTerms({ terms }: { terms: InstitutionTerm[] }): ReactElement | null {
  if (!terms.length) return null;
  return (
    <>
      <h4>Temporal Roles</h4>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Holder</th>
              <th>Period</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((term) => (
              <tr key={term.id}>
                <td>{term.roleType}</td>
                <td>{term.holderName}</td>
                <td>
                  {term.startsOn ?? "unknown"} - {term.endsOn ?? "present/unknown"}
                </td>
                <td>{term.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InstitutionEvents({ events }: { events: InstitutionEvent[] }): ReactElement | null {
  if (!events.length) return null;
  return (
    <>
      <h4>Rules And Events</h4>
      <div className="transition-list">
        {events.map((event) => (
          <div key={event.id}>
            <code>{event.eventType}</code>
            <strong>{event.title}</strong>
            <p>{event.description}</p>
            <p className="muted">
              {event.occurredOn ?? "undated"} - {event.status}
            </p>
            {event.sourceUrl ? (
              <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                Official source
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

function InstitutionExamples({ examples }: { examples: InstitutionExample[] }): ReactElement | null {
  if (!examples.length) return null;
  return (
    <>
      <h4>Observed Bill Examples</h4>
      <div className="transition-list">
        {examples.map((example) => (
          <div key={example.id}>
            <strong>{example.title}</strong>
            <p>{example.description}</p>
            <p className="muted">
              {example.billId ?? "unknown bill"} - {example.status}
            </p>
            {example.sourceUrl ? (
              <a href={example.sourceUrl} target="_blank" rel="noreferrer">
                Official source
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
