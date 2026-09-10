import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { convertSuggestionToProposal, createAgentTaskPack, createModelRun, evaluateGoldSet, getModelPresets, getModelRuns, getSuggestions } from "../api";
import type { ModelPreset, ModelRun, ModelSuggestion } from "../types";

interface ModelLabProps {
  defaultModel: string;
  onRunComplete: () => Promise<void>;
}

export function ModelLab({ defaultModel, onRunComplete }: ModelLabProps): ReactElement {
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [presetId, setPresetId] = useState("bill_dossier_audit");
  const [entityType, setEntityType] = useState("bill");
  const [entityId, setEntityId] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [temperature, setTemperature] = useState(0.1);
  const [contextMode, setContextMode] = useState<"compact" | "expanded">("compact");
  const [goldSetId, setGoldSetId] = useState("local-gold-v1");
  const [execute, setExecute] = useState(false);
  const [runs, setRuns] = useState<ModelRun[]>([]);
  const [suggestions, setSuggestions] = useState<ModelSuggestion[]>([]);
  const [evaluation, setEvaluation] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>("Preview mode stores prompt/context without calling Ollama.");
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    const [presetPayload, nextRuns, nextSuggestions] = await Promise.all([getModelPresets(), getModelRuns({ limit: 40 }), getSuggestions()]);
    setPresets(presetPayload.presets);
    setRuns(nextRuns);
    setSuggestions(nextSuggestions);
  }

  async function handleRun(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result = await createModelRun({
        presetId,
        entityType,
        entityId,
        billIdOrSlug: entityType === "bill" ? entityId : undefined,
        model,
        temperature,
        contextMode,
        execute
      });
      setMessage(`${execute ? "Model run" : "Preview"} stored as ${result.run.id}; job ${result.job.id}.`);
      await Promise.all([load(), onRunComplete()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleEvaluate(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result = await evaluateGoldSet({ goldSetId });
      setEvaluation(result);
      const metrics = result.metrics as Record<string, unknown> | undefined;
      setMessage(`Gold-set evaluation stored: ${String(metrics?.evaluationStatus ?? "unknown")} with ${String(metrics?.matchedExampleCount ?? 0)} matched examples.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleTaskPack(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const pack = await createAgentTaskPack({
        entityType,
        entityId,
        taskType: presetId,
        issue: "Review this entity with official-source evidence."
      });
      setMessage(`Agent task pack created: ${String(pack.filePath ?? pack.id)}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleConvertSuggestion(suggestion: ModelSuggestion): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const proposal = await convertSuggestionToProposal(suggestion.id);
      setMessage(`Converted suggestion into proposal ${proposal.id}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setModel(defaultModel);
  }, [defaultModel]);

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Local model suggestions, never truth by themselves</p>
          <h2>Model Lab</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void load()} disabled={busy}>
          Refresh
        </button>
      </header>

      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span>Preset</span>
            <select value={presetId} onChange={(event) => setPresetId(event.currentTarget.value)}>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Entity type</span>
            <select value={entityType} onChange={(event) => setEntityType(event.currentTarget.value)}>
              <option value="bill">Bill</option>
              <option value="document">Document</option>
              <option value="vote">Vote</option>
              <option value="member">Member</option>
              <option value="party">Party</option>
            </select>
          </label>
          <label className="field">
            <span>Entity ID or slug</span>
            <input value={entityId} onChange={(event) => setEntityId(event.currentTarget.value)} placeholder="bill-pl-x-403-2026, document id..." />
          </label>
          <label className="field">
            <span>Model</span>
            <input value={model} onChange={(event) => setModel(event.currentTarget.value)} />
          </label>
          <label className="field">
            <span>Temperature</span>
            <input type="number" min="0" max="1" step="0.05" value={temperature} onChange={(event) => setTemperature(Number(event.currentTarget.value))} />
          </label>
          <label className="field">
            <span>Context mode</span>
            <select value={contextMode} onChange={(event) => setContextMode(event.currentTarget.value as "compact" | "expanded")}>
              <option value="compact">Compact</option>
              <option value="expanded">Expanded</option>
            </select>
          </label>
          <label className="field">
            <span>Gold set</span>
            <select value={goldSetId} onChange={(event) => setGoldSetId(event.currentTarget.value)}>
              <option value="local-gold-v1">All local seeds</option>
              <option value="ocr-quality">OCR quality</option>
              <option value="citation-review">Citation review</option>
              <option value="taxonomy-labeling">Taxonomy labeling</option>
              <option value="procedure-gap">Procedure gaps</option>
              <option value="bill-diff">Bill diff</option>
            </select>
          </label>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={execute} onChange={(event) => setExecute(event.currentTarget.checked)} />
          <span>Call Ollama now</span>
        </label>
        <div className="button-row">
          <button type="button" className="button" onClick={() => void handleRun()} disabled={busy || entityId.trim().length < 2}>
            {execute ? "Run model" : "Store preview"}
          </button>
          <button type="button" className="button secondary" onClick={() => void handleEvaluate()} disabled={busy}>
            Evaluate gold set
          </button>
          <button type="button" className="button secondary" onClick={() => void handleTaskPack()} disabled={busy || entityId.trim().length < 2}>
            Agent task pack
          </button>
        </div>
        {message ? <p className="message">{message}</p> : null}
        {evaluation ? <EvaluationSummary evaluation={evaluation} /> : null}
        <p className="muted">{presets.find((preset) => preset.id === presetId)?.description}</p>
      </section>

      <div className="two-column">
        <section className="panel">
          <h3>Run History</h3>
          <div className="record-list compact">
            {runs.map((run) => (
              <article className="record-card" key={run.id}>
                <strong>{run.taskType}</strong>
                <span className="status-pill">{run.status}</span>
                <p className="mono">
                  {run.entityType}:{run.entityId}
                </p>
                <p className="muted">
                  {run.model} | {run.promptVersion} | {run.schemaVersion}
                </p>
                {run.validation ? <code>{JSON.stringify(run.validation)}</code> : null}
              </article>
            ))}
            {runs.length === 0 ? <p className="muted">No model runs stored yet.</p> : null}
          </div>
        </section>

        <section className="panel">
          <h3>Suggestions</h3>
          <div className="suggestion-list">
            {suggestions.slice(0, 60).map((suggestion) => (
              <article className="suggestion" key={suggestion.id}>
                <header>
                  <span className={`badge ${suggestion.status}`}>{suggestion.status}</span>
                  <strong>{suggestion.suggestionType}</strong>
                  <span className="mono">
                    {suggestion.entityType}:{suggestion.entityId}
                  </span>
                </header>
                {suggestion.error ? <p className="danger-text">{suggestion.error}</p> : null}
                {suggestion.suggestedValue ? <p>{suggestion.suggestedValue}</p> : null}
                {suggestion.evidenceQuote ? <blockquote>{suggestion.evidenceQuote}</blockquote> : null}
                {suggestion.explanation ? <p className="muted">{suggestion.explanation}</p> : null}
                <div className="button-row">
                  <button type="button" className="button secondary small" disabled={busy || suggestion.status === "failed"} onClick={() => void handleConvertSuggestion(suggestion)}>
                    Convert to proposal
                  </button>
                </div>
              </article>
            ))}
            {suggestions.length === 0 ? <p className="muted">No suggestions loaded yet.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function EvaluationSummary({ evaluation }: { evaluation: Record<string, unknown> }): ReactElement {
  const metrics = (evaluation.metrics ?? {}) as Record<string, unknown>;
  const status = String(metrics.evaluationStatus ?? "unknown");
  const matched = Number(metrics.matchedExampleCount ?? 0);
  return (
    <div className={status === "evaluated" ? "banner" : "banner warn"}>
      <strong>Gold-set status: {status}</strong>
      <span>Matched examples: {Number.isFinite(matched) ? matched : 0}</span>
      {status !== "evaluated" ? <span>Quality percentages are not meaningful until at least one gold example matches a run.</span> : null}
    </div>
  );
}
