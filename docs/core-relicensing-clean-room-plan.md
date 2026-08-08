<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Core provenance and clean-room migration plan

Status: executable release gate; no relicensing approval has been recorded.

This document separates technical feasibility from copyright authorization. It
is an engineering plan, not legal advice. The current Core package remains
`MPL-2.0 AND AGPL-3.0-or-later` until every gate below is satisfied and reviewed.

## Decision

All four inherited files can technically be replaced through independent new
implementations without changing the public Core API. That does **not** mean
that editing, reorganizing, translating, or partially rewriting the current
files cuts their historical derivation.

The recommended order is:

1. verify whether a complete rightsholder grant is available;
2. if it is, obtain a reviewed written grant for the identified historical
   blobs while preserving all prior AGPL grants;
3. otherwise use a documented clean-room process with a genuinely independent
   implementation team;
4. keep the package mixed-license until either route has complete evidence.

`expression.js` and `data.js` are the lowest-risk independent replacements.
`index.js` is feasible after its dependencies have stable clean interfaces.
`template-engine.js` is feasible but high-risk because it combines archive
security, OOXML rendering, images, QR codes, PDF form handling, fonts, and PDF
merging.

## Recorded historical baseline

The machine-readable record is
[`license-boundaries.json`](https://github.com/docflowlocal/docflow/blob/main/license-boundaries.json).
The fixed comparison
point is commit `867e700d4b0d42f4f3e2d938ad2416fcb9457b2f`.

| Historical file | Git blob | Recorded license |
| --- | --- | --- |
| `desktop/engine.js` | `ca2a8702952cc10cff1cc382b96bdf3853c6baad` | AGPL-3.0-or-later |
| `desktop/expression.js` | `38f6939b143aa18ca20647c126ac0b8608979aec` | AGPL-3.0-or-later |
| `desktop/template-engine.js` | `2feefd547bd6b5fd26a61f5ab438e8265c3bf915` | AGPL-3.0-or-later |

Git currently shows two commits for those paths, both attributed to
`txianlian <305850115+txianlian@users.noreply.github.com>`. Commit metadata is
evidence of repository authorship, not proof of copyright ownership or authority
to relicense.

## File-by-file provenance audit

The line-comparison figures below are diagnostic evidence, not a legal test for
derivation. Blank lines and ordinary boilerplate can inflate line matches.

| Current Core file | Evidence against the historical baseline | Current decision | Independent replacement |
| --- | --- | --- | --- |
| `src/expression.js` | After removing only the added SPDX line, it is byte-for-byte identical to historical `desktop/expression.js`; all 17 top-level parser/rule symbols are shared. | Inherited AGPL. | High feasibility. Specify a grammar and implement a new parser/evaluator without access to the old source. |
| `src/data.js` | Extracts/adapts `decodeCsv`, `parseCsv`, spreadsheet safety, cell conversion, and `parseTabular` from `desktop/engine.js`; a line LCS diagnostic matched about 152 of 301 current lines. | Inherited AGPL. | High feasibility. Rebuild adapters from CSV/JSON/OOXML behavior and dependency APIs. |
| `src/index.js` | Reuses/adapts historical mapping, pattern-field, hashing, path, validation, and orchestration behavior; exact shared symbols include `mapRow`, `patternFields`, and `sha256`. Diagnostic LCS matches exist against both historical engine files. | Inherited AGPL. | Medium/high feasibility after data, expression, and template contracts are frozen. |
| `src/template-engine.js` | Extends the historical template engine and retains nearly all historical functions; the diagnostic LCS matched 782 of 788 historical lines, including the DOCX/PDF security and rendering pipeline. | Inherited AGPL. | Feasible but highest risk. Use a new module decomposition and standards/dependency documentation, not the old control flow. |

Small edits, renamed functions, formatting changes, transpilation, or moving
these files to a new repository are not accepted as clean-room replacements.

## Dependency audit

Dependencies are not evidence that DocFlow's surrounding implementation is
independent. They are reusable only under their own terms, and their APIs can be
used as clean implementation inputs.

| Current file | Direct third-party runtime dependencies | Declared licenses inspected locally |
| --- | --- | --- |
| `src/data.js` | `adm-zip`, `exceljs`, `ssf` | MIT, MIT, Apache-2.0 |
| `src/expression.js` | none | n/a |
| `src/index.js` | internal Core modules and Node built-ins only | n/a |
| `src/template-engine.js` | `@fontsource/noto-sans-sc`, `@pdf-lib/fontkit`, `adm-zip`, `docxtemplater`, `pdf-lib`, `pizzip`, `qrcode` | OFL-1.1, MIT, MIT, MIT, MIT, `(MIT OR GPL-3.0)`, MIT |

For `pizzip`, release review must deliberately use and preserve the MIT option
and its notice. The Noto Sans SC font remains under OFL-1.1. Before a split
release, generate an SBOM and verify the actual locked versions and notices;
the table is not a substitute for third-party notice generation.

## Replacement interfaces

The specification team may describe these interfaces and observable behavior.
It must not copy old implementation comments, internal structure, or expressive
code into the implementation specification.

### Data adapter

Keep the `@docflow-local/core/data` surface:

```text
MAX_COLUMNS
MAX_INPUT_BYTES
MAX_ROWS
parseCsv(bytes)
parseJson(bytes)
parseTabular(filename, bytes)
```

The parsed result contract is:

```text
{
  headers: string[],
  rows: object[],
  sourceRows: number[],
  warnings: string[]
}
```

The independent specification must cover JSON depth and unsafe-key rejection,
UTF-8/UTF-16/GB18030 behavior, CSV quoting and physical source rows, delimiter
detection, duplicate headers, empty rows, Excel date/number formatting, XLSM
acceptance without macro execution, ZIP limits, 25 MiB input, 10,000 data rows,
and 500 columns.

### Expression and rules

Keep the `@docflow-local/core/expression` exports:

```text
LIMITS
tokenize(expression)
evaluateExpression(expression, row)
normalizeValue(value)
replaceFieldReferences(expression, row)
applyRulesDetailed(rows, computedFields, conditionalFields)
```

Freeze a grammar for literals, bracketed and bare identifiers, calls, unary and
binary operators, ternaries, precedence, right-associative exponentiation,
short-circuiting, and Chinese operator aliases. Specify built-in functions,
rounding, numeric/string limits, unknown-field behavior, rule dependency order,
cycles, and structured error results. A clean implementation can use a newly
written Pratt parser, shunting-yard parser, or a compatible permissively
licensed parser; it must not translate the current parser line by line.

### Template engine

Keep the `@docflow-local/core/template-engine` exports:

```text
applyTemplateFilter(value, filter, customFormatters, context)
extractDocxTemplateInfo(bytes)
renderDocxTemplate(bytes, context, options)
inspectPdfTemplate(bytes)
fillPdfTemplate(bytes, context, options)
mergePdfBuffers(buffers)
parseAssetTag(tag)
validateImageData(value)
```

Write separate specifications for:

- OOXML archive limits, safe paths, relationships, active content, and field
  instruction rejection;
- tag discovery across document, header, footer, footnote, and endnote parts;
- variables, conditions, array loops, formatters, escaping, and split Word runs;
- image, QR, and signature resolution, size limits, media relationships, and
  drawing placement;
- PDF active-content rejection, AcroForm inspection and supported field types;
- font embedding, flattening, image-over-field behavior, and PDF merge order.

A preferred new structure is independent modules such as `archive-policy`,
`docx-inspection`, `docx-render`, `asset-resolver`, `pdf-policy`, `pdf-form`, and
`pdf-merge`. This decomposition is a requirement for review, not permission to
copy functions into differently named files.

### Core orchestrator

Keep the package-root exports:

```text
CORE_VERSION
DOCX_MEDIA_TYPE
ERROR_CODES
SCHEMA_VERSION
DocFlowEngine
DocFlowError
PluginRegistry
ValidationError
createEngine(options)
createPluginRegistry()
pluginApiVersion
```

Keep the observable `DocFlowEngine` methods:

```text
inspectData(input, options)
inspectTemplate(input, options)
inspect(input)
validate(job)
generate(job) -> AsyncIterable<Artifact>
output(artifacts, sinkName, options)
```

The implementation must use the published contracts and schemas as its primary
input. Freeze mapping normalization, strict validation, source-row reporting,
safe/de-duplicated relative paths, output conflict behavior, artifact shape,
SHA-256 reporting, plugin registration, and stable error codes. Human-readable
error wording is not frozen unless a public test explicitly declares it stable.

## Resolution route A: explicit rightsholder grant

This is the shorter route if ownership is clear.

- [ ] Identify every natural person or entity that owns copyright in each
      historical blob, including employer, client, contractor, and commissioned
      work interests.
- [ ] Confirm the repository author identity and authority to sign for any
      relevant entity.
- [ ] Audit copied snippets, prior repositories, generated code, pair work, and
      third-party contributions.
- [ ] Obtain a reviewed written grant that identifies the exact files/blobs,
      authorizes distribution under MPL-2.0, and addresses the MPL patent grant.
- [ ] Record the signed grant or counsel-approved public declaration in an
      immutable evidence location and reference it from the boundary manifest.
- [ ] State explicitly that historical AGPL releases and recipient grants remain
      valid and are not revoked.
- [ ] Obtain final legal/release approval before changing an SPDX identifier,
      package license expression, NOTICE, or the pure-MPL release gate.

A DCO sign-off on a new commit does not retroactively relicense historical work.

## Resolution route B: clean-room replacement

Use this route only if the rightsholder route is incomplete.

### Team separation

- [ ] Assign a specification/QA team that may inspect the AGPL implementation.
- [ ] Assign an implementation team whose members attest that they have not
      inspected the historical files, diffs, or expressive AGPL tests.
- [ ] Exclude anyone already exposed to the current implementations from the
      independent implementation team. The agents and maintainers who performed
      this audit have seen the source and cannot provide clean-room authorship.
- [ ] Keep access logs, team attestations, task prompts, review records, and
      dependency/source citations.
- [ ] Route implementation questions through a logged specification channel;
      never answer them with old code excerpts or implementation structure.

Because the AGPL source is public, proving non-access is difficult. Counsel must
review whether the proposed separation is sufficient for the relevant
jurisdiction and facts.

### Specification and oracle

- [ ] Produce a source-free interface specification from published contracts,
      public documentation, file-format standards, and dependency APIs.
- [ ] Convert behavior into synthetic input/expected-output vectors. Do not send
      AGPL test source to the implementation team.
- [ ] Keep any legacy test harness on the specification/QA side and expose only
      normalized results needed to diagnose conformance.
- [ ] Audit the licensing of fixtures, fonts, templates, schemas, and expected
      output files before copying them into a future MPL repository.
- [ ] Version and hash the approved specification and vector bundle.

### Independent implementation

- [ ] Implement in a separate repository or access-controlled worktree with no
      historical source checkout.
- [ ] Replace in this order: expression, data, template engine, orchestrator.
- [ ] Use different internal decomposition and independently chosen algorithms.
- [ ] Record all third-party dependencies and preserve their notices.
- [ ] Require DCO sign-offs plus a clean-room non-access attestation from every
      implementation contributor.
- [ ] Do not copy compatibility wrappers, comments, tests, error text, or helper
      functions from the AGPL files.

### Independent review

- [ ] Have QA run old and new implementations against the same approved vectors.
- [ ] Run a similarity scan against all historical blobs. Exact nontrivial runs,
      shared unusual identifiers, or matching control-flow structure require
      human review. A low similarity score is evidence, not proof.
- [ ] Review dependency provenance and generate an SBOM.
- [ ] Have counsel or a designated provenance reviewer approve the evidence
      packet before source integration.

## Test baseline

The current minimum executable baseline is:

```bash
npm run test:licenses
npm --prefix packages/core run test:syntax
npm --prefix packages/core test
node desktop/expression-test.js
node desktop/template-engine-test.js
node desktop/mvp-regression-test.js
npm run test:api
npm run test:packages
```

At the time of this audit, Core has 21 Node test cases: 9 CLI/API, 3 data, and 9
engine tests. The desktop compatibility suites add broader expression,
DOCX/PDF, active-content, spreadsheet, mapping, naming, and package-generation
coverage. Test counts are informational; acceptance is based on named behavior,
not preserving a count.

Before clean implementation starts, add source-free vectors for at least:

- every exported function and engine method;
- all operator precedence, short-circuit, rounding, limit, and rule-cycle cases;
- JSON/CSV/XLSX encodings, row numbers, date formats, unsafe keys, archive bombs,
  duplicate headers, and boundary-size inputs;
- DOCX parts, split runs, loops, conditions, filters, assets, unsafe
  relationships/fields, and archive limits;
- every supported PDF field type, CJK appearance generation, images,
  flatten/non-flatten, active content, malformed PDFs, and merge order;
- deterministic naming, Unicode normalization, collisions, strict validation,
  plugins, artifact limits, and iterator cancellation.

## Acceptance conditions

No file can move to MPL, and Core cannot be labelled pure MPL, until all of the
following are true:

- [ ] One resolution route has complete evidence for each of the four files.
- [ ] The implementation team and provenance reviewer are independent as
      required by the chosen route.
- [ ] Public exports, schemas, error codes, security limits, and artifact shapes
      match the frozen specification.
- [ ] All baseline and new vector tests pass on Node.js 22.
- [ ] DOCX/PDF outputs match byte-for-byte where deterministic; otherwise
      canonicalized package structure, visible content, relationships, form
      values, pages, and security decisions match.
- [ ] No unsafe `eval`, dynamic code evaluation, implicit network access,
      unbounded decompression, or silent telemetry is introduced.
- [ ] Performance and memory stay within documented release budgets.
- [ ] Similarity and manual provenance review find no copied expressive code.
- [ ] The tarball contains the correct license text, NOTICE, README, exports,
      SBOM/third-party notices, and no historical AGPL implementation.
- [ ] Historical tags/source remain available under AGPL and documentation says
      their grants are unchanged.
- [ ] Legal/provenance and release reviewers approve the evidence references in
      `license-boundaries.json`.

Only after those conditions are satisfied may a reviewed change update the four
file notices, Core package expression, license bundle, root NOTICE, release
documentation, and `pureMplCoreAllowed`.

## Information still requiring confirmation

The recorded Git history cannot answer these questions:

1. Who is the natural person behind the `txianlian` commits?
2. Was any work created within employment, contracting, commissioned-work, or
   client arrangements that affect ownership?
3. Did another person provide code, detailed pseudocode, pair-programming work,
   or uncredited patches?
4. Were any portions copied from prior private/public repositories, examples,
   forums, generated snippets, or incompatible-licensed projects?
5. Were AI tools used, under what terms, and did their output reproduce
   third-party material?
6. Does the signer have authority to grant MPL-2.0 rights, including the MPL
   patent grant, for every historical blob?
7. Are there patents, trademark constraints, contributor agreements, or prior
   exclusive grants affecting the proposed release?
8. Which tests, fixtures, templates, fonts, and expected artifacts may be moved
   into a future pure-MPL repository, and under what license?
9. Who will serve as clean specification, implementation, provenance-review,
   and legal-approval roles?
10. Where will signed grants, attestations, specification hashes, review
    decisions, and release evidence be stored immutably?

Until these questions and the selected route are resolved, the mechanically
enforced answer is: Core is mixed-license and the pure-MPL gate is closed.

## Mechanical boundary check

Run:

```bash
npm run test:licenses
```

The check verifies:

- historical commit/blob references;
- the four inherited AGPL SPDX identifiers and NOTICE entries;
- package license expressions and complete license copies;
- direct dependency declarations and installed dependency license metadata;
- MPL SPDX headers for other published module source;
- a six-line exact-copy guard between MPL Core files and the historical blobs;
- Electron license/notice inclusion; and
- that the pure-MPL gate remains closed while resolutions are unresolved.

The exact-copy guard is deliberately only a tripwire. Formatting changes can
evade it, and ordinary boilerplate can create false positives. It never replaces
human provenance review or legal approval.
