# DocFlow public contracts

`@docflow-local/contracts` is the versioned compatibility boundary shared by
DocFlow Core, desktop hosts and plugins.

It exports:

- `SCHEMA_VERSION`
- `PLUGIN_API_VERSION`
- `PLUGIN_CAPABILITIES`
- `GENERATE_REQUEST_KEYS`
- `ERROR_CODES`
- `DocFlowError`
- `assertSchemaVersion()`
- `assertKnownProperties()`
- `registerAjvRuntimeTypes()`
- `problemFromError()`
- JSON schemas through `@docflow-local/contracts/schemas/*`

`generate-request.schema.json` describes the public Node generation job,
including `rows`, plugin transforms, assets, strict validation and naming
aliases. Buffer fields carry the `x-docflow-runtimeType` keyword because a Node
`Buffer` is not a JSON value. Register that keyword with
`registerAjvRuntimeTypes(ajv)` when using Ajv; generic JSON-only validators can
still validate the surrounding descriptor shape but cannot validate Node
binary types. Core rejects unknown top-level generation properties so the
runtime and schema cannot silently drift.

## Plugin contract v1

A plugin package exports one module with exactly two public pieces:

```js
module.exports = {
  manifest: {
    schemaVersion: 1,
    id: "example.csv-cleanup",
    name: "CSV cleanup",
    version: "1.0.0",
    apiVersion: "1",
    entry: "index.js",
    capabilities: ["transform"],
    permissions: {
      filesystem: ["read"]
    }
  },
  activate(api) {
    api.registerTransform("cleanup", (row, context) => ({
      ...row,
      customer: String(row.customer || "").trim()
    }));
  }
};
```

The module must export:

- `manifest`, conforming to `plugin-manifest.schema.json`;
- synchronous `activate(api)`.

The v1 `api` exposes exactly these registration functions, each taking a hook
name and its implementation:

```text
registerDataSource(name, dataSource)
registerTransform(name, transform)
registerFormatter(name, formatter)
registerOutputSink(name, outputSink)
```

The matching capability must appear in `manifest.capabilities`:

```text
data-source
transform
formatter
output-sink
```

`permissions` is a transparent declaration of expected filesystem and network
access. It is not a security sandbox. Plugins execute as trusted code in the
host process and must be reviewed before installation.

## Versioning

Generation requests carry `schemaVersion: 1`; plugin manifests carry both
`schemaVersion: 1` and `apiVersion: "1"`. A host must reject unsupported
versions rather than guessing or silently coercing them.

Errors crossing a process or HTTP boundary use `ERROR_CODES`. HTTP adapters can
turn a `DocFlowError` into an RFC 9457-style problem document with
`problemFromError()`.
