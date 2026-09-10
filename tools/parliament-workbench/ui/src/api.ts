import type {
  AssetAuditResult,
  AssetListPayload,
  AssetSummary,
  AssetVerification,
  AuditResult,
  ConnectorsPayload,
  DataHealthSummary,
  DatasetFile,
  DigiStorageStatus,
  DoctorReport,
  DocumentDiffPayload,
  DocumentTextIntelligence,
  EntityDetail,
  EvidenceProfile,
  HistoricalYearPlan,
  ImportPlan,
  ImportRunResult,
  InstitutionAnswer,
  InstitutionAtlasStatus,
  InstitutionEntity,
  JobLog,
  JobRecord,
  JobStep,
  LocalProposal,
  MigrationExportResult,
  MigrationPreview,
  ModelPreset,
  ModelRun,
  ModelSuggestion,
  ProcedureNode,
  ProcedureTransition,
  PublishBatchPreview,
  ReviewProposalPreview,
  ReviewQueueItem,
  ReviewQueuePayload,
  ReviewQueueSummary,
  SourceClaim,
  SourceConflict,
  CommandPreview,
  StatusPayload,
  TaxonomyLabel,
  TaxonomyPayload,
  WorkbenchStateStatus,
  WikiRecord
} from "./types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail ?? payload);
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function getStatus(): Promise<StatusPayload> {
  return requestJson<StatusPayload>("/api/status");
}

export function getDoctorReport(): Promise<DoctorReport> {
  return requestJson<DoctorReport>("/api/doctor");
}

export function getWorkbenchState(): Promise<WorkbenchStateStatus> {
  return requestJson<WorkbenchStateStatus>("/api/workbench/state");
}

export function initWorkbenchState(): Promise<WorkbenchStateStatus> {
  return requestJson<WorkbenchStateStatus>("/api/workbench/state/init", {
    method: "POST"
  });
}

export function getConnectorsStatus(): Promise<ConnectorsPayload> {
  return requestJson<ConnectorsPayload>("/api/connectors/status");
}

export function getDigiStatus(): Promise<DigiStorageStatus> {
  return requestJson<DigiStorageStatus>("/api/digi/status");
}

export function checkDigiPath(storagePath: string): Promise<AssetVerification> {
  return requestJson<AssetVerification>("/api/digi/check-path", {
    method: "POST",
    body: JSON.stringify({ storagePath })
  });
}

export function buildWiki(limit = 5000): Promise<{ result: { recordCount: number; entityCounts: Record<string, number> }; job: JobRecord }> {
  return requestJson("/api/wiki/build", {
    method: "POST",
    body: JSON.stringify({ limit })
  });
}

export async function searchWiki(query: string, entityType?: string): Promise<WikiRecord[]> {
  const search = new URLSearchParams({ q: query, limit: "30" });
  if (entityType) search.set("entityType", entityType);
  const payload = await requestJson<{ results: WikiRecord[] }>(`/api/wiki/search?${search.toString()}`);
  return payload.results;
}

export function getWikiEntity(entityType: string, entityId: string): Promise<WikiRecord> {
  return requestJson<WikiRecord>(`/api/wiki/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
}

export function getInstitutionStatus(): Promise<InstitutionAtlasStatus> {
  return requestJson<InstitutionAtlasStatus>("/api/institutions/status");
}

export async function getInstitutions(query = "", category = ""): Promise<InstitutionEntity[]> {
  const search = new URLSearchParams();
  if (query) search.set("q", query);
  if (category) search.set("category", category);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const payload = await requestJson<{ institutions: InstitutionEntity[] }>(`/api/institutions${suffix}`);
  return payload.institutions;
}

export function getInstitution(entityId: string): Promise<InstitutionEntity> {
  return requestJson<InstitutionEntity>(`/api/institutions/${encodeURIComponent(entityId)}`);
}

export function getInstitutionProcedureGraph(): Promise<{ nodes: ProcedureNode[]; transitions: ProcedureTransition[] }> {
  return requestJson<{ nodes: ProcedureNode[]; transitions: ProcedureTransition[] }>("/api/institutions/procedure-graph");
}

export function askInstitutionAtlas(question: string): Promise<InstitutionAnswer> {
  return requestJson<InstitutionAnswer>("/api/institutions/ask", {
    method: "POST",
    body: JSON.stringify({ question })
  });
}

export function previewCurrentImport(params: { year?: number; limit?: number; includeText?: boolean; mode?: "dry_run" | "persist" }): Promise<ImportPlan> {
  const search = new URLSearchParams();
  if (params.year) search.set("year", String(params.year));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.includeText !== undefined) search.set("includeText", String(params.includeText));
  if (params.mode) search.set("mode", params.mode);
  return requestJson<ImportPlan>(`/api/imports/current/preview?${search.toString()}`);
}

export function runCurrentImport(payload: {
  year?: number;
  limit: number;
  includeText: boolean;
  mode: "dry_run" | "persist";
  execute: boolean;
}): Promise<ImportRunResult> {
  return requestJson<ImportRunResult>("/api/imports/current/run", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function previewHistoricalYear(params: { year: number; chamber: string; sourceType?: string; includeText?: boolean; limit?: number }): Promise<HistoricalYearPlan> {
  const search = new URLSearchParams({ year: String(params.year), chamber: params.chamber, limit: String(params.limit ?? 25) });
  if (params.sourceType) search.set("sourceType", params.sourceType);
  if (params.includeText !== undefined) search.set("includeText", String(params.includeText));
  return requestJson<HistoricalYearPlan>(`/api/imports/historical-year/preview?${search.toString()}`);
}

export function runHistoricalYear(payload: {
  year: number;
  chamber: string;
  sourceType?: string;
  limit: number;
  includeText: boolean;
  includeOcr: boolean;
  execute: boolean;
}): Promise<ImportRunResult> {
  return requestJson<ImportRunResult>("/api/imports/historical-year/run", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getEntityDetail(entityType: string, entityId: string): Promise<EntityDetail> {
  return requestJson<EntityDetail>(`/api/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
}

export function getDocumentTextIntelligence(documentId: string): Promise<DocumentTextIntelligence> {
  return requestJson<DocumentTextIntelligence>(`/api/documents/${encodeURIComponent(documentId)}/text-intelligence`);
}

export function parseDocumentText(documentId: string, correctionId?: string): Promise<DocumentTextIntelligence["parse"]> {
  return requestJson<DocumentTextIntelligence["parse"]>(`/api/documents/${encodeURIComponent(documentId)}/parse`, {
    method: "POST",
    body: JSON.stringify({ correctionId: correctionId || undefined })
  });
}

export function createTextCorrection(
  documentId: string,
  payload: {
    correctedText?: string;
    correctionNote?: string;
    evidenceQuote: string;
    sourceDocumentId?: string;
    officialUrl?: string;
  }
): Promise<unknown> {
  return requestJson(`/api/documents/${encodeURIComponent(documentId)}/corrections`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getBillDocumentDiff(billId: string): Promise<DocumentDiffPayload> {
  return requestJson<DocumentDiffPayload>(`/api/bills/${encodeURIComponent(billId)}/document-diff`);
}

export function auditBill(billIdOrSlug: string, model?: string): Promise<AuditResult> {
  return requestJson<AuditResult>("/api/model/audit-bill", {
    method: "POST",
    body: JSON.stringify({ billIdOrSlug, model: model || undefined })
  });
}

export async function getSuggestions(billId?: string): Promise<ModelSuggestion[]> {
  const suffix = billId ? `?billId=${encodeURIComponent(billId)}` : "";
  const payload = await requestJson<{ suggestions: ModelSuggestion[] }>(`/api/model/suggestions${suffix}`);
  return payload.suggestions;
}

export function getModelPresets(): Promise<{ promptVersion: string; schemaVersion: string; presets: ModelPreset[] }> {
  return requestJson<{ promptVersion: string; schemaVersion: string; presets: ModelPreset[] }>("/api/model/presets");
}

export function createModelRun(payload: {
  presetId: string;
  entityType?: string;
  entityId?: string;
  billIdOrSlug?: string;
  model?: string;
  temperature?: number;
  contextMode?: "compact" | "expanded";
  execute?: boolean;
}): Promise<{ run: ModelRun; job: JobRecord }> {
  return requestJson<{ run: ModelRun; job: JobRecord }>("/api/model/runs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getModelRuns(params: { entityType?: string; entityId?: string; limit?: number } = {}): Promise<ModelRun[]> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const payload = await requestJson<{ runs: ModelRun[] }>(`/api/model/runs${suffix}`);
  return payload.runs;
}

export function evaluateGoldSet(payload: { goldSetId?: string; modelRunId?: string } = {}): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/api/model/gold-set/evaluate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createAgentTaskPack(payload: {
  entityType: string;
  entityId: string;
  taskType: string;
  title?: string;
  issue?: string;
  acceptanceCriteria?: string[];
}): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>("/api/agent-task-packs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function convertSuggestionToProposal(suggestionId: string): Promise<LocalProposal> {
  return requestJson<LocalProposal>(`/api/model/suggestions/${encodeURIComponent(suggestionId)}/proposal`, {
    method: "POST"
  });
}

export async function getProposals(params: { entityType?: string; entityId?: string; status?: string } = {}): Promise<LocalProposal[]> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const payload = await requestJson<{ proposals: LocalProposal[] }>(`/api/proposals${suffix}`);
  return payload.proposals;
}

export function createProposal(payload: Partial<LocalProposal>): Promise<LocalProposal> {
  return requestJson<LocalProposal>("/api/proposals", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateProposal(proposalId: string, payload: Partial<LocalProposal>): Promise<LocalProposal> {
  return requestJson<LocalProposal>(`/api/proposals/${encodeURIComponent(proposalId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function reviewProposal(proposalId: string): Promise<LocalProposal> {
  return requestJson<LocalProposal>(`/api/proposals/${encodeURIComponent(proposalId)}/review`, {
    method: "POST"
  });
}

export function rejectProposal(proposalId: string, reason?: string): Promise<LocalProposal> {
  return requestJson<LocalProposal>(`/api/proposals/${encodeURIComponent(proposalId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export function previewProposalCommand(proposalId: string): Promise<CommandPreview> {
  return requestJson<CommandPreview>(`/api/proposals/${encodeURIComponent(proposalId)}/command-preview`, {
    method: "POST"
  });
}

export function getHealthSummary(): Promise<DataHealthSummary> {
  return requestJson<DataHealthSummary>("/api/data-health/summary");
}

export function getReviewQueueSummary(): Promise<ReviewQueueSummary> {
  return requestJson<ReviewQueueSummary>("/api/review-queues/summary");
}

export function getReviewQueue(params: {
  queue?: string;
  status?: string;
  entityType?: string;
  entityId?: string;
  q?: string;
  source?: string;
  blocksExport?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<ReviewQueuePayload> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson<ReviewQueuePayload>(`/api/review-queues${suffix}`);
}

export function transitionReviewItem(queue: string, itemId: string, payload: { status: string; reviewer?: string; reviewerNote?: string; decisionReason?: string }): Promise<ReviewQueueItem> {
  return requestJson<ReviewQueueItem>(`/api/review-queues/${encodeURIComponent(queue)}/${encodeURIComponent(itemId)}/transition`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function previewReviewProposal(queue: string, itemId: string): Promise<ReviewProposalPreview> {
  return requestJson<ReviewProposalPreview>(`/api/review-queues/${encodeURIComponent(queue)}/${encodeURIComponent(itemId)}/proposal-preview`, {
    method: "POST"
  });
}

export function convertReviewItemToProposal(queue: string, itemId: string): Promise<LocalProposal> {
  return requestJson<LocalProposal>(`/api/review-queues/${encodeURIComponent(queue)}/${encodeURIComponent(itemId)}/convert-to-proposal`, {
    method: "POST"
  });
}

export async function getPublishBatches(): Promise<PublishBatchPreview[]> {
  const payload = await requestJson<{ batches: PublishBatchPreview[] }>("/api/publish-batches");
  return payload.batches;
}

export function previewPublishBatch(payload: { title: string; proposalIds?: string[]; create?: boolean }): Promise<PublishBatchPreview> {
  return requestJson<PublishBatchPreview>("/api/publish-batches/preview", {
    method: "POST",
    body: JSON.stringify({ title: payload.title, proposalIds: payload.proposalIds ?? [], create: payload.create ?? false })
  });
}

export async function getSourceClaims(params: { entityType?: string; entityId?: string; status?: string; limit?: number } = {}): Promise<SourceClaim[]> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const payload = await requestJson<{ claims: SourceClaim[] }>(`/api/source-claims${suffix}`);
  return payload.claims;
}

export function createSourceClaim(payload: {
  entityType: string;
  entityId: string;
  fieldPath: string;
  value: unknown;
  sourceUrl?: string;
  sourceTitle?: string;
  evidenceQuote?: string;
  sourceType?: string;
  confidence?: string;
  status?: string;
}): Promise<SourceClaim> {
  return requestJson<SourceClaim>("/api/source-claims", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateSourceClaim(
  claimId: string,
  payload: {
    status?: string;
    sourceUrl?: string | null;
    sourceTitle?: string | null;
    evidenceQuote?: string | null;
    reviewer?: string | null;
    reviewerNote?: string | null;
    decisionReason?: string | null;
    proposalId?: string | null;
  }
): Promise<SourceClaim> {
  return requestJson<SourceClaim>(`/api/source-claims/${encodeURIComponent(claimId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function getSourceConflicts(params: { entityType?: string; entityId?: string; status?: string; limit?: number } = {}): Promise<SourceConflict[]> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const payload = await requestJson<{ conflicts: SourceConflict[] }>(`/api/source-conflicts${suffix}`);
  return payload.conflicts;
}

export function updateSourceConflict(conflictId: string, payload: { status?: string; reviewerNote?: string | null }): Promise<SourceConflict> {
  return requestJson<SourceConflict>(`/api/source-conflicts/${encodeURIComponent(conflictId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function getDatasets(): Promise<DatasetFile[]> {
  const payload = await requestJson<{ datasets: DatasetFile[] }>("/api/datasets");
  return payload.datasets;
}

export async function getJobs(): Promise<JobRecord[]> {
  const payload = await requestJson<{ jobs: JobRecord[] }>("/api/jobs");
  return payload.jobs;
}

export async function getJobSteps(jobId: string): Promise<JobStep[]> {
  const payload = await requestJson<{ steps: JobStep[] }>(`/api/jobs/${encodeURIComponent(jobId)}/steps`);
  return payload.steps;
}

export async function getJobLogs(jobId: string): Promise<JobLog[]> {
  const payload = await requestJson<{ logs: JobLog[] }>(`/api/jobs/${encodeURIComponent(jobId)}/logs`);
  return payload.logs;
}

export function getJobDetail(jobId: string): Promise<JobRecord> {
  return requestJson<JobRecord>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function previewJobStepRetry(jobId: string, stepId: string): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(`/api/jobs/${encodeURIComponent(jobId)}/steps/${encodeURIComponent(stepId)}/retry-preview`, {
    method: "POST"
  });
}

export function cancelJob(jobId: string): Promise<JobRecord> {
  return requestJson<JobRecord>(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST"
  });
}

export function retryJob(jobId: string): Promise<JobRecord> {
  return requestJson<JobRecord>(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST"
  });
}

export function getAssetSummary(): Promise<AssetSummary> {
  return requestJson<AssetSummary>("/api/assets/summary");
}

export function getAssets(params: {
  assetType?: string;
  provider?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AssetListPayload> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return requestJson<AssetListPayload>(`/api/assets${suffix}`);
}

export function verifyAsset(assetId: string): Promise<AssetVerification> {
  return requestJson<AssetVerification>(`/api/assets/${encodeURIComponent(assetId)}/verify`, {
    method: "POST"
  });
}

export function auditAssets(limit: number, verifyRemote: boolean): Promise<AssetAuditResult> {
  return requestJson<AssetAuditResult>("/api/assets/audit", {
    method: "POST",
    body: JSON.stringify({ limit, verifyRemote })
  });
}

export function getTaxonomy(): Promise<TaxonomyPayload> {
  return requestJson<TaxonomyPayload>("/api/taxonomy");
}

export function createTaxonomyLabel(payload: {
  entityType: string;
  entityId: string;
  topicCode: string;
  stanceCode?: string;
  confidence?: number;
  evidenceQuote?: string;
  sourceId?: string;
  status?: string;
}): Promise<TaxonomyLabel> {
  return requestJson<TaxonomyLabel>("/api/taxonomy/labels", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getEvidenceProfile(params: { entityType: string; entityId: string; startDate?: string; endDate?: string }): Promise<EvidenceProfile> {
  const search = new URLSearchParams({ entityType: params.entityType, entityId: params.entityId });
  if (params.startDate) search.set("startDate", params.startDate);
  if (params.endDate) search.set("endDate", params.endDate);
  return requestJson<EvidenceProfile>(`/api/analytics/evidence-profile?${search.toString()}`);
}

export function getMigrationPreview(): Promise<MigrationPreview> {
  return requestJson<MigrationPreview>("/api/migrate/preview");
}

export function exportMigrationPreview(title?: string): Promise<MigrationExportResult> {
  return requestJson<MigrationExportResult>("/api/migrate/export", {
    method: "POST",
    body: JSON.stringify({ title })
  });
}
