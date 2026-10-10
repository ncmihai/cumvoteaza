import {
  boolean,
  date,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/pg-core";

export const chamberEnum = pgEnum("chamber", ["senate", "deputies"]);
/** Votes can also be held in a joint sitting of both chambers (Constitution art. 65). */
export const voteChamberEnum = pgEnum("vote_chamber", ["senate", "deputies", "joint"]);
export const voteChoiceEnum = pgEnum("vote_choice", [
  "for",
  "against",
  "abstention",
  "present_not_voting",
  "absent",
  "unknown"
]);
export const voteMotionKindEnum = pgEnum("vote_motion_kind", [
  "final_adoption",
  "final_rejection",
  "rejection_report",
  "amendment",
  "committee_referral",
  "reconsideration",
  "confidence",
  "no_confidence",
  "institutional_resolution",
  "procedural_timing",
  "agenda_or_schedule",
  "quorum_or_presence",
  "internal_procedure",
  "unknown"
]);
export const voteProminenceEnum = pgEnum("vote_prominence", ["major", "standard", "routine", "unclassified"]);
export const voteClassificationConfidenceEnum = pgEnum("vote_classification_confidence", ["verified", "high", "medium", "low"]);
export const voteClassificationBasisEnum = pgEnum("vote_classification_basis", [
  "official_metadata",
  "deterministic_rule",
  "contextual_inference",
  "manual_review",
  "unclassified"
]);
export const voteYesMeaningEnum = pgEnum("vote_yes_meaning", [
  "supports_adoption",
  "supports_rejection",
  "supports_amendment",
  "supports_referral",
  "supports_reconsideration",
  "supports_confidence",
  "supports_no_confidence",
  "supports_resolution",
  "supports_procedure",
  "confirms_presence",
  "unknown"
]);
export const sourceStatusEnum = pgEnum("source_status", ["parsed", "partial", "failed"]);
export const ingestionRunStatusEnum = pgEnum("ingestion_run_status", ["running", "completed", "partial", "failed"]);
export const sourceDiscoveryStatusEnum = pgEnum("source_discovery_status", ["pending", "imported", "partial", "failed", "skipped"]);
export const sourceDiscoveryKindEnum = pgEnum("source_discovery_kind", ["bill", "vote"]);
export const governanceAlignmentEnum = pgEnum("governance_alignment", [
  "government",
  "governing_support",
  "opposition",
  "mixed",
  "unaffiliated",
  "unknown"
]);
export const alignmentBasisEnum = pgEnum("alignment_basis", [
  "official_investiture",
  "official_coalition",
  "parliamentary_group_declaration",
  "computed_vote_support",
  "manual_curation",
  "unknown"
]);
export const ministryLineageTypeEnum = pgEnum("ministry_lineage_type", [
  "renamed_to",
  "replaced_by",
  "merged_into",
  "split_into",
  "responsibility_transferred_to"
]);
export const compositionEventTypeEnum = pgEnum("composition_event_type", [
  "legislature_start",
  "legislature_end",
  "government_designated",
  "government_invested",
  "government_ended",
  "minister_appointed",
  "minister_ended",
  "reshuffle",
  "no_confidence_motion",
  "confidence_vote",
  "coalition_change",
  "group_change",
  "member_mandate_start",
  "member_mandate_end",
  "committee_change",
  "role_change",
  "other"
]);
export const storedAssetEntityTypeEnum = pgEnum("stored_asset_entity_type", [
  "member",
  "person",
  "party",
  "formation",
  "bill_document",
  "source_snapshot",
  "pipeline_report"
]);
export const storedAssetTypeEnum = pgEnum("stored_asset_type", [
  "photo",
  "cv",
  "party_logo",
  "bill_text",
  "html_snapshot",
  "report"
]);
export const storedAssetStatusEnum = pgEnum("stored_asset_status", [
  "pending",
  "stored",
  "failed",
  "missing",
  "official_timeout"
]);
export const storedAssetStorageProviderEnum = pgEnum("stored_asset_storage_provider", [
  "local",
  "digi_storage",
  "vercel_blob",
  "external"
]);
export const politicalFormationEventTypeEnum = pgEnum("political_formation_event_type", [
  "party_founded",
  "party_reestablished",
  "alliance_formed",
  "alliance_dissolved",
  "party_merged",
  "party_split",
  "party_renamed",
  "party_absorbed",
  "other"
]);
export const politicalFormationEventSourceKindEnum = pgEnum("political_formation_event_source_kind", [
  "official",
  "wikipedia",
  "curated"
]);
export const politicalFormationEventEntityTypeEnum = pgEnum("political_formation_event_entity_type", [
  "party",
  "formation"
]);
export const politicalFormationEventEntityRoleEnum = pgEnum("political_formation_event_entity_role", [
  "absorbed",
  "absorber",
  "alliance_member",
  "renamed_from",
  "renamed_to",
  "split_from",
  "split_to",
  "subject"
]);
export const documentKindEnum = pgEnum("document_kind", [
  "proposal",
  "senate_adopted_form",
  "committee_report",
  "committee_opinion",
  "adopted_form",
  "promulgation_form",
  "other"
]);
export const documentTextStatusEnum = pgEnum("document_text_status", [
  "pending",
  "stored",
  "missing",
  "failed",
  "unsupported"
]);
export const billProcedureStepTypeEnum = pgEnum("bill_procedure_step_type", [
  "registered",
  "sent_to_senate",
  "adopted_by_senate",
  "sent_to_deputies",
  "sent_to_committee",
  "committee_opinion_requested",
  "committee_opinion_received",
  "committee_report_received",
  "plenary_debate",
  "final_vote",
  "promulgation",
  "constitutional_review",
  "other",
  // Sprint 7 (D-025): the dossier pages' own vocabulary.
  "urgency_requested",
  "urgency_decided",
  "government_view_requested",
  "government_view_received",
  "opinion_requested",
  "opinion_received",
  "agenda_scheduled",
  "adopted",
  "rejected",
  "withdrawn",
  "procedure_ended",
  "deadline_extended",
  "competence_decision",
  "constitutional_window",
  "sent_to_president",
  "published",
  "archived",
  "initiators_changed",
  "reexamination_requested",
  "government_responsibility"
]);

export const legislatures = pgTable("legislatures", {
  id: text("id").primaryKey(),
  label: varchar("label", { length: 32 }).notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull()
});

export const parties = pgTable("parties", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  shortName: text("short_name").notNull(),
  name: text("name").notNull(),
  color: varchar("color", { length: 16 }).notNull(),
  /** party | minority_organisation | minority_group | independent | unaffiliated (D-029): one row per organisation, not per legislature. */
  kind: text("kind").notNull().default("party"),
  /** False when the only name we hold is the abbreviation the Chamber prints ("FD", "PLS"); the page then says the full name is not recorded. */
  fullNameKnown: boolean("full_name_known").notNull().default(true),
  /** The stored image of the party's own logo as the Chamber publishes it, linked only where one party clearly owns the image (D-029). */
  logoAssetId: text("logo_asset_id").references(() => storedAssets.id),
  logoSourceUrl: text("logo_source_url")
}, (table) => ({
  slugIdx: uniqueIndex("parties_slug_idx").on(table.slug)
}));

export const parliamentaryGroups = pgTable("parliamentary_groups", {
  id: text("id").primaryKey(),
  num: integer("num").generatedAlwaysAsIdentity().notNull(),
  partyId: text("party_id").references(() => parties.id),
  chamber: chamberEnum("chamber").notNull(),
  shortName: text("short_name").notNull(),
  name: text("name").notNull(),
  color: varchar("color", { length: 16 }).notNull()
}, (table) => ({
  numIdx: uniqueIndex("parliamentary_groups_num_idx").on(table.num)
}));

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  birthDate: date("birth_date"),
  sourceIds: jsonb("source_ids").$type<Record<string, string>>().notNull().default({})
}, (table) => ({
  slugIdx: uniqueIndex("people_slug_idx").on(table.slug),
  normalizedNameIdx: index("people_normalized_name_idx").on(table.normalizedName)
}));

/**
 * What an official page says about the person themselves (Sprint 13, D-036): the date of birth printed in the header of the Chamber's profile pages,
 * with the page it comes from. Nothing here is guessed or taken from a third party; a person whose profiles disagree has no date. Marital status and
 * children are never stored (D-021).
 */
export const personBiographies = pgTable("person_biographies", {
  personId: text("person_id").primaryKey().references(() => people.id, { onDelete: "cascade" }),
  birthDate: date("birth_date"),
  birthDateSourceUrl: text("birth_date_source_url"),
  /** The CV page the member filed with the Chamber, and the date the member last updated it (the text of the CV is not stored). */
  cvUrl: text("cv_url"),
  cvUpdatedOn: date("cv_updated_on"),
  readAt: timestamp("read_at", { withTimezone: true }).notNull()
});

/**
 * Retired person/member IDs and the ID that replaced them. Every importer resolves IDs through this
 * table, so a merge is never undone by re-running an old import that still derives the old ID.
 */
export const idAliases = pgTable("id_aliases", {
  aliasId: text("alias_id").primaryKey(),
  canonicalId: text("canonical_id").notNull(),
  kind: text("kind").notNull(), // "person" | "member"
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  canonicalIdx: index("id_aliases_canonical_idx").on(table.canonicalId)
}));

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  /** Compact key used by individual_vote_rows (D-023); the text id stays the public identity. */
  num: integer("num").generatedAlwaysAsIdentity().notNull(),
  personId: text("person_id").references(() => people.id),
  slug: text("slug").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  displayName: text("display_name").notNull(),
  sourceIds: jsonb("source_ids").$type<Record<string, string>>().notNull().default({})
}, (table) => ({
  slugIdx: uniqueIndex("members_slug_idx").on(table.slug),
  numIdx: uniqueIndex("members_num_idx").on(table.num)
}));

export const sourceSnapshots = pgTable("source_snapshots", {
  id: text("id").primaryKey(),
  sourceUrl: text("source_url").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  contentHash: text("content_hash").notNull(),
  parser: text("parser").notNull(),
  parserVersion: text("parser_version").notNull(),
  status: sourceStatusEnum("status").notNull(),
  notes: text("notes")
}, (table) => ({
  hashIdx: uniqueIndex("source_snapshots_content_hash_idx").on(table.contentHash)
}));

export const ingestionRuns = pgTable("ingestion_runs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: ingestionRunStatusEnum("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error")
});

export const sourceDiscoveries = pgTable("source_discoveries", {
  id: text("id").primaryKey(),
  chamber: chamberEnum("chamber").notNull(),
  kind: sourceDiscoveryKindEnum("kind").notNull(),
  sourceUrl: text("source_url").notNull(),
  officialId: text("official_id"),
  title: text("title"),
  discoveredOn: date("discovered_on"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  importedAt: timestamp("imported_at", { withTimezone: true }),
  status: sourceDiscoveryStatusEnum("status").notNull().default("pending"),
  failureCount: integer("failure_count").notNull().default(0),
  lastError: text("last_error"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  sourceUrlIdx: uniqueIndex("source_discoveries_source_url_idx").on(table.sourceUrl)
}));

export const storedAssets = pgTable("stored_assets", {
  id: text("id").primaryKey(),
  entityType: storedAssetEntityTypeEnum("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  assetType: storedAssetTypeEnum("asset_type").notNull(),
  legislatureId: text("legislature_id").references(() => legislatures.id),
  chamber: chamberEnum("chamber"),
  officialUrl: text("official_url"),
  blobUrl: text("blob_url"),
  storageProvider: storedAssetStorageProviderEnum("storage_provider"),
  storagePath: text("storage_path"),
  publicUrl: text("public_url"),
  width: integer("width"),
  height: integer("height"),
  variant: text("variant"),
  contentHash: text("content_hash"),
  mimeType: text("mime_type"),
  byteSize: integer("byte_size"),
  fetchStatus: storedAssetStatusEnum("fetch_status").notNull().default("pending"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  entityIdx: index("stored_assets_entity_idx").on(table.entityType, table.entityId, table.assetType),
  officialUrlIdx: index("stored_assets_official_url_idx").on(table.officialUrl),
  contentHashIdx: index("stored_assets_content_hash_idx").on(table.contentHash),
  statusIdx: index("stored_assets_status_idx").on(table.fetchStatus, table.lastAttemptAt),
  storageIdx: index("stored_assets_storage_idx").on(table.storageProvider, table.storagePath)
}));

export const politicalFormationEvents = pgTable("political_formation_events", {
  id: text("id").primaryKey(),
  date: date("date").notNull(),
  eventType: politicalFormationEventTypeEnum("event_type").notNull(),
  titleRo: text("title_ro").notNull(),
  titleEn: text("title_en").notNull(),
  descriptionRo: text("description_ro").notNull(),
  descriptionEn: text("description_en").notNull(),
  sourceUrl: text("source_url"),
  sourceKind: politicalFormationEventSourceKindEnum("source_kind").notNull().default("curated")
}, (table) => ({
  dateIdx: index("political_formation_events_date_idx").on(table.date, table.eventType),
  sourceKindIdx: index("political_formation_events_source_kind_idx").on(table.sourceKind)
}));

export const politicalFormationEventEntities = pgTable("political_formation_event_entities", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => politicalFormationEvents.id),
  entityType: politicalFormationEventEntityTypeEnum("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  role: politicalFormationEventEntityRoleEnum("role").notNull()
}, (table) => ({
  eventIdx: index("political_formation_event_entities_event_idx").on(table.eventId),
  entityIdx: index("political_formation_event_entities_entity_idx").on(table.entityType, table.entityId, table.role),
  uniqueEntityRoleIdx: uniqueIndex("political_formation_event_entities_unique_idx").on(table.eventId, table.entityType, table.entityId, table.role)
}));

export const governments = pgTable("governments", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  legislatureId: text("legislature_id").references(() => legislatures.id),
  primeMinisterPersonId: text("prime_minister_person_id").references(() => people.id),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  basis: alignmentBasisEnum("basis").notNull().default("official_investiture"),
  investitureVoteId: text("investiture_vote_id"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  slugIdx: uniqueIndex("governments_slug_idx").on(table.slug),
  periodIdx: index("governments_period_idx").on(table.startsOn, table.endsOn),
  legislatureIdx: index("governments_legislature_idx").on(table.legislatureId)
}));

export const ministries = pgTable("ministries", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  descriptionRo: text("description_ro").notNull(),
  descriptionEn: text("description_en").notNull(),
  active: integer("active").notNull().default(1)
}, (table) => ({
  slugIdx: uniqueIndex("ministries_slug_idx").on(table.slug)
}));

export const policyPortfolios = pgTable("policy_portfolios", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  nameRo: text("name_ro").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionRo: text("description_ro").notNull(),
  descriptionEn: text("description_en").notNull(),
  active: integer("active").notNull().default(1)
}, (table) => ({
  slugIdx: uniqueIndex("policy_portfolios_slug_idx").on(table.slug)
}));

export const ministryAliases = pgTable("ministry_aliases", {
  id: text("id").primaryKey(),
  ministryId: text("ministry_id").notNull().references(() => ministries.id),
  name: text("name").notNull(),
  startsOn: date("starts_on"),
  endsOn: date("ends_on")
}, (table) => ({
  ministryIdx: index("ministry_aliases_ministry_idx").on(table.ministryId),
  nameIdx: index("ministry_aliases_name_idx").on(table.name)
}));

export const ministryIncarnations = pgTable("ministry_incarnations", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  slugIdx: uniqueIndex("ministry_incarnations_slug_idx").on(table.slug),
  periodIdx: index("ministry_incarnations_period_idx").on(table.startsOn, table.endsOn)
}));

export const ministryIncarnationPortfolios = pgTable("ministry_incarnation_portfolios", {
  id: text("id").primaryKey(),
  incarnationId: text("incarnation_id").notNull().references(() => ministryIncarnations.id),
  portfolioId: text("portfolio_id").notNull().references(() => policyPortfolios.id),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  incarnationIdx: index("ministry_incarnation_portfolios_incarnation_idx").on(table.incarnationId),
  portfolioPeriodIdx: index("ministry_incarnation_portfolios_portfolio_period_idx").on(table.portfolioId, table.startsOn, table.endsOn),
  uniqueMappingIdx: uniqueIndex("ministry_incarnation_portfolios_unique_idx").on(table.incarnationId, table.portfolioId, table.startsOn)
}));

export const ministryLineage = pgTable("ministry_lineage", {
  id: text("id").primaryKey(),
  fromIncarnationId: text("from_incarnation_id").notNull().references(() => ministryIncarnations.id),
  toIncarnationId: text("to_incarnation_id").notNull().references(() => ministryIncarnations.id),
  relationship: ministryLineageTypeEnum("relationship").notNull(),
  effectiveOn: date("effective_on").notNull(),
  notes: text("notes"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  fromIdx: index("ministry_lineage_from_idx").on(table.fromIncarnationId),
  toIdx: index("ministry_lineage_to_idx").on(table.toIncarnationId),
  uniqueEdgeIdx: uniqueIndex("ministry_lineage_unique_idx").on(table.fromIncarnationId, table.toIncarnationId, table.relationship, table.effectiveOn)
}));

/**
 * How a government came to be, or failed to: one row per candidate for prime minister (Constitution art. 103).
 * Investiture votes are secret ballots, so only totals exist; every figure comes from a cited source.
 */
export const governmentFormationAttempts = pgTable("government_formation_attempts", {
  id: text("id").primaryKey(),
  designeePersonId: text("designee_person_id").notNull().references(() => people.id),
  precedingGovernmentId: text("preceding_government_id").references(() => governments.id),
  resultingGovernmentId: text("resulting_government_id").references(() => governments.id),
  designatedOn: date("designated_on").notNull(),
  designationDecree: text("designation_decree"),
  designationDecreeUrl: text("designation_decree_url"),
  revokedOn: date("revoked_on"),
  revocationDecree: text("revocation_decree"),
  revocationDecreeUrl: text("revocation_decree_url"),
  voteHeldOn: date("vote_held_on"),
  presentCount: integer("present_count"),
  votesFor: integer("votes_for"),
  votesAgainst: integer("votes_against"),
  votesVoid: integer("votes_void"),
  threshold: integer("threshold"),
  /** invested | failed | revoked_before_vote */
  outcome: text("outcome").$type<"invested" | "failed" | "revoked_before_vote">().notNull(),
  parliamentDecision: text("parliament_decision"),
  parliamentDecisionUrl: text("parliament_decision_url"),
  appointmentDecree: text("appointment_decree"),
  sources: jsonb("sources").$type<Array<{ label: string; url: string; kind: "official" | "reported" }>>().notNull().default([]),
  notes: text("notes")
}, (table) => ({
  designatedIdx: index("government_formation_attempts_designated_idx").on(table.designatedOn)
}));

/** Censure and simple motions with their official result and signatories. */
export const parliamentaryMotions = pgTable("parliamentary_motions", {
  id: text("id").primaryKey(),
  /** censure (joint sitting) | simple (one chamber) */
  kind: text("kind").$type<"censure" | "simple">().notNull(),
  chamber: voteChamberEnum("chamber").notNull(),
  legislatureId: text("legislature_id").references(() => legislatures.id),
  number: integer("number").notNull(),
  filedOn: date("filed_on").notNull(),
  /** Presented in the plenary, and the vote, when the source states them. */
  presentedOn: date("presented_on"),
  votedOn: date("voted_on"),
  title: text("title").notNull(),
  initiators: text("initiators"),
  /** adopted | rejected | unknown (not yet decided or not stated) */
  outcome: text("outcome").$type<"adopted" | "rejected" | "unknown">().notNull().default("unknown"),
  votesFor: integer("votes_for"),
  votesAgainst: integer("votes_against"),
  votesAbstain: integer("votes_abstain"),
  votesVoid: integer("votes_void"),
  presentCount: integer("present_count"),
  signatoriesDeputies: integer("signatories_deputies"),
  signatoriesSenators: integer("signatories_senators"),
  targetGovernmentId: text("target_government_id").references(() => governments.id),
  sourceUrl: text("source_url").notNull(),
  documentUrl: text("document_url"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  filedIdx: index("parliamentary_motions_filed_idx").on(table.filedOn),
  kindIdx: index("parliamentary_motions_kind_idx").on(table.kind, table.chamber)
}));

export const motionSignatories = pgTable("motion_signatories", {
  motionId: text("motion_id").notNull().references(() => parliamentaryMotions.id),
  memberId: text("member_id").notNull().references(() => members.id),
  groupLabel: text("group_label")
}, (table) => ({
  pk: primaryKey({ columns: [table.motionId, table.memberId] }),
  memberIdx: index("motion_signatories_member_idx").on(table.memberId)
}));

export const governmentRoles = pgTable("government_roles", {
  id: text("id").primaryKey(),
  governmentId: text("government_id").notNull().references(() => governments.id),
  personId: text("person_id").notNull().references(() => people.id),
  title: text("title").notNull(),
  ministry: text("ministry"),
  ministryId: text("ministry_id").references(() => ministries.id),
  ministryIncarnationId: text("ministry_incarnation_id").references(() => ministryIncarnations.id),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  governmentIdx: index("government_roles_government_idx").on(table.governmentId),
  personPeriodIdx: index("government_roles_person_period_idx").on(table.personId, table.startsOn, table.endsOn)
}));

export const governmentPartyAlignments = pgTable("government_party_alignments", {
  id: text("id").primaryKey(),
  governmentId: text("government_id").notNull().references(() => governments.id),
  partyId: text("party_id").notNull().references(() => parties.id),
  alignment: governanceAlignmentEnum("alignment").notNull().default("unknown"),
  basis: alignmentBasisEnum("basis").notNull().default("unknown"),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  partyPeriodIdx: index("government_party_alignments_party_period_idx").on(table.partyId, table.startsOn, table.endsOn),
  governmentIdx: index("government_party_alignments_government_idx").on(table.governmentId)
}));

export const governmentGroupAlignments = pgTable("government_group_alignments", {
  id: text("id").primaryKey(),
  governmentId: text("government_id").notNull().references(() => governments.id),
  groupId: text("group_id").notNull().references(() => parliamentaryGroups.id),
  alignment: governanceAlignmentEnum("alignment").notNull().default("unknown"),
  basis: alignmentBasisEnum("basis").notNull().default("unknown"),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  groupPeriodIdx: index("government_group_alignments_group_period_idx").on(table.groupId, table.startsOn, table.endsOn),
  governmentIdx: index("government_group_alignments_government_idx").on(table.governmentId)
}));

export const memberMandates = pgTable("member_mandates", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  legislatureId: text("legislature_id").notNull().references(() => legislatures.id),
  chamber: chamberEnum("chamber").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  constituency: text("constituency"),
  status: text("status").notNull().default("unknown"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  memberLegislatureIdx: index("member_mandates_member_legislature_idx").on(table.memberId, table.legislatureId, table.chamber),
  legislatureChamberIdx: index("member_mandates_legislature_chamber_idx").on(table.legislatureId, table.chamber),
  chamberPeriodIdx: index("member_mandates_chamber_period_idx").on(table.chamber, table.startsOn, table.endsOn)
}));

export const memberMandateRelations = pgTable("member_mandate_relations", {
  id: text("id").primaryKey(),
  mandateId: text("mandate_id").notNull().references(() => memberMandates.id),
  relation: text("relation").notNull(),
  relatedMemberId: text("related_member_id").references(() => members.id),
  relatedName: text("related_name").notNull(),
  relatedOfficialUrl: text("related_official_url"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  mandateIdx: index("member_mandate_relations_mandate_idx").on(table.mandateId),
  relatedMemberIdx: index("member_mandate_relations_related_member_idx").on(table.relatedMemberId)
}));

export const memberGroupMemberships = pgTable("member_group_memberships", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  groupId: text("group_id").notNull().references(() => parliamentaryGroups.id),
  startsOn: date("starts_on").notNull(),
  // "month" when the official source only gives a month (CDEP: "din iun. 2025"); the date is then the 1st of that month.
  startsOnPrecision: text("starts_on_precision").notNull().default("day"),
  endsOn: date("ends_on"),
  endsOnPrecision: text("ends_on_precision").notNull().default("day"),
  currentSnapshotOn: date("current_snapshot_on"),
  logoUrl: text("logo_url"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  memberPeriodIdx: index("member_group_memberships_member_period_idx").on(table.memberId, table.startsOn, table.endsOn),
  groupPeriodIdx: index("member_group_memberships_group_period_idx").on(table.groupId, table.startsOn, table.endsOn),
  groupMemberPeriodIdx: index("member_group_memberships_group_member_period_idx").on(table.groupId, table.memberId, table.startsOn, table.endsOn)
}));

export const memberPartyAffiliations = pgTable("member_party_affiliations", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  partyId: text("party_id").notNull().references(() => parties.id),
  startsOn: date("starts_on").notNull(),
  startsOnPrecision: text("starts_on_precision").notNull().default("day"),
  endsOn: date("ends_on"),
  endsOnPrecision: text("ends_on_precision").notNull().default("day"),
  logoUrl: text("logo_url"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  memberPeriodIdx: index("member_party_affiliations_member_period_idx").on(table.memberId, table.startsOn, table.endsOn),
  partyPeriodIdx: index("member_party_affiliations_party_period_idx").on(table.partyId, table.startsOn, table.endsOn)
}));

export const memberGovernanceAlignments = pgTable("member_governance_alignments", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  governmentId: text("government_id").references(() => governments.id),
  alignment: governanceAlignmentEnum("alignment").notNull().default("unknown"),
  basis: alignmentBasisEnum("basis").notNull().default("unknown"),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  memberPeriodIdx: index("member_governance_alignments_member_period_idx").on(table.memberId, table.startsOn, table.endsOn),
  governmentIdx: index("member_governance_alignments_government_idx").on(table.governmentId)
}));

export const compositionEvents = pgTable("composition_events", {
  id: text("id").primaryKey(),
  eventType: compositionEventTypeEnum("event_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  occurredOn: date("occurred_on").notNull(),
  endsOn: date("ends_on"),
  legislatureId: text("legislature_id").references(() => legislatures.id),
  governmentId: text("government_id").references(() => governments.id),
  chamber: chamberEnum("chamber"),
  memberId: text("member_id").references(() => members.id),
  personId: text("person_id").references(() => people.id),
  partyId: text("party_id").references(() => parties.id),
  groupId: text("group_id").references(() => parliamentaryGroups.id),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  dateIdx: index("composition_events_date_idx").on(table.occurredOn, table.eventType),
  governmentIdx: index("composition_events_government_idx").on(table.governmentId),
  legislatureIdx: index("composition_events_legislature_idx").on(table.legislatureId)
}));

export const memberCommitteeMemberships = pgTable("member_committee_memberships", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  committeeName: text("committee_name").notNull(),
  chamber: chamberEnum("chamber").notNull(),
  role: text("role"),
  startsOn: date("starts_on").notNull(),
  startsOnPrecision: text("starts_on_precision").notNull().default("day"),
  endsOn: date("ends_on"),
  endsOnPrecision: text("ends_on_precision").notNull().default("day"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
});

export const memberRoles = pgTable("member_roles", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  title: text("title").notNull(),
  chamber: chamberEnum("chamber").notNull(),
  /** "group": leader, deputy leader or secretary of a parliamentary group; "bureau": the chamber's Permanent Bureau; "other": undated snapshot rows from before D37. */
  kind: text("kind").notNull().default("other"),
  /** The parliamentary group of a "group" role. */
  groupId: text("group_id").references(() => parliamentaryGroups.id),
  startsOn: date("starts_on").notNull(),
  // "month" when the official source only gives a month ("din feb. 2026"); the date is then the 1st of that month.
  startsOnPrecision: text("starts_on_precision").notNull().default("day"),
  endsOn: date("ends_on"),
  endsOnPrecision: text("ends_on_precision").notNull().default("day"),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  memberIdx: index("member_roles_member_idx").on(table.memberId),
  kindPeriodIdx: index("member_roles_kind_period_idx").on(table.kind, table.chamber, table.startsOn)
}));

/**
 * Counts the institutions publish about a member's own activity (initiatives, speeches, questions, motions signed,
 * e-vote attendance), stored as published beside the figures we compute ourselves. One row per member, legislature and metric.
 */
/**
 * The delegations to international parliamentary organisations and the friendship groups with other parliaments a member's profile lists (Sprint 13a, D-036),
 * each with the role printed after it. Read from the profile page; replaced as a whole whenever the page is read again.
 */
export const memberInternationalBodies = pgTable("member_international_bodies", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  legislatureId: text("legislature_id").notNull().references(() => legislatures.id),
  /** delegation | friendship_group */
  kind: text("kind").notNull(),
  /** The Chamber's number of the body (`idg`). */
  officialId: text("official_id").notNull(),
  name: text("name").notNull(),
  role: text("role"),
  bodyUrl: text("body_url").notNull(),
  sourceUrl: text("source_url").notNull(),
  asOf: date("as_of").notNull()
}, (table) => ({
  memberIdx: index("member_international_bodies_member_idx").on(table.memberId, table.legislatureId),
  bodyIdx: uniqueIndex("member_international_bodies_body_idx").on(table.memberId, table.legislatureId, table.kind, table.officialId)
}));

/**
 * A question ("întrebare") or interpellation ("interpelare") a deputy put to the Government, read from the Chamber's page for it (Sprint 13c, D-036): the number and dates,
 * the text's PDF, the answer with its date and PDF when there is one. The askers and the addressees are in their own tables (several of each are possible).
 */
export const parliamentaryQuestions = pgTable("parliamentary_questions", {
  id: text("id").primaryKey(),
  chamber: chamberEnum("chamber").notNull(),
  /** The Chamber's number for the page (`idi`). */
  officialId: text("official_id").notNull(),
  /** question | interpellation */
  kind: text("kind").notNull(),
  /** "819B" for an interpellation, "3676A" for a question. */
  number: text("number").notNull(),
  title: text("title").notNull(),
  registeredOn: date("registered_on").notNull(),
  presentedOn: date("presented_on"),
  communicatedOn: date("communicated_on"),
  /** "în scris" | "oral" as the page prints it. */
  askMode: text("ask_mode"),
  /** The PDF of the text. */
  textUrl: text("text_url"),
  answerNumber: text("answer_number"),
  answeredOn: date("answered_on"),
  answerMode: text("answer_mode"),
  /** The institution the answer came from, and who signed it, as printed. */
  answerFrom: text("answer_from"),
  answerSignedBy: text("answer_signed_by"),
  answerUrl: text("answer_url"),
  sourceUrl: text("source_url").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull()
}, (table) => ({
  officialIdx: uniqueIndex("parliamentary_questions_official_idx").on(table.chamber, table.officialId),
  registeredIdx: index("parliamentary_questions_registered_idx").on(table.registeredOn)
}));

export const parliamentaryQuestionAskers = pgTable("parliamentary_question_askers", {
  questionId: text("question_id").notNull().references(() => parliamentaryQuestions.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  /** The member the page links; empty when the link names a profile we do not hold. */
  memberId: text("member_id").references(() => members.id),
  /** As printed: "Mirela Elena Adomnicăi - deputat PSD". */
  askerText: text("asker_text").notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.questionId, table.position] }),
  memberIdx: index("parliamentary_question_askers_member_idx").on(table.memberId)
}));

export const parliamentaryQuestionAddressees = pgTable("parliamentary_question_addressees", {
  questionId: text("question_id").notNull().references(() => parliamentaryQuestions.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  /** The institution as printed ("Ministerul Mediului, Apelor şi Pădurilor", "Primul-ministru", ...). */
  name: text("name").notNull(),
  /** The person it was sent to, as printed ("doamnei Diana-Anda Buzoianu - Ministru"). */
  attention: text("attention"),
  /** The ministry of ours that has exactly this name; empty for any other body. */
  ministryId: text("ministry_id").references(() => ministries.id)
}, (table) => ({
  pk: primaryKey({ columns: [table.questionId, table.position] }),
  ministryIdx: index("parliamentary_question_addressees_ministry_idx").on(table.ministryId)
}));

export const memberOfficialActivity = pgTable("member_official_activity", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  legislatureId: text("legislature_id").notNull().references(() => legislatures.id),
  chamber: chamberEnum("chamber").notNull(),
  metric: text("metric").notNull(),
  value: integer("value").notNull(),
  /** For attendance-like metrics: the total the value is counted against ("87 of 95 sittings"). */
  outOf: integer("out_of"),
  /** Secondary count shown in the same line ("43 initiatives, 6 of them promulgated"). */
  detail: integer("detail"),
  asOf: date("as_of").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceSnapshotId: text("source_snapshot_id").references(() => sourceSnapshots.id)
}, (table) => ({
  memberMetricIdx: uniqueIndex("member_official_activity_member_metric_idx").on(table.memberId, table.legislatureId, table.metric)
}));

export const bills = pgTable("bills", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  identifiers: jsonb("identifiers").$type<Record<string, string>>().notNull().default({}),
  chamberOfOrigin: text("chamber_of_origin").notNull().default("unknown"),
  decisionChamber: chamberEnum("decision_chamber"),
  status: text("status").notNull().default("unknown"),
  /** "Caracterul legii" from the official bill page: ordinary | organic | constitutional; null when not read. */
  lawType: text("law_type").$type<"ordinary" | "organic" | "constitutional">(),
  sourceSnapshotIds: jsonb("source_snapshot_ids").$type<string[]>().notNull().default([])
}, (table) => ({
  slugIdx: uniqueIndex("bills_slug_idx").on(table.slug),
  chamberOriginIdx: index("bills_chamber_origin_idx").on(table.chamberOfOrigin),
  decisionChamberIdx: index("bills_decision_chamber_idx").on(table.decisionChamber),
  statusIdx: index("bills_status_idx").on(table.status)
}));

export const billVoteSummaries = pgTable("bill_vote_summaries", {
  billId: text("bill_id").primaryKey().references(() => bills.id),
  submittedOn: date("submitted_on"),
  latestEventOn: date("latest_event_on"),
  voteCount: integer("vote_count").notNull().default(0),
  sourceStatus: sourceStatusEnum("source_status").notNull().default("partial"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull()
}, (table) => ({
  submittedIdx: index("bill_vote_summaries_submitted_idx").on(table.submittedOn, table.billId),
  latestEventIdx: index("bill_vote_summaries_latest_event_idx").on(table.latestEventOn, table.billId),
  sourceStatusIdx: index("bill_vote_summaries_source_status_idx").on(table.sourceStatus)
}));

export const billEvents = pgTable("bill_events", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  occurredOn: date("occurred_on").notNull(),
  chamber: text("chamber").notNull().default("unknown"),
  label: text("label").notNull(),
  sourceUrl: text("source_url")
}, (table) => ({
  billDateIdx: index("bill_events_bill_date_idx").on(table.billId, table.occurredOn),
  occurredOnIdx: index("bill_events_occurred_on_idx").on(table.occurredOn)
}));

export const billSponsors = pgTable("bill_sponsors", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  sponsorType: text("sponsor_type").notNull().default("unknown"),
  memberId: text("member_id").references(() => members.id),
  name: text("name").notNull(),
  /** The group or party label printed beside the name on the bill page ("PSD", "neafiliati"). */
  groupLabel: text("group_label"),
  /** "deputies" or "senate" when the page says whether the initiator is a deputy or a senator. */
  memberChamber: text("member_chamber"),
  /** Which official page named the initiator: "cdep" (with a profile link) or "senate" (a name). */
  source: text("source")
}, (table) => ({
  billIdx: index("bill_sponsors_bill_idx").on(table.billId),
  memberIdx: index("bill_sponsors_member_idx").on(table.memberId)
}));

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  label: text("label").notNull(),
  url: text("url").notNull(),
  documentKind: documentKindEnum("document_kind").notNull().default("other"),
  sourceChamber: chamberEnum("source_chamber"),
  officialUrlHash: text("official_url_hash"),
  textAssetId: text("text_asset_id").references(() => storedAssets.id),
  textStatus: documentTextStatusEnum("text_status").notNull().default("pending"),
  textPreview: text("text_preview"),
  lastTextAttemptAt: timestamp("last_text_attempt_at", { withTimezone: true })
}, (table) => ({
  billKindIdx: index("documents_bill_kind_idx").on(table.billId, table.documentKind),
  officialUrlHashIdx: index("documents_official_url_hash_idx").on(table.officialUrlHash),
  textStatusIdx: index("documents_text_status_idx").on(table.textStatus)
}));

export const billMinistryRelations = pgTable("bill_ministry_relations", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  ministryId: text("ministry_id").notNull().references(() => ministries.id),
  relation: text("relation").notNull(),
  confidence: text("confidence").notNull(),
  reason: text("reason").notNull(),
  documentId: text("document_id").references(() => documents.id),
  sourceUrl: text("source_url"),
  evidenceExcerpt: text("evidence_excerpt")
}, (table) => ({
  billIdx: index("bill_ministry_relations_bill_idx").on(table.billId),
  ministryIdx: index("bill_ministry_relations_ministry_idx").on(table.ministryId, table.confidence),
  uniqueRelationIdx: uniqueIndex("bill_ministry_relations_unique_idx").on(table.billId, table.ministryId, table.relation)
}));

export const billProcedureSteps = pgTable("bill_procedure_steps", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  occurredOn: date("occurred_on").notNull(),
  chamber: text("chamber").notNull().default("unknown"),
  stepType: billProcedureStepTypeEnum("step_type").notNull().default("other"),
  title: text("title").notNull(),
  description: text("description"),
  committeeName: text("committee_name"),
  documentId: text("document_id").references(() => documents.id),
  sourceUrl: text("source_url"),
  displayOrder: integer("display_order").notNull().default(0),
  /** "cdep" or "senate": the official page the step was read from (D-025). */
  source: text("source"),
  /** An outside body the step concerns (Consiliul Legislativ, the Government, ...); parliamentary committees use `committee_name`. */
  institution: text("institution"),
  /** The page's own committee identifier: "cdep:7" (the Chamber's idc) or "senate:<guid>". */
  committeeRef: text("committee_ref"),
  /** favorable | unfavorable | favorable_with_amendments | rejection, as the sentence says. */
  verdict: text("verdict"),
  /** Registration number of the report, opinion or view ("213", "596/27.08.2025"). */
  documentNumber: text("document_number"),
  amendmentsAdmitted: integer("amendments_admitted"),
  amendmentsRejected: integer("amendments_rejected"),
  deadlineAmendmentsOn: date("deadline_amendments_on"),
  deadlineOn: date("deadline_on"),
  /** The counts the dossier prints beside an adoption or rejection. */
  resultFor: integer("result_for"),
  resultAgainst: integer("result_against"),
  resultAbstention: integer("result_abstention"),
  resultNotVoting: integer("result_not_voting"),
  /** The vote this step links to, when we hold it (the dossier names the vote page; D-025). */
  voteId: text("vote_id"),
  /** The official vote page the dossier names: "cdep:36828" or "senate:<AppID>". */
  voteRef: text("vote_ref"),
  stenogramUrl: text("stenogram_url"),
  /** A note printed with the row (the law's category, the title as adopted). */
  note: text("note")
}, (table) => ({
  billDateIdx: index("bill_procedure_steps_bill_date_idx").on(table.billId, table.occurredOn, table.displayOrder),
  documentIdx: index("bill_procedure_steps_document_idx").on(table.documentId),
  typeIdx: index("bill_procedure_steps_type_idx").on(table.stepType)
}));

/**
 * The Government ordinances approval bills approve (D-033, Sprint 12b), read from the legislative portal: an urgency ordinance (OUG) or an ordinary one (OG),
 * with its own date, title, Official Gazette number and date, and the portal's page of its text. One row per ordinance, whatever bills refer to it.
 */
export const governmentOrdinances = pgTable("government_ordinances", {
  id: text("id").primaryKey(),
  /** urgency (OUG) | ordinary (OG). */
  kind: text("kind").notNull(),
  number: text("number").notNull(),
  year: integer("year").notNull(),
  issuedOn: date("issued_on").notNull(),
  title: text("title").notNull(),
  issuer: text("issuer").notNull(),
  gazetteNumber: text("gazette_number"),
  gazetteOn: date("gazette_on"),
  portalUrl: text("portal_url").notNull(),
  portalId: text("portal_id"),
  readAt: timestamp("read_at", { withTimezone: true }).notNull()
}, (table) => ({
  referenceIdx: uniqueIndex("government_ordinances_reference_idx").on(table.kind, table.number, table.year)
}));

/**
 * The ordinance a bill's title says it approves. `ordinance_id` is empty when the portal has no such act: the reference from the title stays, with no link.
 */
export const billOrdinances = pgTable("bill_ordinances", {
  billId: text("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  number: text("number").notNull(),
  year: integer("year").notNull(),
  ordinanceId: text("ordinance_id").references(() => governmentOrdinances.id)
}, (table) => ({
  pk: primaryKey({ columns: [table.billId, table.kind, table.number, table.year] }),
  ordinanceIdx: index("bill_ordinances_ordinance_idx").on(table.ordinanceId)
}));

/**
 * Bills the Senate's Legislative Bulletin marks "prioritate legislativă" (D-034, Sprint 12c), one row per bill and session: where the label was read (the bulletin,
 * its page) and the other labels printed with it. The bulletin does not say who asked for the label.
 */
export const billPriorityFlags = pgTable("bill_priority_flags", {
  billId: text("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  /** "2025-1" (the first ordinary session of 2025, February to June) or "2025-2" (September to December). */
  sessionId: text("session_id").notNull(),
  sessionLabel: text("session_label").notNull(),
  sessionStartsOn: date("session_starts_on").notNull(),
  sessionEndsOn: date("session_ends_on").notNull(),
  bulletinUrl: text("bulletin_url").notNull(),
  bulletinPage: integer("bulletin_page").notNull(),
  senateNumber: text("senate_number").notNull(),
  urgency: boolean("urgency").notNull().default(false),
  /** ordinary | organic, as printed beside the label. */
  lawKind: text("law_kind")
}, (table) => ({
  pk: primaryKey({ columns: [table.billId, table.sessionId] }),
  sessionIdx: index("bill_priority_flags_session_idx").on(table.sessionId)
}));

/**
 * What was read from the committees' report PDFs (D-035, Sprint 12d): per report document, how many pages, how clean the text is (the Chamber's reports are born
 * digital, the Senate's are scans with an OCR layer), and, only where it can be read without guessing, where the amendment annexes are and who the annex names.
 */
export const committeeReportReads = pgTable("committee_report_reads", {
  documentId: text("document_id").primaryKey().references(() => documents.id, { onDelete: "cascade" }),
  pages: integer("pages").notNull(),
  /** Share of words with a character that does not occur in Romanian text (OCR noise), in percent. */
  garbledPercent: real("garbled_percent").notNull(),
  /** clean | poor | none. */
  quality: text("quality").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull()
});

export const committeeReportAnnexes = pgTable("committee_report_annexes", {
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  /** admitted | rejected. */
  kind: text("kind").notNull(),
  page: integer("page").notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.documentId, table.kind, table.page] })
}));

export const committeeReportAuthors = pgTable("committee_report_authors", {
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  /** deputy | senator. */
  role: text("role").notNull(),
  groupLabel: text("group_label"),
  /** Set only when exactly one member of that chamber has the same words in any order. */
  memberId: text("member_id").references(() => members.id)
}, (table) => ({
  pk: primaryKey({ columns: [table.documentId, table.position] }),
  memberIdx: index("committee_report_authors_member_idx").on(table.memberId)
}));

/**
 * Every document a dossier step prints, in the page's order (D-032). `bill_procedure_steps.document_id` keeps the first one; this table keeps all of them, so a
 * registration step shows its Legislative Council opinion and the Government's decision, and a report its annexes and the .doc copy beside the .pdf.
 * Rewritten with the steps (the steps are replaced as a whole on every import).
 */
export const billStepDocuments = pgTable("bill_step_documents", {
  stepId: text("step_id").notNull().references(() => billProcedureSteps.id, { onDelete: "cascade" }),
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  position: integer("position").notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.stepId, table.documentId] }),
  documentIdx: index("bill_step_documents_document_idx").on(table.documentId)
}));

/**
 * What a bill's dossier pages say, read as published (D-025): registration numbers, initiative type, urgency,
 * the stage line, the Chamber's summary of the object, and the bill's fate. One row per bill that has been read.
 */
export const billDossiers = pgTable("bill_dossiers", {
  billId: text("bill_id").primaryKey().references(() => bills.id),
  readAt: timestamp("read_at", { withTimezone: true }).notNull(),
  /** The official pages read and when they were fetched: { cdep?: { url, fetchedAt }, senate?: { url, fetchedAt } }. */
  sources: jsonb("sources").$type<Record<string, { url: string; fetchedAt?: string }>>().notNull().default({}),
  registrations: jsonb("registrations").$type<Array<{ body: string; number: string; date?: string }>>().notNull().default([]),
  initiativeType: text("initiative_type"),
  initiativeKind: text("initiative_kind"),
  urgent: boolean("urgent"),
  stageText: text("stage_text"),
  summary: text("summary"),
  tacitDeadline: date("tacit_deadline"),
  initiatorCountText: text("initiator_count_text"),
  /** in_progress | promulgated | rejected | withdrawn | ended (only what the pages say; see D-025). */
  outcome: text("outcome").notNull().default("in_progress"),
  outcomeOn: date("outcome_on"),
  lawNumber: text("law_number"),
  lawYear: integer("law_year"),
  decreeNumber: text("decree_number"),
  decreeYear: integer("decree_year"),
  decreeOn: date("decree_on"),
  gazetteNumber: text("gazette_number"),
  gazetteOn: date("gazette_on")
}, (table) => ({
  outcomeIdx: index("bill_dossiers_outcome_idx").on(table.outcome),
  lawIdx: index("bill_dossiers_law_idx").on(table.lawYear, table.lawNumber)
}));

/**
 * The President's decrees since 2014, from the legislative portal's catalog (Sprint 14, D-037). One row per decree: number, date, the subject as the title prints it, its type
 * (read from that title by plain rules), the Official Gazette that published it, who signed it (read from the signature at the end of the decree) and the portal's page. The text of a decree
 * is not stored: it names the people it concerns, private persons decorated among them (D-029, Q19).
 */
export const presidentialDecrees = pgTable("presidential_decrees", {
  id: text("id").primaryKey(),
  number: integer("number").notNull(),
  year: integer("year").notNull(),
  issuedOn: date("issued_on").notNull(),
  subject: text("subject").notNull(),
  kind: text("kind").notNull(),
  /** appointment | release | other, where the title says which. */
  action: text("action"),
  gazetteNumber: text("gazette_number"),
  gazetteOn: date("gazette_on"),
  signer: text("signer"),
  signedAsInterim: boolean("signed_as_interim").notNull().default(false),
  /** True when the signer was not read from this decree's own signature but taken from the decrees signed just before and after it by the same person. */
  signerInferred: boolean("signer_inferred").notNull().default(false),
  portalUrl: text("portal_url").notNull(),
  portalId: text("portal_id"),
  readAt: timestamp("read_at", { withTimezone: true }).notNull()
}, (table) => ({
  referenceIdx: uniqueIndex("presidential_decrees_reference_idx").on(table.year, table.number),
  kindIdx: index("presidential_decrees_kind_idx").on(table.kind, table.issuedOn),
  issuedIdx: index("presidential_decrees_issued_idx").on(table.issuedOn)
}));

/**
 * The parliamentary elections whose results the Permanent Electoral Authority publishes as open data (Sprint 15, D-038): 2016 and 2020. The 2024 elections are not in that open data
 * (their results sit on a site that answers a browser check to any program), so they are not here and the site says so.
 */
export const elections = pgTable("elections", {
  id: text("id").primaryKey(),
  labelRo: text("label_ro").notNull(),
  labelEn: text("label_en").notNull(),
  heldOn: date("held_on").notNull(),
  /** The legislature the election produced, by the year it began ("2020"). */
  legislatureYear: text("legislature_year").notNull(),
  portalUrl: text("portal_url").notNull(),
  license: text("license").notNull(),
  /** False when the mandates each list won are not in the files read (only the votes are): the page then shows no mandates for this election. */
  mandatesKnown: boolean("mandates_known").notNull().default(true),
  readAt: timestamp("read_at", { withTimezone: true }).notNull()
});

/**
 * The votes and mandates of each list in each circumscription of one election and chamber: the sum over its polling stations and the votes by mail, as the AEP's files give them.
 * `party_id` is set only where the list's printed name is exactly a party we hold; an alliance or a minority organisation stays a name.
 */
export const electionListResults = pgTable("election_list_results", {
  electionId: text("election_id").notNull().references(() => elections.id, { onDelete: "cascade" }),
  chamber: chamberEnum("chamber").notNull(),
  circumscriptionNumber: integer("circumscription_number").notNull(),
  circumscription: text("circumscription").notNull(),
  listName: text("list_name").notNull(),
  votes: integer("votes").notNull(),
  mandates: integer("mandates").notNull().default(0),
  partyId: text("party_id").references(() => parties.id),
  independent: boolean("independent").notNull().default(false)
}, (table) => ({
  pk: primaryKey({ columns: [table.electionId, table.chamber, table.circumscriptionNumber, table.listName] }),
  partyIdx: index("election_list_results_party_idx").on(table.partyId),
  scopeIdx: index("election_list_results_scope_idx").on(table.electionId, table.chamber)
}));

/**
 * The lists of one election and chamber, each with a small code so that the votes of a commune can be kept as two short arrays (Sprint 17, D-041). Code 0 is "the independent candidates", added
 * together; the others are numbered by their votes, the largest first.
 */
export const electionLists = pgTable("election_lists", {
  electionId: text("election_id").notNull().references(() => elections.id, { onDelete: "cascade" }),
  chamber: chamberEnum("chamber").notNull(),
  code: integer("code").notNull(),
  name: text("name").notNull(),
  independents: boolean("independents").notNull().default(false),
  partyId: text("party_id").references(() => parties.id)
}, (table) => ({
  pk: primaryKey({ columns: [table.electionId, table.chamber, table.code] })
}));

/**
 * The polling-station results added up per commune or city (Bucharest per sector; abroad per country) for one election and chamber, from the same files as `election_list_results` but without
 * the votes by mail, which belong to no place. `area_key` is the SIRUTA code of the commune, or "abroad:<country>". The statistics are the AEP's columns: `registered` is a1 (voters on the permanent
 * lists), `present` is b (voters who came), `valid` is e (equal to the sum of the lists' votes) and `invalid` is f (null votes).
 */
export const electionAreaResults = pgTable("election_area_results", {
  electionId: text("election_id").notNull().references(() => elections.id, { onDelete: "cascade" }),
  chamber: chamberEnum("chamber").notNull(),
  areaKey: text("area_key").notNull(),
  circumscriptionNumber: integer("circumscription_number").notNull(),
  name: text("name").notNull(),
  sections: integer("sections").notNull(),
  registered: integer("registered").notNull(),
  present: integer("present").notNull(),
  valid: integer("valid").notNull(),
  invalid: integer("invalid").notNull(),
  listCodes: integer("list_codes").array().notNull(),
  listVotes: integer("list_votes").array().notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.electionId, table.chamber, table.areaKey] }),
  circumscriptionIdx: index("election_area_results_circumscription_idx").on(table.electionId, table.chamber, table.circumscriptionNumber)
}));

/**
 * The people a presidential decree names when it concerns a public office (a minister, an ambassador, a judge of the Constitutional Court, the head of the judiciary, a presidential adviser),
 * with the sentence of the decree that names them. Decorations, pardons, judges and prosecutors are never read for names (D-029, Q19). `person_id` is set only when the name is exactly one of our people.
 */
export const presidentialDecreePersons = pgTable("presidential_decree_persons", {
  decreeId: text("decree_id").notNull().references(() => presidentialDecrees.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  personId: text("person_id").references(() => people.id)
}, (table) => ({
  pk: primaryKey({ columns: [table.decreeId, table.position] }),
  personIdx: index("presidential_decree_persons_person_idx").on(table.personId)
}));

export const billDocumentTextChunks = pgTable("bill_document_text_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => documents.id),
  billId: text("bill_id").notNull().references(() => bills.id),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  documentChunkIdx: uniqueIndex("bill_document_text_chunks_document_chunk_idx").on(table.documentId, table.chunkIndex),
  billIdx: index("bill_document_text_chunks_bill_idx").on(table.billId)
}));

export const votes = pgTable("votes", {
  id: text("id").primaryKey(),
  num: integer("num").generatedAlwaysAsIdentity().notNull(),
  billId: text("bill_id").references(() => bills.id),
  chamber: voteChamberEnum("chamber").notNull(),
  title: text("title").notNull(),
  heldOn: date("held_on").notNull(),
  voteType: text("vote_type").notNull(),
  motionKind: voteMotionKindEnum("motion_kind").notNull().default("unknown"),
  prominence: voteProminenceEnum("prominence").notNull().default("unclassified"),
  yesMeaning: voteYesMeaningEnum("yes_meaning").notNull().default("unknown"),
  classificationConfidence: voteClassificationConfidenceEnum("classification_confidence").notNull().default("low"),
  classificationBasis: voteClassificationBasisEnum("classification_basis").notNull().default("unclassified"),
  classificationVersion: text("classification_version"),
  classificationReason: text("classification_reason"),
  classifiedAt: timestamp("classified_at", { withTimezone: true }),
  present: integer("present").notNull().default(0),
  forCount: integer("for_count").notNull().default(0),
  against: integer("against").notNull().default(0),
  abstention: integer("abstention").notNull().default(0),
  presentNotVoting: integer("present_not_voting").notNull().default(0),
  absent: integer("absent"),
  sourceSnapshotId: text("source_snapshot_id").notNull().references(() => sourceSnapshots.id)
}, (table) => ({
  numIdx: uniqueIndex("votes_num_idx").on(table.num),
  heldOnIdx: index("votes_held_on_id_idx").on(table.heldOn, table.id),
  chamberHeldOnIdx: index("votes_chamber_held_on_idx").on(table.chamber, table.heldOn),
  billIdx: index("votes_bill_id_idx").on(table.billId),
  sourceSnapshotIdx: index("votes_source_snapshot_idx").on(table.sourceSnapshotId),
  classificationIdx: index("votes_classification_idx").on(table.prominence, table.classificationConfidence, table.heldOn)
}));

/**
 * D-022: votes the site does not store one by one. A joint sitting's article, annex and amendment votes become
 * one row per sitting with a link to the official list.
 */
export const voteSittingSummaries = pgTable("vote_sitting_summaries", {
  id: text("id").primaryKey(),
  chamber: voteChamberEnum("chamber").notNull(),
  heldOn: date("held_on").notNull(),
  kind: text("kind").notNull(),
  voteCount: integer("vote_count").notNull(),
  firstOfficialId: text("first_official_id").notNull(),
  lastOfficialId: text("last_official_id").notNull(),
  officialUrl: text("official_url").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
}, (table) => ({
  heldOnIdx: index("vote_sitting_summaries_held_on_idx").on(table.heldOn)
}));

/**
 * What the official lists say against what we hold, published for the methodology page (Sprint 8): one row per scope
 * ("votes", "bills"), rewritten by `coverage:publish` from the saved official lists. `payload` is the report's own rows.
 */
export const coverageSnapshots = pgTable("coverage_snapshots", {
  id: text("id").primaryKey(),
  generatedOn: date("generated_on").notNull(),
  rangeFrom: date("range_from"),
  rangeTo: date("range_to"),
  payload: jsonb("payload").$type<unknown>().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow()
});

/**
 * D-027: the updater's records. A run is one catch-up (dry runs are not recorded); a job is a request that waits for a worker;
 * a heartbeat says a worker is alive; a revision is one field of one entity that changed, with the old and new value and the source.
 */
export const updaterRuns = pgTable("updater_runs", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull(),
  workerId: text("worker_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  /** running | published | held | failed | nothing_new */
  status: text("status").notNull().default("running"),
  gitSha: text("git_sha"),
  steps: jsonb("steps").$type<unknown[]>().notNull().default([]),
  held: jsonb("held").$type<unknown[]>().notNull().default([]),
  counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
  issueUrl: text("issue_url"),
  note: text("note")
}, (table) => ({
  startedIdx: index("updater_runs_started_idx").on(table.startedAt),
  statusIdx: index("updater_runs_status_idx").on(table.status, table.startedAt)
}));

export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: text("worker_id").primaryKey(),
  host: text("host").notNull(),
  version: text("version"),
  /** idle | running */
  state: text("state").notNull().default("idle"),
  currentRunId: text("current_run_id"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
});

export const updaterJobs = pgTable("updater_jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("catch_up"),
  /** queued | running | done | failed */
  status: text("status").notNull().default("queued"),
  requestedBy: text("requested_by").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  runId: text("run_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error")
}, (table) => ({
  statusIdx: index("updater_jobs_status_idx").on(table.status, table.requestedAt)
}));

export const dataRevisions = pgTable("data_revisions", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  /** "created" for a new entity, otherwise the field that changed. */
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  sourceUrl: text("source_url"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  entityIdx: index("data_revisions_entity_idx").on(table.entityType, table.entityId, table.recordedAt),
  runIdx: index("data_revisions_run_idx").on(table.runId)
}));

export const voteCoverageSummaries = pgTable("vote_coverage_summaries", {
  voteId: text("vote_id").primaryKey().references(() => votes.id),
  coverageLevel: text("coverage_level").notNull().default("source_only"),
  nominalVotes: integer("nominal_votes").notNull().default(0),
  groupTotals: integer("group_totals").notNull().default(0),
  sourceStatus: sourceStatusEnum("source_status").notNull().default("partial"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull()
}, (table) => ({
  coverageIdx: index("vote_coverage_summaries_coverage_idx").on(table.coverageLevel, table.sourceStatus),
  sourceStatusIdx: index("vote_coverage_summaries_source_status_idx").on(table.sourceStatus)
}));

export const groupVoteTotals = pgTable("group_vote_totals", {
  id: text("id").primaryKey(),
  voteId: text("vote_id").notNull().references(() => votes.id),
  groupId: text("group_id").notNull().references(() => parliamentaryGroups.id),
  forCount: integer("for_count").notNull().default(0),
  against: integer("against").notNull().default(0),
  abstention: integer("abstention").notNull().default(0),
  presentNotVoting: integer("present_not_voting").notNull().default(0)
}, (table) => ({
  voteIdx: index("group_vote_totals_vote_idx").on(table.voteId),
  groupIdx: index("group_vote_totals_group_idx").on(table.groupId)
}));

/**
 * One recorded choice per member per vote (D-023). Compact integer keys: about 80 bytes a row with its two
 * indexes, against about 700 when the rows carried three text keys. Written by the importers; read through
 * the `individual_votes` view, which gives back the text ids.
 */
export const individualVoteRows = pgTable("individual_vote_rows", {
  voteNum: integer("vote_num").notNull().references(() => votes.num),
  memberNum: integer("member_num").notNull().references(() => members.num),
  groupNum: integer("group_num").references(() => parliamentaryGroups.num),
  choice: voteChoiceEnum("choice").notNull(),
  voteMethod: text("vote_method")
}, (table) => ({
  pk: primaryKey({ columns: [table.voteNum, table.memberNum] }),
  memberIdx: index("individual_vote_rows_member_idx").on(table.memberNum, table.voteNum)
}));

/** Read side of individual_vote_rows with the text ids; created in migration 0035. Not a table: write to individualVoteRows. */
export const individualVotes = pgView("individual_votes", {
  id: text("id").notNull(),
  voteId: text("vote_id").notNull(),
  memberId: text("member_id").notNull(),
  groupId: text("group_id"),
  choice: voteChoiceEnum("choice").notNull(),
  voteMethod: text("vote_method")
}).existing();

export const memberLegislatureActivity = pgTable("member_legislature_activity", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => members.id),
  personId: text("person_id").references(() => people.id),
  legislatureId: text("legislature_id").notNull().references(() => legislatures.id),
  chamber: chamberEnum("chamber").notNull(),
  voteRecords: integer("vote_records").notNull().default(0),
  majorVoteRecords: integer("major_vote_records").notNull().default(0),
  standardVoteRecords: integer("standard_vote_records").notNull().default(0),
  routineVoteRecords: integer("routine_vote_records").notNull().default(0),
  unclassifiedVoteRecords: integer("unclassified_vote_records").notNull().default(0),
  votesFor: integer("votes_for").notNull().default(0),
  votesAgainst: integer("votes_against").notNull().default(0),
  abstentions: integer("abstentions").notNull().default(0),
  presentNotVoting: integer("present_not_voting").notNull().default(0),
  absent: integer("absent").notNull().default(0),
  unknown: integer("unknown").notNull().default(0),
  proposals: integer("proposals").notNull().default(0),
  committees: integer("committees").notNull().default(0),
  roles: integer("roles").notNull().default(0),
  firstActivityOn: date("first_activity_on"),
  lastActivityOn: date("last_activity_on"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull()
}, (table) => ({
  memberLegislatureIdx: uniqueIndex("member_legislature_activity_member_leg_idx").on(table.memberId, table.legislatureId, table.chamber),
  personLegislatureIdx: index("member_legislature_activity_person_leg_idx").on(table.personId, table.legislatureId),
  legislatureIdx: index("member_legislature_activity_legislature_idx").on(table.legislatureId, table.chamber)
}));

export const entitySearchIndex = pgTable("entity_search_index", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  searchText: text("search_text").notNull(),
  chamber: chamberEnum("chamber"),
  legislatureId: text("legislature_id").references(() => legislatures.id),
  sourceDate: date("source_date"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull()
}, (table) => ({
  entityIdx: uniqueIndex("entity_search_index_entity_idx").on(table.entityType, table.entityId),
  textIdx: index("entity_search_index_text_idx").on(table.searchText),
  chamberLegislatureIdx: index("entity_search_index_chamber_leg_idx").on(table.chamber, table.legislatureId),
  sourceDateIdx: index("entity_search_index_source_date_idx").on(table.sourceDate)
}));

export const engagementEvents = pgTable("engagement_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  queryHash: text("query_hash"),
  queryText: text("query_text"),
  locale: varchar("locale", { length: 8 }).notNull().default("ro"),
  visitorHash: text("visitor_hash").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
}, (table) => ({
  eventMonthIdx: index("engagement_events_event_month_idx").on(table.eventType, table.entityType, table.occurredAt),
  entityIdx: index("engagement_events_entity_idx").on(table.entityType, table.entityId, table.occurredAt),
  searchIdx: index("engagement_events_search_idx").on(table.queryHash, table.occurredAt)
}));

/**
 * What visitors send through the feedback form (D-031): a mistake in the data, a suggestion or a technical problem. No IP, no cookie, no account: the optional
 * contact is only what the visitor types. `status` is for the owner: new, then read, then done.
 */
export const feedbackReports = pgTable("feedback_reports", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  pagePath: text("page_path"),
  locale: text("locale"),
  contact: text("contact"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  statusIdx: index("feedback_reports_status_idx").on(table.status, table.createdAt)
}));

export const contentReactions = pgTable("content_reactions", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  reaction: text("reaction").notNull(),
  visitorHash: text("visitor_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => ({
  uniqueVisitorReactionIdx: uniqueIndex("content_reactions_unique_visitor_idx").on(
    table.entityType,
    table.entityId,
    table.reaction,
    table.visitorHash
  ),
  aggregateIdx: index("content_reactions_aggregate_idx").on(table.entityType, table.entityId, table.reaction, table.createdAt)
}));
