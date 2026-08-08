# DocFlow Core

DocFlow Core is the open-source, local-first document generation engine behind
DocFlow Local. It reads JSON, CSV, XLSX or XLSM records and renders one DOCX
artifact per valid row without uploading source data.

This package is the engine, CLI, local HTTP adapter and plugin SDK. The engine
itself never writes files: `generate()` returns an `AsyncIterable<Artifact>`.

## Install

```bash
npm install @docflow-local/core
```

This install command applies once the modular package is published; it does not
claim that the npm scope already has a release. For the transition monorepo,
run `npm ci` at the root and invoke `node packages/core/bin/docflow.js`.

Node.js 22 or newer is required. The published package resolves the matching
`@docflow-local/contracts` release through its semver dependency; the monorepo
workspace links that package locally during development.

## CLI

```bash
docflow generate \
  --data customers.xlsx \
  --template quotation.docx \
  --output ./generated \
  --name "{{customer_code}}-quotation-{{index}}"
```

Other commands:

```bash
docflow inspect --template quotation.docx
docflow inspect --data customers.csv
docflow validate --data customers.xlsx --template quotation.docx
docflow serve --port 3765
```

`generate` refuses to replace an existing file unless `--overwrite` is passed.
It consumes generated artifacts one at a time into a private staging directory
inside the destination directory, so artifact bytes are not accumulated in
memory and final paths remain untouched until generation succeeds. It then uses
same-filesystem atomic renames to commit each file. A generation, limit or
conflict failure removes the staging directory without leaving partial final
output.

Atomicity is per-file rename, not a crash-safe multi-file filesystem
transaction. Catchable commit errors trigger rollback, including restoration of
files replaced by `--overwrite`. If the process is killed or the machine loses
power during commit, partial final output and the private staging directory can
remain; inspect or remove those remnants before retrying the job.

The CLI accepts at most 2,000 artifacts and 256 MiB of aggregate uncompressed
artifact bytes per generation. Exceeding either limit fails with
`DOCFLOW_DATA_LIMIT`; these limits match the local HTTP adapter.

CLI exit codes are stable: `0` means success, `2` means data/template validation
prevented the requested operation (including strict generation), and `1` means
another usage or runtime error.

Use `--config job.json` for mappings and rules:

```json
{
  "schemaVersion": 1,
  "mappings": {
    "customer": "Customer Name",
    "total": { "kind": "expression", "expression": "[quantity] * [unit_price]" }
  },
  "computedFields": [
    { "name": "tax", "expression": "[total] * 0.13", "digits": 2 }
  ],
  "conditionalFields": [
    {
      "name": "show_discount",
      "expression": "[discount] > 0",
      "whenTrue": "yes",
      "whenFalse": ""
    }
  ],
  "requiredFields": ["customer"]
}
```

Command-line paths and naming options override their config counterparts.

## JavaScript API

```js
const fs = require("node:fs/promises");
const { createEngine } = require("@docflow-local/core");

const engine = createEngine();
const artifacts = engine.generate({
  schemaVersion: 1,
  data: {
    filename: "customers.csv",
    bytes: await fs.readFile("customers.csv")
  },
  template: {
    filename: "quotation.docx",
    bytes: await fs.readFile("quotation.docx")
  },
  mappings: { customer: "Customer Name" },
  output: { pattern: "{{customer}}-quotation" }
});

for await (const artifact of artifacts) {
  // The host decides whether and where to persist the bytes.
  console.log(artifact.relativePath, artifact.sha256);
}
```

Each artifact has this stable shape:

```ts
{
  schemaVersion: 1;
  relativePath: string;
  bytes: Buffer;
  mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  rowIndex: number; // zero-based index in the parsed input
  sha256: string;
}
```

Use `inspectData()`, `inspectTemplate()` or `inspect()` before building a
mapping UI. Use `validate()` for required-field and rule diagnostics. Generation
skips invalid rows by default, throws when no rows are valid, and can be made
all-or-nothing with `strict: true`.

Template syntax:

```text
{{customer}}
{{amount | currency:USD}}
{{date | date:YYYY-MM-DD}}
{{#show_discount}}...{{/show_discount}}
{{#items}}{{name}} × {{quantity}}{{/items}}
{{@image:photo}}
{{@qrcode:order_id}}
{{@signature}}
```

Loop values remain arrays. In particular, `{{#items}}` is not coerced to a
boolean conditional.

## Local HTTP API

`docflow serve` binds to `127.0.0.1` by default and prints a random bearer token.
Every endpoint requires that token. The server also validates `Host` and
`Origin` headers and enforces multipart, file-size and part-count limits.

```bash
curl -H "Authorization: Bearer $DOCFLOW_TOKEN" \
  http://127.0.0.1:3765/v1/health

curl -X POST \
  -H "Authorization: Bearer $DOCFLOW_TOKEN" \
  -F "data=@customers.xlsx" \
  -F "template=@quotation.docx" \
  -F 'options={"output":{"pattern":"{{customer}}-quotation"}}' \
  -o generated.zip \
  http://127.0.0.1:3765/v1/generate
```

Endpoints:

- `GET /v1/health`
- `POST /v1/inspect-template` with multipart field `template`
- `POST /v1/validate` with multipart fields `data`, `template`, optional `options`
- `POST /v1/generate` with the same fields; returns a ZIP and manifest

The HTTP adapter rejects a generation response before ZIP construction if it
would contain more than 2,000 generated artifacts or more than 256 MiB of
aggregate uncompressed artifact bytes. The response is an
`application/problem+json` document with HTTP `413` and code
`DOCFLOW_DATA_LIMIT`. These HTTP packaging limits are deliberately lower than
the streaming Node API's row limit so one loopback request cannot exhaust the
host while the complete ZIP is held in memory.

The CLI/API adapters use schema version 1 when no `schemaVersion` is included in
`options`. The direct JavaScript API requires `schemaVersion: 1`.

## Plugin SDK v1

A plugin is a module with a versioned manifest and synchronous `activate(api)`:

```js
module.exports = {
  manifest: {
    schemaVersion: 1,
    id: "example.uppercase",
    name: "Uppercase formatter",
    version: "1.0.0",
    apiVersion: "1",
    entry: "index.js",
    capabilities: ["formatter"],
    permissions: {}
  },
  activate(api) {
    api.registerFormatter("loud", value => String(value ?? "").toUpperCase());
  }
};
```

The v1 activation API exposes:

- `registerDataSource(name, { extensions, parse })`
- `registerTransform(name, transform)`
- `registerFormatter(name, formatter)`
- `registerOutputSink(name, { write })`

A plugin can register only hooks declared in `manifest.capabilities`.
`permissions` documents expected network/filesystem access for hosts and users;
it does **not** sandbox the plugin. Plugins execute as trusted code in the host
Node.js process. Install only plugins you trust.

```js
const engine = createEngine({ plugins: [require("./my-plugin")] });
```

Formatters are synchronous because DOCX rendering is synchronous. Data sources,
row transforms and output sinks may return promises.

## Security and limits

- Data files: 25 MB, 10,000 rows, 500 columns.
- DOCX templates: 100 MB input plus archive entry, expansion and compression
  ratio checks.
- CLI generations and HTTP generation packages: 2,000 artifacts and 256 MiB
  aggregate uncompressed artifact bytes.
- Images: PNG/JPEG, 5 MB each, bounded dimensions and pixel count.
- Active DOCX content, unsafe relationships, path traversal and unsafe archive
  expansion are rejected.
- Output paths are normalized, bounded, Windows-safe and de-duplicated
  case-insensitively.
- The local API is loopback-only unless the operator explicitly opts into a
  remote bind.

DocFlow processes business data locally. Plugins can intentionally add network
or filesystem behavior, so their trust boundary must be reviewed separately.

## License

This transition package is mixed-license:
`MPL-2.0 AND AGPL-3.0-or-later`. Newly written modular files carry MPL-2.0
notices; files inherited from the historical 0.x engine retain their AGPL
notices. See [NOTICE.md](NOTICE.md) for the file-level boundary and `LICENSES/`
for the complete terms. Do not treat this preview as a pure-MPL Core release.
