# CumVoteaza cockpit planning

Date: 2026-09-08. Status: discovery in progress; this is a planning document, not an approved implementation specification.

## User objective

Make the local workbench a useful daily operating cockpit. The user wants to configure the local model, fetch new parliamentary data by pressing a button, and make most routine changes through the interface. A collection of minimally connected forms is insufficient. The user requested inspection and a collaborative planning session before implementation.

## Confirmed decisions

- **Import into local staging, inspect changes, then publish manually.** Confirmed by the user on 2026-09-08.
- The cockpit must expose local model configuration and imports through the UI.
- The model should power user-defined analyses: for example, define and teach a public-sector bill category using context/examples, then classify the full bill dataset. The user does not primarily want a chat interface.
- The user also wants configurable political scoring and party/member comparisons within each legislature, based on bills and votes. The scoring methodology is not yet chosen.
- Import categories should be independently toggleable: members, parties, groups, new votes, new bills, and related categories as selected.
- The home screen should show dataset coverage: total bills and bills per legislature, with **separate progress for import, text extraction, analysis, and human review**.
- The user approved the teaching workflow: definition → positive/negative examples → small test → corrections → run across selected legislatures. Start small and improve from observed results; improvement must be measured rather than assumed.
- The public-sector pilot covers public administration/employees and the wider public sector together: state-funded services and state-owned enterprises, including health and education. Use subcategories and distinguish direct from incidental relevance.
- Explore the political scoring methodology together before choosing a scale.
- Include an editorial workflow for the main website, with review and approval of changes. Exact content/field/layout scope remains open.
- The user replied "yes" to a compound question about deployment and unattended work. Treat unattended support as desired provisionally; machine, hardware, remote access, and overnight requirements still need a precise answer.
- Plan workflows and ask follow-up questions before implementing the redesign.

## Findings from this inspection

Inspected the handoff, current Git status, workbench README, relevant progress/task entries, React screens, Python import/model/job/publish code, local SQLite counts, and the configured public cron route. Opened the current app at `http://127.0.0.1:8787` and captured the four entry screens below.

The existing source changes and untracked `tools/parliament-workbench/` were preserved. Startup rebuilt generated UI assets; application source was not changed. This session did not run imports, model generation, publishing, or production migrations.

| Step | Surface | Current health | Evidence and implication |
| --- | --- | --- | --- |
| 1 | Dashboard | Loads, but gives little operational direction | Shows database/Ollama status, 31,596 wiki records, a wiki build form, connection details, and jobs. Does not show freshness by source, incoming changes, review workload, or a clear daily import action. |
| 2 | Import Cockpit | Preview and dry-run controls exist; intended workflow incomplete | The UI explicitly disables persist execution. The backend has a token-gated persist path, but that writes to Neon; it is not local staging. Command tables dominate the screen. |
| 3 | Model Lab | Basic single-entity form; configuration workflow incomplete | Model name, temperature, compact/expanded context, five fixed presets, and evaluation controls exist. There is no reusable profile/prompt editor, batch selector, or useful first-run guidance. |
| 4 | Publish Gate | Local draft and blocker preview only | Displays batch title, preview, and save-draft actions. There is no implemented publish/apply flow. Current state has no publish batches or accepted proposals shown here. |

Additional code/state findings:

- Local state contains 5 workflow jobs, 0 Model Lab runs, 0 source claims, 8 taxonomy labels, and 0 publish batches.
- Both current-import jobs marked `succeeded` have `execute: false` and `executed: false`. These are successful preview creations, not successful imports. Future status displays must distinguish these outcomes.
- Job cancellation changes a database status; it does not terminate a running subprocess. Retry creates a queued record; it does not by itself resume execution.
- Model Lab's context builder supports bills and documents. The visible vote/member/party choices currently fall through to `context_unavailable`; a selectable type does not establish a usable model task.
- Analytics is also a foundation, not the requested scoring engine: vote similarity currently returns an empty list, government alignment returns `context_pending`, and there is no implemented user-defined left-right method. Existing topic codes are locally adapted; their CAP mappings need review before claiming compatibility with the official codebook.
- Presets and prompt construction are hardcoded. Changing a version string is not a substitute for an immutable, editable prompt version with its actual content stored.
- The import dry-run classifies discoveries without persisting them. Its later pending-import stage reads the existing database queue, so it is not a full staged preview of everything just discovered.
- Pending imports select pending/partial/failed discoveries. Refreshing already-imported, still-active bills needs an explicit policy; merely finding new records is not enough for a reliable latest-data button.
- `vercel.json` declares a daily `/api/cron/daily-import` call, and that handler invokes the normal writing sync path. Whether the deployed schedule is currently enabled was not checked. The intended manual publication boundary must address this path and every other writer.

## Screenshot evidence

Captured in this session at the in-app browser's current 983 × 720 viewport. These are viewport captures, not whole-page captures. The right side of the rendered layout overflows the viewport; that is an observed reflow issue, not evidence that the offscreen controls do not exist. Accessibility-tree inspection supplemented the images. A stitched full-page capture produced duplicate content and was rejected.

1. Dashboard: [screenshot](../data/parliament-workbench/reports/cockpit-planning-2026-09-08/01-dashboard.png).
2. Import Cockpit: [screenshot](../data/parliament-workbench/reports/cockpit-planning-2026-09-08/02-imports.png).
3. Model Lab: [screenshot](../data/parliament-workbench/reports/cockpit-planning-2026-09-08/03-model-lab.png).
4. Publish Gate: [screenshot](../data/parliament-workbench/reports/cockpit-planning-2026-09-08/04-publish.png).

Strengths: consistent section styling, recognizable navigation, labeled main fields, visible local-only states, and explicit empty states. Risks: overflow at a common split-window width; technical language and IDs in routine flows; unhelpful empty states; model checkbox separated from its label; and initial loading briefly represented as zero/offline/not configured. Keyboard flow, screen-reader announcements, measured contrast, mobile behavior, actual import execution, and publishing were not tested. This is a scoped UX/code inspection, not a full accessibility certification or production data audit.

## Proposed experience, pending discussion

The central workflow should be:

**Fetch official data → stage locally → inspect changes and issues → optionally run model tasks → select a release → preview the public result → publish → verify.**

Model results remain evidence-linked suggestions until reviewed. Official imported facts, manual corrections, and AI suggestions need visible provenance and separate approval policies. Whether every clean official row needs individual approval remains open.

| Area | Main actions | What it should answer |
| --- | --- | --- |
| Overview | Filter by legislature, inspect coverage/progress, get latest data | How many bills exist in our dataset, how many have text/analysis/review, and where are the gaps? |
| Imports | Toggle entity categories, run a saved recipe, choose dates/chamber, inspect results, retry failures | What will be fetched, how much is complete, and what did this run actually add or change? |
| Analysis Studio | Define categories and scoring methods, supply context/examples, test, correct, version, run a batch | What are we teaching the model to identify, how well does it work, and which records has this method processed? |
| Results | Explore classifications and score distributions by legislature/party/member; inspect contributing bills/votes | What does this analysis show, which evidence produced the result, and how does it change under another method? |
| Data workspace | Search/filter records, inspect sources, edit fields/relations, correct text | What do we know, where did it come from, and how can I correct it? |
| Review and releases | Compare before/after, accept/reject/defer, select a batch, preview and publish | Which changes are supported and exactly what will become public? |
| System settings | Check connectors/model availability, manage defaults, storage/backups and jobs | Is the cockpit ready to work, and can I recover interrupted work? |

These are capabilities, not a final sidebar or layout. Assets, knowledge/Atlas, analytics, and export already have foundations; their placement and first-release priority should follow actual use.

## Proposed functional requirements

### Coverage dashboard

- Global totals and a legislature table: discovered candidates, imported unique bills, bills with usable text, analyzed bills for the selected method/version, reviewed bills, failures, and unpublished changes.
- Click any count to open the corresponding filtered records. Filters should carry across into batch analysis and review.
- Show distinct bill dossiers rather than treating each chamber URL, document, vote, or wiki record as another bill. The current 31,596 wiki count is not a bill count.
- Distinguish dataset size from verified official coverage. Show a percentage of official coverage only when a reliable source denominator is known.
- Define how a bill is assigned to a legislature: proposed default is introduction/registration period, with a separate view for bills active or voted on during a selected legislature. Carry-over bills must not distort totals. The schema currently has no direct legislature foreign key on bills, so this mapping needs a reviewed rule and an unknown-date bucket.
- Text readiness should mean usable required text under a stated document policy, not simply any attached document. Show partial/missing/unreadable text explicitly.
- Analysis and review progress are per selected method and input version. Show stale results when rules or source documents change.
- Keep an unobtrusive running-jobs area and connector readiness indicators; give dataset coverage the main visual space.

### Imports and staging

- One default latest-data action plus saved recipes for different scopes and historical backfills.
- Capture a durable local batch of parsed records, official source references, extraction artifacts, validation results, and the canonical baseline used for comparison.
- Classify each record as new, changed, unchanged, conflicting, or failed. Distinguish last attempted check from last successful check and verified coverage.
- Keep staged data and artifacts local until an explicit publication action. Do not write discovery rows to production merely to make the local runner work.
- Refresh relevant existing dossiers and relationships as well as discovering new records. Store checkpoints and source/date coverage; expose gaps instead of promising completeness from a capped run.
- Carry cross-chamber identities, bill/vote/document relations, and temporal affiliation context through staging and release validation.
- Preserve accepted manual corrections when later source imports disagree; expose the disagreement for review.

### Model Studio

The primary interface should be an **Analysis Studio**. Model parameters are an advanced part of an analysis configuration, not the main organizing idea.

Proposed classification workflow:

1. Create a named analysis, such as "Public-sector bills".
2. Write its definition, inclusion/exclusion rules, and optional subcategories. Select contextual material.
3. Add reviewed positive, negative, and ambiguous examples, with reasons and source excerpts.
4. Test on a small sample; show matches, missed matches, false positives, uncertain cases, and supporting text.
5. Correct results, explicitly promote appropriate corrections to examples, and save a new method version.
6. Run that version over a selected legislature/date range, filtered collection, or all eligible bills.
7. Review/explore results and optionally approve a version for public use.

Initially, "teaching" can mean a saved codebook, reviewed examples, and retrieved context supplied to the model on each run. It does not mean the underlying model weights have been trained. Keep a held-out evaluation sample separate from teaching examples. Fine-tuning is a separate future decision if demonstrated errors justify it.

Store processing status per bill, document/input version, and analysis version. A bill processed by one method is not automatically processed by all methods. Changed source text or revised rules should identify results that need rerunning without destroying previous runs.

Proposed scoring workflow, pending methodological choices:

- Define dimensions, criteria, direction, weights, exclusions, and aggregation rules as a versioned method.
- First identify relevant policy provisions and the version of the bill applicable to each vote. Separate policy topic from policy direction and from how a member voted.
- Distinguish votes on adoption, rejection, amendments, and procedure; do not assume every yes vote supports the same substantive position.
- Specify treatment of abstentions, absences, non-voting, technical bills, omnibus bills, repeated votes, and contradictory provisions. Missing data must not silently become a centrist score.
- Preserve party/group affiliation at the vote date, membership switches, and the legislature context.
- Keep sponsorship and voting behavior as separately inspectable signals before any explicit combination.
- Show the number and share of usable votes/bills, excluded cases, and contribution of each observation to the score. Model self-reported confidence is not a validated probability.
- Support local exploratory results separately from reviewed publication. Cross-legislature comparisons need stable anchors or explicit calibration; independently scaled periods are not automatically comparable.
- Compare rule/method versions and weighting choices without overwriting past results.

Methodology grounding read during planning:

- [Comparative Agendas master codebook](https://www.comparativeagendas.net/pages/master-codebook): a source for definitions, examples, and policy topic structure. Topic categories alone do not define a left-right score.
- [Manifesto Project methodology tutorial](https://manifesto-project.wzb.eu/down/tutorials/main-dataset.html): describes left-right aggregation from manifesto categories and limitations of fixed categories across contexts, including weaker construct validity in Central/Eastern Europe. It is a reference to assess, not a formula to transplant unchanged to Romanian roll-call data.

- Searchable record and batch selection instead of requiring internal IDs.
- Reusable model profiles, task presets, editable prompts, and immutable versions. Save actual effective options, prompt content, context, model identity, and outputs for each run.
- Candidate advanced controls: temperature, output/context budget, sampling controls, seed, timeout, concurrency, and output schema. Exact controls depend on user needs and the chosen local model runtime; unsupported controls must be explicit.
- Preview the exact context, source excerpts, and exclusions before a run; show missing context instead of running an apparently supported task without evidence.
- One-item test, side-by-side output comparison, batch runs, visible progress, cancellation, and review of suggestions.
- Evaluation based on reviewed Romanian examples, with no quality score when examples do not match.
- Chat, task chaining, automatic model runs after import, model downloads, and external providers remain open scope decisions.

### Editing, review, and publishing

- Field/relationship editing with source evidence and change history; exact entity and field scope awaits the user's examples.
- Review source, previous value, proposed value, evidence, and validation together. Allow deferral without losing the batch.
- Publish selected coherent changes, with dependency checks. A deferred unrelated batch should not automatically block every release.
- Detect if canonical data changed after staging/review; require reconciliation before applying stale edits.
- Preview public-facing results against the staged release, with a recorded release manifest.
- Use a restricted publisher with transactional database writes, separately tracked derived-asset work, read-model/cache refresh, and post-publish verification. Retries must not create duplicate releases.
- Maintain recovery data and support a reviewed revert where possible. Reverts must account for subsequent changes; do not blindly restore an old database snapshot.
- Inspect and reconcile the existing Vercel import schedule before enabling the new publication contract. No production schedule was changed in this session.

### Background work and reliability

- Durable runner independent of individual browser requests; live stage progress and structured outcomes.
- Real subprocess cancellation, timeouts, restart recovery, and retry from a valid checkpoint.
- Prevent overlapping runs from corrupting the same batch or publishing concurrently.
- Differentiate preview created, data fetched, staged, partially complete, ready for review, and published.
- Preserve local proposals, model profiles, review history, and unreleased batches through backup and restart. Existing generated directories also hold user-authored work and should not all be treated as disposable caches.

## Proposed implementation sequence

1. Complete product decisions and concrete daily scenarios; agree on the cockpit's screen structure and visual direction.
2. Build the coverage dashboard and one complete staging workflow for current votes/bills: fetch, persist locally, compare, inspect, and recover an interrupted job.
3. Build Analysis Studio and one evidence-backed classification task on staged data; prove examples, method versioning, evaluation, and batch review.
4. Add the selected record-editing and review workflows, then a release preview and controlled publisher.
5. Add the agreed political scoring methodology and results explorer; integrate secondary tools and expand historical coverage/scheduling as agreed.

Plan staging storage after evaluating reuse of the typed TypeScript parsers and relational persistence model. Compare a local relational replica with an explicit normalized staging store; do not choose a database merely to match the existing workflow SQLite file. Reuse the current parsers, entity screens, review infrastructure, and public application boundary where they fit.

## Completion scenarios to agree before development

- Press Get latest data, leave/reopen the page, and see real progress and a persistent new/changed/failed summary without any public mutation.
- Rerun the same input without duplicates; refresh an existing bill and see its new procedural event.
- Cancel an active job and confirm its worker stops; resume from the last valid checkpoint after failure/restart.
- Create a model profile and prompt version, test on a selected record, run on a filtered batch, and inspect evidence for every suggestion.
- Correct a record locally, defer another item, and publish only the selected coherent release after a public-page preview.
- Detect a stale release when the public database has changed since review; verify a completed publication in the public app.

## Open questions

Asked so far:

1. **Answered:** latest data should import locally, show changes, then allow manual publication.
2. **Answered:** user-defined, teachable classification and scoring analyses. Examples: public-sector bill detection; left-right party/member analysis by legislature.
3. **Partly answered:** editorial changes and approval for the public website are wanted; exact content/layout scope remains open.
4. **Answered:** independently toggle import categories rather than having one fixed import scope.
5. **Answered:** total bills, coverage per legislature, and processing counts.
6. **Partly answered:** "yes" to the deployment/unattended-work question; precise hosting/hardware/access details remain open.
7. **Answered:** approved definition → positive/negative examples → test → corrections → full-run teaching workflow.
8. **Answered:** explore methodology together before choosing a political scale.
9. **Answered:** show separate import, text extraction, analysis, and human-review progress.
10. **Answered:** combine public administration/employment with all state-funded services and state-owned enterprises in the public-sector category.
11. Website editor: records/text; also selection of page sections/charts; or visual layout/design editing too?
12. Exact model computer/chip/RAM and same-computer versus other-device access?

Follow up after these answers:

- Review granularity: approve clean official changes in a batch, or inspect every row? How should warnings/conflicts affect publication?
- Which local model tasks should run automatically after import, if any?
- Typical batch sizes, acceptable waiting time, and priority of current data versus historical backfill.
- Single operator or collaborators, desired UI language, screen size, density/theme, and any existing dashboard references.
- What should happen when the source disagrees with a manual correction, or a source page/PDF disappears?
- Which three end-to-end tasks would make the first release genuinely useful, and what can wait?

Update this document with answers and distinguish confirmed decisions from proposals throughout the planning session.

## Political scoring proposal

The user requested a recommendation on the best construction and number of parameters. The proposed methodology is documented in [political-scale-methodology.md](political-scale-methodology.md). The proposed two axes and ten policy indicators are recommendations for discussion, not yet user-approved or empirically validated. They should remain distinct from the broad public-sector topic classifier.
