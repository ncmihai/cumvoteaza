import { readFile } from "node:fs/promises";
import { uploadDerivedAsset } from "../../packages/ingest/src/asset-import";
const input: Buffer[] = [];
for await (const chunk of process.stdin) input.push(Buffer.from(chunk));
const requests = JSON.parse(Buffer.concat(input).toString("utf8")) as Array<{path:string;objectPath:string;mimeType:string}>;
const results = [];
for (const request of requests) {
  if (request.mimeType.includes("pdf")) throw new Error("Original PDFs remain external");
  results.push(await uploadDerivedAsset({objectPath:request.objectPath, mimeType:request.mimeType, bytes:await readFile(request.path)}));
}
process.stdout.write(JSON.stringify(results));
