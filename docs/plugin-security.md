# Plugin security

DocFlow plugin API v1 is an extensibility contract, not a security sandbox.
Plugins execute as trusted Node.js code in the host process and can use Node APIs
available to that process. A malicious plugin can read or alter local files,
access credentials, send data over the network, or interfere with output.

The local-first privacy statement applies to Core itself. Installing a networked
or malicious plugin can change that trust boundary.

## Plugin shape

A plugin module exports its manifest and a synchronous `activate(api)` function:

```js
const manifest = require("./manifest.json");

module.exports = {
  manifest,
  activate(api) {
    api.registerTransform("normalize-customer", (record, context) => ({
      ...record,
      customer: String(record.customer ?? "").trim()
    }));
  }
};
```

The v1 registration methods are:

```text
registerDataSource(name, { extensions, parse })
registerTransform(name, transform)
registerFormatter(name, formatter)
registerOutputSink(name, { write })
```

A plugin may register only capabilities declared in its manifest. Formatter
functions and `activate` are synchronous; data sources, transforms, and output
sinks may return promises where the host contract allows them.

## Manifest and permissions

The manifest is strict and versioned:

```json
{
  "schemaVersion": 1,
  "id": "example.normalize-customer",
  "name": "Normalize customer names",
  "version": "1.0.0",
  "apiVersion": "1",
  "entry": "index.js",
  "capabilities": ["transform"],
  "permissions": {
    "networkHosts": [],
    "filesystem": []
  }
}
```

`permissions.networkHosts` and `permissions.filesystem` describe intended access
for review and future policy tooling. They do not prevent undeclared access.
An empty permission declaration is not proof that a plugin is safe.

## User installation checklist

- Obtain the plugin from an identified publisher and a pinned version.
- Verify a published checksum or signature through an independent channel.
- Review the entry file, dependency tree, install scripts, and transitive
  dependencies; a small entry file can still import risky code.
- Compare requested capabilities and permissions with the business need.
- Test with synthetic data in a separate OS account or disposable environment.
- Restrict filesystem and network access at the operating-system/container level
  when the workflow handles sensitive data.
- Record the plugin version and digest with generated-job audit evidence.
- Re-review every upgrade; do not auto-update untrusted code.
- Remove plugins that are no longer required.

Do not load third-party plugins into a process that has access to production
documents, signing keys, browser sessions, or cloud credentials unless the
publisher and code have passed your security review.

## Plugin author checklist

- Declare the smallest capability and permission set.
- Avoid install scripts, dynamic code generation, `eval`, and shell execution.
- Never collect telemetry or make network calls without explicit documentation
  and opt-in configuration.
- Validate all options, input records, paths, URLs, and output sizes.
- Treat records as untrusted and return new objects instead of mutating input.
- Use timeouts, byte limits, and allowlists for intentional I/O.
- Never log document contents, tokens, secrets, or personal data by default.
- Produce reproducible packages and publish checksums and provenance.
- Fail closed with actionable errors.

The
[`transform-uppercase`](https://github.com/docflowlocal/plugins/tree/main/transform-uppercase)
example has no I/O,
does not mutate input, declares one capability, and is exercised by the content
validator. It is a contract example, not a sandbox demonstration.

## Host responsibilities

A production host should verify schema/API versions, reject unknown manifest
properties, prevent duplicate hook names, enforce capability declarations, pin
approved plugin digests, and isolate plugins at the operating-system or process
boundary when real security separation is required.

Stopping a plugin from registering an undeclared hook is useful validation, but
it cannot stop ordinary Node.js code from performing other actions. Real
isolation requires a separate process/container, reduced OS permissions,
explicit IPC, resource limits, and network policy.
