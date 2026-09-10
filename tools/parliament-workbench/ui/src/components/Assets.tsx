import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { auditAssets, getAssets, getAssetSummary, verifyAsset } from "../api";
import type { AssetAuditResult, AssetListPayload, AssetSummary, AssetVerification, StoredAssetRecord } from "../types";

export function Assets(): ReactElement {
  const [summary, setSummary] = useState<AssetSummary | null>(null);
  const [payload, setPayload] = useState<AssetListPayload>({ assets: [], total: 0, limit: 50, offset: 0 });
  const [assetType, setAssetType] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StoredAssetRecord | null>(null);
  const [verification, setVerification] = useState<Record<string, AssetVerification>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyRemoteAudit, setVerifyRemoteAudit] = useState(false);

  const offset = payload.offset;
  const canPageBack = offset > 0;
  const canPageForward = offset + payload.limit < payload.total;

  async function refresh(nextOffset = offset): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const [nextSummary, nextAssets] = await Promise.all([
        getAssetSummary(),
        getAssets({ assetType, provider, status, q: query.trim(), limit: payload.limit || 50, offset: nextOffset })
      ]);
      setSummary(nextSummary);
      setPayload(nextAssets);
      if (selected && !nextAssets.assets.some((asset) => asset.id === selected.id)) {
        setSelected(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(asset: StoredAssetRecord): Promise<void> {
    setVerification((current) => ({ ...current, [asset.id]: { assetId: asset.id, status: "running", exists: false } }));
    try {
      const result = await verifyAsset(asset.id);
      setVerification((current) => ({ ...current, [asset.id]: result }));
    } catch (error) {
      setVerification((current) => ({
        ...current,
        [asset.id]: { assetId: asset.id, status: "error", exists: false, lastError: error instanceof Error ? error.message : String(error) }
      }));
    }
  }

  async function handleAudit(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const result: AssetAuditResult = await auditAssets(500, verifyRemoteAudit);
      setMessage(`Created asset audit with ${result.result.issueCount.toLocaleString()} issues: ${result.result.reportPath}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh(0);
  }, []);

  const selectedPreviewUrl = useMemo(() => previewUrlFor(selected), [selected]);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Digi and asset health</p>
          <h2>Assets</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      <div className="metric-grid">
        <Metric label="Total assets" value={(summary?.total ?? 0).toLocaleString()} tone="neutral" />
        <Metric label="Stored" value={(summary?.stored ?? 0).toLocaleString()} tone="good" />
        <Metric label="Digi Storage" value={(summary?.digiStorage ?? 0).toLocaleString()} tone="neutral" />
        <Metric label="Open asset issues" value={openIssueCount(summary).toLocaleString()} tone={openIssueCount(summary) > 0 ? "warn" : "good"} />
      </div>

      <section className="panel">
        <h3>Filters</h3>
        <div className="form-grid four">
          <label className="field">
            <span>Asset type</span>
            <select value={assetType} onChange={(event) => setAssetType(event.currentTarget.value)}>
              <option value="">all</option>
              {summary?.byType.map((item) => (
                <option key={item.key} value={item.key}>{`${item.key} (${item.count})`}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.currentTarget.value)}>
              <option value="">all</option>
              {summary?.byProvider.map((item) => (
                <option key={item.key} value={item.key}>{`${item.key} (${item.count})`}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
              <option value="">all</option>
              {summary?.byStatus.map((item) => (
                <option key={item.key} value={item.key}>{`${item.key} (${item.count})`}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="asset id, entity, path, URL" />
          </label>
        </div>
        <div className="button-row">
          <button type="button" className="button" onClick={() => void refresh(0)} disabled={busy}>
            Apply filters
          </button>
          <label className="check-field">
            <input type="checkbox" checked={verifyRemoteAudit} onChange={(event) => setVerifyRemoteAudit(event.currentTarget.checked)} />
            <span>Verify Digi paths during audit</span>
          </label>
          <button type="button" className="button secondary" onClick={() => void handleAudit()} disabled={busy}>
            Create audit report
          </button>
        </div>
        {message ? <p className="message">{message}</p> : null}
      </section>

      <div className="panel-grid wide">
        <section className="panel">
          <h3>Asset Inventory</h3>
          <p className="muted">
            Showing {payload.assets.length.toLocaleString()} of {payload.total.toLocaleString()} assets. Verification only checks Digi link availability.
          </p>
          <AssetTable assets={payload.assets} selectedId={selected?.id} verification={verification} onSelect={setSelected} onVerify={(asset) => void handleVerify(asset)} />
          <div className="button-row">
            <button type="button" className="button secondary" disabled={!canPageBack || busy} onClick={() => void refresh(Math.max(0, offset - payload.limit))}>
              Previous
            </button>
            <button type="button" className="button secondary" disabled={!canPageForward || busy} onClick={() => void refresh(offset + payload.limit)}>
              Next
            </button>
          </div>
        </section>

        <section className="panel">
          <h3>Preview</h3>
          {selected ? (
            <div className="asset-preview">
              <dl className="detail-list">
                <dt>Asset</dt>
                <dd className="mono">{selected.id}</dd>
                <dt>Entity</dt>
                <dd>{selected.entityLabel ?? selected.entityId}</dd>
                <dt>Provider</dt>
                <dd>{selected.storageProvider}</dd>
                <dt>Path</dt>
                <dd className="mono">{selected.storagePath ?? "not stored"}</dd>
                <dt>Public route</dt>
                <dd className="mono">{selected.publicGatewayUrl}</dd>
                <dt>App route</dt>
                <dd className="mono">{selected.appUrl ?? "unknown"}</dd>
              </dl>
              <PreviewFrame asset={selected} previewUrl={selectedPreviewUrl} />
            </div>
          ) : (
            <p className="muted">Select an asset to inspect metadata and preview local content.</p>
          )}
        </section>
      </div>
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

interface AssetTableProps {
  assets: StoredAssetRecord[];
  selectedId?: string;
  verification: Record<string, AssetVerification>;
  onSelect: (asset: StoredAssetRecord) => void;
  onVerify: (asset: StoredAssetRecord) => void;
}

function AssetTable({ assets, selectedId, verification, onSelect, onVerify }: AssetTableProps): ReactElement {
  if (assets.length === 0) {
    return <p className="muted">No assets match the current filters.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Entity</th>
            <th>Storage</th>
            <th>Metadata</th>
            <th>Check</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const result = verification[asset.id];
            return (
              <tr key={asset.id} className={selectedId === asset.id ? "selected-row" : undefined}>
                <td>
                  <button type="button" className="link-button mono" onClick={() => onSelect(asset)}>
                    {asset.id}
                  </button>
                  <div className="tag-list compact">
                    <span>{asset.assetType}</span>
                    <span>{asset.fetchStatus}</span>
                  </div>
                </td>
                <td>
                  <div>{asset.entityLabel ?? asset.entityId}</div>
                  <div className="muted mono">{asset.entityType}/{asset.entityId}</div>
                </td>
                <td>
                  <div>{asset.storageProvider}</div>
                  <div className="muted mono">{asset.storagePath ?? asset.publicUrl ?? "no path"}</div>
                </td>
                <td>
                  <div>{asset.mimeType ?? "unknown"}</div>
                  <div className="muted">
                    {asset.byteSize ? `${asset.byteSize.toLocaleString()} bytes` : "size unknown"}
                    {asset.width && asset.height ? ` · ${asset.width}x${asset.height}` : ""}
                  </div>
                </td>
                <td>
                  <button type="button" className="button secondary small" disabled={asset.storageProvider !== "digi_storage"} onClick={() => onVerify(asset)}>
                    Verify
                  </button>
                  {result ? <div className={`badge ${result.status === "exists" ? "succeeded" : result.status === "running" ? "running" : "failed"}`}>{result.status}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface PreviewFrameProps {
  asset: StoredAssetRecord;
  previewUrl: string | null;
}

function PreviewFrame({ asset, previewUrl }: PreviewFrameProps): ReactElement {
  if (!previewUrl) {
    return <p className="muted">Preview is available for Digi Storage assets with a stored path.</p>;
  }
  if (asset.mimeType?.startsWith("image/")) {
    return <img className="preview-image" src={previewUrl} alt={asset.entityLabel ?? asset.id} />;
  }
  if (asset.mimeType?.startsWith("text/") || asset.assetType === "bill_text") {
    return <iframe className="preview-frame" src={previewUrl} title={`Preview ${asset.id}`} />;
  }
  return (
    <div className="preview-actions">
      <a className="button secondary" href={previewUrl} target="_blank" rel="noreferrer">
        Open local preview
      </a>
    </div>
  );
}

function previewUrlFor(asset: StoredAssetRecord | null): string | null {
  if (!asset || asset.storageProvider !== "digi_storage" || !asset.storagePath) return null;
  return `/api/digi/preview?storagePath=${encodeURIComponent(asset.storagePath)}`;
}

function openIssueCount(summary: AssetSummary | null): number {
  if (!summary) return 0;
  return summary.missingDigiPath + summary.imageAssetsMissingMetadata + summary.documentTextAssetGaps;
}
