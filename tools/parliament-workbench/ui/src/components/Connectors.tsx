import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { checkDigiPath, getConnectorsStatus } from "../api";
import type { AssetVerification, ConnectorsPayload } from "../types";

export function Connectors(): ReactElement {
  const [payload, setPayload] = useState<ConnectorsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState("");
  const [checkResult, setCheckResult] = useState<AssetVerification | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    setError(null);
    try {
      setPayload(await getConnectorsStatus());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }

  async function handleCheckPath(): Promise<void> {
    if (!storagePath.trim()) return;
    setBusy(true);
    setCheckResult(null);
    try {
      setCheckResult(await checkDigiPath(storagePath));
    } catch (checkError) {
      setCheckResult({ status: "error", exists: false, lastError: checkError instanceof Error ? checkError.message : String(checkError) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Local connectors</p>
          <h2>Connectors</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      {error ? <div className="banner danger">{error}</div> : null}

      <div className="metric-grid">
        <Metric label="Neon" value={payload?.database.ok ? "connected" : payload?.database.configured ? "error" : "missing env"} tone={payload?.database.ok ? "good" : "warn"} />
        <Metric label="Ollama" value={payload?.ollama.ok ? "available" : "offline"} tone={payload?.ollama.ok ? "good" : "warn"} />
        <Metric label="Digi Storage" value={payload?.digiStorage.authenticated ? "authenticated" : payload?.digiStorage.configured ? "needs check" : "missing env"} tone={payload?.digiStorage.authenticated ? "good" : "warn"} />
        <Metric label="FTP fallback" value={payload?.ftp.configured ? "configured" : "not configured"} tone={payload?.ftp.configured ? "neutral" : "warn"} />
      </div>

      <div className="panel-grid">
        <section className="panel">
          <h3>Digi Storage</h3>
          <dl className="detail-list">
            <dt>Configured</dt>
            <dd>{payload?.digiStorage.configured ? "yes" : "no"}</dd>
            <dt>Authenticated</dt>
            <dd>{payload?.digiStorage.authenticated ? "yes" : "no"}</dd>
            <dt>Mount</dt>
            <dd>{payload?.digiStorage.mountFound ? payload.digiStorage.mountId ?? "found" : "not found"}</dd>
            <dt>Base path</dt>
            <dd className="mono">{payload?.digiStorage.basePath ?? "unknown"}</dd>
            <dt>API URL</dt>
            <dd className="mono">{payload?.digiStorage.apiUrl ?? "unknown"}</dd>
            <dt>Missing env</dt>
            <dd>{payload?.digiStorage.missingEnv.join(", ") || "none"}</dd>
            <dt>Last error</dt>
            <dd>{payload?.digiStorage.lastError ?? "none"}</dd>
          </dl>
        </section>

        <section className="panel">
          <h3>FTP Fallback</h3>
          <dl className="detail-list">
            <dt>Configured</dt>
            <dd>{payload?.ftp.configured ? "yes" : "no"}</dd>
            <dt>Host</dt>
            <dd className="mono">{payload?.ftp.host ?? "not set"}</dd>
            <dt>User</dt>
            <dd>{payload?.ftp.usernameConfigured ? "configured" : "not set"}</dd>
            <dt>Public URL</dt>
            <dd className="mono">{payload?.ftp.publicBaseUrl ?? "not set"}</dd>
            <dt>Mode</dt>
            <dd>{payload?.ftp.mode ?? "fallback_only"}</dd>
            <dt>Missing env</dt>
            <dd>{payload?.ftp.missingEnv.join(", ") || "none"}</dd>
          </dl>
        </section>
      </div>

      <section className="panel">
        <h3>Check Digi Path</h3>
        <p className="muted">Verifies that Digi can create a temporary download link for one stored path. The link is not exposed to the browser.</p>
        <div className="search-row">
          <input value={storagePath} onChange={(event) => setStoragePath(event.currentTarget.value)} placeholder="/cumvoteaza-assets/parliament-assets/..." />
          <button type="button" className="button" onClick={() => void handleCheckPath()} disabled={busy || !storagePath.trim()}>
            {busy ? "Checking..." : "Check path"}
          </button>
        </div>
        {checkResult ? (
          <div className="inline-result">
            <span className={`badge ${checkResult.status === "exists" ? "succeeded" : "failed"}`}>{checkResult.status}</span>
            <span>{checkResult.exists ? "available" : checkResult.lastError ?? "not available"}</span>
          </div>
        ) : null}
      </section>
    </section>
  );
}

interface MetricProps {
  label: string;
  value: string;
  tone: "good" | "warn" | "neutral";
}

function Metric({ label, value, tone }: MetricProps): ReactElement {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
