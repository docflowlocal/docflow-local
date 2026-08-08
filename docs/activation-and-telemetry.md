# Activation, qualification, trial, and telemetry contract

Status: accepted product contract for Community-to-Pro implementation.

This document defines product milestones and the only usage metadata DocFlow
may retain or transmit. It does not enable telemetry, implement an activation
service, or authorize document upload.

## Product principles

- Community is useful indefinitely. It has no document-count quota and adds no
  watermark to generated documents.
- Community does not require registration and document processing remains
  local.
- Community includes saved local projects and safe recipe import/export.
- Paid boundaries cover unattended automation, advanced data/rule complexity,
  operational reliability, audit/approval, commercial connectors, support,
  and team governance.
- A trial clock never starts at install time or in the background. The user
  explicitly starts it after becoming eligible.
- Trial expiry disables only Pro commands. It must not delete, encrypt, hide,
  or invalidate existing projects or outputs.

## Feature-boundary vocabulary

The public feature catalogue is the machine-readable source of truth. These
distinctions are normative:

| Feature identifier | Edition | Meaning |
| --- | --- | --- |
| `projects.saved` | Community | Save, open, duplicate, and rerun a local project. It is not run history or governance. |
| `recipes.safeExport` | Community | Import/export a privacy-reviewed recipe that contains no source rows, source/template filenames, raw custom templates, generated content, signature, image asset, or customer literal. |
| `templates.multiple` | Community | Generate a basic multi-template delivery package. |
| `rules.edit` | Community | Basic safe formulas and conditions already present in Community. |
| `automation.cli` | Community | A user explicitly invokes a foreground CLI command. |
| `automation.localApi` | Community | A user explicitly starts and invokes the authenticated loopback API; no durable queue, scheduler, monitor, or automatic retry is implied. |
| `rules.advanced` | Pro | Cross-table, nested, grouped, or otherwise advanced commercial rules beyond Community's published basic evaluator. |
| `automation.unattendedApi` | Pro | A background/service-mode API trigger or external orchestrator invocation without an attended Community run. |
| `automation.retries` | Pro | Persisted retry policy, failure quarantine, and resumable operational state. |
| `automation.apiTrigger` | Pro | Legacy entitlement identifier. New issuers use `automation.unattendedApi`; do not reinterpret it as the Community loopback API. |
| `projects.history` | Pro | Searchable execution history, revisions, retry history, and operational records. It does not gate Community project save/open. |

Safety ceilings for memory, archive size, file count, or render count are not
commercial quotas. They must be documented as safety limits and applied
equally to the same execution path in every edition.

## Source classification

Packaged sample data and templates have release-time identifiers and digests.
They are `sample` sources. A source is `user` only when it was selected or
created outside a packaged sample workflow and does not match a packaged sample
digest.

The comparison happens locally. Sample digests, user input digests, template
digests, and match results are never telemetry fields.

## Milestones

### Guided activation

Guided activation occurs when, within ten foreground-active minutes after the
onboarding flow starts, the user:

1. selects one packaged scenario;
2. runs its intentionally incomplete sample through full preflight;
3. resolves the guided blocking issue; and
4. successfully saves the generated sample delivery package.

Background time and time while the application is not in the foreground do not
consume the ten-minute target. A sample run is never a real activation or PQL.

### Real batch

A successful real batch requires all of the following in the same project:

1. at least one `user` data source;
2. at least one `user` template;
3. confirmed field mappings;
4. a full preflight with no blocking issue (warnings are allowed);
5. at least one generated artifact; and
6. a delivery package successfully saved to a user-selected destination.

Generation attempts, previews, validation-only runs, cancelled save dialogs,
failed runs, retries of the same failed attempt, and packaged samples are not
successful real batches.

### Real activation

Real activation occurs when the user completes a successful real batch and
saves that project within seven calendar days of first launch. The milestone
is recorded once per installation.

Project save is intentionally Community functionality. Trial eligibility must
not force a user to buy Pro merely to satisfy the activation definition.

### Batch deduplication

The client may calculate a local batch key using HMAC with a random,
installation-local secret over the project instance, normalized workflow,
input, template set, and local calendar day. Raw hashes are not used as stable
analytics identifiers and the HMAC key never leaves the device.

Equivalent successful saves on the same local day count once. A successful run
on another day, or a run with a different input/workflow/template set, is a
distinct batch. This prevents double clicks and recovery retries from inflating
activation and north-star metrics without suppressing legitimate recurring
work.

## PQL contract

Two local product-qualified signals are defined:

- **Usage PQL:** real activation followed by a second distinct successful real
  batch within 14 days of the first.
- **Intent PQL:** real activation followed by an explicit attempt to configure
  a Pro capability such as watched folders, schedules, relational/database
  sources, unattended API, retry management, approval, audit, or a commercial
  connector.

Completing three distinct real batches or successfully using two or more user
templates are supporting score signals, not standalone PQL definitions.

Install, download, GitHub Star, app open, sample generation, documentation
views, and passive exposure to a Pro button never qualify a user.

A local PQL changes only in-app guidance. It becomes a sales/CRM PQL only after
the user separately identifies themselves by starting an account-based trial,
requesting contact, or explicitly consenting to that transfer. Usage consent
alone does not authorize CRM enrollment.

## North-star metric

The product north star is:

> Weekly distinct successful real batches that passed full preflight and were
> saved as delivery packages.

It counts delivery-package runs, not the number of documents or rows inside a
package. Locally it is exact after batch deduplication. A company-wide or public
number may include only opted-in aggregate reports and must state the reporting
coverage; it must not be presented as representing all installations.

## Pro trial state machine

```text
community_ineligible
  -> community_eligible
  -> trial_offered
  -> trial_active
  -> trial_expired

trial_active -> paid_active
trial_expired -> paid_active
```

- Real activation moves the local state to `community_eligible`.
- Showing an offer may move it to `trial_offered`; this does not start time.
- Only an explicit user confirmation and a successfully verified signed trial
  license move it to `trial_active`.
- A v2 trial license is installation-bound, has no grace period, and lasts no
  more than 21 days. Issuer policy uses exactly 21 days from `notBefore`.
- Reinstall, telemetry consent, document volume, or app inactivity do not alter
  signed license dates.
- Trial expiry falls back to Community entitlements. Pro configuration remains
  visible and exportable, and the user may remove Pro-only steps to run a
  Community-compatible workflow.
- Previously generated files remain ordinary user-owned files and are never
  encrypted, watermarked, revoked, or deleted by DocFlow.

Anti-abuse may use a random installation identifier protected by the operating
system credential store and a server-side record of trial issuance. Raw disk
serials, MAC addresses, document fingerprints, invasive hardware fingerprints,
and hidden analytics are prohibited. Preventing determined local tampering is
not a reason to weaken Community or the privacy promise.

## Local milestone ledger

A future implementation may keep a local-only milestone ledger so the product
can resume onboarding, deduplicate batches, decide trial eligibility, and show
local value. Creating this ledger does not enable telemetry.

Allowed local fields are an explicit whitelist:

- schema version;
- random event ID;
- enumerated event name;
- local occurrence timestamp;
- random session ID;
- random project-instance ID not derived from project content or name;
- app version, operating-system family, and UI locale;
- packaged scenario enum for guided sample events only;
- booleans for user-data present, user-template present, mappings confirmed,
  preflight passed, output saved, and project saved;
- template-count bucket: `one` or `two_or_more`;
- approved Pro feature identifier for an explicit intent action;
- coarse elapsed-time bucket;
- installation-local batch HMAC used only for deduplication.

Recommended event-name allowlist:

- `onboarding_started`
- `onboarding_scenario_selected`
- `sample_preflight_passed`
- `guided_issue_resolved`
- `sample_package_saved`
- `guided_activation_completed`
- `real_preflight_passed`
- `real_package_saved`
- `project_saved`
- `real_activation_completed`
- `repeat_real_batch_completed`
- `pro_feature_intent`
- `trial_eligible`
- `trial_offered`
- `trial_started`
- `trial_expired`
- `paid_license_activated`

The local ledger must have a documented location, restrictive file
permissions, bounded retention, atomic writes, and user controls to inspect,
export, and clear it. Clearing analytics consent must not delete projects or
licenses. Clearing the local product ledger may reset onboarding guidance but
must not manufacture a second server-issued trial.

## Optional telemetry upload whitelist

Telemetry remains off unless the user makes a separate, informed opt-in choice.
If implemented, upload is limited to daily aggregates containing only:

- schema version;
- UTC calendar day, without precise event timestamps;
- allowed event name;
- aggregate count bucket: `one`, `two`, or `three_or_more`;
- app major/minor version;
- operating-system family;
- UI locale;
- random analytics installation ID generated for analytics only and reset when
  the user clears analytics data.

The following must never be retained as telemetry or uploaded:

- spreadsheet, template, image, project, generated-file, or folder contents;
- source rows or cells;
- customer, employee, student, supplier, or project values;
- file, project, customer, template, worksheet, or folder names and paths;
- column names, field names, mappings, formulas, conditions, literal values,
  naming patterns, or directory patterns;
- signatures, images, QR payloads, generated text, or document metadata;
- input, template, workflow, output, or batch hashes/HMACs;
- exact row, document, customer, template, or currency-value counts;
- license IDs, installation hashes used for licensing, email addresses, account
  IDs, hardware identifiers, IP addresses collected by the application, or
  support content.

Telemetry code must fail closed on unknown event names or fields. A free-form
properties object is prohibited. The privacy notice and in-product consent copy
must be updated and reviewed before any network sender is enabled.

## Recipe privacy boundary

Saved local projects and shareable recipes are separate products:

- A local `.docflow` project may embed a user's templates and therefore is not
  safe to publish merely because source rows are excluded.
- A shareable recipe must use a separate schema/extension and an allowlist. It
  excludes raw custom templates, original filenames, project/customer names,
  source data, output files, signatures, image assets, customer literals, and
  generated content. Import requires the recipient to bind their own data and
  templates.
- Recipe export must show a human-readable preview and warn that field labels,
  formulas, and rule text can still contain confidential business information.
- Imported recipes never auto-enable watched folders, schedules, connectors,
  network actions, plugins, or delivery actions.

Heuristic secret scanning may supplement the allowlist, but it must not be
described as proof that a recipe is free of personal or confidential data.
