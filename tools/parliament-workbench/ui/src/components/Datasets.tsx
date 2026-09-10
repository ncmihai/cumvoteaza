import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { getDatasets } from "../api";
import type { DatasetFile } from "../types";

export function Datasets(): ReactElement {
  const [files, setFiles] = useState<DatasetFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      setError(null);
      setFiles(await getDatasets());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Generated local artifacts</p>
          <h2>Datasets</h2>
        </div>
        <button type="button" className="button secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      {error ? <div className="banner danger">{error}</div> : null}
      <section className="panel">
        {files.length === 0 ? <p className="muted">No generated workbench files yet.</p> : null}
        {files.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Kind</th>
                  <th>Size</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.relativePath}>
                    <td className="mono">{file.relativePath}</td>
                    <td>{file.kind}</td>
                    <td>{file.byteSize.toLocaleString()} bytes</td>
                    <td>{new Date(file.updatedAt * 1000).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}
