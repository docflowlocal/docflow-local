# DocFlow Core quick start

DocFlow Core turns JSON, CSV, XLSX, or XLSM records into DOCX files locally. It
offers the same generation contract through a CLI, a JavaScript API, and an
authenticated loopback HTTP API.

Node.js 22 or newer is required.

## Install the CLI

```bash
npm install --global @docflow-local/core
docflow --version
```

The scoped package command applies after the modular package is published. It is
not yet a promise that the npm scope contains a public release. For repository
development today, install locked dependencies and invoke the same CLI entry
directly:

```bash
npm ci
node packages/core/bin/docflow.js --version
docflow() { node packages/core/bin/docflow.js "$@"; }
node templates/scripts/build-starters.js
node templates/scripts/validate-content.js
```

The shell function keeps the remaining examples identical to the future
installed command. On PowerShell, replace `docflow` in the examples with
`node packages/core/bin/docflow.js`.

## Inspect, validate, generate

Use inspection to see the fields a template expects:

```bash
docflow inspect --template templates/quotation/starter.docx
docflow inspect --data templates/quotation/sample.json
```

Validate before writing output:

```bash
docflow validate \
  --data templates/quotation/sample.json \
  --template templates/quotation/starter.docx
```

Generate one DOCX per valid data row:

```bash
docflow generate \
  --data templates/quotation/sample.json \
  --template templates/quotation/starter.docx \
  --output ./generated \
  --name "{{quoteNumber}}-{{customerName}}"
```

Existing files are not replaced unless `--overwrite` is explicit. Add `--strict`
to make any invalid row fail the entire job. Use `--config job.json` for mappings,
computed fields, conditional fields, required fields, and plugin configuration.

Try the
[Excel quotation](https://github.com/docflowlocal/examples/tree/main/excel-to-quotation),
[bulk certificate](https://github.com/docflowlocal/examples/tree/main/bulk-certificate-generator),
and
[employee onboarding](https://github.com/docflowlocal/examples/tree/main/employee-onboarding-pack)
scenarios next.

## JavaScript API

The engine returns an async stream of artifacts and does not choose where to
persist them:

```js
const fs = require("node:fs/promises");
const { createEngine } = require("@docflow-local/core");

const engine = createEngine();
const job = {
  schemaVersion: 1,
  data: {
    filename: "customers.csv",
    bytes: await fs.readFile("customers.csv")
  },
  template: {
    filename: "quotation.docx",
    bytes: await fs.readFile("quotation.docx")
  },
  requiredFields: ["customerName"],
  output: { pattern: "{{quoteNumber}}-{{customerName}}" }
};

for await (const artifact of engine.generate(job)) {
  console.log(artifact.relativePath, artifact.sha256);
  // The embedding application decides whether and where to write artifact.bytes.
}
```

Call `engine.inspect()`, `engine.inspectData()`, `engine.inspectTemplate()`, or
`engine.validate()` before generation when building a UI or integration.

## Local HTTP API

Start a loopback-only server:

```bash
docflow serve --host 127.0.0.1 --port 3765
```

The process prints JSON containing a random bearer token. Keep that token local,
then make a multipart request:

```bash
curl -X POST \
  -H "Authorization: Bearer $DOCFLOW_TOKEN" \
  -F "data=@customers.xlsx" \
  -F "template=@quotation.docx" \
  -F 'options={"output":{"pattern":"{{customerName}}-quotation"}}' \
  -o generated.zip \
  http://127.0.0.1:3765/v1/generate
```

Available v1 endpoints:

- `GET /v1/health`
- `POST /v1/inspect-template`
- `POST /v1/validate`
- `POST /v1/generate`

Every endpoint requires the bearer token. Host, origin, multipart sizes, input
sizes, and archive expansion are bounded. Do not expose the server beyond
loopback unless you have designed authentication, TLS, authorization, rate
limits, and network policy for that deployment.

## Verify the result

A successful CLI response lists each relative path, byte count, source row,
and SHA-256 digest. A basic acceptance test should confirm:

1. validation completed before generation;
2. the expected number of DOCX files was produced;
3. every output opens and contains no unresolved `{{...}}` tags;
4. a human reviewed representative records and edge cases;
5. the original data and template were not modified.
