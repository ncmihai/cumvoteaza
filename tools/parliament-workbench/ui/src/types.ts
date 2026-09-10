export interface StatusPayload {
  api: { ok: boolean; host: string; port: number };
  database: {
    configured: boolean;
    ok: boolean;
    reason?: string;
    counts?: Record<string, number>;
  };
  wiki: {
    built: boolean;
    recordCount: number;
    path?: string;
    sqlitePath?: string;
    updatedAt?: string;
  };
  ollama: {
    ok: boolean;
    baseUrl: string;
    reason?: string;
    models?: string[];
  };
  digiStorage?: {
    configured: boolean;
    basePath?: string;
    mountIdConfigured?: boolean;
    missingEnv?: string[];
  };
  workbenchState?: WorkbenchStateStatus;
  institutionAtlas?: InstitutionAtlasStatus;
  dataDir: string;
  model: string;
  writeMode?: {
    enabled: boolean;
    tokenConfigured: boolean;
  };
}

export interface ConnectorsPayload {
  database: StatusPayload["database"];
  ollama: StatusPayload["ollama"];
  digiStorage: DigiStorageStatus;
  ftp: FtpStatus;
}

export interface DigiStorageStatus {
  configured: boolean;
  missingEnv: string[];
  baseUrl: string;
  apiUrl: string;
  basePath: string;
  mountIdConfigured: boolean;
  authenticated: boolean;
  mountFound: boolean;
  mountId?: string;
  lastError?: string;
}

export interface FtpStatus {
  configured: boolean;
  missingEnv: string[];
  host?: string;
  usernameConfigured: boolean;
  publicBaseUrl?: string;
  mode: string;
}

export interface WikiRecord {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string;
  summary: string;
  body: string;
  sourceUrls: string[];
  tags: string[];
  relatedIds: Record<string, string[]>;
}

export interface EntityReference {
  entityType: string;
  entityId: string;
  label: string;
}

export interface EntityDetail {
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string;
  summary: string;
  facts: Record<string, unknown>;
  sections: Record<string, Array<Record<string, unknown>>>;
  references: EntityReference[];
  sourceUrls: string[];
  assets: StoredAssetRecord[];
  healthIssues: Array<Record<string, unknown>>;
  proposals: LocalProposal[];
  suggestions: ModelSuggestion[];
  wikiRecord?: WikiRecord | null;
}

export interface LocalProposal {
  id: string;
  status: "draft" | "reviewed" | "accepted" | "rejected" | "applied" | "failed";
  proposalType: "field_correction" | "relation_link" | "text_annotation" | "asset_issue" | "procedure_event" | "duplicate_merge" | "review_note";
  entityType: string;
  entityId: string;
  field?: string | null;
  currentValue?: unknown;
  proposedValue?: unknown;
  evidenceQuote?: string | null;
  sourceDocumentId?: string | null;
  officialUrl?: string | null;
  explanation?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommandPreview {
  proposalId: string;
  status: string;
  writeModeEnabled: boolean;
  requiresWriteToken: boolean;
  canExecute: boolean;
  commands: string[];
  expectedEffects: string[];
}

export interface DoctorReport {
  ok: boolean;
  checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    required?: boolean;
    path?: string;
    hint?: string;
    error?: string;
    listening?: boolean;
    details?: unknown;
    models?: string[];
    modelAvailable?: boolean;
  }>;
}

export interface JobRecord {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  createdAt: string;
  updatedAt: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  parentJobId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  canceledAt?: string | null;
  steps?: JobStep[];
  logs?: JobLog[];
  retryJobs?: JobRecord[];
  parentJob?: JobRecord | null;
}

export interface JobStep {
  id: string;
  jobId: string;
  stepIndex: number;
  stageId: string;
  label: string;
  status: "queued" | "running" | "succeeded" | "failed" | "skipped" | "canceled";
  command: string[];
  commandText: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  returnCode?: number | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  updatedAt: string;
}

export interface JobLog {
  id: string;
  jobId: string;
  stepId?: string | null;
  level: string;
  message: string;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkbenchStateStatus {
  path: string;
  initialized: boolean;
  ok: boolean;
  schemaVersion?: string | null;
  counts: Record<string, number>;
  error?: string;
}

export interface InstitutionAtlasStatus {
  built: boolean;
  seedVersion: string;
  entities: number;
  sources: number;
  terms?: number;
  events?: number;
  procedureNodes: number;
  procedureTransitions: number;
  examples?: number;
}

export interface InstitutionEntity {
  id: string;
  entityType: string;
  name: string;
  shortName?: string | null;
  category: string;
  status: string;
  summary: string;
  body: string;
  temporalScope: string;
  sourceConfidence: string;
  updatedAt: string;
  sources?: InstitutionSource[];
  procedureNodes?: ProcedureNode[];
  terms?: InstitutionTerm[];
  events?: InstitutionEvent[];
  examples?: InstitutionExample[];
}

export interface InstitutionSource {
  id: string;
  entityId: string;
  title: string;
  url: string;
  sourceType: string;
  citationNote: string;
  updatedAt: string;
}

export interface ProcedureNode {
  id: string;
  label: string;
  actorEntityId?: string | null;
  stageOrder: number;
  status: string;
  description: string;
  sourceIds: string[];
  updatedAt: string;
}

export interface ProcedureTransition {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  conditionLabel: string;
  required: boolean;
  description: string;
  sourceIds: string[];
  updatedAt: string;
}

export interface InstitutionExample {
  id: string;
  entityId: string;
  billId?: string | null;
  title: string;
  description: string;
  sourceUrl?: string | null;
  status: string;
  updatedAt: string;
}

export interface InstitutionTerm {
  id: string;
  entityId: string;
  roleType: string;
  holderName: string;
  holderEntityId?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  status: string;
  sourceIds: string[];
  updatedAt: string;
}

export interface InstitutionEvent {
  id: string;
  entityId: string;
  eventType: string;
  occurredOn?: string | null;
  title: string;
  description: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  sourceUrl?: string | null;
  status: string;
  updatedAt: string;
}

export interface InstitutionAnswer {
  answer: string;
  mode: string;
  citations: InstitutionSource[];
  matchedEntities: InstitutionEntity[];
  needsReview: boolean;
  guardrail?: string;
}

export interface ImportStage {
  id: string;
  label: string;
  description: string;
  command: string[];
  commandText: string;
  readOnly: boolean;
  requiresWriteToken: boolean;
  writes: "none" | "neon" | "digi" | "neon_and_digi";
  mutatesCanonical?: boolean;
  source: string;
}

export interface ImportPlan {
  kind: string;
  year: number;
  limit: number;
  includeText: boolean;
  mode: "dry_run" | "persist";
  requiresWriteToken: boolean;
  stages: ImportStage[];
  warnings: string[];
}

export interface ImportRunResult {
  job: JobRecord;
  steps?: JobStep[];
  logs?: JobLog[];
  result: {
    executed: boolean;
    plan: ImportPlan;
    message?: string;
    stages?: Array<Record<string, unknown>>;
  };
}

export interface HistoricalYearPlan {
  kind: string;
  year: number;
  chamber: string;
  sourceType?: string;
  limit: number;
  mode?: "dry_run" | "persist";
  requiresWriteToken?: boolean;
  stages?: ImportStage[];
  commands: Array<{ command: string[]; commandText: string }>;
  contextRequirements: string[];
  contextChecks?: Record<string, unknown>;
  includeText?: boolean;
  includeOcr?: boolean;
}

export interface PublishBatchPreview {
  id?: string | null;
  status: string;
  title: string;
  description?: string;
  strictGate: {
    strict: boolean;
    canPublish: boolean;
    blockers: Array<{ key: string; label: string; count: number }>;
    warnings: string[];
    health: Record<string, number>;
    acceptedProposalCount: number;
  };
  items: Array<{
    id: string;
    itemType: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SourceClaim {
  id: string;
  entityType: string;
  entityId: string;
  fieldPath: string;
  value: unknown;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  evidenceQuote?: string | null;
  sourceType: string;
  confidence: string;
  status: string;
  observedAt: string;
  reviewer?: string | null;
  reviewerNote?: string | null;
  reviewedAt?: string | null;
  decisionReason?: string | null;
  proposalId?: string | null;
  updatedAt: string;
}

export interface SourceConflict {
  id: string;
  entityType: string;
  entityId: string;
  fieldPath: string;
  conflict: Record<string, unknown>;
  status: string;
  reviewerNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataHealthSummary {
  reviews: number;
  openReviews: number;
  storedDocuments: number;
  unlinkedVotes: number;
  missingProcedures: number;
}

export interface DatasetFile {
  name: string;
  relativePath: string;
  kind: string;
  byteSize: number;
  updatedAt: number;
}

export interface AssetSummary {
  total: number;
  stored: number;
  digiStorage: number;
  missingDigiPath: number;
  imageAssetsMissingMetadata: number;
  billTextAssets: number;
  documentTextAssetGaps: number;
  byProvider: CountBucket[];
  byType: CountBucket[];
  byStatus: CountBucket[];
}

export interface CountBucket {
  key: string;
  count: number;
}

export interface StoredAssetRecord {
  id: string;
  entityType: string;
  entityId: string;
  assetType: string;
  legislatureId?: string;
  chamber?: string;
  officialUrl?: string;
  storageProvider: string;
  storagePath?: string;
  publicUrl?: string;
  publicGatewayUrl: string;
  contentHash?: string;
  mimeType?: string;
  byteSize?: number;
  width?: number;
  height?: number;
  variant?: string;
  fetchStatus: string;
  lastAttemptAt?: string;
  updatedAt?: string;
  entityLabel?: string;
  documentId?: string;
  documentLabel?: string;
  documentTextStatus?: string;
  billId?: string;
  billSlug?: string;
  memberSlug?: string;
  partySlug?: string;
  appUrl?: string;
  documentTextUrl?: string;
}

export interface AssetListPayload {
  assets: StoredAssetRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface AssetVerification {
  assetId?: string;
  storagePath?: string;
  status: string;
  exists: boolean;
  downloadLinkAvailable?: boolean;
  checkedAt?: string;
  lastError?: string;
}

export interface AssetAuditResult {
  result: {
    issueCount: number;
    suggestionsPath: string;
    reportPath: string;
    verifiedRemote: boolean;
  };
  job: JobRecord;
}

export interface AuditResult {
  status: string;
  billId: string;
  suggestionCount: number;
  failedCount: number;
  suggestionsPath: string;
  error?: string;
}

export interface ModelSuggestion {
  id: string;
  status: string;
  billId: string;
  model: string;
  createdAt: string;
  suggestionType: string;
  entityType: string;
  entityId: string;
  confidence?: number;
  suggestedValue?: string;
  evidenceQuote?: string;
  sourceDocumentId?: string;
  officialUrl?: string;
  explanation?: string;
  proposalId?: string;
  reviewer?: string;
  reviewerNote?: string;
  reviewedAt?: string;
  decisionReason?: string;
  error?: string;
}

export interface ParsedSection {
  id: string;
  heading: string;
  normalizedHeading: string;
  kind: string;
  startOffset: number;
  endOffset: number;
  text: string;
  wordCount: number;
}

export interface ExtractedCitation {
  id: string;
  documentId: string;
  parseId?: string | null;
  citationType: string;
  rawText: string;
  normalizedTarget: string;
  snippet: string;
  startOffset?: number;
  endOffset?: number;
  confidence?: number;
  status: string;
}

export interface DocumentParsePayload {
  id?: string | null;
  documentId: string;
  parserVersion: string;
  sourceTextHash: string;
  correctionId?: string | null;
  quality: string;
  warnings: string[];
  sections: ParsedSection[];
  citations: ExtractedCitation[];
}

export interface TextCorrection {
  id: string;
  documentId: string;
  status: string;
  baseTextHash: string;
  correctedText?: string | null;
  correctionNote?: string | null;
  evidenceQuote: string;
  sourceDocumentId?: string | null;
  officialUrl?: string | null;
  proposalId?: string | null;
  reviewer?: string | null;
  reviewerNote?: string | null;
  reviewedAt?: string | null;
  decisionReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentTextIntelligence {
  document?: Record<string, unknown> | null;
  rawText: string;
  rawTextHash: string;
  rawTextLength: number;
  parse: DocumentParsePayload;
  corrections: TextCorrection[];
  health: {
    quality: string;
    warnings: string[];
    correctionCount: number;
    hasReviewedCorrection: boolean;
  };
}

export interface DocumentDiffPayload {
  billId: string;
  diffVersion: string;
  documentOrder?: string[];
  documents: Array<{
    documentId: string;
    label: string;
    documentKind: string;
    sourceUrl?: string | null;
    textLength: number;
    sectionCount: number;
    warnings: string[];
    quality: string;
  }>;
  comparisons: Array<{
    fromDocumentId: string;
    toDocumentId: string;
    fromKind: string;
    toKind: string;
    added: Array<Record<string, unknown>>;
    removed: Array<Record<string, unknown>>;
    changed: Array<Record<string, unknown>>;
    unchangedCount: number;
    weakParse: boolean;
    warnings: string[];
  }>;
  warnings: string[];
}

export interface ModelPreset {
  id: string;
  label: string;
  taskType: string;
  description: string;
}

export interface ModelRun {
  id: string;
  taskType: string;
  entityType?: string | null;
  entityId?: string | null;
  jobId?: string | null;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  validation?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxonomyTerm {
  code: string;
  label: string;
  capCode?: string;
}

export interface TaxonomyLabel {
  id: string;
  entityType: string;
  entityId: string;
  taxonomyVersion: string;
  topicCode: string;
  topicLabel: string;
  stanceCode?: string | null;
  stanceLabel?: string | null;
  confidence?: number | string | null;
  status: string;
  evidenceQuote?: string | null;
  sourceId?: string | null;
  reviewer?: string | null;
  reviewerNote?: string | null;
  reviewedAt?: string | null;
  decisionReason?: string | null;
  proposalId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxonomyPayload {
  version: string;
  topics: TaxonomyTerm[];
  stances: TaxonomyTerm[];
  reviewedLabelCount: number;
  labels: TaxonomyLabel[];
}

export interface EvidenceProfile {
  entityType: string;
  entityId: string;
  taxonomyVersion: string;
  coverage: Record<string, unknown>;
  topicCounts: Record<string, number>;
  stanceCounts: Record<string, number>;
  voteSimilarity: Array<Record<string, unknown>>;
  partyDiscipline: Array<Record<string, unknown>>;
  governmentAlignment: Record<string, unknown>;
  labels: TaxonomyLabel[];
}

export interface MigrationPreview {
  status: string;
  counts: Record<string, number>;
  blockers: Array<{ key: string; count: number; entityIds?: string[] }>;
  items: Record<string, Array<Record<string, unknown>>>;
  writeMode: string;
}

export interface MigrationExportResult {
  id: string;
  status: string;
  files: string[];
  preview: MigrationPreview;
}

export interface ReviewQueueItem {
  id: string;
  queue: "citations" | "text_corrections" | "taxonomy_labels" | "source_claims" | "model_suggestions" | "export_blockers";
  status: string;
  entityType: string;
  entityId: string;
  title: string;
  subtitle?: string | null;
  evidenceQuote?: string | null;
  sourceId?: string | null;
  sourceDocumentId?: string | null;
  officialUrl?: string | null;
  snippet?: string | null;
  confidence?: number | null;
  proposalId?: string | null;
  reviewer?: string | null;
  reviewerNote?: string | null;
  reviewedAt?: string | null;
  decisionReason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  blocksExport: boolean;
  raw: Record<string, unknown>;
}

export interface ReviewQueuePayload {
  items: ReviewQueueItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReviewQueueSummary {
  total: number;
  blockers: number;
  byQueue: CountBucket[];
  byStatus: CountBucket[];
}

export interface ReviewProposalPreview {
  queue: string;
  itemId: string;
  proposalId?: string;
  proposal?: LocalProposal;
  proposalPayload?: Partial<LocalProposal>;
  commandPreview?: CommandPreview | null;
  canConvert: boolean;
}
