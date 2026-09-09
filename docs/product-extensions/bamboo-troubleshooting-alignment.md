# Bamboo troubleshooting alignment

Paseo treats the bundled `life-settle-ai-assistant` Runner contract as the authority for Bamboo
record states, evidence validation, Agent separation, close operations, and drain reporting.

## Required alignment

- Each Bamboo Project selects an existing Paseo Lark bot or stores a Project-scoped dedicated
  `app_id`/`app_secret`. Dedicated credentials are used only by Bamboo scanning, Wiki/Base access,
  document publication, notifications, and Runner subprocesses; they are never registered as a
  general chat, substitute, or reminder channel.
- Create daily Bases in Drive with the Base API, replace the generated blank table with the
  canonical `归因记录` table, and then move the Base below the configured Wiki root. Never create a
  Bamboo Base directly with the Wiki node-create API because that path can generate example data
  tables named `table`, `workflow`, and `dashboard`.
- Existing Bamboo Bases may remove known generated sample tables even when they contain sample
  rows. Unknown non-empty tables stop cleanup to prevent deleting business data. The final Base
  must contain exactly one `归因记录` table.
- Poll both `init` and `failed` daily Base records.
- Page through every matching Base record instead of treating the first 200 rows as the complete
  result set. Sort newest-first and apply the configured one-to-fourteen-day lookback window to
  polling, record relocation, and final drain.
- Classify unsupported rule types before any Agent starts. Persist `not_support` with the concrete
  `rule_type` and authoritative sample-count source.
- Keep a record at `init` while an external failure still has a scheduled retry. Write `failed`
  only after the bounded external retries are exhausted.
- Only retry failures with explicit transient evidence such as timeout, rate limiting, connection
  failure, or retryable HTTP status. Keep authorization, record-contract, evidence, validation, and
  exhausted review-rework blockers at `pending` without consuming automatic retries.
- Persist a terminal retry-stop marker for fatal runtime failures. A later scheduler tick must not
  reconstruct `nextRetryAt` for those tasks.
- Return independent review blockers to the original investigation Agent. Re-publish, revalidate,
  and run a new fresh-context review after each rework. Stop after two rework rounds.
- Run `auto-troubleshoot-drain`, then the stricter `final-drain-check`, and render the report from
  the audited run summary.
- Persist per-group scan audits under the Project `.tmp` directory and expose the latest path in the
  Project runtime. Persist the structured Runner report on the task so metrics, daily Bases,
  artifact consistency, cleanup plan, business close, notification close, and audit files remain
  inspectable.
- Keep notification close failures visible without reverting a successful business close.

## Intentional product adaptations

- Real-time listening and scheduled history reads use the configured Paseo Lark channel service.
  The standalone CLI cannot own a long-running listener or Paseo-managed bot credentials.
- Paseo's persistent per-Project queue is the claim and resume owner. A single task therefore uses
  `prepare-single-troubleshoot-data` and a one-item work file instead of invoking the Runner's batch
  `prepare-auto-troubleshoot`, `split-work-items`, and `resume-auto-orchestration` commands.
- A successfully closed record remains successful when the root directory still contains other
  unfinished records. The task keeps the global drain blocker as a visible warning; the batch CLI
  alone may declare the entire scan round complete.
- A daemon restart restores its own locally persisted running task immediately. Cross-session Base
  recovery remains subject to the Runner's stale-processing safeguards.
- Enhanced troubleshooting Skills, reference Feishu documents, and Runner date lookback are Bamboo
  options. The shared Argos form must not expose controls that its execution path does not consume.

Do not replace these adaptations with copied Runner code or a second plugin lifecycle. Keep the
Runner scripts byte-for-byte aligned with their packaged source and express Paseo behavior through
small adapters.
