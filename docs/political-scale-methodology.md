# CumVoteaza political scale — methodology proposal

Date: 2026-09-08. Status: proposed for discussion, not implemented or validated.

## Recommendation

Build an evidence-linked legislative behavior profile with two main dimensions and ten starting policy indicators. Keep contextual/behavioral measures separate. Begin with a transparent descriptive voting-direction index; treat any later estimate of latent ideological position as a different statistical output requiring additional validation.

Ten is a practical starting codebook size, not a scientific constant. Revise the indicators if Romanian examples show redundancy, ambiguous boundaries, or inadequate evidence. Do not score parties using their names, reputations, or an instruction to the model to decide how left/right they are.

Two main dimensions:

- Economic: redistribution, public provision, and intervention ↔ market allocation and more limited redistributive/state roles.
- Social: personal autonomy and pluralism ↔ traditional social prescriptions and order-oriented restrictions.

These are declared operational definitions for the project. They do not make one side good/bad, democratic/undemocratic, or competent/incompetent. Some policies do not fit either continuum, and that should be a valid result.

## Ten proposed indicators

| ID | Indicator | Negative direction | Positive direction | Coding boundary |
| --- | --- | --- | --- | --- |
| E1 | Distribution of the tax burden | More progressive distribution | Less progressive distribution | Examine incidence and affected groups; raising/lowering a tax alone is insufficient. |
| E2 | Social protection and transfers | Broader/more generous redistributive coverage | Narrower/reduced coverage | Separate ordinary coverage from preferential benefits for a narrow occupational group. |
| E3 | Public-service access and financing | Broader publicly financed access | Greater individual payment or reduced public coverage | Covers health, education, care and comparable services; ownership belongs in E4. |
| E4 | Ownership and provision | Expansion of public ownership | Privatization/private ownership | An agency renaming, reorganization, or routine public salary change is not automatically a directional signal. |
| E5 | Labor relations | Stronger employee protections and collective bargaining | Greater employer discretion/labor-market flexibility | Read substantive effects, not the stated intent in a title. |
| E6 | Market intervention | Greater substantive state direction of economic allocation | Reduced intervention/more market allocation | Administrative simplification, competition enforcement and technical rules require separate interpretation. Not every regulation is leftward. |
| S1 | Personal and family autonomy | Wider individual choice | More legally prescribed traditional norms | Code specific rights/options and who gains or loses them. |
| S2 | Equal treatment and minority rights | Broader legal equality/inclusion | Narrower equal treatment or differentiated restrictions | Not all migration/border administration can be reduced to this indicator. |
| S3 | Religion and public policy | More religious neutrality in state policy | Greater legal role for religious prescriptions | Routine heritage maintenance is not automatically a directional signal. |
| S4 | Civil liberties and public order | Broader expression, assembly and privacy protections | Greater coercive/restrictive state powers | Separate a specific liberty/security tradeoff from the institutional independence of courts or regulators. |

Equal weight within each axis is the initial reference specification: E1–E6 each 1/6; S1–S4 each 1/4. These are transparent design choices to test. No combined economic/social score by default. An exploratory combination may be configurable, but its weights must be visible and saved as a separate version; offsetting positions can otherwise look misleadingly centrist.

Keep four additional measures outside those axes:

1. EU integration/shared authority ↔ national policy autonomy, coded on its own terms.
2. Institutional checks and accountability, using separately documented indicators for judicial/oversight independence and transparency. Do not call this an observed corruption score.
3. Government alignment in recorded votes, using date-specific government context and a stated definition of government position.
4. Party/group cohesion in votes, with date-specific membership and a declared denominator.

Environment, migration, regional development, defense and similar issues remain available as policy topics. Additional axes can be added after reviewing how those policies fit the intended construct. Do not mechanically force every topic into a binary left/right category.

## Broad public-sector classification

The user confirmed that the category includes both administration/employment and the broader public sector. Suggested subcategories: administration/civil service; public health; public education/research; social insurance and public pensions; state-owned enterprises/utilities; public finance/procurement; public assets/infrastructure; public institutions/oversight.

Use multiple labels where appropriate. Also mark relevance as direct, indirect/incidental, unrelated, or uncertain. Merely being legislation, collecting a tax, or mentioning a public authority does not automatically make a bill substantively about public-sector organization/services. The exact inclusion rule for financing private providers of public services must be specified with examples.

Topic membership and ideological direction are separate fields. A public-sector bill may expand public provision, privatize it, redistribute benefits, protect a narrow entitlement, or have no directional content.

## Unit of evidence

The coding unit is a substantive provision/change attached to a bill version and its applicable vote/motion. Preserve:

- bill family/cross-chamber identifiers and version;
- the existing legal baseline and relevant provisions;
- what the proposed change actually alters;
- policy indicator(s), affected population and scope;
- exact source text, document/version and passage location;
- motion type, date, chamber, and the outcomes represented by yes/no;
- model, codebook/prompt/example version, reviewer and decision;
- uncertainty and reasons to exclude or request more context.

Use operative text and relevant existing law. Explanatory memoranda help provide context but are not proof of a claimed effect. Never attach analysis of a later final text to a vote on an earlier materially different version.

Initially use a five-category proposal-direction rubric: -2 strong negative-direction change; -1 modest negative-direction change; 0 a reviewed substantive change without a direction on that indicator; +1 modest positive-direction change; +2 strong positive-direction change. Anchor modest/strong in concrete examples and legal scope, not model rhetoric or an unverified budget estimate.

Keep `not_applicable`, `insufficient_evidence`, `mixed`, and `disputed` distinct from 0. Preserve conflicting provisions instead of letting them silently cancel. The numerical categories are ordinal judgments; equal spacing is a modeling assumption. For the first voting index, use the reviewed direction sign and report strength separately until magnitude calibration is reliable.

## Votes and aggregation

Map the motion before using a vote: yes to adopt, yes to reject, yes to an amendment, and yes to procedure have different meanings. Primary v1 eligibility should favor interpretable substantive final decisions; keep other votes separately inspectable. Ambiguous or mixed final packages may be excluded pending manual decomposition. This exclusion itself must be reported because it can create selection bias.

For an interpretable binary decision, code whether a recorded vote supports or opposes the reviewed directional move. An opposing vote is evidence of opposing that proposal. It does not demonstrate an equal and opposite preferred ideology; the voter may prefer a stronger move, object to financing, or oppose the government. Therefore the first index measures directional support in observed decisions, not ideological extremity or private beliefs.

Abstention, absence, present-not-voting, and missing records get distinct statuses and no directional contribution in the default index. Display participation and excluded counts separately. Never turn lack of evidence into a central political position.

Descriptive calculation:

1. For each eligible member × substantive decision × indicator, record a contribution of -1 or +1 for the direction supported/resisted after motion normalization.
2. Neutral, unscorable and unknown cases do not enter the directional denominator; retain their counts.
3. Normalize repeated decisions within one underlying bill family so it does not gain influence merely by passing through more procedural stages. Preserve earlier positions separately; the default profile uses the selected comparable final decision for each member/chamber/family. Amendments need an explicit alternative specification.
4. Average contributions within each indicator; multiply by 100 for a -100 to +100 direction-support index. All weights initially equal at the bill-family level; no model-confidence or arbitrary importance multiplier.
5. Combine indicator means using the declared weights only when coverage requirements are met. Missing indicators remain missing. Partial-axis results must be prominently labeled and should not be directly ranked against full-axis results on different evidence.

An endpoint of +100 here means all included directional contributions were positive under the codebook. It does not mean "maximally right-wing". An average near zero can reflect opposing choices, rather than centrist policies; show component distributions and anchors.

For a party/group's voting profile, calculate a member-vote share within each eligible decision, then aggregate decisions and indicators. This makes party size a denominator rather than a source of extra ideological weight. Use affiliation at the vote date, and retain party/group distinctions where party membership is unknown. Show member distribution and splits as well as the party mean. A different member-equal aggregation can be an explicit sensitivity view.

Keep authorship/sponsorship separate from voting. Neither a sponsor nor a party leader's classification should be inherited as a member's inferred position. Blind the substantive text-coding stage to party/sponsor metadata where practical while retaining required legal context.

## Comparable ideological positions, if added later

Voteview/NOMINATE-style models estimate latent positions from patterns of agreement. Such a pattern need not represent left/right in a different parliament; it can reflect government/opposition. Treat a similarity map as an additional diagnostic, with content-coded anchors establishing any ideological interpretation.

For stronger position estimates, evaluate a content-informed, anchored multidimensional voting model only after a sufficient, connected set of comparable roll calls exists. Validate whether the dimensions recover the intended concepts, whether party discipline dominates, and whether positions can be linked across chambers/periods. The descriptive index and latent estimates should keep different names and version histories.

Fixed codebook definitions alone do not make legislature averages comparable: agendas, baselines, available documents and legislative choices change. Use explicit policy anchors, overlapping comparable issues, stable weights and historical context; avoid recentering every legislature and then presenting the result as an absolute trend. Label unmatched comparisons as exploratory or unavailable.

## Validation and pilot

Start with 40–60 diverse bills for codebook development and public-sector classification. Then grow toward 200–300 reviewed bills/decision packages across relevant indicators and periods as document coverage permits. These are proposed planning ranges, not sample-size guarantees.

Separate teaching/development examples from a held-out evaluation set. Keep all versions, chamber records and votes from the same bill family in the same split. A source of evaluation leakage would be teaching one version and testing another nearly identical version.

Review classification precision/recall, directional agreement per indicator, source-quote validity, motion interpretation, ambiguity rates, and coverage. Use an independent second human review on a subset to test the codebook itself. Evaluate confidence calibration before using any probability-like model output; self-reported model confidence is not sufficient.

Include difficult cases: public salary increases, occupational pension privileges, technical reorganizations, mixed fiscal bills, state ownership changes, EU-mandated provisions, old legal baselines, and votes on rejection. Do not evaluate only on easy examples selected to match familiar party reputations.

Choose minimum evidence requirements after examining the pilot. Track independent bill families, indicator coverage, and missingness; there is no universal vote count that establishes validity. Show uncertainty from bill-level sampling and sensitivity to coding/weighting/exclusions separately. Sampling intervals do not account for all source-selection or annotation bias.

Compare equal-indicator and vote-frequency weighting, exclude one indicator at a time, test modest alternative weights, and inspect rank/position stability. Where rankings move substantially, show the instability. Refer to CHES only as an external party-position comparison with a different construct (expert views of party leadership), not training truth or a target to force agreement with.

## Cockpit controls

Expose named method versions containing the codebook, teaching set, context policy, eligible vote types, duplicate policy, indicator weights, evidence thresholds and aggregation rules. Separate these methodological settings from model/runtime controls.

Users should be able to test, compare, edit, approve a new method, run it on a selected corpus, inspect changed classifications, and see which results became stale. Every visible score should open its contributing bills, votes, source passages, exclusions, coverage and method version.

Public publication remains a reviewed release. Changing an experimental slider should not silently rewrite the public methodology or scores.

## Sources and their limits

- [CHES-Europe](https://www.chesdata.eu/ches-europe/): separates economic left/right, GAL–TAN and European integration; relevant to dimensional design, but measures expert judgments of party positioning rather than the proposed bill/vote index. The ten indicators above are a custom proposal, not an official CHES scale.
- [Manifesto Project tutorial](https://manifesto-project.wzb.eu/down/tutorials/main-dataset.html): describes RILE based on manifesto text and reports cross-context/aggregation limitations, including weaker construct validity in Central/Eastern Europe. Do not transplant its formula to roll-call data unchanged.
- [Voteview methodology overview](https://voteview.com/about): explains DW-NOMINATE and voting-space interpretation for the US Congress. Its dimensional interpretation is not automatically valid for Romania.
- [Luque and Sosa, Colombian Senate voting model](https://arxiv.org/abs/2110.10250): their inferred dimension reflects opposition/non-opposition; this is evidence from another setting of a methodological risk, not a finding about Romania.
- [OECD/JRC composite indicator handbook](https://www.oecd.org/en/publications/handbook-on-constructing-composite-indicators-methodology-and-user-guide_9789264043466-en.html): supports explicit conceptual choices, weights, uncertainty and sensitivity analysis; it does not validate this proposed political index.
