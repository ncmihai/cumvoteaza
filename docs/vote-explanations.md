# Vote explanations

Approved behavior (2026-09-10): Gemini explanations appear immediately with an explicit AI-generated, unreviewed label. The operator can subsequently review them in the cockpit. This is an exception to the approval-before-publication rule for analysis labels; political scores remain internal.

Implementation requirements:

- Server-side `GEMINI_API_KEY` only; never expose it in browser code. Configure in Vercel Production.
- Generate Romanian and English together from the published vote, its applicable motion, linked bill version and available official text. Treat source text as data, never instructions. Explain limited evidence explicitly; do not infer legal effects from titles alone.
- Persist by vote ID, source/input hash and prompt version. Reuse the result across visitors and languages. A changed source creates a new unreviewed version.
- Database-backed generation lease and daily budget prevent concurrent requests and repeated refreshes from multiplying costs. Timeout and failed-attempt backoff are required. Never promise five-second completion.
- Display a short description beneath the title, source links and an AI/unreviewed badge. Failed generation must not block the vote page.
- Cockpit review lists generated versions and their exact input evidence. Accept or hide individually with a durable decision record; hidden output must not regenerate automatically for the same input.
- Runtime explanation tables must be excluded from import comparisons and release manifests, like public engagement data.

Implemented: bilingual client panel, server-only Gemini integration, source/version cache, 90-second generation leases, 100-attempt daily default cap, one-hour failed-attempt backoff, exact quotation validation and cockpit individual review/hide with durable audit history. Additive migration 0017 is applied locally and in production. Runtime tables are excluded from editorial releases.

Current status: **disabled at the user's request** pending Gemini credits/setup. The live provider returned HTTP 404 for the initial model; insufficient credits were suggested by the user but have not been confirmed. No successful live explanation has been verified. The current default is `gemini-3.5-flash`; `GEMINI_EXPLANATION_MODEL` can override it. Model availability must be checked before enabling.

Enable only when ready by setting `GEMINI_EXPLANATIONS_ENABLED=1` in Vercel Production and redeploying. `GEMINI_API_KEY` is already configured. `GEMINI_EXPLANATIONS_DAILY_LIMIT` defaults to 100 and accepts 0 to stop new generation. Both the page banner and paid generation remain disabled without the explicit enable flag. Review generated records under cockpit → Review & publish → AI vote explanations.

Validation: four evidence-contract tests, TypeScript and production build, and a real PostgreSQL test of review/hide audit history and rejection of incomplete output. Cached generation concurrency and a successful live provider response still require verification before enabling.
