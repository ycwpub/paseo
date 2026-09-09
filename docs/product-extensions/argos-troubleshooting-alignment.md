# Argos troubleshooting alignment

Paseo uses the bundled `life-settle-ai-assistant` Argos Runner as the authority for record fields,
fixed attribution values, evidence validation, document and SOP publication, close operations, and
drain reporting.

## Required alignment

- Parse the same Argos card identifiers as the Runner. `unique_id` is the rule-level `rule_id`;
  `result_id` is the alert instance `alert_group_id`, with `problem_id` as fallback.
- Require a complete Argos card with a detail URL, PSM, rule name, and stable identifiers. Similar
  text that cannot satisfy the Runner contract is ignored before Base insertion.
- Create daily Bases in Drive, convert the default table to the canonical `归因记录` schema, and
  move the Base below the configured Wiki root.
- Scan configured groups independently. One unreadable group does not discard successful groups.
  Every scan writes an atomic audit under the Project `.tmp` directory, and ingestion retries replay
  the exact persisted message rather than rescanning a different window.
- Keep one persistent Project queue. Only transient external failures use the configured retry
  interval, with at most three automatic attempts. Authorization, record-contract, evidence,
  validation, and exhausted review failures remain visible as `pending`.
- Prepare each work item through the Runner. Investigation, SOP summarization, and independent
  review run in separate Agent contexts and exchange only atomically committed files.
- Return failed review requirements to the original investigation Agent. Republish and revalidate
  after each correction, with at most two rework rounds.
- Agents never update Base records, publish documents or SOPs, close work items, edit cards, or
  reply to groups. The parent orchestrator owns those effects through Runner commands.
- Close only when the final review audit and `validate-result-dir` both pass. Then run
  `close-ready-work-items`, `auto-troubleshoot-drain`, and `render-run-report`.
- Preserve notification failures and incomplete global drain state as task warnings without
  reverting a successful per-record business close.

## Paseo adaptations

- Real-time listening and scheduled group reads use the configured Paseo Lark channel service.
- Paseo's persistent queue owns claim and resume, so a single task uses a one-item work file instead
  of the Runner batch `prepare-auto-troubleshoot` and `split-work-items` entry points.
- The Project form exposes enhanced Skills, reference Feishu documents, date lookback, and optional
  Agent auto-archive because the Argos orchestrator consumes each setting.
- Argos card editing remains unsupported. The Runner records `card_update_status=skipped` and keeps
  the reason in the close audit.

Keep the bundled Runner files byte-for-byte aligned with the installed
`@byted/life-settle-ai-assistant` package. Add Paseo behavior through adapters rather than copying
the Runner into a second implementation.
